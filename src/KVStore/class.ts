import { KVStoreError } from '../.errors/class.js'
import type { Row } from '../.types/index.js'
import { isKey } from '../.helpers/index.js'
import { assertStore, resolveDB } from '../indexedDB/index.js'
export class KVStore<T extends Record<string, unknown>> {
  public readonly namespace: string
  private readonly ready: Promise<void>

  constructor(namespace: string) {
    isKey(namespace, 'namespace')
    this.namespace = namespace
    this.ready = assertStore(namespace)
  }

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
