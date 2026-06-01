import { TwoS } from './dist/index.js'
const key = process.env.MAINNET_TEST_PAYER_PRIVATE_KEY
const c = new TwoS({ privateKey: key, baseUrl: 'https://2s.io' })
const r = await c.finance.companyFacts({ ticker: 'AAPL', metrics: 'revenue', annualLimit: 2, quarterlyLimit: 0 })
console.log(JSON.stringify(r, null, 2).slice(0, 3000))
