/**
 * Audit-log chain verifier.
 *
 * Walks the audit_log table in canonical order (chain_seq ASC) and
 * recomputes each entry_hash. Returns the position of the first break,
 * or null if the chain is intact end-to-end.
 *
 * Runs out-of-band (cron or on-demand from the admin panel). Reads only —
 * no locks taken against the writer's critical section.
 *
 * Sanitized excerpt; DB stubs and logger imports removed for clarity.
 */

import crypto from 'crypto';
import type { Pool } from './_stubs';

interface AuditRow {
  id: string;
  user_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  metadata: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  prev_hash: string;
  entry_hash: string;
  chain_seq: number;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return '{' + keys.map((k) =>
    JSON.stringify(k) + ':' + stableStringify((value as any)[k])
  ).join(',') + '}';
}

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export interface VerificationReport {
  chainedCount: number;
  headHash: string;
  valid: boolean;
  issues: Array<{
    chainSeq: number;
    id: string;
    reason: 'prev-mismatch' | 'hash-mismatch';
    expected?: string;
    actual?: string;
  }>;
}

/**
 * Streaming verifier — keeps memory flat regardless of log size.
 * The full table can have millions of rows; we never hold more than
 * BATCH_SIZE at a time.
 */
export async function verifyAuditChain(pool: Pool): Promise<VerificationReport> {
  const BATCH_SIZE = 500;
  const issues: VerificationReport['issues'] = [];

  // Genesis hash — all zeros. The first row's prev_hash must match this.
  let expectedPrevHash = '0'.repeat(64);
  let chainedCount = 0;
  let lastEntryHash = expectedPrevHash;
  let offset = 0;

  // Walk by chain_seq ASC. We deliberately do NOT order by created_at —
  // that has 1-second resolution and ties under concurrent writes.
  // chain_seq is AUTO_INCREMENT and gives us a total order.
  while (true) {
    const [rows] = await pool.execute<AuditRow[]>(
      `SELECT id, user_id, action, entity_type, entity_id, status,
              metadata, ip_address, user_agent, created_at,
              prev_hash, entry_hash, chain_seq
       FROM audit_log
       ORDER BY chain_seq ASC
       LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      // Link check — does this row's prev_hash point to the previous
      // row's entry_hash? If a row was deleted, this is where we notice.
      if (row.prev_hash !== expectedPrevHash) {
        issues.push({
          chainSeq: row.chain_seq,
          id: row.id,
          reason: 'prev-mismatch',
          expected: expectedPrevHash,
          actual: row.prev_hash,
        });
      }

      // Recompute the hash this row should have. If the metadata was
      // tampered with after insertion, this won't match.
      const canonical = {
        id: row.id,
        user_id: row.user_id,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        status: row.status,
        metadata: typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : (row.metadata ?? {}),
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        created_at: new Date(row.created_at).toISOString(),
        prev_hash: row.prev_hash,
      };
      const recomputed = sha256Hex(stableStringify(canonical));

      if (recomputed !== row.entry_hash) {
        issues.push({
          chainSeq: row.chain_seq,
          id: row.id,
          reason: 'hash-mismatch',
          expected: recomputed,
          actual: row.entry_hash,
        });
      }

      // Walk forward.
      expectedPrevHash = row.entry_hash;
      lastEntryHash = row.entry_hash;
      chainedCount += 1;
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  return {
    chainedCount,
    headHash: lastEntryHash,
    valid: issues.length === 0,
    issues,
  };
}
