/**
 * Agent: chained legal research — citation discovery → verification → full text.
 *
 * Given a topic, surface relevant US court opinions. For the top hit,
 * verify the citation is real (anti-hallucination) and fetch the full
 * opinion text for downstream analysis.
 *
 * Costs: ~$0.0036 (case-search) + $0.006 (case-verify) + $0.0048 (opinion).
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx legal-research-chain.ts
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

const topic = 'qualified immunity'

async function research() {
  console.log(`Researching: ${topic}\n`)

  // 1. Discover candidate opinions. case-search returns { cases: [...] }.
  const search = await client.law.caseSearch({ q: topic, limit: 5 })
  const cases = (search.data as any).cases as Array<any>
  console.log(`Top ${cases.length} hits:`)
  for (const c of cases) {
    const cite = (c.citations && c.citations[0]) || c.citation || '(no citation)'
    console.log(`  ${c.caseName ?? c.name} — ${c.court ?? ''} ${c.year ?? ''} | ${cite}`)
  }
  console.log()

  const top = cases[0]
  if (!top) {
    console.log('(no results)')
    return
  }
  const sampleCitation = (top.citations && top.citations[0]) || top.citation
  if (!sampleCitation) {
    console.log('(top hit has no citation to verify; skipping)')
    return
  }

  // 2. Verify the citation lives in the corpus.
  console.log(`Verifying citation: "${sampleCitation}"`)
  const verify = await client.law.caseVerify({ text: `as cited at ${sampleCitation}` })
  const citations = (verify.data as any).citations as Array<any>
  const hit = citations.find((c) => c.verified)
  if (!hit) {
    console.error('  Citation did not resolve.')
    return
  }
  console.log(`  ✓ ${hit.case.name} (${hit.case.year}) — ${hit.case.url}`)

  // 3. Pull the full opinion text by citation.
  const opinion = await client.law.opinion({ citation: sampleCitation })
  const text = ((opinion.data as any).text as string) ?? ''
  console.log(`\n--- Opinion text (${text.length} chars, first 600) ---`)
  console.log(text.slice(0, 600) + (text.length > 600 ? '…' : ''))
  console.log(`\nPaid total: $${(search.costUsd + verify.costUsd + opinion.costUsd).toFixed(4)} USDC`)
}

research().catch((e) => {
  console.error(e)
  process.exit(1)
})
