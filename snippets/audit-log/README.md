# Tamper-Evident Audit Log

Every admin action — user ban, post takedown, role change — is appended to
an audit log. Two requirements:

1. If an entry is deleted or modified after the fact, that must be **detectable**.
2. Reads of the log must not block writes; writes must serialize cleanly under
   concurrent admin activity.

The naive shape (`audit_log(id, action, payload, created_at)`) fails (1):
nothing stops anyone with DB access from `DELETE FROM audit_log WHERE …` and
moving on with their day. We need the integrity check baked into the data.

## The shape

```sql
CREATE TABLE audit_log (
  id            VARCHAR(36)    PRIMARY KEY,
  user_id       VARCHAR(36)    NOT NULL,
  action        VARCHAR(64)    NOT NULL,
  entity_type   VARCHAR(32),
  entity_id     VARCHAR(36),
  status        ENUM('success','failure'),
  metadata      JSON,
  ip_address    VARCHAR(64),
  user_agent    TEXT,
  created_at    TIMESTAMP      NOT NULL,
  prev_hash     CHAR(64)       NOT NULL,   -- SHA256 of previous entry
  entry_hash    CHAR(64)       NOT NULL,   -- SHA256 of this entry + prev_hash
  chain_seq     BIGINT UNSIGNED AUTO_INCREMENT UNIQUE,
  KEY (created_at), KEY (entity_type, entity_id)
);

-- Sentinel row holds the latest hash for the writer to read under lock
CREATE TABLE audit_log_tip (
  id        TINYINT     PRIMARY KEY DEFAULT 1,
  prev_hash CHAR(64)    NOT NULL
);
INSERT INTO audit_log_tip (id, prev_hash) VALUES (1, REPEAT('0', 64));
```

## The chain

```
entry_hash_n = SHA256(stableStringify({
  prev_hash:  hash_of_entry_n-1,
  payload:    canonical(entry_n)
}))
```

`stableStringify` canonicalizes — sorted keys, no whitespace — so the same
logical entry always hashes to the same value regardless of insertion order
within the JSON object. Without this, an attacker who only reorders keys
breaks the chain *and* hides the break.

## The verifier

A separate process walks `audit_log` ordered by `chain_seq ASC`, recomputes
each `entry_hash`, and compares against the stored value. Anyone who deletes
a row, modifies `metadata`, or even *reorders* by tampering with timestamps
gets caught by a chain mismatch. The latest valid `entry_hash` is published
to admin dashboards.

In production: **28,601 entries, 0 issues** under a 20-parallel-writer stress
test.

## The interesting part: how the writes serialize

See [`audit-log.ts`](audit-log.ts) and [`chain-verifier.ts`](chain-verifier.ts)
for the actual code. The short version:

- Open a transaction at `READ COMMITTED` isolation.
- `SELECT prev_hash FROM audit_log_tip WHERE id = 1 FOR UPDATE`. This both
  *reads* the previous hash and *locks* the sentinel row — any concurrent
  writer blocks here until the current one commits.
- Compute `entry_hash`, INSERT into `audit_log`, UPDATE `audit_log_tip` with
  the new hash. Commit.

Why `READ COMMITTED` not the InnoDB default of `REPEATABLE READ`? Because
under REPEATABLE READ, the `FOR UPDATE` on the sentinel grabs the lock fine
but the *snapshot* you see for the rest of the transaction is stale —
including the sentinel row's value. So you can lock and still read a
yesterday-old `prev_hash`. READ COMMITTED reads the latest committed value
each statement, which is what we actually want here.

## Why a sentinel row at all?

The straightforward "read the latest entry to get the previous hash"
approach has a race:

```
TXN A: SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1;  -- sees X
TXN B: SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1;  -- sees X
TXN A: INSERT … (prev_hash = X, entry_hash = Y);
TXN B: INSERT … (prev_hash = X, entry_hash = Z);  -- A's entry is now orphaned
```

Two entries claim the same `prev_hash`. The chain forks. The verifier
will catch it but the damage is done — you've lost the linear "next" of
one of them.

The sentinel row solves this: it's a single, well-known row you can
`FOR UPDATE` lock without table scans. Any number of writers can show up,
they all queue at the sentinel, and the chain stays single-threaded.

## What the `chain_seq` is for

`AUTO_INCREMENT BIGINT UNSIGNED`. Two reasons:
1. The verifier walks by `chain_seq ASC`, not by `created_at` (which has
   1-second resolution and ties) and not by `id` (a UUID, no ordering
   guarantee).
2. After a chain break is detected, `chain_seq` is the canonical pointer
   for "the row immediately after the break", regardless of clock skew or
   inserted duplicates.

## See also

[`case-studies/hash-chain-race.md`](../../case-studies/hash-chain-race.md) —
five migrations of progressively narrowing the race condition. Story of
realising that each "fix" was actually exposing the next, deeper bug.
