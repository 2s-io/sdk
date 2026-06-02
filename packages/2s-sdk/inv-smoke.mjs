import { TwoS } from './dist/index.js'
const c = new TwoS({ privateKey: process.env.MAINNET_TEST_PAYER_PRIVATE_KEY, baseUrl: 'https://2s.io' })
const r = await c.request({ method: 'GET', path: '/api/vehicle/investigations', query: { limit: 3, status: 'O' }, endpoint: 'vehicle.investigations' })
console.log('total:', r.data.totalCount, 'returned:', r.data.returned, 'nextOffset:', r.data.pagination.nextOffset)
for (const inv of r.data.investigations) {
  console.log(`  · ${inv.nhtsaId} [${inv.investigationType}] ${inv.subject}`)
  console.log(`    ${inv.description.slice(0, 100)}...`)
}
console.log('  tx:', r.settlement?.txHash)
