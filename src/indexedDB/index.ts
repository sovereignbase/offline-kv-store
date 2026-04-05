import { KVStoreError } from '../.errors/class.js'

const DB_NAME = 'offline-kv-store'

let dbRef: IDBDatabase | null = null
let dbPromise: Promise<IDBDatabase> | null = null
let ensureStoreChain: Promise<void> = Promise.resolve()

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
    request.onblocked = () =>
      reject(
        new KVStoreError('DATABASE_OPEN_BLOCKED', 'IndexedDB open blocked')
      )
  })
}

function closeDB(): void {
  if (dbRef) dbRef.close()
  dbRef = null
  dbPromise = null
}

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

export async function destroyDB(): Promise<void> {
  closeDB()

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)

    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(
        new KVStoreError('DATABASE_DELETION_FAILED', request.error?.message)
      )
    request.onblocked = () =>
      reject(
        new KVStoreError(
          'DATABASE_DELETION_BLOCKED',
          'IndexedDB delete blocked'
        )
      )
  })
}

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
