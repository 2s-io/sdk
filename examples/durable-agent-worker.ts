/**
 * Agent: a durable, exactly-once work loop on the 2s.io control plane.
 *
 * Stateless agent replicas can't coordinate by themselves — two copies of the
 * same agent will happily do the same job twice, or step on each other writing
 * results. 2s.io exposes the same primitives a backend would reach for, as
 * pay-per-call HTTP endpoints, so an agent gets coordination without standing
 * up Redis / SQS / a database:
 *   - lock.*   → a short-lived lease so only ONE replica is the leader
 *   - queue.*  → enqueue work, lease a batch with a visibility timeout, ack
 *   - store.*  → persist each result under a key any replica can read later
 *
 * The shape below is the classic competing-consumers pattern: lease → do work
 * → persist → ack. A crash before ack just means the item reappears after the
 * visibility window, so nothing is lost and nothing runs twice once acked.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx durable-agent-worker.ts
 *
 * Wallet must hold a small USDC balance on Base.
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

const QUEUE = 'demo-enrichment'
const RESULT_NS = 'demo-enrichment-results'
const LEADER_KEY = 'demo-enrichment-leader'

// The job: pretend we're enriching a handful of domains. Replace with anything.
const WORK = ['stripe.com', 'anthropic.com', 'vercel.com']

async function seed() {
  for (const domain of WORK) {
    await client.queue.enqueue({ queue: QUEUE, body: JSON.stringify({ domain }), maxAttempts: 3 })
  }
  console.log(`Seeded ${WORK.length} items into queue "${QUEUE}".\n`)
}

async function workLoop() {
  // Become the single leader for this batch. ttl is a safety net: if this
  // replica dies, the lease expires and another replica can take over.
  const lease = await client.lock.acquire({ key: LEADER_KEY, ttlSeconds: 60 })
  const token = (lease.data as any)?.items?.[0]?.token ?? (lease.data as any)?.token
  if (!token) {
    console.log('Another replica holds the leader lease — standing down.')
    return
  }
  console.log('Acquired leader lease; draining the queue.\n')

  try {
    // Pull a batch; items are invisible to other workers for visibilitySeconds.
    const leased = await client.queue.lease({ queue: QUEUE, count: 10, visibilitySeconds: 30 })
    const messages = ((leased.data as any)?.items ?? (leased.data as any)?.messages ?? []) as Array<any>

    if (messages.length === 0) {
      console.log('Queue empty — nothing to do.')
      return
    }

    for (const msg of messages) {
      const id: string = msg.id
      const leaseToken: string = msg.leaseToken ?? msg.lease_token
      const { domain } = JSON.parse(msg.body ?? '{}')

      // The actual work — any 2s.io endpoint. Here: who hosts the domain.
      const dns = await client.dns.lookup({ host: domain, types: 'A' })
      const records = ((dns.data as any)?.items ?? []) as Array<any>
      const ip = records[0]?.value ?? records[0]?.data ?? 'unknown'

      // Persist the result so any replica can read it without re-doing the work.
      await client.store.kvPut({ ns: RESULT_NS, key: domain, value: JSON.stringify({ ip }) })

      // Ack — removes the item permanently. Only happens after a durable write,
      // so a crash mid-loop is safe (the item just reappears, un-acked).
      await client.queue.ack({ queue: QUEUE, id, leaseToken })
      console.log(`  ${domain} → ${ip}  (persisted + acked)`)
    }
  } finally {
    // Release the lease promptly so the next run isn't blocked for 60s.
    await client.lock.release({ key: LEADER_KEY, token })
    console.log('\nReleased leader lease.')
  }
}

async function readBack() {
  console.log('\nReading persisted results back from the store:')
  for (const domain of WORK) {
    const got = await client.store.kvGet({ ns: RESULT_NS, key: domain })
    const raw = (got.data as any)?.items?.[0]?.value ?? (got.data as any)?.value
    console.log(`  ${domain}: ${raw ?? '(not found)'}`)
  }
}

async function main() {
  await seed()
  await workLoop()
  await readBack()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
