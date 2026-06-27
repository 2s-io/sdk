/**
 * Agent: crosswalk one entity across identifier systems before joining data.
 *
 * Agents constantly have to reconcile records that key on different IDs: a
 * filings feed uses SEC CIK, a market-data feed uses ticker, a counterparty
 * graph uses LEI. Joining them means maintaining crosswalk tables — exactly
 * the kind of stale, fiddly plumbing an agent shouldn't own.
 *
 * 2s.io's resolve/crosswalk endpoints turn that into one call per hop, built
 * only on in-hand public-domain / CC0 identifier datasets (it deliberately
 * never emits licensed identifiers like CUSIP or SEDOL):
 *   - finance.cikTicker      ticker  <-> SEC CIK
 *   - finance.securityResolve ticker -> ISIN + LEI (public-domain only)
 *   - business.idResolve      any of {name, ticker, cik, lei} -> unified bundle
 *
 * Given a ticker, we assemble a canonical identity bundle an agent can use as
 * stable join keys across all three feeds.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx identity-crosswalk.ts
 *
 * Wallet must hold a small USDC balance on Base.
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

const ticker = 'MSFT'

// The resolve endpoints return a normalized envelope; the resolved record is
// the first item (or the body itself on legacy shapes). One defensive reader.
function first(result: { data: unknown }): Record<string, any> {
  const d = result.data as any
  return (d?.items?.[0] ?? d?.result ?? d ?? {}) as Record<string, any>
}

async function crosswalk() {
  console.log(`Crosswalking ticker "${ticker}" across identifier systems\n`)

  // 1. ticker -> SEC CIK (the key every EDGAR filing is indexed by).
  const cikRec = first(await client.finance.cikTicker({ ticker }))
  const cik: string | undefined = cikRec.cik ?? cikRec.cikStr
  console.log(`SEC CIK:  ${cik ?? '(unresolved)'}`)

  // 2. ticker -> ISIN + LEI (public-domain identifiers only — no CUSIP/SEDOL).
  const sec = first(await client.finance.securityResolve({ ticker }))
  console.log(`ISIN:     ${sec.isin ?? '(unresolved)'}`)
  console.log(`LEI:      ${sec.lei ?? '(unresolved)'}`)

  // 3. One unified bundle keyed off whatever we now know.
  const bundle = first(await client.business.idResolve({ ticker, cik, lei: sec.lei }))
  console.log(`\nUnified identity bundle:`)
  console.log(`  legal name: ${bundle.legalName ?? bundle.name ?? '(unknown)'}`)
  if (bundle.lei) console.log(`  LEI:        ${bundle.lei}`)
  if (bundle.cik) console.log(`  CIK:        ${bundle.cik}`)
  if (bundle.ticker) console.log(`  ticker:     ${bundle.ticker}`)

  console.log(`\nThese resolve to the same entity — use them as join keys across feeds.`)
}

crosswalk().catch((e) => {
  console.error(e)
  process.exit(1)
})
