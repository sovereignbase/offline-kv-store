/**
 * Error codes thrown by the offline KV store.
 */
export type KVStoreErrorCode =
  | 'DATABASE_DELETION_BLOCKED'
  | 'DATABASE_DELETION_FAILED'
  | 'DATABASE_OPEN_BLOCKED'
  | 'DATABASE_OPEN_FAILED'
  | 'INDEXED_DB_TRANSACTION_FAILED'
  | 'INDEXED_DB_TRANSACTION_ABORTED'
  | 'NAME_WAS_INVALID'

/**
 * An error thrown by the offline KV store.
 */
export class KVStoreError extends Error {
  /**
   * The machine-readable error code.
   */
  readonly code: KVStoreErrorCode

  /**
   * Creates a new `KVStoreError`.
   *
   * @param code The machine-readable error code.
   * @param message A human-readable detail message.
   */
  constructor(code: KVStoreErrorCode, message?: string) {
    const detail = message ?? code
    super(`{@sovereignbase/offline-kv-store} ${detail}`)
    this.code = code
    this.name = 'KVStoreError'
  }
}
