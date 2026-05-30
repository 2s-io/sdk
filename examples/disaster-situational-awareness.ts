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
 *   EVM_PRIVATE_KEY=0x... npx tsx disaster-situational-awareness.ts
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

// Tokyo, near a known seismic zone, coastal — usually has signal.
const lat = 35.6895
const lon = 139.6917

async function situation() {
  const snapshot = await client.earth.now({ lat, lon })
  const d = snapshot.data as Record<string, any>

  console.log(`Situation at ${lat}, ${lon}  (endpoint: ${snapshot.endpoint})\n`)

  // The shape of /api/earth/now's composite payload may evolve; we print
  // each known top-level slice when present, fall back to JSON when not.
  for (const key of ['weather', 'quakes', 'sun', 'tide']) {
    if (d[key] !== undefined) {
      console.log(`${key}:\n${JSON.stringify(d[key], null, 2)}\n`)
    }
  }

  console.log(`Paid: $${snapshot.costUsd} USDC — tx ${snapshot.settlement?.txHash}`)
}

situation().catch((e) => {
  console.error(e)
  process.exit(1)
})
