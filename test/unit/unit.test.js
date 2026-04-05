import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { KVStore, destroyDB, resolveDB } from '../../dist/index.js'

function createValue(id) {
  return {
    id,
    label: `value-${id}`,
    meta: { even: id % 2 === 0 },
  }
}

async function resetDatabase() {
  try {
    await destroyDB()
  } catch {}
}

function replaceMethod(target, key, value) {
  const original = target[key]

  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value,
  })

  return () => {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value: original,
    })
  }
}

function createMockRequest(result = undefined) {
  return { result }
}

function createMockTransaction({
  event = 'complete',
  errorMessage = `mock ${event}`,
  requestResult,
  withGetKey = true,
  throwValue,
} = {}) {
  if (throwValue !== undefined) throw throwValue

  const request = createMockRequest(requestResult)
  const tx = {
    error:
      event === 'abort'
        ? new DOMException(errorMessage, 'AbortError')
        : new DOMException(errorMessage, 'InvalidStateError'),
    oncomplete: null,
    onerror: null,
    onabort: null,
    objectStore() {
      return {
        get: () => request,
        ...(withGetKey ? { getKey: () => request } : {}),
        put: () => request,
        delete: () => request,
        clear: () => request,
      }
    },
  }

  queueMicrotask(() => {
    if (event === 'complete') tx.oncomplete?.()
    else if (event === 'error') tx.onerror?.()
    else tx.onabort?.()
  })

  return tx
}

async function withMockedTransaction(
  namespace,
  transactionFactory,
  callback,
  warmupKey = 'warmup'
) {
  const store = new KVStore(namespace)
  await store.put(warmupKey, createValue(999))
  const db = await resolveDB()
  const restore = replaceMethod(db, 'transaction', transactionFactory)

  try {
    await callback(store)
  } finally {
    restore()
  }
}

function createOpenRequest({
  event = 'success',
  error = new DOMException(`mock open ${event}`, 'InvalidStateError'),
  oldVersion = 1,
  newVersion = 2,
} = {}) {
  const request = {
    result: null,
    error,
    onsuccess: null,
    onerror: null,
    onblocked: null,
    onupgradeneeded: null,
  }

  queueMicrotask(() => {
    if (event === 'error') request.onerror?.()
    else if (event === 'blocked')
      request.onblocked?.({ oldVersion, newVersion })
    else request.onsuccess?.()
  })

  return request
}

function createDeleteRequest({
  event = 'success',
  error = new DOMException(`mock delete ${event}`, 'InvalidStateError'),
  oldVersion = 1,
  newVersion = null,
} = {}) {
  const request = {
    error,
    onsuccess: null,
    onerror: null,
    onblocked: null,
  }

  queueMicrotask(() => {
    if (event === 'error') request.onerror?.()
    else if (event === 'blocked')
      request.onblocked?.({ oldVersion, newVersion })
    else request.onsuccess?.()
  })

  return request
}

test('constructor rejects an invalid namespace', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  assert.throws(
    () => new KVStore(''),
    (error) => {
      assert.equal(error.name, 'KVStoreError')
      assert.equal(error.code, 'NAME_WAS_INVALID')
      assert.match(
        error.message,
        /\{@sovereignbase\/offline-kv-store\} namespace must be a non-empty string/
      )
      return true
    }
  )
})

test('put, get, has, delete, and clear round-trip values', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const store = new KVStore('unit-basic')
  const first = createValue(1)
  const second = createValue(2)

  assert.equal(await store.has('missing'), false)
  assert.equal(await store.get('missing'), undefined)

  await store.put('alpha', first)
  await store.put('beta', second)

  assert.equal(await store.has('alpha'), true)
  assert.deepEqual(await store.get('alpha'), first)
  assert.deepEqual(await store.get('beta'), second)

  await store.delete('alpha')

  assert.equal(await store.has('alpha'), false)
  assert.equal(await store.get('alpha'), undefined)
  assert.deepEqual(await store.get('beta'), second)

  await store.clear()

  assert.equal(await store.has('beta'), false)
  assert.equal(await store.get('beta'), undefined)
})

test('namespaces isolate values for the same key', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const left = new KVStore('unit-left')
  const right = new KVStore('unit-right')

  await left.put('shared', createValue(10))
  await right.put('shared', createValue(20))

  assert.deepEqual(await left.get('shared'), createValue(10))
  assert.deepEqual(await right.get('shared'), createValue(20))

  await left.clear()

  assert.equal(await left.get('shared'), undefined)
  assert.deepEqual(await right.get('shared'), createValue(20))
})

test('multiple instances in the same namespace share persisted data', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const writer = new KVStore('unit-shared')
  const reader = new KVStore('unit-shared')

  await writer.put('entry', createValue(30))

  assert.equal(await reader.has('entry'), true)
  assert.deepEqual(await reader.get('entry'), createValue(30))
})

