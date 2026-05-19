/**
 * Type stubs so the snippet files can be read without the rest of the
 * production codebase. These mirror node-mysql2's Pool / PoolConnection
 * surface area, not the real internal abstraction.
 */

export interface PoolConnection {
  query(sql: string): Promise<any>;
  execute<T = any>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface Pool {
  getConnection(): Promise<PoolConnection>;
  execute<T = any>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}
