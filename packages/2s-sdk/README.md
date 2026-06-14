# @2sio/sdk

**Typed TypeScript client for [2s.io](https://2s.io) — the (most) everything API. Pay-per-call AI-agent data APIs on Base or Solana via x402.**

No signup, no API keys, no credit card on file. Sign for whichever rail you hold USDC on (EIP-3009 on Base, partial SPL transfer on Solana), hit any endpoint, get back typed JSON. Settles in ~2 seconds. Prices start at $0.001 per call. The endpoint catalog is constantly expanding — 2s is an open-ended experiment in maximally-comprehensive agent infrastructure.

```bash
npm install @2sio/sdk
```

## 🎁 Try before you buy — free, no wallet

Verify any endpoint works before funding a wallet. `trial: true` makes free calls (one per endpoint per hour, no key, no signup):

```ts
import { TwoS } from '@2sio/sdk'

const trial = new TwoS({ trial: true })
const { data } = await trial.validate.iban({ iban: 'GB82WEST12345698765432' })
console.log(data.items[0].valid) // real result; once/hour/endpoint, then throws TwoSError('TRIAL_EXHAUSTED')
```

Drop `trial` and pass a `privateKey`/`signer` (below) to pay per call for unlimited access.

## Quick start

```ts
import { TwoS } from '@2sio/sdk'

const client = new TwoS({
  privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
})

const { data } = await client.patents.search({ q: 'neural network', limit: 5 })
console.log(data.items[0].title) // normalized envelope: { ok, items, total, source, meta? }
```

### Response shape

Most endpoints return the **normalized envelope** — a consistent wrapper so you don't learn a different shape per endpoint:

```ts
{
  ok: true,
  items: T[],          // results — always an array (single-result lookups return a 1-element array)
  total: number | null, // total matching rows upstream, or null when the upstream doesn't report one
  page?: { number, size, pages },
  source: { provider, url, license },
  meta?: { ... }        // endpoint-specific extras (mode flags, query echoes, etc.)
}
```

A handful of endpoints keep a custom shape by design and advertise `responseShape: "legacy"` in `/api/directory` and `x-2s-response-shape` in the OpenAPI spec: the **enrichment** endpoints (e.g. `person.crossRegistry`, `geo.nearby`, `*.profile`, `*.screen`) return per-source `{ found, error, ... }` blocks rather than a flat `items` array, and the **binary** endpoints (`barcode.generate`, `countdown.gif`, `image.compress`, `ai.screenshot`) return raw bytes (`result.data` is a `Uint8Array`). The `Normalized<T>` type is exported for the normalized ones.

## v1.0 (breaking)

`1.0` makes the normalized envelope the stable, advertised contract. **Breaking change:** the per-endpoint `*Response` types (`PatentsSearchResponse`, `DnsLookupResponse`, etc.) have been removed — those endpoints now return `Normalized` (their typed methods return `R<Normalized>` / `R<Normalized<T>>`). If you imported one of those types, switch to `Normalized` from `@2sio/sdk` and read `result.data.items`. Legacy-shape endpoints (enrichment per-source blocks, binary `Uint8Array` responses, `account.balance`, `url.*`) keep their existing types and are flagged `responseShape: "legacy"` on the discovery surfaces. No runtime behavior changed — this is a types-only cut.

If you'd rather build the signer yourself (e.g. for a custodial KMS-backed wallet), pass `signer` directly:

```ts
import { privateKeyToAccount } from 'viem/accounts'
const client = new TwoS({ signer: privateKeyToAccount('0x...') })
```

The SDK auto-detects 402 responses, signs the payment, retries, and returns typed data. Your private key never leaves your process.

## What's included

An ever-expanding catalog of 190+ endpoints (live count in the [directory](https://2s.io/api/directory)), currently spanning:

- **AI** — summarize, translate, extract, describe-image, screenshot
- **Agent primitives** — persistent key-value memory, agent-to-agent marketplace (register / discover / review), knowledge-delta ("what changed in X since date Y")
- **Patents & trademarks** — USPTO Open Data Portal patent search + file-wrapper detail + documents; trademark full-text search + status
- **Law** — case search, citation verification, OFAC sanctions screening, Federal Register, CFR & USC sections, opinions, dockets, attorney/judge lookup (CourtListener / Free Law Project)
- **Government** — Congress bills/votes/members/hearings, FEC campaign finance, FDA drug/device/food events + recalls, OSHA/MSHA, USAspending, EPA facilities, USGS water, lobbying filings, inmate locator
- **Finance & treasury** — SEC EDGAR company facts, filings, insider trades (Form 4), 13F holdings; US Treasury debt, cash & monthly statements; stock quotes; FX rates
- **Vehicles** — VIN decode, recalls, complaints, investigations, manufacturers, models (NHTSA)
- **Health & medical** — ICD-10 + RxNorm lookup, hospital quality, Medicare provider + open-payments, clinical-trial search, professional-license lookup
- **Business & registries** — Secretary-of-State entity search, entity screening, IRS nonprofit search, npm/PyPI package lookup, bank routing
- **Geo / weather / earth** — forward + reverse geocoding, US weather by ZIP, NOAA tides, sunrise/sunset, climate stations, recent earthquakes, natural-event feed, IP geolocation (single + bulk)
- **Space** — launches, close approaches, satellites, exoplanets, sky-tonight, space weather
- **Science** — Wikipedia summaries, multi-source paper search (arXiv + PubMed + Semantic Scholar), gene/protein/species, chemical compounds
- **Property** — NYC parcel lookup, deed history, permits, violations
- **Internet** — dns.lookup, domain.whois (RDAP), url.unfurl, url.clean, geo.ip, ipinfo.bulk
- **Crypto** — multi-chain address validation, live EVM gas oracle
- **Reference data** — airport lookup/nearest (OurAirports CC0), Census demographics, College Scorecard, USAJOBS + BLS, food/nutrition
- **Utilities** — hash.compute, image.compress, barcode.generate, countdown.gif

New groups and endpoints land regularly. 2s is an open-ended experiment in maximally-comprehensive agent infrastructure — the goal is to keep widening the surface autonomous software can reach behind a single payment-aware interface.

Live catalog: <https://2s.io/api/directory> · OpenAPI 3.1: <https://2s.io/api/openapi> · Machine manifest: <https://2s.io/.well-known/x402>.

## Safety

- The SDK refuses to sign payments above `config.maxPriceUsd` (default `$0.10`).
- An optional `onPaymentRequested` hook lets you approve/deny each call.

```ts
const client = new TwoS({
  signer,
  maxPriceUsd: 0.05,
  onPaymentRequested: async ({ url, amountUsd }) => {
    console.log(`approve ${amountUsd} USDC for ${url}?`)
    return amountUsd < 0.02
  },
})
```

## Result shape

Every call returns `{ data, settlement?, costUsd, endpoint }`. `settlement` carries the x402 receipt; `data` is the typed response body.

```ts
const result = await client.law.sanctionsCheck({ query: 'John Doe' })
console.log(result.data.items)         // typed
console.log(result.settlement?.txHash)   // basescan tx
console.log(result.costUsd)              // 0.0048
```

## Errors

- `TwoSError` — HTTP error from 2s.io (4xx/5xx after payment).
- `PaymentRefusedError` — local refusal: price exceeded `maxPriceUsd` or the `onPaymentRequested` hook returned false.

## Networks

x402 mode settles on **Base** or **Solana** mainnet (USDC on both). On Base the Coinbase CDP facilitator handles verify + settle; on Solana the SDK signs a partial SPL USDC transfer. Pay on whichever rail your wallet holds USDC — no facilitator config required from your side.

## License

MIT. See [LICENSE](./LICENSE).

## Links

- Site: <https://2s.io>
- Source: <https://github.com/2s-io/sdk>
- MCP server: [`@2sio/mcp`](https://www.npmjs.com/package/@2sio/mcp) — exposes every endpoint as an MCP tool for Claude Desktop / AgentKit / any MCP host.
