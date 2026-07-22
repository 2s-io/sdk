/**
 * Agent: equity-research dossier — one ticker in, an SEC-grounded brief out.
 *
 * A research agent is handed a stock ticker and needs a factual, cited snapshot
 * before it reasons about the company: what has it filed lately, how are its
 * fundamentals trending, and are insiders buying or selling? Rather than
 * scraping EDGAR and parsing Form 4 XML itself, the agent composes three calls:
 *   - finance.cikTicker      → resolve the ticker to a canonical SEC CIK + name
 *                              (identity step; every SEC record is keyed by CIK)
 *   - finance.companyProfile → one "company 360": recent filings + curated XBRL
 *                              fundamentals + recent insider activity, each
 *                              section degrading independently (found/error)
 *   - finance.insiderTrades  → drill down into parsed Form 4 transactions
 *                              (code, shares, price/share, USD value) — the
 *                              detail the profile only counts
 *
 * The point: the agent gets analyst-ready, source-cited SEC data in a handful
 * of paid calls — no EDGAR crawling, no XBRL frames, no XML parsing on its side.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx equity-research-dossier.ts AAPL
 *
 * Wallet must hold a small USDC balance on Base. Everything here is public-domain
 * SEC data; each response carries its own {provider, url, license} source block.
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

const ticker = (process.argv[2] ?? 'AAPL').toUpperCase()

function fmtUsd(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 'n/a'
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toLocaleString()}`
}

async function dossier() {
  console.log(`Building SEC dossier for ${ticker}\n`)

  // 1. Identity: ticker → CIK. Everything at the SEC is keyed by CIK, not ticker.
  const idRes = await client.finance.cikTicker({ ticker })
  const id = ((idRes.data as any)?.items ?? [])[0]
  if (!id?.cik) {
    console.log(`No SEC registrant found for ${ticker} — is it a US-listed company?`)
    return
  }
  console.log(`Registrant: ${id.name}  (CIK ${id.cik})\n`)

  // 2. One-call 360: filings + fundamentals + insider activity.
  const profRes = await client.finance.companyProfile({ ticker, limit: 5 })
  const prof = (profRes.data as any) ?? {}

  const filings = (prof.filings?.filings ?? []) as Array<any>
  console.log(`Recent filings (${prof.filings?.count ?? filings.length}):`)
  for (const f of filings.slice(0, 5)) {
    console.log(`  ${f.formType ?? f.form ?? '?'}  ${f.filedAt ?? f.filingDate ?? ''}`)
  }

  const metrics = (prof.fundamentals?.metrics ?? []) as Array<any>
  console.log(`\nFundamentals (${prof.fundamentals?.entityName ?? id.name}):`)
  for (const m of metrics.slice(0, 6)) {
    const latest = (m.annual ?? m.quarterly ?? [])[0]
    if (latest) console.log(`  ${m.metric}: ${fmtUsd(latest.value)}  (FY${latest.fy ?? latest.fp ?? '?'})`)
  }

  // 3. Drill down: parsed Form 4 transactions the profile only summarizes.
  const itRes = await client.finance.insiderTrades({ ticker, limit: 5 })
  const itItems = ((itRes.data as any)?.items ?? []) as Array<any>
  console.log(`\nRecent insider transactions:`)
  let buys = 0
  let sells = 0
  for (const filing of itItems) {
    const who = filing.reportingOwner?.name ?? 'unknown'
    const title = filing.reportingOwner?.officerTitle ?? (filing.reportingOwner?.isDirector ? 'Director' : '')
    for (const t of (filing.transactions ?? []) as Array<any>) {
      const disposed = t.acquiredOrDisposed === 'D'
      if (t.code === 'P') buys++
      if (t.code === 'S') sells++
      console.log(
        `  ${t.transactionDate ?? filing.filingDate ?? ''}  ${who}${title ? ` (${title})` : ''}` +
          `  ${disposed ? 'SOLD' : 'BOUGHT'} ${Number(t.shares ?? 0).toLocaleString()} ${t.securityTitle ?? 'shares'}` +
          `  @ ${t.pricePerShare != null ? `$${t.pricePerShare}` : 'n/a'}  =${fmtUsd(t.totalValueUsd)}  [code ${t.code}]`,
      )
    }
  }

  // Agent-ready signal: net insider direction over the pulled window.
  const signal = buys === sells ? 'mixed' : buys > sells ? 'net buying' : 'net selling'
  console.log(`\nInsider signal (last ${itItems.length} filings): ${signal}  (${buys} buys / ${sells} sells)`)
  console.log(`Source: SEC EDGAR — public domain. Every field above is cited in each call's source block.`)
}

dossier().catch((e) => {
  console.error(e)
  process.exit(1)
})
