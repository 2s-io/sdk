/**
 * Agent: use frontier LLMs without holding a single provider API key.
 *
 * Most agents need an OpenAI key, an Anthropic key, a Google key, billing set
 * up with each, and per-provider rate limits to babysit. 2s.io's AI gateway
 * collapses that into one pay-per-call surface settled in USDC on Base — no
 * accounts, no keys, no signup. You pick any gateway model id at call time and
 * pay only for the tokens that request used; the price is quoted in the x402
 * challenge before you pay.
 *
 *   - GET  /api/ai/models        free — the live list of selectable model ids
 *   - ai.chat   { model, messages }   one completion from any one model
 *   - ai.council { prompt, mode }     ask several frontier models at once and
 *                                     get one synthesized answer + the dissent
 *
 * This script: discover the available models (free), run a normal completion
 * against one of them, then escalate a higher-stakes question to the council so
 * disagreement between models surfaces instead of hiding behind one sample.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx ai-gateway-no-keys.ts
 *
 * Wallet must hold a small USDC balance on Base. The /api/ai/models call is
 * free (plain GET, no payment); chat + council are paid per request.
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

// The normalized envelope puts the payload on result.data; one defensive reader
// covers the normal and legacy shapes.
function body(result: { data: unknown }): Record<string, any> {
  const d = result.data as any
  return (d?.result ?? d ?? {}) as Record<string, any>
}

async function main() {
  // 1. Discover models — free, no wallet needed. Pick whatever the catalog
  //    offers rather than hard-coding a provider you happen to have a key for.
  const catalog: any = await (await fetch('https://2s.io/api/ai/models')).json()
  const models: string[] = (catalog?.models ?? catalog?.data ?? [])
    .map((m: any) => (typeof m === 'string' ? m : m?.id))
    .filter(Boolean)
  console.log(`${models.length} gateway models available; e.g. ${models.slice(0, 4).join(', ')}\n`)

  // Prefer a model the catalog actually lists; fall back to a common id.
  const chatModel = models.find((m) => /gpt|claude|gemini/i.test(m)) ?? models[0] ?? 'openai/gpt-5'

  // 2. A normal single-model completion — same shape as an OpenAI chat call.
  const chat = body(
    await client.ai.chat({
      model: chatModel,
      messages: [
        { role: 'system', content: 'You answer in one tight sentence.' },
        { role: 'user', content: 'What is the x402 payment protocol, in plain terms?' },
      ],
      max_tokens: 120,
    }),
  )
  console.log(`[${chatModel}] ${chat.content ?? chat.text ?? '(no content)'}\n`)

  // 3. For a question where being wrong is expensive, don't trust one sample.
  //    The council asks several frontier models, has a chairman synthesize one
  //    answer, and reports a confidence score plus where the models disagreed.
  const council = body(
    await client.ai.council({
      prompt: 'A startup wants to let AI agents pay per API call without accounts. Is x402 over USDC on Base a sound choice, and what is the single biggest risk?',
      mode: 'balanced',
    }),
  )
  console.log('Council consensus:')
  console.log(`  ${council.consensus ?? '(none)'}`)
  console.log(`  confidence: ${council.confidence ?? '?'}`)
  if (council.agreement) console.log(`  agreed on:  ${council.agreement}`)
  for (const d of council.dissent ?? []) console.log(`  dissent:    ${d}`)

  console.log('\nNo provider keys, no accounts — every token billed per call in USDC.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
