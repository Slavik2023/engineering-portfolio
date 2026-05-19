# Case Study: Five Migrations to Close a Hash-Chain Race

> A story about how every "fix" exposed the next, deeper bug. Took five
> database migrations and a complete rewrite of the writer to land on
> something that actually held under load.

## The setup

The audit log (see [snippets/audit-log](../snippets/audit-log)) is a
hash-chained, append-only table. Each new entry's `prev_hash` must
point at the previous entry's `entry_hash`. Verifier walks the table
periodically. A break is a tamper alarm.

Under serial writes, this is trivial. Under concurrent writes — multiple
admins moderating at the same time, system actions firing in parallel —
the question is: how do two writers agree on what "previous" means?

## Attempt 1: "Just read the last row"

```sql
SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1;
INSERT INTO audit_log (..., prev_hash = <that value>, ...);
```

Worked in dev. Worked in the first hundred prod entries. Then we got
two simultaneous moderation actions and the verifier started reporting
forked chains. Two rows both claiming the same `prev_hash`.

The race:

```
T0  Admin A: SELECT entry_hash ... -> X
T0  Admin B: SELECT entry_hash ... -> X
T1  Admin A: INSERT (prev_hash=X, entry_hash=Y)
T1  Admin B: INSERT (prev_hash=X, entry_hash=Z)
```

Two rows, both pointing at X. One of them is now an orphan branch.

## Attempt 2: `SELECT ... FOR UPDATE` on the last row

Lock the row we read. Concurrent SELECT…FOR UPDATE blocks until we commit.

The bug: we were *reading* the last row by `id DESC LIMIT 1`. The lock
applies to the row we got back. But between our `SELECT` and the next
writer's `SELECT`, the writer might find a *different* "last" row —
maybe ours (just committed), maybe one inserted by a third writer.
The lock doesn't apply to the act of *finding* the last row; only to
the row we found.

Reproducible at 20 concurrent writers / 100% break rate.

## Attempt 3: `GET_LOCK('audit_chain_write', 5)`

Switch to MySQL's named application lock. One writer at a time, no race.

Reproducible bug: MySQL session locks don't span pooled connections
the way we wanted. Connection pool returns connection A to writer 1,
connection B to writer 2 — both `GET_LOCK` with the same name on
different sessions. The lock is per-session, not per-database, so it
works *between* sessions but it's fragile under pool churn (lock leak
on connection eviction was the actual production incident).

Also: GET_LOCK is a MySQL-ism. Migrating to a different store (PostgreSQL,
MS SQL Server, etc.) means rewriting this. Not great.

## Attempt 4: Sentinel row + `FOR UPDATE`

Introduce `audit_log_tip(id=1, prev_hash)`. One well-known row. Writers
do `SELECT prev_hash FROM audit_log_tip WHERE id = 1 FOR UPDATE`. The
row exists, the lock is unambiguous, queueing is clean.

This is the right answer. But it shipped *broken* the first time.

The bug: under InnoDB's default `REPEATABLE READ` isolation, the
transaction takes a snapshot at `BEGIN` (or at the first read).
`SELECT … FOR UPDATE` correctly takes the lock *but* the value it
returns is the snapshot value — which is from *before* the previous
writer committed. So:

```
T0  Writer A: BEGIN; SELECT prev_hash FROM audit_log_tip FOR UPDATE → X
T1  Writer A: INSERT; UPDATE audit_log_tip SET prev_hash = Y; COMMIT;
T2  Writer B: BEGIN; SELECT prev_hash FROM audit_log_tip FOR UPDATE → ???
```

What's `???` Under REPEATABLE READ, Writer B's snapshot was taken at
its own BEGIN (T2 > T1, so the snapshot is *after* A's commit) —
so it *should* see Y. And it does, but only if the BEGIN happens
after T1.

The actual failure mode was subtler. Long-running connections in the
pool had stale snapshots; writers reusing those connections saw old
values; the chain broke. The repro was racy and infuriating to track
down.

## Attempt 5: READ COMMITTED + sentinel row

Sentinel row, FOR UPDATE, plus:

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
BEGIN;
SELECT prev_hash FROM audit_log_tip WHERE id = 1 FOR UPDATE;
-- This reads the latest *committed* value, not a snapshot.
```

Under READ COMMITTED, each statement reads the latest committed value
independently. The snapshot is per-statement, not per-transaction.
The FOR UPDATE still gives us the lock; the read now reflects the
chain's true tip.

Stress tested: 20 writers, 60 seconds, no breaks. Verifier confirmed
the full chain remained valid through ~28K production entries since.

## What I'd do differently

Skip attempts 1–3 entirely and go straight to the sentinel row. The
race is a well-known database problem; the lesson on my end was to
recognise it as that earlier and not chase the surface symptoms.

Also: pick READ COMMITTED for chain-writer transactions from the
start. REPEATABLE READ is the InnoDB default and it's what bites you
when you mix locks with reads inside the same transaction.

## What this is generalisable to

Any time you have:
- Linear sequence (chain, log, immutable list)
- Concurrent producers
- Each producer needs to read the latest state to decide its own value

A sentinel row + FOR UPDATE at READ COMMITTED is the cheapest correct
pattern in MySQL. PostgreSQL has the same shape with slightly different
syntax (`SELECT ... FOR UPDATE OF ...`).
