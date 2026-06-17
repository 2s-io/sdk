# 2s.io SDK

[![smithery badge](https://smithery.ai/badge/twosio/mcp)](https://smithery.ai/servers/twosio/mcp)
[![2s-io/sdk MCP server](https://glama.ai/mcp/servers/2s-io/sdk/badges/score.svg)](https://glama.ai/mcp/servers/2s-io/sdk)

**Client SDK + MCP server for [2s.io](https://2s.io) — the (most) everything API. One pay-per-call API giving AI agents ground-truth data across hundreds of endpoints, paid per call in USDC on Base or Solana via [x402](https://x402.org).**

This repo ships SDKs for every major agent-development language plus an MCP server for any MCP-aware host:

| Language | Package | Install | Status |
|---|---|---|---|
| **TypeScript / Node** | [`@2sio/sdk`](./packages/2s-sdk) | `npm install @2sio/sdk` | ✅ x402 |
| **TypeScript / Node** | [`@2sio/mcp`](./packages/2s-mcp) | `npx @2sio/mcp` | ✅ MCP server, x402 |
| **Python** | [`2sio`](./packages/python) | `pip install 2sio` | ✅ x402 |
| **Python / LangChain** | [`langchain-twosio`](./packages/python-langchain) | `pip install langchain-twosio` | ✅ Tool adapters |
| **Python / LlamaIndex** | [`llama-index-tools-twosio`](./packages/python-llamaindex) | `pip install llama-index-tools-twosio` | ✅ Tool adapters |
| **Go** | [`github.com/2s-io/sdk/packages/go`](./packages/go) | `go get github.com/2s-io/sdk/packages/go` | 🚧 x402 wire-up pending |
| **Rust** | [`twosio`](./packages/rust) | `cargo add twosio` | 🚧 x402 wire-up pending |

No accounts. No API keys. No credit cards. Buyers sign an EIP-3009 USDC authorization (Base) or an SPL USDC transfer (Solana) on-the-fly, the facilitator verifies + settles in ~2 seconds on mainnet, and the API returns typed data. Prices start at $0.001/call.

## 🎁 Try before you buy — free, no wallet

Want to confirm an endpoint actually works before funding anything? Every endpoint serves **one free real call per endpoint per hour** — no key, no wallet, no signup. Add `?trial=1` (or header `X-2s-Trial: 1`), or flip the SDK into trial mode:

```ts
import { TwoS } from '@2sio/sdk'
const trial = new TwoS({ trial: true })            // no key required
const { data } = await trial.validate.iban({ iban: 'GB82WEST12345698765432' })
console.log(data.items[0].valid)                    // real result; response meta.trial = { free: true, ... }
```

```python
from twosio import TwoS
trial = TwoS(trial=True)                            # no key required
print(trial.validate.iban(iban="GB82WEST12345698765432").data["items"][0]["valid"])
```

```bash
curl "https://2s.io/api/validate/iban?iban=GB82WEST12345698765432&trial=1"
```

```bash
npx -y @2sio/mcp --trial      # MCP host with free trial calls; or set TWOS_TRIAL=1
```

The trial runs the **real handler** and returns real data. Once the hourly trial is used, the endpoint returns the normal `402` — drop `trial` and pass a `privateKey`/`signer` to pay per call for unlimited access.

## 30-second demo

**TypeScript:**

```ts
import { TwoS } from '@2sio/sdk'
import { privateKeyToAccount } from 'viem/accounts'

const client = new TwoS({ signer: privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`) })

const { data } = await client.patents.search({ q: 'neural network', limit: 5 })
console.log(data.items[0].title) // normalized envelope: { ok, items, total, source, meta? }
```

**Python:**

```python
from eth_account import Account
from twosio import TwoS

client = TwoS(signer=Account.from_key(os.environ["EVM_PRIVATE_KEY"]))
r = client.patents.search(q="neural network", limit=5)
print(r.data["hits"][0]["title"])
```

## 30-second Claude Desktop install

```json
{
  "mcpServers": {
    "2sio": {
      "command": "npx",
      "args": ["-y", "@2sio/mcp"],
      "env": { "EVM_PRIVATE_KEY": "0x..." }
    }
  }
}
```

Restart Claude. The model can now call patents.search, law.sanctions-check, ai.summarize, geocode.address, vehicle.vin-decode, security.cve, agent.knowledge-delta, and 300+ other paid tools — paying per call, no human in the loop.

## What's behind the API

300+ endpoints across 95 groups (live count in the [directory](https://2s.io/api/directory)), spanning:

- **AI:** webpage summarization, translation, typed extraction, image description, screenshots, audio transcription, HTML/URL → markdown
- **Agent primitives:** persistent key-value memory, agent-to-agent marketplace (register / discover / review), knowledge-delta ("what changed in X since date Y"), atomic batch settlement, natural-language endpoint search
- **Patents & trademarks:** USPTO Open Data Portal search + full file-wrapper detail + document list; trademark full-text search + status
- **Law:** federal/state case search, citation verification, OFAC sanctions screening, Federal Register, CFR & USC, opinions, dockets
- **Government & public records:** Congress bills/votes/members, FEC campaign finance, FDA drug/device/food events + recalls, FEMA disaster declarations + risk index, OSHA/MSHA, USAspending, EPA, lobbying & foreign-agent filings
- **Finance & treasury:** SEC EDGAR company facts, filings, insider trades, 13F holdings; US Treasury debt + statements; stock quotes; FX & currency conversion; bank routing; tax
- **Vehicles & transport:** VIN decode, recalls, complaints, fuel economy, NCAP safety (NHTSA); aircraft registry; live flights; airports; maritime vessels & USCG cases
- **Health & medical:** ICD-10 + RxNorm + drug pricing, hospital quality, Medicare provider + open-payments, clinical trials, professional-license lookup, gene/protein/species, chemistry
- **Agriculture, soil & energy:** NASS crop stats, USDM drought, SSURGO soil profiles + hardiness zones; electricity generation mix, utility & electricity rates
- **Security:** CVE + CISA KEV + EPSS, email-security, HTTP headers, password-exposure (HIBP), RPKI, CT logs, IOC reputation, CWE / ATT&CK / CAPEC, exploit availability
- **Geo / weather / earth:** forward + reverse geocoding, US weather, NOAA tides, sunrise/sunset, climate stations, earthquakes, timezones, places, parks, IP geolocation (single + bulk)
- **Internet & dev:** DNS lookup, RDAP whois, TLS inspection, URL unfurl, URL → markdown, code & dev tools, unit/currency conversion, EDI/EDIFACT
- **Science & reference:** Wikipedia + Wikidata, multi-source paper search (arXiv + PubMed + Semantic Scholar), space launches/satellites/exoplanets, books, music (MusicBrainz), country & ISO codes, news
- **Crypto:** multi-chain address validation (BTC, ETH, SOL, LTC, TRX, XRP, BCH), live EVM gas oracle
- **Business & property:** Secretary-of-State entity search, KYB-360 screening, property records, email/phone validation, domain intel
- **Census / education / jobs:** ACS demographics, College Scorecard, USAJOBS + BLS, food/nutrition, IRS nonprofit search
- **Utilities:** hash computation, image compression, barcode/QR generation, countdown GIFs

Live catalog: <https://2s.io/api/directory>. OpenAPI 3.1: <https://2s.io/api/openapi>. Machine-discovery manifest: <https://2s.io/.well-known/x402>.

## Safety

- The SDK refuses to sign payments above a configurable `maxPriceUsd` (default `$0.10`).
- Every x402 payment is a single-use EIP-3009 authorization with a 60-second deadline. No allowances are issued; a leaked key can only spend what's in the wallet at the moment of signing, only at advertised prices.
- Optional `onPaymentRequested` hook lets callers approve/deny each call programmatically.

## Repo layout

```
packages/
├── 2s-sdk/             @2sio/sdk — typed TypeScript client
├── 2s-mcp/             @2sio/mcp — MCP server (depends on 2s-sdk)
├── python/             2sio — Python client
├── python-langchain/   langchain-twosio — LangChain tool adapters
├── python-llamaindex/  llama-index-tools-twosio — LlamaIndex tool adapters
├── go/                 Go client (x402 wire-up pending)
└── rust/               Rust client (x402 wire-up pending)
examples/sdk/   minimal paying-agent samples + Claude Desktop wiring
```

## License

MIT. See [LICENSE](./packages/2s-sdk/LICENSE).

## Links

- API site: <https://2s.io>
- npm:
  - <https://www.npmjs.com/package/@2sio/sdk>
  - <https://www.npmjs.com/package/@2sio/mcp>
- x402 protocol: <https://x402.org>
- MCP protocol: <https://modelcontextprotocol.io>
