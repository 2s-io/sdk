import { TwoS } from './dist/index.js'
const c = new TwoS({ privateKey: process.env.MAINNET_TEST_PAYER_PRIVATE_KEY, baseUrl: 'https://2s.io' })

console.log('--- complaints Honda Accord 2018 ---')
const r1 = await c.request({ method: 'GET', path: '/api/vehicle/complaints', query: { make: 'Honda', model: 'Accord', modelYear: 2018, limit: 3 }, endpoint: 'vehicle.complaints' })
console.log('  totalCount:', r1.data.totalCount, 'returned:', r1.data.returned)
for (const cp of r1.data.complaints) {
  const flags = [cp.crash && 'CRASH', cp.fire && 'FIRE', cp.numberOfInjuries && `${cp.numberOfInjuries} INJ`, cp.numberOfDeaths && `${cp.numberOfDeaths} DEATH`].filter(Boolean).join(' ')
  console.log(`  · ODI ${cp.odiNumber} [${cp.components}] ${flags || 'no incidents'}: ${(cp.summary||'').slice(0, 80)}...`)
}
console.log('  tx:', r1.settlement?.txHash)

console.log('--- models Tesla 2023 ---')
const r2 = await c.request({ method: 'GET', path: '/api/vehicle/models', query: { make: 'Tesla', modelYear: 2023 }, endpoint: 'vehicle.models' })
console.log('  count:', r2.data.count, 'models:', r2.data.models.map(m => m.modelName).join(', '))
console.log('  tx:', r2.settlement?.txHash)
