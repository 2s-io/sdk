/**
 * Agent: catch up on a domain since your training cutoff — in one paid call.
 *
 * Every LLM has a knowledge cutoff. An agent working in a fast-moving domain is
 * blind to everything that happened after it. Instead of firing off a dozen
 * searches and hoping, the agent spends ONE call:
 *   - agent.knowledgeDelta → pass a free-text topic + a `since` date (typically
 *                            the model's own training cutoff). Get back a
 *                            deduplicated, significance-ranked list of real
 *                            events drawn from US federal regulations, House +
 *                            Senate roll-call votes, academic papers
 *                            (arXiv + PubMed + Semantic Scholar), and federal
 *                            court opinions — each with a title, 1-2 sentence
 *                            summary, date, source, source URL, and a 1-5
 *                            significance score.
 *
 * The point: a stateless agent grounds itself on what changed — with citations
 * it can follow — before it reasons or answers, without maintaining its own
 * ingestion pipeline over four different government + academic feeds.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx knowledge-delta-catchup.ts
 *
 * Wallet must hold a small USDC balance on Base. ~$0.06 for the single call.
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

// What the agent needs to get current on, and the date it stopped knowing.
const topic = 'FDA regulation of AI/ML medical devices'
const since = '2025-05-01' // e.g. this model's training cutoff

type DeltaEvent = {
  title: string
  summary: string
  date: string | null
  source: string
  sourceLabel: string
  sourceUrl: string | null
  significance: number
}

async function catchUp() {
  console.log(`Catching up on "${topic}" since ${since}...\n`)

  const res = await client.agent.knowledgeDelta({ topic, since, maxEvents: 15 })

  // Normalized envelope: items = [one knowledge-delta document].
  const doc = ((res.data as any)?.items?.[0] ?? res.data) as any
  const events = (doc?.events ?? []) as DeltaEvent[]
  const sources = (doc?.sourcesQueried ?? []) as string[]

  if (events.length === 0) {
    console.log('No notable events since the cutoff — the agent is already current.')
    return
  }

  console.log(`${events.length} event(s) across sources: ${sources.join(', ')}\n`)

  // Already ranked by significance; lead with what actually matters.
  for (const e of events) {
    const stars = '★'.repeat(e.significance) + '☆'.repeat(5 - e.significance)
    console.log(`${stars}  ${e.date ?? 'n/a'}  [${e.source}]`)
    console.log(`  ${e.title}`)
    console.log(`  ${e.summary}`)
    if (e.sourceUrl) console.log(`  ↳ ${e.sourceUrl}`)
    console.log()
  }

  // A grounding step feeds only the high-significance items into the prompt.
  const mustKnow = events.filter((e) => e.significance >= 4)
  console.log(`${mustKnow.length} high-significance item(s) to inject as grounding context before answering.`)
}

catchUp().catch((e) => {
  console.error(e)
  process.exit(1)
})
