import { KVStoreError } from '../.errors/class.js'
import type { Row } from '../.types/index.js'
import { isKey } from '../.helpers/index.js'
import { assertStore, resolveDB } from '../indexedDB/index.js'
export class KVStore<T extends Record<string, unknown>> {
  public readonly namespace: string

  constructor(namespace: string) {
    isKey(namespace, 'namespace')
    this.namespace = namespace
  }

  async put(key: string, value: T): Promise<void> {
    isKey(key, 'key')
    await assertStore(this.namespace)
    const db = await resolveDB()

    await new Promise<void>((resolve, reject) => {
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
          new KVStoreError('INDEXED_DB_TRANSACTION_ABORTED', tx.error?.message)
        )
    })
  }

  async has(key: string): Promise<boolean> {
    isKey(key, 'key')
    await assertStore(this.namespace)
    const db = await resolveDB()

    return new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(this.namespace, 'readonly')
      const store = tx.objectStore(this.namespace)
      const request =
        typeof store.getKey === 'function' ? store.getKey(key) : store.get(key)

      tx.oncomplete = () => resolve(request.result !== undefined)
      tx.onerror = () =>
        reject(
          new KVStoreError('INDEXED_DB_TRANSACTION_FAILED', tx.error?.message)
        )
      tx.onabort = () =>
        reject(
          new KVStoreError('INDEXED_DB_TRANSACTION_ABORTED', tx.error?.message)
        )
    })
  }

  async get(key: string): Promise<T | undefined> {
    isKey(key, 'key')
    await assertStore(this.namespace)
    const db = await resolveDB()

    const row = await new Promise<Row<T> | undefined>((resolve, reject) => {
      const tx = db.transaction(this.namespace, 'readonly')
      const store = tx.objectStore(this.namespace)
      const request = store.get(key)

      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () =>
        new KVStoreError('INDEXED_DB_TRANSACTION_FAILED', tx.error?.message)
      tx.onabort = () =>
        new KVStoreError('INDEXED_DB_TRANSACTION_ABORTED', tx.error?.message)
    })

    return row?.value ?? undefined
  }

  async delete(key: string): Promise<void> {
    isKey(key, 'key')
    await assertStore(this.namespace)
    const db = await resolveDB()

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.namespace, 'readwrite')
      const store = tx.objectStore(this.namespace)

      store.delete(key)

      tx.oncomplete = () => resolve()
      tx.onerror = () =>
        new KVStoreError('INDEXED_DB_TRANSACTION_FAILED', tx.error?.message)
      tx.onabort = () =>
        new KVStoreError('INDEXED_DB_TRANSACTION_ABORTED', tx.error?.message)
    })
  }

  async clear(): Promise<void> {
    await assertStore(this.namespace)
    const db = await resolveDB()

    await new Promise<void>((resolve, reject) => {
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
          new KVStoreError('INDEXED_DB_TRANSACTION_ABORTED', tx.error?.message)
        )
    })
  }
}
