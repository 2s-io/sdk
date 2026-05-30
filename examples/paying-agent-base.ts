/**
 * Minimum-viable paying agent: hits 2s.io with a private key, pays per call
 * in USDC on Base mainnet, prints typed responses.
 *
 * Usage:
 *
 *   EVM_PRIVATE_KEY=0x...  npx tsx paying-agent-base.ts
 *
 * Requires a Base mainnet wallet with USDC ≥ $0.01. Total cost across the
 * three calls below: ~$0.0076.
 */

import { TwoS } from '@2sio/sdk'

async function main() {
  const key = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined
  if (!key) {
    console.error('Set EVM_PRIVATE_KEY (0x + 64 hex).')
    process.exit(2)
  }

  const client = new TwoS({
    privateKey: key,
    maxPriceUsd: 0.05,
    onPaymentRequested: async ({ url, amountUsd }) => {
      console.log(`  → paying $${amountUsd.toFixed(6)} for ${url}`)
      return true
    },
  })

  // 1. Find a US patent
  console.log('\n[patents.search] q="neural network compression"')
  const patents = await client.patents.search({ q: 'neural network compression', limit: 3 })
  for (const hit of patents.data.hits) {
    console.log(`  ${hit.applicationNumber}  ${hit.title?.slice(0, 80)}`)
  }
  console.log(`  settled: ${patents.settlement?.txHash}`)

  // 2. Sanctions-screen a name
  console.log('\n[law.sanctions-check] query="John Smith"')
  const sanctions = await client.law.sanctionsCheck({ query: 'John Smith' })
  console.log(`  ${sanctions.data.matches.length} match(es) found`)

  // 3. Validate an Ethereum address
  console.log('\n[crypto.address-validate] vitalik.eth resolved address')
  const addr = await client.crypto.addressValidate({
    chain: 'eth',
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  })
  console.log(`  valid=${addr.data.valid} format=${addr.data.format}`)

  console.log('\n[done] all three calls paid + settled on Base mainnet')
}

main().catch((err) => {
  console.error('[error]', err)
  process.exit(1)
})
