import { TwoS } from './dist/index.js'
const c = new TwoS({ privateKey: process.env.MAINNET_TEST_PAYER_PRIVATE_KEY, baseUrl: 'https://2s.io' })

console.log('--- insider-trades AAPL ---')
const r2 = await c.finance.insiderTrades({ ticker: 'AAPL', limit: 2 })
console.log('returned:', r2.data.returned, 'cost:', r2.meta?.cost)
for (const f of r2.data.filings) {
  console.log(`  ${f.filingDate}  ${f.reportingOwner.name} (officer=${f.reportingOwner.isOfficer}, ${f.reportingOwner.officerTitle ?? f.reportingOwner.isDirector ? 'Director' : '—'}), ${f.transactions.length} tx`)
  for (const t of f.transactions.slice(0, 3)) {
    console.log(`    ${t.code} ${t.acquiredOrDisposed} shares=${t.shares} @ ${t.pricePerShare} (${t.securityTitle})`)
  }
}

console.log('--- 13F Berkshire ---')
const r3 = await c.finance.thirteenF({ managerCik: '1067983', limit: 5 })
console.log('manager:', r3.data.managerName, 'periodOfReport:', r3.data.filing.periodOfReport, 'positions:', r3.data.totalPositions, 'totalValueUsd: $', (r3.data.totalValueUsd/1e9).toFixed(1)+'B')
for (const h of r3.data.holdings) {
  console.log(`  ${h.nameOfIssuer}: $${(h.valueUsd/1e9).toFixed(2)}B (${h.sharesOrPrinAmt} ${h.sharesOrPrinAmtType})`)
}
