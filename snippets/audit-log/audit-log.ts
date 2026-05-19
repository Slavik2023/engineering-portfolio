/**
 * Hash-chained audit log writer.
 *
 * Sanitized excerpt from a production codebase. Database driver, logger,
 * and config imports are stubbed for readability. The core logic — chain
 * serialization, transactional sentinel lock, canonical hashing — is intact.
 *
 * Read the README in this folder first for the design rationale.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Pool, PoolConnection } from './_stubs';

/** Sorted-key JSON encoder — same logical object always produces the same string. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((value as any)[k]))
      .join(',') +
    '}'
  );
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export interface AuditEntry {
  userId: string;
  action: string;                     // e.g. 'admin.post.reject'
  entityType?: string | null;
  entityId?: string | null;
  status: 'success' | 'failure';
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append a new entry to the chain. Returns the inserted row's id + hash.
 *
 * Writes serialize through a sentinel row (`audit_log_tip`) under a
 * transaction lock. Concurrent callers queue at the sentinel; the chain
 * stays linear no matter how many admins act simultaneously.
 */
export async function appendAuditEntry(
  pool: Pool,
  entry: AuditEntry,
): Promise<{ id: string; entryHash: string; chainSeq: number }> {
  const conn: PoolConnection = await pool.getConnection();

  try {
    // READ COMMITTED so the SELECT after FOR UPDATE sees the latest value,
    // not a stale REPEATABLE READ snapshot from when the txn began.
    await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await conn.beginTransaction();

    // Acquire the chain-write lock. Any concurrent writer blocks here until
    // we commit. This is the critical section.
    const [tipRows] = await conn.execute<{ prev_hash: string }[]>(
      'SELECT prev_hash FROM audit_log_tip WHERE id = 1 FOR UPDATE',
    );
    const prevHash = tipRows[0]?.prev_hash ?? '0'.repeat(64);

    const id = uuidv4();
    const createdAt = new Date();

    // Canonical payload — every field that contributes to the hash. The
    // verifier reconstructs this exact object when re-checking the chain.
    const canonical = {
      id,
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      status: entry.status,
      metadata: entry.metadata ?? {},
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
      created_at: createdAt.toISOString(),
      prev_hash: prevHash,
    };

    const entryHash = sha256Hex(stableStringify(canonical));

    // Insert the row. chain_seq auto-increments and gives us the canonical
    // walk order for the verifier (created_at has 1-second resolution).
    const [insertResult] = await conn.execute<{ insertId: number }>(
      `INSERT INTO audit_log
        (id, user_id, action, entity_type, entity_id, status, metadata,
         ip_address, user_agent, created_at, prev_hash, entry_hash)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?)`,
      [
        canonical.id,
        canonical.user_id,
        canonical.action,
        canonical.entity_type,
        canonical.entity_id,
        canonical.status,
        JSON.stringify(canonical.metadata),
        canonical.ip_address,
        canonical.user_agent,
        canonical.created_at.replace('T', ' ').slice(0, 19),
        canonical.prev_hash,
        entryHash,
      ],
    );

    // Advance the tip. The next writer will read this value.
    await conn.execute(
      'UPDATE audit_log_tip SET prev_hash = ? WHERE id = 1',
      [entryHash],
    );

    await conn.commit();
    return { id, entryHash, chainSeq: insertResult.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
