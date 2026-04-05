import 'fake-indexeddb/auto'
import { performance } from 'node:perf_hooks'
import { KVStore, destroyDB } from '../dist/index.js'

const ENTRY_ITERATIONS = Number.parseInt(
  process.env.BENCH_ENTRY_ITERATIONS || '2000',
  10
)
const NAMESPACE_ITERATIONS = Number.parseInt(
  process.env.BENCH_NAMESPACE_ITERATIONS || '200',
  10
)

function createValue(id) {
  return {
    id,
    label: `bench-${id}`,
    meta: { even: id % 2 === 0, mod10: id % 10 },
  }
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

async function resetDatabase() {
  try {
    await destroyDB()
  } catch {}
}

async function measure(label, operations, fn) {
  const startedAt = performance.now()
  await fn()
  const elapsedMs = performance.now() - startedAt
  const throughput = operations / (elapsedMs / 1000)

  return { label, operations, elapsedMs, throughput }
}

function printResult(result) {
  console.log(
    `${result.label.padEnd(32)} ${String(result.operations).padStart(6)} ops  ${formatNumber(result.elapsedMs).padStart(10)} ms  ${formatNumber(result.throughput).padStart(12)} ops/s`
  )
}

async function main() {
  console.log('offline-kv-store throughput benchmark')
  console.log(
    `entry iterations=${ENTRY_ITERATIONS}, namespace iterations=${NAMESPACE_ITERATIONS}`
  )

  await resetDatabase()

  const namespaceProvisioning = await measure(
    'namespace provision + first put',
    NAMESPACE_ITERATIONS,
    async () => {
      for (let index = 0; index < NAMESPACE_ITERATIONS; index++) {
        const store = new KVStore(`bench-namespace-${index}`)
        await store.put('seed', createValue(index))
      }
    }
  )

  await resetDatabase()

  const store = new KVStore('bench-steady-state')

  const writeResult = await measure('put', ENTRY_ITERATIONS, async () => {
    for (let index = 0; index < ENTRY_ITERATIONS; index++) {
      await store.put(`key-${index}`, createValue(index))
    }
  })

  const readResult = await measure('get', ENTRY_ITERATIONS, async () => {
    for (let index = 0; index < ENTRY_ITERATIONS; index++) {
      await store.get(`key-${index}`)
    }
  })

  const existsResult = await measure('has', ENTRY_ITERATIONS, async () => {
    for (let index = 0; index < ENTRY_ITERATIONS; index++) {
      await store.has(`key-${index}`)
    }
  })

  const deleteResult = await measure('delete', ENTRY_ITERATIONS, async () => {
    for (let index = 0; index < ENTRY_ITERATIONS; index++) {
      await store.delete(`key-${index}`)
    }
  })

  for (let index = 0; index < ENTRY_ITERATIONS; index++) {
    await store.put(`clear-${index}`, createValue(index))
  }

  const clearResult = await measure('clear', 1, async () => {
    await store.clear()
  })

  console.log('')
  for (const result of [
    namespaceProvisioning,
    writeResult,
    readResult,
    existsResult,
    deleteResult,
    clearResult,
  ]) {
    printResult(result)
  }

  await resetDatabase()
}

await main()
