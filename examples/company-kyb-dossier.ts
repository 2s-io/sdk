/**
 * Agent: KYB onboarding — resolve a messy company name, then pull one dossier.
 *
 * An onboarding agent gets a free-text counterparty name typed by a human.
 * Before it can run diligence it has to resolve that string to a real legal
 * entity (record linkage), then gather the checks a KYB review needs:
 *   - business.entityMatch → fuzzy-resolve the name to a canonical GLEIF LEI
 *                            with a similarity score + confidence
 *   - business.kyb360      → one dossier: SAM/exclusions/OFAC/GLEIF/USAspending/
 *                            FARA/trademarks (+ SEC if a ticker is known)
 *
 * The point: an agent never has to glue six registries together itself — it
 * resolves the identity, then asks for the dossier on the resolved entity.
 *
 * Run:
 *   EVM_PRIVATE_KEY=0x... npx tsx company-kyb-dossier.ts
 *
 * Wallet must hold a small USDC balance on Base.
 */

import { TwoS } from '@2sio/sdk'

const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })

// Whatever a human typed into the onboarding form.
const rawName = 'apple inc'

async function diligence() {
  console.log(`Resolving counterparty: "${rawName}"\n`)

  // 1. Record linkage: messy string → canonical entity.
  const match = await client.business.entityMatch({ name: rawName, country: 'US', limit: 3 })
  const candidates = ((match.data as any)?.matches ?? (match.data as any)?.results ?? []) as Array<any>

  if (candidates.length === 0) {
    console.log('No GLEIF match — cannot proceed with KYB on an unresolved entity.')
    return
  }

  const best = candidates[0]
  const legalName: string = best.legalName ?? best.name ?? rawName
  const lei: string | undefined = best.lei
  const score: number | undefined = best.score ?? best.similarity ?? best.confidence
  console.log(`Best match: ${legalName}${lei ? `  (LEI ${lei})` : ''}${score != null ? `  score=${score}` : ''}\n`)

  // 2. One dossier for the resolved entity.
  const dossier = await client.business.kyb360({ name: legalName, threshold: 0.85 })
  const d = (dossier.data as any) ?? {}

  const sanctioned = Boolean(d.ofac?.hit ?? d.sanctions?.hit)
  const excluded = Boolean(d.exclusions?.hit ?? d.sam?.excluded)
  console.log('KYB-360 summary:')
  console.log(`  OFAC sanctions hit: ${sanctioned ? 'YES — escalate' : 'none'}`)
  console.log(`  Federal exclusions: ${excluded ? 'YES — escalate' : 'none'}`)
  if (d.gleif?.status) console.log(`  GLEIF registration: ${d.gleif.status}`)
  if (d.sec?.cik) console.log(`  SEC CIK: ${d.sec.cik}`)
  if (Array.isArray(d.trademarks)) console.log(`  Trademarks on file: ${d.trademarks.length}`)
}

diligence().catch((e) => {
  console.error(e)
  process.exit(1)
})
