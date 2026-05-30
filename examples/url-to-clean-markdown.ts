/**
 * Agent: fetch any web page and return clean, LLM-ready markdown.
 *
 * `/api/url/clean` strips nav, footer, ads, sidebars, scripts, and styles
 * via heuristic article extraction (<article>, <main>, role=main, densest
 * content block). The output is the article body as markdown — well-suited
 * for downstream summarization, RAG ingestion, or just reading.
 *
 * Use this instead of fetching raw HTML when you only care about content,
 * not chrome. Each call: $0.00108 + 8s server-side timeout, SSRF-guarded,
 * 512KB cap on the source HTML.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx url-to-clean-markdown.ts <url>
 */

import { TwoS } from '@2sio/sdk'

const url = process.argv[2] ?? 'https://www.uspto.gov/patents/basics'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

async function run() {
  const res = await client.url.clean({ url })
  const d = res.data
  console.log(`# ${d.title}\n`)
  console.log(`Source: ${url}`)
  console.log(`Words: ${d.wordCount}, bytes scraped: ${d.sourceBytes}\n`)
  console.log(`Paid: $${res.costUsd}  tx: ${res.settlement?.txHash}\n`)
  console.log('---\n')
  console.log(d.markdown.slice(0, 2000))
  if (d.markdown.length > 2000) console.log(`…\n[truncated; full markdown is ${d.markdown.length} chars]`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
