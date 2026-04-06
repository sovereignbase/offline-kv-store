[![npm version](https://img.shields.io/npm/v/@sovereignbase/offline-kv-store)](https://www.npmjs.com/package/@sovereignbase/offline-kv-store)
[![CI](https://github.com/sovereignbase/offline-kv-store/actions/workflows/ci.yaml/badge.svg?branch=master)](https://github.com/sovereignbase/offline-kv-store/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/sovereignbase/offline-kv-store/branch/master/graph/badge.svg)](https://codecov.io/gh/sovereignbase/offline-kv-store)
[![license](https://img.shields.io/npm/l/@sovereignbase/offline-kv-store)](LICENSE)

# offline-kv-store

Small namespace-scoped key-value storage on top of IndexedDB. It is designed for local-first browser data where each namespace maps to its own object store and operations fail with explicit error codes instead of silent fallthrough.

## Compatibility

- Runtimes: modern browsers and runtimes that expose global `indexedDB`
- Module format: ESM and CJS.
- Required globals / APIs: `indexedDB`, `DOMException`.
- TypeScript: bundled types.

## Goals

- Simple `put` / `get` / `has` / `delete` / `clear` API per namespace.
- Explicit error surfaces with stable `code` strings.
- Dynamic namespace creation backed by IndexedDB object stores.
- Small public surface: `KVStore`, `resolveDB`, and `destroyDB`.

## Installation

```sh
npm install @sovereignbase/offline-kv-store
# or
pnpm add @sovereignbase/offline-kv-store
# or
yarn add @sovereignbase/offline-kv-store
# or
bun add @sovereignbase/offline-kv-store
# or
deno add jsr:@sovereignbase/offline-kv-store
# or
vlt install jsr:@sovereignbase/offline-kv-store
```

## Usage

```ts
import { KVStore } from '@sovereignbase/offline-kv-store'

const settings = new KVStore<string>('settings')

await settings.put('theme', 'dark')

const theme = await settings.get('theme')
console.log(theme) // "dark"

console.log(await settings.has('theme')) // true

await settings.delete('theme')
await settings.clear()
```

### Namespaces

Each `KVStore` instance is bound to one namespace:

```ts
import { KVStore } from '@sovereignbase/offline-kv-store'

const profiles = new KVStore<{
  name: string
  email: string
  verified: boolean
}>('profiles')
const drafts = new KVStore<{
  title: string
  body: string
  updatedAt: string
}>('drafts')

await profiles.put('alice', {
  name: 'Alice',
  email: 'alice@example.test',
  verified: true,
})
await drafts.put('welcome', {
  title: 'Hello',
  body: 'Draft content goes here.',
  updatedAt: new Date().toISOString(),
})
```

### Direct database lifecycle

```ts
import { destroyDB, resolveDB } from '@sovereignbase/offline-kv-store'

const db = await resolveDB()
console.log(db.name) // "offline-kv-store"

await destroyDB()
```

## Runtime Behavior

### Browsers / IndexedDB runtimes

Namespaces are created on demand. The first operation for a new namespace may trigger an IndexedDB version upgrade to create the backing object store.

### Validation and errors

Validation failures and runtime failures reject with errors named `KVStoreError`. The error object includes a `code` property such as:

- `NAME_WAS_INVALID`
- `DATABASE_OPEN_FAILED`
- `DATABASE_OPEN_BLOCKED`
- `DATABASE_DELETION_FAILED`
- `DATABASE_DELETION_BLOCKED`
- `INDEXED_DB_TRANSACTION_FAILED`
- `INDEXED_DB_TRANSACTION_ABORTED`

## Tests

- Suite: unit + integration in Node, browser E2E in Playwright.
- Browser matrix: Chromium, Firefox, WebKit, mobile Chrome, mobile Safari.
- Coverage: `c8` at 100% statements / branches / functions / lines for the Node test pass.
- Command: `npm run test`

## Benchmarks

How it was run: `npm run bench`  
Environment: Node `v22.14.0` on `win32 x64` using the repository benchmark harness.

| Operation                       | Workload | Time      | Throughput     |
| ------------------------------- | -------- | --------- | -------------- |
| namespace provision + first put | 200 ops  | 97.92 ms  | 2,042.43 ops/s |
| put                             | 2000 ops | 293.87 ms | 6,805.64 ops/s |
| get                             | 2000 ops | 516.10 ms | 3,875.20 ops/s |
| has                             | 2000 ops | 565.26 ms | 3,538.22 ops/s |
| delete                          | 2000 ops | 823.03 ms | 2,430.05 ops/s |
| clear                           | 1 op     | 3.58 ms   | 279.30 ops/s   |

Results vary by machine and runtime. These numbers come from the included Node benchmark harness, not from an in-browser benchmark.

## License

Apache-2.0
