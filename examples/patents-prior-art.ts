/**
 * Agent: prior-art search before filing a patent application.
 *
 * Given a brief invention disclosure, search USPTO for similar applications
 * filed in the last N years and surface the closest matches. Use this
 * pattern in a patent-prep workflow where the agent wants to flag
 * "you should look at these before filing" without forcing a human to
 * type the search terms themselves.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx patents-prior-art.ts
 *
 * Wallet must hold a small USDC balance on Base. Each call costs $0.0018.
 */

import { TwoS } from '@2sio/sdk'

const disclosure =
  'A method for neural-network-based beamforming in 5G millimeter-wave cellular base stations.'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

async function priorArt() {
  // Extract the search terms — in real code you'd ask the LLM for these;
  // here we hard-code a couple of obvious keywords.
  const queries = ['neural network beamforming', 'mmWave beamforming']

  const allHits: Array<{ q: string; applicationNumber: string; title: string; filingDate: string; url: string }> = []

  for (const q of queries) {
    const res = await client.patents.search({
      q,
      yearFrom: new Date().getFullYear() - 5,
      limit: 5,
    })
    for (const hit of res.data.hits) {
      allHits.push({ q, applicationNumber: hit.applicationNumber, title: hit.title, filingDate: hit.filingDate, url: hit.url })
    }
  }

  // Dedupe by application number
  const byApp = new Map<string, (typeof allHits)[number]>()
  for (const h of allHits) byApp.set(h.applicationNumber, h)

  console.log(`Disclosure:\n  ${disclosure}\n`)
  console.log(`Prior-art candidates (${byApp.size}):\n`)
  for (const h of byApp.values()) {
    console.log(`  ${h.applicationNumber}  ${h.filingDate}`)
    console.log(`    "${h.title}"`)
    console.log(`    ${h.url}\n`)
  }
}

priorArt().catch((e) => {
  console.error(e)
  process.exit(1)
})
