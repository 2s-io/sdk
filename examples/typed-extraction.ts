/**
 * Agent: turn a web page into typed data via JSON Schema.
 *
 * /api/ai/extract fetches a URL, runs an LLM with structured-output enforcement
 * against your schema, and returns data that matches that schema EXACTLY.
 * The schema acts as a contract — no free-text parsing required.
 *
 * Use this for any "scrape and structure" workflow: pricing tables, product
 * specs, contact info, dates from press releases, etc. The LLM cost is
 * folded into the call price ($0.03/call) — no separate Anthropic / OpenAI
 * billing to manage.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx typed-extraction.ts
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

// Pull structured event data from a press release / blog post.
const sourceUrl = 'https://www.anthropic.com/news/introducing-claude-2-5-sonnet'

const schema = {
  type: 'object',
  required: ['headline', 'announcedDate', 'product'],
  properties: {
    headline: { type: 'string', description: 'Article headline as displayed' },
    announcedDate: { type: 'string', description: 'ISO date of the announcement (YYYY-MM-DD)' },
    product: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        modelFamily: { type: 'string' },
        keyImprovements: { type: 'array', items: { type: 'string' } },
        pricing: {
          type: 'object',
          properties: {
            inputPerMTok: { type: 'number' },
            outputPerMTok: { type: 'number' },
          },
        },
      },
    },
  },
} as const

async function extract() {
  const res = await client.ai.extract({ url: sourceUrl, schema })
  console.log('Extracted:')
  console.log(JSON.stringify(res.data, null, 2))
  console.log(`\nPaid: $${res.costUsd} USDC  tx: ${res.settlement?.txHash}`)
}

extract().catch((e) => {
  console.error(e)
  process.exit(1)
})
