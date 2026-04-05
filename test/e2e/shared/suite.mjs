const TEST_TIMEOUT_MS = 5000

function createValue(id) {
  return {
    id,
    label: `browser-${id}`,
    nested: { id, enabled: id % 2 === 0 },
  }
}

export async function runKVStoreSuite(api, options = {}) {
  const { label = 'runtime' } = options
  const results = { label, ok: true, errors: [], tests: [] }
  const { KVStore, destroyDB, resolveDB } = api

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'assertion failed')
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected)
      throw new Error(message || `expected ${actual} to equal ${expected}`)
  }

  function assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(message || 'deep equality assertion failed')
  }

  async function resetDatabase() {
    try {
      await destroyDB()
    } catch {}
  }

  async function withTimeout(promise, ms, name) {
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`timeout after ${ms}ms${name ? `: ${name}` : ''}`))
      }, ms)
    })
    return Promise.race([promise.finally(() => clearTimeout(timer)), timeout])
  }

  async function runTest(name, fn) {
    try {
      await withTimeout(Promise.resolve().then(fn), TEST_TIMEOUT_MS, name)
      results.tests.push({ name, ok: true })
    } catch (error) {
      results.ok = false
      results.tests.push({ name, ok: false })
      results.errors.push({ name, message: String(error) })
    }
  }

  await runTest('exports shape', async () => {
    await resetDatabase()
    assert(typeof KVStore === 'function', 'KVStore export missing')
    assert(typeof resolveDB === 'function', 'resolveDB export missing')
    assert(typeof destroyDB === 'function', 'destroyDB export missing')
  })

  await runTest('basic CRUD', async () => {
    await resetDatabase()
    const store = new KVStore('browser-basic')

    assertEqual(await store.has('missing'), false)
    assertEqual(await store.get('missing'), undefined)

    await store.put('entry', createValue(1))
    assertEqual(await store.has('entry'), true)
    assertDeepEqual(await store.get('entry'), createValue(1))

    await store.delete('entry')
    assertEqual(await store.has('entry'), false)
    assertEqual(await store.get('entry'), undefined)
  })

  await runTest('namespace isolation', async () => {
    await resetDatabase()
    const alpha = new KVStore('browser-alpha')
    await alpha.put('shared', createValue(2))

    const beta = new KVStore('browser-beta')
    await beta.put('shared', createValue(3))

    assertDeepEqual(await alpha.get('shared'), createValue(2))
    assertDeepEqual(await beta.get('shared'), createValue(3))

    await alpha.clear()

    assertEqual(await alpha.get('shared'), undefined)
    assertDeepEqual(await beta.get('shared'), createValue(3))
  })

  await runTest('shared namespace persistence across instances', async () => {
    await resetDatabase()
    const writer = new KVStore('browser-shared')
    const reader = new KVStore('browser-shared')

    await writer.put('entry', createValue(4))
    assertDeepEqual(await reader.get('entry'), createValue(4))
  })

  await runTest('resolveDB reuses the cached connection', async () => {
    await resetDatabase()
    const store = new KVStore('browser-cache')
    await store.put('entry', createValue(5))

    const dbA = await resolveDB()
    const dbB = await resolveDB()

    assertEqual(dbA, dbB)
    assertEqual(dbA.objectStoreNames.contains('browser-cache'), true)
  })

  await runTest('destroyDB resets stores and allows recreation', async () => {
    await resetDatabase()
    const initial = new KVStore('browser-before-reset')
    await initial.put('entry', createValue(6))
    await destroyDB()

    const recreated = new KVStore('browser-after-reset')
    await recreated.put('fresh', createValue(7))

    const db = await resolveDB()
    assertEqual(db.objectStoreNames.contains('browser-before-reset'), false)
    assertEqual(db.objectStoreNames.contains('browser-after-reset'), true)
    assertDeepEqual(await recreated.get('fresh'), createValue(7))
  })

  await resetDatabase()
  return results
}

export function printResults(results) {
  const passed = results.tests.filter((test) => test.ok).length
  console.log(`${results.label}: ${passed}/${results.tests.length} passed`)
  if (!results.ok) {
    for (const error of results.errors)
      console.error(`  - ${error.name}: ${error.message}`)
  }
}

export function ensurePassing(results) {
  if (results.ok) return
  throw new Error(
    `${results.label} failed with ${results.errors.length} failing tests`
  )
}
