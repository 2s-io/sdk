# @2sio/sdk

**Typed TypeScript client for [2s.io](https://2s.io) — pay-per-call AI agent APIs on Base or Solana via x402.**

No signup, no API keys, no credit card on file. Sign for whichever rail you hold USDC on (EIP-3009 on Base, partial SPL transfer on Solana), hit any endpoint, get back typed JSON. Settles in ~2 seconds. Prices start at $0.001 per call. The endpoint catalog is constantly expanding — 2s is an open-ended experiment in maximally-comprehensive agent infrastructure.

```bash
npm install @2sio/sdk
```

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

An ever-expanding catalog of endpoints, currently spanning:

- **AI** — summarize, translate, extract, describe-image, screenshot
- **Patents** — search, detail, documents (USPTO Open Data Portal)
- **Law** — case-search, case-verify, sanctions-check, federal-register, cfr-section, opinion, attorney-lookup, judge-lookup (CourtListener / Free Law Project)
- **Finance** — sec-filings, company-facts (XBRL), insider-trades (Form 4), 13F holdings (SEC EDGAR)
- **Geocoding** — forward, reverse (LocationIQ + US Census)
- **Weather / earth** — weather.zip, climate.station-near, tides.now, sunrise.compute, earth.now, quakes.recent, space.weather
- **Airports** — lookup, near (OurAirports CC0)
- **Crypto** — address-validate (multi-chain checksum), gas-oracle
- **Wikipedia / papers** — summary, search (arXiv + PubMed + Semantic Scholar)
- **Internet** — dns.lookup, domain.whois, url.unfurl, url.clean, geo.ip, ipinfo.bulk
- **Utilities** — hash.compute, image.compress, barcode.generate, countdown.gif
- **Census** — zipcode demographics

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

x402 mode currently settles on **Base mainnet**. The Coinbase CDP facilitator handles verify + settle; no facilitator config required from your side.

## License

MIT. See [LICENSE](./LICENSE).

## Links

- Site: <https://2s.io>
- Source: <https://github.com/2s-io/sdk>
- MCP server: [`@2sio/mcp`](https://www.npmjs.com/package/@2sio/mcp) — exposes every endpoint as an MCP tool for Claude Desktop / AgentKit / any MCP host.
