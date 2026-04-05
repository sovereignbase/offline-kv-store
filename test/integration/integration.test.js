import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { KVStore, destroyDB, resolveDB } from '../../dist/index.js'

function createValue(id) {
  return {
    id,
    label: `integration-${id}`,
    nested: { index: id, parity: id % 2 === 0 ? 'even' : 'odd' },
  }
}

async function resetDatabase() {
  try {
    await destroyDB()
  } catch {}
}

test('concurrent namespace initialization preserves both stores', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const users = new KVStore('integration-users')
  const sessions = new KVStore('integration-sessions')

  await Promise.all([
    users.put('u:1', createValue(1)),
    sessions.put('s:1', createValue(2)),
  ])

  assert.deepEqual(await users.get('u:1'), createValue(1))
  assert.deepEqual(await sessions.get('s:1'), createValue(2))

  const db = await resolveDB()
  assert.equal(db.objectStoreNames.contains('integration-users'), true)
  assert.equal(db.objectStoreNames.contains('integration-sessions'), true)
})

test('database deletion resets persisted stores and data', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const original = new KVStore('integration-original')
  await original.put('entry', createValue(3))
  await destroyDB()

  const recreated = new KVStore('integration-recreated')
  await recreated.put('fresh', createValue(4))

  const db = await resolveDB()
  assert.equal(db.objectStoreNames.contains('integration-original'), false)
  assert.equal(db.objectStoreNames.contains('integration-recreated'), true)
  assert.deepEqual(await recreated.get('fresh'), createValue(4))
})

test('data remains visible across new instances after prior instances are discarded', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  {
    const writer = new KVStore('integration-persisted')
    await writer.put('entry', createValue(5))
  }

  const reader = new KVStore('integration-persisted')
  assert.equal(await reader.has('entry'), true)
  assert.deepEqual(await reader.get('entry'), createValue(5))
})

test('clear only affects the targeted namespace during mixed workloads', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const alpha = new KVStore('integration-alpha')
  const beta = new KVStore('integration-beta')

  await Promise.all([
    alpha.put('a:1', createValue(6)),
    alpha.put('a:2', createValue(7)),
    beta.put('b:1', createValue(8)),
  ])

  await alpha.clear()

  assert.equal(await alpha.has('a:1'), false)
  assert.equal(await alpha.has('a:2'), false)
  assert.deepEqual(await beta.get('b:1'), createValue(8))
})

test('version changes retire the cached connection and reopen cleanly', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const store = new KVStore('integration-version-base')
  await store.put('entry', createValue(9))

  const original = await resolveDB()
  const nextVersion = original.version + 1

  await new Promise((resolve, reject) => {
    const request = indexedDB.open('offline-kv-store', nextVersion)

    request.onupgradeneeded = () => {
      if (
        !request.result.objectStoreNames.contains('integration-version-extra')
      ) {
        request.result.createObjectStore('integration-version-extra', {
          keyPath: 'key',
        })
      }
    }

    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error)
  })

  const reopened = await resolveDB()
  assert.notEqual(reopened, original)
  assert.equal(
    reopened.objectStoreNames.contains('integration-version-extra'),
    true
  )
})
