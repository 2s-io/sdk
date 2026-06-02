import { TwoS } from './dist/index.js'
const c = new TwoS({ privateKey: process.env.MAINNET_TEST_PAYER_PRIVATE_KEY, baseUrl: 'https://2s.io' })
console.log('--- vin-decode 2018 Tesla Model 3 ---')
const r1 = await c.request({ method: 'GET', path: '/api/vehicle/vin-decode', query: { vin: '5YJ3E1EA4JF000001' }, endpoint: 'vehicle.vin-decode' })
console.log('  vin:', r1.data.vin, 'year/make/model:', r1.data.modelYear, r1.data.make, r1.data.model)
console.log('  engine:', r1.data.engine.fuelTypePrimary, r1.data.engine.hp+'HP')
console.log('  plant:', r1.data.plant.city, r1.data.plant.country)
console.log('  tx:', r1.settlement?.txHash, 'cost:', r1.costUsd)
console.log('--- recalls Honda Accord 2018 ---')
const r2 = await c.request({ method: 'GET', path: '/api/vehicle/recalls', query: { make: 'Honda', model: 'Accord', modelYear: 2018 }, endpoint: 'vehicle.recalls' })
console.log('  count:', r2.data.count)
for (const rec of r2.data.recalls.slice(0, 3)) {
  console.log(`  · ${rec.campaignNumber} ${rec.component}: ${(rec.summary||'').slice(0, 80)}...`)
}
console.log('  tx:', r2.settlement?.txHash)
