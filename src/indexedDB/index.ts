import { KVStoreError } from '../.errors/class.js'

const DB_NAME = 'offline-kv-store'

let dbRef: IDBDatabase | null = null
let dbPromise: Promise<IDBDatabase> | null = null
let ensureStoreChain: Promise<void> = Promise.resolve()

/**
 * Caches an open database connection and wires version-change cleanup.
 *
 * @param db The database connection to cache.
 * @returns The cached database connection.
 */
function cacheDB(db: IDBDatabase): IDBDatabase {
  db.onversionchange = () => {
    if (dbRef === db) {
      dbRef = null
      dbPromise = null
    }

    db.close()
  }

  dbRef = db
  dbPromise = Promise.resolve(db)

  return db
}

/**
 * Opens the backing IndexedDB database.
 *
 * @param version The database version to open.
 * @param onUpgrade The callback invoked during an upgrade transaction.
 * @returns A promise that fulfills with the open database.
 */
function openDB(
  version?: number,
  onUpgrade?: (db: IDBDatabase) => void
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      version === undefined
        ? indexedDB.open(DB_NAME)
        : indexedDB.open(DB_NAME, version)

    request.onupgradeneeded = () => {
      onUpgrade?.(request.result)
    }

    request.onsuccess = () => resolve(cacheDB(request.result))
    request.onerror = () =>
      reject(new KVStoreError('DATABASE_OPEN_FAILED', request.error?.message))
    request.onblocked = (event) =>
      reject(
        new KVStoreError(
          'DATABASE_OPEN_BLOCKED',
          `IndexedDB open blocked for "${DB_NAME}" (oldVersion=${event.oldVersion}, newVersion=${event.newVersion})`
        )
      )
  })
}

/**
 * Closes the cached database connection, if any.
 */
function closeDB(): void {
  if (dbRef) dbRef.close()
  dbRef = null
  dbPromise = null
}

/**
 * Resolves the active database connection.
 *
 * @returns A promise that fulfills with the open database.
 */
export async function resolveDB(): Promise<IDBDatabase> {
  if (dbRef) return dbRef

  if (!dbPromise) {
    dbPromise = openDB().catch((error) => {
      dbPromise = null
      throw error
    })
  }

  return dbPromise
}

/**
 * Deletes the backing IndexedDB database.
 *
 * @returns A promise that fulfills when deletion completes.
 */
export async function destroyDB(): Promise<void> {
  closeDB()

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)

    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(
        new KVStoreError('DATABASE_DELETION_FAILED', request.error?.message)
      )
    request.onblocked = (event) =>
      reject(
        new KVStoreError(
          'DATABASE_DELETION_BLOCKED',
          `IndexedDB delete blocked for "${DB_NAME}" (oldVersion=${event.oldVersion}, newVersion=${event.newVersion})`
        )
      )
  })
}

/**
 * Ensures that the named object store exists.
 *
 * @param storeName The object store name to create if needed.
 * @returns A promise that fulfills after the object store is available.
 */
export function assertStore(storeName: string): Promise<void> {
  const task = ensureStoreChain.then(async () => {
    const db = await resolveDB()

    if (db.objectStoreNames.contains(storeName)) return

    const nextVersion = db.version + 1
    closeDB()

    await openDB(nextVersion, (upgradeDb) => {
      if (!upgradeDb.objectStoreNames.contains(storeName)) {
        upgradeDb.createObjectStore(storeName, { keyPath: 'key' })
      }
    })
  })

  ensureStoreChain = task.catch(() => {})
  return task
}
