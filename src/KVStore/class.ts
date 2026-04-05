import { KVStoreError } from '../.errors/class.js'
import type { Row } from '../.types/index.js'
import { isKey } from '../.helpers/index.js'
import { assertStore, resolveDB } from '../indexedDB/index.js'

/**
 * A key-value store backed by a single IndexedDB object store namespace.
 *
 * @typeParam T The stored value type.
 */
export class KVStore<T extends Record<string, unknown>> {
  /**
   * The namespace backing this store instance.
   */
  public readonly namespace: string

  /**
   * A promise that fulfills after the namespace store is available.
   */
  private readonly ready: Promise<void>

  /**
   * Creates a new `KVStore` bound to the given namespace.
   *
   * @param namespace The object store name backing the instance.
   */
  constructor(namespace: string) {
    isKey(namespace, 'namespace')
    this.namespace = namespace
    this.ready = assertStore(namespace)
  }

  /**
   * Returns the value associated with the given key.
   *
   * @param key The key to look up.
   * @returns A promise that fulfills with the stored value, if any.
   */
  async get(key: string): Promise<T | undefined> {
    isKey(key, 'key')
    await this.ready
    const db = await resolveDB()

    const row = await new Promise<Row<T> | undefined>((resolve, reject) => {
      try {
        const tx = db.transaction(this.namespace, 'readonly')
        const store = tx.objectStore(this.namespace)
        const request = store.get(key)

        tx.oncomplete = () => resolve(request.result)
        tx.onerror = () =>
          reject(
            new KVStoreError('INDEXED_DB_TRANSACTION_FAILED', tx.error?.message)
          )
        tx.onabort = () =>
          reject(
            new KVStoreError(
              'INDEXED_DB_TRANSACTION_ABORTED',
              tx.error?.message
            )
          )
      } catch (error) {
        reject(
          new KVStoreError(
            'INDEXED_DB_TRANSACTION_FAILED',
            error instanceof Error ? error.message : undefined
          )
        )
      }
    })

    return row?.value ?? undefined
  }

  /**
   * Returns whether the given key exists.
   *
   * @param key The key to look up.
   * @returns A promise that fulfills with `true` if the key exists.
   */
  async has(key: string): Promise<boolean> {
    isKey(key, 'key')
    await this.ready
    const db = await resolveDB()

    return new Promise<boolean>((resolve, reject) => {
      try {
        const tx = db.transaction(this.namespace, 'readonly')
        const store = tx.objectStore(this.namespace)
        const request =
          typeof store.getKey === 'function'
            ? store.getKey(key)
            : store.get(key)

        tx.oncomplete = () => resolve(request.result !== undefined)
        tx.onerror = () =>
          reject(
            new KVStoreError('INDEXED_DB_TRANSACTION_FAILED', tx.error?.message)
          )
        tx.onabort = () =>
          reject(
            new KVStoreError(
              'INDEXED_DB_TRANSACTION_ABORTED',
              tx.error?.message
            )
          )
      } catch (error) {
        reject(
          new KVStoreError(
            'INDEXED_DB_TRANSACTION_FAILED',
            error instanceof Error ? error.message : undefined
          )
        )
      }
    })
  }

  /**
   * Stores a value for the given key.
   *
   * @param key The key to write.
   * @param value The value to associate with `key`.
   * @returns A promise that fulfills when the write completes.
   */
  async put(key: string, value: T): Promise<void> {
    isKey(key, 'key')
    await this.ready
    const db = await resolveDB()

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(this.namespace, 'readwrite')
        const store = tx.objectStore(this.namespace)
        const row: Row<T> = { key, value }

        store.put(row)

        tx.oncomplete = () => resolve()
        tx.onerror = () =>
          reject(
            new KVStoreError('INDEXED_DB_TRANSACTION_FAILED', tx.error?.message)
          )
        tx.onabort = () =>
          reject(
            new KVStoreError(
              'INDEXED_DB_TRANSACTION_ABORTED',
              tx.error?.message
            )
          )
      } catch (error) {
        reject(
          new KVStoreError(
            'INDEXED_DB_TRANSACTION_FAILED',
            error instanceof Error ? error.message : undefined
          )
        )
      }
    })
  }

  /**
   * Deletes the value associated with the given key.
   *
   * @param key The key to delete.
   * @returns A promise that fulfills when the deletion completes.
   */
  async delete(key: string): Promise<void> {
    isKey(key, 'key')
    await this.ready
    const db = await resolveDB()

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(this.namespace, 'readwrite')
        const store = tx.objectStore(this.namespace)

        store.delete(key)

        tx.oncomplete = () => resolve()
        tx.onerror = () =>
          reject(
            new KVStoreError('INDEXED_DB_TRANSACTION_FAILED', tx.error?.message)
          )
        tx.onabort = () =>
          reject(
            new KVStoreError(
              'INDEXED_DB_TRANSACTION_ABORTED',
              tx.error?.message
            )
          )
      } catch (error) {
        reject(
          new KVStoreError(
            'INDEXED_DB_TRANSACTION_FAILED',
            error instanceof Error ? error.message : undefined
          )
        )
      }
    })
  }

  /**
   * Deletes every value stored in the namespace.
   *
   * @returns A promise that fulfills when the namespace is cleared.
   */
  async clear(): Promise<void> {
    await this.ready
    const db = await resolveDB()

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(this.namespace, 'readwrite')
        const store = tx.objectStore(this.namespace)

        store.clear()

        tx.oncomplete = () => resolve()
        tx.onerror = () =>
          reject(
            new KVStoreError('INDEXED_DB_TRANSACTION_FAILED', tx.error?.message)
          )
        tx.onabort = () =>
          reject(
            new KVStoreError(
              'INDEXED_DB_TRANSACTION_ABORTED',
              tx.error?.message
            )
          )
      } catch (error) {
        reject(
          new KVStoreError(
            'INDEXED_DB_TRANSACTION_FAILED',
            error instanceof Error ? error.message : undefined
          )
        )
      }
    })
  }
}
