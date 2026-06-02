import { performance } from 'node:perf_hooks'
import { TwoS } from './dist/index.js'

// EVM-only construct.
new TwoS({ privateKey: '0x1111111111111111111111111111111111111111111111111111111111111111' })

// Now check if @solana/kit got pulled in. If lazy works, it's NOT loaded yet,
// so this dynamic-import is a cold load (~50-200ms). If broken, it's cached (<5ms).
const t0 = performance.now()
await import('@solana/kit')
const dt = performance.now() - t0

console.log(`@solana/kit import time after EVM-only TwoS(): ${dt.toFixed(2)}ms`)
if (dt < 5) {
  console.log('✗ FAIL — Solana SDK was already cached, lazy-load is broken')
  process.exit(1)
} else {
  console.log('✓ PASS — Solana SDK was not loaded by EVM-only construct')
}
