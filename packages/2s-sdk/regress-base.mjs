import { TwoS } from './dist/index.js'
const c = new TwoS({ privateKey: process.env.MAINNET_TEST_PAYER_PRIVATE_KEY, baseUrl: 'https://2s.io' })
// Cheapest endpoint to keep cost negligible
const r = await c.finance.companyFacts({ ticker: 'TSLA', metrics: 'revenue', annualLimit: 1, quarterlyLimit: 0 })
console.log('status: 200 (implicit, we got data back)')
console.log('  ticker:', r.data.ticker, 'returned:', r.data.returned)
console.log('  settlement:', JSON.stringify(r.settlement))
console.log('  cost:', r.costUsd)
console.log('  endpoint:', r.endpoint)
