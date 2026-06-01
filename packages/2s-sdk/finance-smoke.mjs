import { TwoS } from './dist/index.js'

const key = process.env.MAINNET_TEST_PAYER_PRIVATE_KEY
if (!key) { console.error('MAINNET_TEST_PAYER_PRIVATE_KEY not set'); process.exit(1) }

const c = new TwoS({ privateKey: key, baseUrl: 'https://2s.io' })

async function main() {
  console.log('--- company-facts: AAPL, revenue+netIncome ---')
  const r1 = await c.finance.companyFacts({ ticker: 'AAPL', metrics: 'revenue,netIncome', annualLimit: 2, quarterlyLimit: 1 })
  console.log('  returned:', r1.data.returned, 'entity:', r1.data.entityName, 'cost:', r1.meta.cost.usd)
  for (const m of r1.data.metrics) {
    console.log(`  ${m.key}: annual=${m.annual.map(a => `${a.fiscalYear}=$${(a.val/1e9).toFixed(1)}B`).join(', ')}, q=${m.quarterly.map(q => `${q.fiscalYear}${q.fiscalPeriod}=$${(q.val/1e9).toFixed(1)}B`).join(', ')}`)
  }

  console.log('--- insider-trades: AAPL ---')
  const r2 = await c.finance.insiderTrades({ ticker: 'AAPL', limit: 2 })
  console.log('  returned:', r2.data.returned, 'cost:', r2.meta.cost.usd)
  for (const f of r2.data.filings) {
    console.log(`  ${f.filingDate} ${f.reportingOwner.name} (${f.reportingOwner.isOfficer ? f.reportingOwner.officerTitle : f.reportingOwner.isDirector ? 'Director' : 'Other'}): ${f.transactions.length} tx`)
    for (const t of f.transactions.slice(0, 2)) {
      console.log(`    ${t.code} ${t.acquiredOrDisposed} ${t.shares} ${t.securityTitle} @ $${t.pricePerShare ?? '—'}`)
    }
  }

  console.log('--- 13F: Berkshire Hathaway (CIK 1067983) ---')
  const r3 = await c.finance.thirteenF({ managerCik: '1067983', limit: 5 })
  console.log('  manager:', r3.data.managerName, 'period:', r3.data.filing.periodOfReport, 'positions:', r3.data.totalPositions, 'cost:', r3.meta.cost.usd)
  for (const h of r3.data.holdings) {
    console.log(`    ${h.nameOfIssuer}: $${(h.valueUsd/1e9).toFixed(2)}B (${h.sharesOrPrinAmt} ${h.sharesOrPrinAmtType})`)
  }
}

main().catch(e => { console.error('SMOKE FAILED:', e?.message ?? e); process.exit(1) })
