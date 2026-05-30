# @2sio/sdk

**Typed TypeScript client for [2s.io](https://2s.io) — pay-per-call AI agent APIs on Base via x402.**

No signup, no API keys, no credit card on file. Sign an EIP-3009 USDC authorization, hit any endpoint, get back typed JSON. Settles on Base in ~2 seconds. Prices start at $0.001 per call.

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
console.log(data.hits[0].title)
```

If you'd rather build the signer yourself (e.g. for a custodial KMS-backed wallet), pass `signer` directly:

```ts
import { privateKeyToAccount } from 'viem/accounts'
const client = new TwoS({ signer: privateKeyToAccount('0x...') })
```

The SDK auto-detects 402 responses, signs the payment, retries, and returns typed data. Your private key never leaves your process.

## What's included

39 endpoints across:

- **AI** — `summarize`, `translate`, `extract`, `describe-image`, `screenshot`
- **Patents** — `search`, `detail`, `documents` (USPTO Open Data Portal)
- **Law** — `case-search`, `case-verify`, `sanctions-check`, `federal-register`, `opinion`
- **Geocoding** — `address`, `reverse`
- **Weather / earth** — `weather.zip`, `climate.station-near`, `tides.now`, `sunrise.compute`, `earth.now`, `quakes.recent`
- **Airports** — `lookup`, `near` (OurAirports CC0, ~85k airports)
- **Crypto** — `address-validate` (multi-chain checksum), `gas-oracle`
- **Wikipedia / papers** — `summary`, `search` (arXiv + PubMed + Semantic Scholar)
- **Internet** — `dns.lookup`, `domain.whois`, `url.unfurl`, `url.clean`, `geo.ip`, `ipinfo.bulk`
- **Utilities** — `hash.compute`, `image.compress`, `barcode.generate`, `countdown.gif`
- **Census** — `census.zipcode`

Full endpoint catalog: <https://2s.io/api/directory>. OpenAPI 3.1: <https://2s.io/api/openapi>. Discovery manifest for machines: <https://2s.io/.well-known/x402>.

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
console.log(result.data.matches)         // typed
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