test('resolveDB reuses the active connection and exposes created stores', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const store = new KVStore('unit-inspect')
  await store.put('entry', createValue(40))

  const dbA = await resolveDB()
  const dbB = await resolveDB()

  assert.equal(dbA, dbB)
  assert.equal(dbA.objectStoreNames.contains('unit-inspect'), true)
})

test('synchronous transaction failures map to KVStoreError', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const store = new KVStore('unit-closed-db')
  await store.put('entry', createValue(50))

  const db = await resolveDB()
  db.close()

  await assert.rejects(
    () => store.get('entry'),
    (error) => {
      assert.equal(error.name, 'KVStoreError')
      assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
      assert.match(
        error.message,
        /\{@sovereignbase\/offline-kv-store\}.*(database connection is closing|not active|InvalidStateError|close)/i
      )
      return true
    }
  )
})

test('has falls back to store.get when getKey is unavailable', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-has-fallback',
    () =>
      createMockTransaction({
        event: 'complete',
        requestResult: 'fallback-result',
        withGetKey: false,
      }),
    async (store) => {
      assert.equal(await store.has('entry'), true)
    }
  )
})

test('get maps transaction error callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-get-error',
    () => createMockTransaction({ event: 'error', errorMessage: 'get failed' }),
    async (store) => {
      await assert.rejects(
        () => store.get('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(error.message, /get failed/)
          return true
        }
      )
    }
  )
})

test('get maps transaction abort callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-get-abort',
    () =>
      createMockTransaction({ event: 'abort', errorMessage: 'get aborted' }),
    async (store) => {
      await assert.rejects(
        () => store.get('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_ABORTED')
          assert.match(error.message, /get aborted/)
          return true
        }
      )
    }
  )
})

test('get falls back to the error code detail for non-Error throws', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-get-non-error-throw',
    () => createMockTransaction({ throwValue: 123 }),
    async (store) => {
      await assert.rejects(
        () => store.get('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(
            error.message,
            /\{@sovereignbase\/offline-kv-store\} INDEXED_DB_TRANSACTION_FAILED/
          )
          return true
        }
      )
    }
  )
})

test('has maps transaction error callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-has-error',
    () => createMockTransaction({ event: 'error', errorMessage: 'has failed' }),
    async (store) => {
      await assert.rejects(
        () => store.has('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(error.message, /has failed/)
          return true
        }
      )
    }
  )
})

test('has maps transaction abort callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-has-abort',
    () =>
      createMockTransaction({ event: 'abort', errorMessage: 'has aborted' }),
    async (store) => {
      await assert.rejects(
        () => store.has('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_ABORTED')
          assert.match(error.message, /has aborted/)
          return true
        }
      )
    }
  )
})

test('has maps synchronous transaction throws', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-has-throw',
    () => createMockTransaction({ throwValue: new Error('has threw') }),
    async (store) => {
      await assert.rejects(
        () => store.has('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(error.message, /has threw/)
          return true
        }
      )
    }
  )
})

test('has falls back to the error code detail for non-Error throws', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-has-non-error-throw',
    () => createMockTransaction({ throwValue: 123 }),
    async (store) => {
      await assert.rejects(
        () => store.has('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(
            error.message,
            /\{@sovereignbase\/offline-kv-store\} INDEXED_DB_TRANSACTION_FAILED/
          )
          return true
        }
      )
    }
  )
})

test('put maps transaction error callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-put-error',
    () => createMockTransaction({ event: 'error', errorMessage: 'put failed' }),
    async (store) => {
      await assert.rejects(
        () => store.put('entry', createValue(60)),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(error.message, /put failed/)
          return true
        }
      )
    }
  )
})

test('put maps transaction abort callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-put-abort',
    () =>
      createMockTransaction({ event: 'abort', errorMessage: 'put aborted' }),
    async (store) => {
      await assert.rejects(
        () => store.put('entry', createValue(61)),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_ABORTED')
          assert.match(error.message, /put aborted/)
          return true
        }
      )
    }
  )
})

test('put maps synchronous transaction throws', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-put-throw',
    () => createMockTransaction({ throwValue: new Error('put threw') }),
    async (store) => {
      await assert.rejects(
        () => store.put('entry', createValue(62)),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(error.message, /put threw/)
          return true
        }
      )
    }
  )
})

test('put falls back to the error code detail for non-Error throws', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-put-non-error-throw',
    () => createMockTransaction({ throwValue: 123 }),
    async (store) => {
      await assert.rejects(
        () => store.put('entry', createValue(63)),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(
            error.message,
            /\{@sovereignbase\/offline-kv-store\} INDEXED_DB_TRANSACTION_FAILED/
          )
          return true
        }
      )
    }
  )
})

test('delete maps transaction abort callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-delete-abort',
    () =>
      createMockTransaction({ event: 'abort', errorMessage: 'delete aborted' }),
    async (store) => {
      await assert.rejects(
        () => store.delete('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_ABORTED')
          assert.match(error.message, /delete aborted/)
          return true
        }
      )
    }
  )
})

