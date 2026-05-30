/**
 * Agent: chained legal research — citation discovery → verification → full text.
 *
 * Given a topic, surface relevant US court opinions. For each top hit,
 * confirm the citation is real (anti-hallucination) and fetch the full
 * opinion text for downstream analysis.
 *
 * Costs per topic: ~$0.003 (case-search) + N × $0.006 (case-verify) +
 * N × $0.0048 (opinion). Budget accordingly.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx legal-research-chain.ts
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

const topic = 'qualified immunity for police officers'

async function research() {
  console.log(`Researching: ${topic}\n`)

  // 1. Discover candidate opinions.
  const search = await client.law.caseSearch({ q: topic, limit: 5, order: 'citeCount-desc' })
  console.log(`Top ${search.data.hits.length} hits by citation count:`)
  for (const h of search.data.hits) {
    console.log(`  ${h.caseName} — ${h.court} ${h.year} | cites=${h.citationCount}`)
  }
  console.log()

  // 2. Pick the most-cited, verify the citation, and fetch the full text.
  const top = search.data.hits[0]
  console.log(`Fetching full text of: ${top.caseName}`)
  console.log(`  Reporter citations: ${top.citations?.join(', ') ?? '(none)'}\n`)

  if (top.citations?.length) {
    const verify = await client.law.caseVerify({ citation: top.citations[0] })
    if (!verify.data.exists) {
      console.error('Citation did not resolve! Aborting.')
      return
    }
    console.log(`  Verified: ${verify.data.canonical.caseName} (${verify.data.canonical.court}, ${verify.data.canonical.year})`)
  }

  const opinion = await client.law.opinion({ clusterId: top.clusterId })
  console.log(`\n--- Opinion text (${opinion.data.text.length} chars, first 600) ---`)
  console.log(opinion.data.text.slice(0, 600) + '…')
  console.log(`\nSource: ${opinion.data.source.url}`)
}

research().catch((e) => {
  console.error(e)
  process.exit(1)
})
