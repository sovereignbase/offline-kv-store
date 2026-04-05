/**
 * Public entry points for `@sovereignbase/offline-kv-store`.
 */
export { KVStore } from './KVStore/class.js'
export type { Row } from './.types/index.js'
export type { KVStoreErrorCode } from './.errors/class.js'
export { resolveDB, destroyDB } from './indexedDB/index.js'