test('delete maps transaction error callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-delete-error',
    () =>
      createMockTransaction({ event: 'error', errorMessage: 'delete failed' }),
    async (store) => {
      await assert.rejects(
        () => store.delete('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(error.message, /delete failed/)
          return true
        }
      )
    }
  )
})

test('delete maps synchronous transaction throws', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-delete-throw',
    () => createMockTransaction({ throwValue: new Error('delete threw') }),
    async (store) => {
      await assert.rejects(
        () => store.delete('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(error.message, /delete threw/)
          return true
        }
      )
    }
  )
})

test('delete falls back to the error code detail for non-Error throws', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-delete-non-error-throw',
    () => createMockTransaction({ throwValue: 123 }),
    async (store) => {
      await assert.rejects(
        () => store.delete('entry'),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(
            error.message,
            /\{@sovereignbase\/offline-kv-store\} INDEXED_DB_TRANSACTION_FAILED/
          )
          return true
        }
      )
    }
  )
})

test('clear maps transaction error callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-clear-error',
    () =>
      createMockTransaction({ event: 'error', errorMessage: 'clear failed' }),
    async (store) => {
      await assert.rejects(
        () => store.clear(),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(error.message, /clear failed/)
          return true
        }
      )
    }
  )
})

test('clear maps synchronous Error throws', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-clear-throw',
    () => createMockTransaction({ throwValue: new Error('clear threw') }),
    async (store) => {
      await assert.rejects(
        () => store.clear(),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(error.message, /clear threw/)
          return true
        }
      )
    }
  )
})

test('clear maps transaction abort callbacks', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-clear-abort',
    () =>
      createMockTransaction({ event: 'abort', errorMessage: 'clear aborted' }),
    async (store) => {
      await assert.rejects(
        () => store.clear(),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_ABORTED')
          assert.match(error.message, /clear aborted/)
          return true
        }
      )
    }
  )
})

test('non-Error transaction throws fall back to the error code detail', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  await withMockedTransaction(
    'unit-non-error-throw',
    () => createMockTransaction({ throwValue: 123 }),
    async (store) => {
      await assert.rejects(
        () => store.clear(),
        (error) => {
          assert.equal(error.code, 'INDEXED_DB_TRANSACTION_FAILED')
          assert.match(
            error.message,
            /\{@sovereignbase\/offline-kv-store\} INDEXED_DB_TRANSACTION_FAILED/
          )
          return true
        }
      )
    }
  )
})

test('resolveDB maps open failures and clears the cached promise for retries', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const restoreOpen = replaceMethod(indexedDB, 'open', () =>
    createOpenRequest({
      event: 'error',
      error: new DOMException('open failed', 'InvalidStateError'),
    })
  )

  await assert.rejects(
    () => resolveDB(),
    (error) => {
      assert.equal(error.code, 'DATABASE_OPEN_FAILED')
      assert.match(error.message, /open failed/)
      return true
    }
  )

  restoreOpen()

  const db = await resolveDB()
  assert.ok(db)
})

test('resolveDB maps blocked open requests', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const restoreOpen = replaceMethod(indexedDB, 'open', () =>
    createOpenRequest({ event: 'blocked', oldVersion: 4, newVersion: 5 })
  )

  try {
    await assert.rejects(
      () => resolveDB(),
      (error) => {
        assert.equal(error.code, 'DATABASE_OPEN_BLOCKED')
        assert.match(error.message, /oldVersion=4, newVersion=5/)
        return true
      }
    )
  } finally {
    restoreOpen()
  }
})

test('destroyDB maps deletion failures', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const store = new KVStore('unit-delete-db-error')
  await store.put('entry', createValue(70))

  const restoreDelete = replaceMethod(indexedDB, 'deleteDatabase', () =>
    createDeleteRequest({
      event: 'error',
      error: new DOMException('delete failed', 'InvalidStateError'),
    })
  )

  try {
    await assert.rejects(
      () => destroyDB(),
      (error) => {
        assert.equal(error.code, 'DATABASE_DELETION_FAILED')
        assert.match(error.message, /delete failed/)
        return true
      }
    )
  } finally {
    restoreDelete()
  }
})

test('destroyDB maps blocked deletion requests', async (t) => {
  await resetDatabase()
  t.after(resetDatabase)

  const store = new KVStore('unit-delete-db-blocked')
  await store.put('entry', createValue(71))

  const restoreDelete = replaceMethod(indexedDB, 'deleteDatabase', () =>
    createDeleteRequest({ event: 'blocked', oldVersion: 9, newVersion: null })
  )

  try {
    await assert.rejects(
      () => destroyDB(),
      (error) => {
        assert.equal(error.code, 'DATABASE_DELETION_BLOCKED')
        assert.match(error.message, /oldVersion=9, newVersion=null/)
        return true
      }
    )
  } finally {
    restoreDelete()
  }
})
