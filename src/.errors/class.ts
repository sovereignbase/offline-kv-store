export type KVStoreErrorCode =
  | 'DATABASE_DELETION_BLOCKED'
  | 'INDEXED_DB_TRANSACTION_FAILED'
  | 'INDEXED_DB_TRANSACTION_ABORTED'
  | 'NAME_WAS_NOT_A_STRING'

export class KVStoreError extends Error {
  readonly code: KVStoreErrorCode

  constructor(code: KVStoreErrorCode, message?: string) {
    const detail = message ?? code
    super(`{@sovereignbase/offline-kv-store} ${detail}`)
    this.code = code
    this.name = 'KVStoreError'
  }
}
