import * as api from '/dist/index.js'
import {
  ensurePassing,
  printResults,
  runKVStoreSuite,
} from '../shared/suite.mjs'

const results = await runKVStoreSuite(api, { label: 'browser esm' })
printResults(results)
window.__OFFLINE_KV_STORE_RESULTS__ = results
const status = document.getElementById('status')
if (status)
  status.textContent = results.ok ? 'ok' : 'failed: ' + results.errors.length
ensurePassing(results)
