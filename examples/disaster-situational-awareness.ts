/**
 * Agent: real-time situational awareness for a coordinate.
 *
 * Given a lat/lon (e.g., from a user's location-sharing or a news event),
 * pull current weather, recent earthquakes, tide state, and sunrise/sunset.
 * Useful for disaster-response agents, travel safety agents, or any
 * "what's happening RIGHT NOW at this place" workflow.
 *
 * /api/earth/now is a composite — single $0.0012 call returns all of the
 * above bundled together. This example shows the composite usage; the
 * individual endpoints (weather/zip, quakes/recent, tides/now, sunrise/compute)
 * are also available if you only need one slice.
 *
 * Run:
 *   WALLET_KEY=0x... npx tsx disaster-situational-awareness.ts
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.WALLET_KEY as `0x${string}` })

// Tokyo, near a known seismic zone, coastal — usually has signal.
const lat = 35.6895
const lon = 139.6917

async function situation() {
  const snapshot = await client.earth.now({ lat, lon })
  const d = snapshot.data

  console.log(`Situation at ${lat}, ${lon}  (${snapshot.meta.endpoint})\n`)

  if (d.weather) {
    console.log(`Weather: ${d.weather.summary}, ${d.weather.temperatureC}°C, wind ${d.weather.windKph} kph`)
  }
  if (d.quakes?.length) {
    console.log(`\nRecent quakes within ${d.quakes[0].radiusKm ?? '?'} km:`)
    for (const q of d.quakes.slice(0, 3)) {
      console.log(`  M${q.magnitude.toFixed(1)}  ${q.time}  depth=${q.depthKm}km  ${q.distanceKm.toFixed(1)}km away`)
    }
  } else {
    console.log('\nNo recent earthquakes.')
  }
  if (d.sun) {
    console.log(`\nSun: rises ${d.sun.sunrise}, sets ${d.sun.sunset}`)
  }
  if (d.tide) {
    console.log(`\nTide: ${d.tide.state}, next ${d.tide.nextEvent.type} at ${d.tide.nextEvent.time}`)
  }

  console.log(`\nPaid: $${snapshot.meta.cost.usd} USDC — tx ${snapshot.meta.settlement.txHash}`)
}

situation().catch((e) => {
  console.error(e)
  process.exit(1)
})
