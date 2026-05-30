# 2s.io SDK

**Client SDK + MCP server for [2s.io](https://2s.io) — a unified JSON REST API for AI agents, paid per call in USDC on Base via [x402](https://x402.org).**

This repo ships SDKs for every major agent-development language plus an MCP server for any MCP-aware host:

| Language | Package | Install | Status |
|---|---|---|---|
| **TypeScript / Node** | [`@2sio/sdk`](./packages/2s-sdk) | `npm install @2sio/sdk viem` | ✅ x402 |
| **TypeScript / Node** | [`@2sio/mcp`](./packages/2s-mcp) | `npx @2sio/mcp` | ✅ MCP server, x402 |
| **Python** | [`2sio`](./packages/python) | `pip install "2sio[x402]"` | ✅ x402 |
| **Python / LangChain** | [`langchain-twosio`](./packages/python-langchain) | `pip install langchain-twosio` | ✅ Tool adapters |
| **Python / LlamaIndex** | [`llama-index-tools-twosio`](./packages/python-llamaindex) | `pip install llama-index-tools-twosio` | ✅ Tool adapters |
| **Go** | [`github.com/2s-io/sdk/packages/go`](./packages/go) | `go get github.com/2s-io/sdk/packages/go` | 🚧 x402 wire-up pending |
| **Rust** | [`twosio`](./packages/rust) | `cargo add twosio` | 🚧 x402 wire-up pending |

No accounts. No API keys. No credit cards. Buyers sign an EIP-3009 USDC authorization on-the-fly, the [Coinbase CDP facilitator](https://docs.cdp.coinbase.com/x402/welcome) verifies + settles in ~2 seconds on Base mainnet, and the API returns typed data. Prices start at $0.001/call.

## 30-second demo

**TypeScript:**

```ts
import { TwoS } from '@2sio/sdk'
import { privateKeyToAccount } from 'viem/accounts'

const client = new TwoS({ signer: privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`) })

const { data } = await client.patents.search({ q: 'neural network', limit: 5 })
console.log(data.hits[0].title)
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

Restart Claude. The model can now call patents.search, law.sanctions-check, ai.summarize, geocode.address, crypto.address-validate, and 30+ other paid tools — paying per call, no human in the loop.

## What's behind the API

39 endpoints across:

- **AI:** webpage summarization, translation, typed extraction, image description, screenshots
- **Patents:** USPTO Open Data Portal search + full file-wrapper detail + document list
- **Law:** federal/state case search, citation verification, OFAC sanctions screening, Federal Register, opinions
- **Geo / weather:** forward + reverse geocoding, US weather by ZIP, NOAA tides, sunrise/sunset, climate stations, recent earthquakes, IP geolocation
- **Internet:** DNS lookup, RDAP whois, URL unfurl (Open Graph), URL → clean Markdown
- **Wikipedia / academic papers:** summaries, multi-source paper search (arXiv + PubMed + Semantic Scholar)
- **Crypto:** multi-chain address validation (BTC, ETH, SOL, LTC, TRX, XRP, BCH), live EVM gas oracle
- **Airports:** lookup by IATA/ICAO, nearest-airport-to-coord (OurAirports CC0, ~85k airports)
- **Utilities:** hash computation, image compression, barcode/QR generation, countdown GIFs
- **Census:** US Census ACS 5-year demographics by ZCTA

Live catalog: <https://2s.io/api/directory>. OpenAPI 3.1: <https://2s.io/api/openapi>. Machine-discovery manifest: <https://2s.io/.well-known/x402>.

## Safety

- The SDK refuses to sign payments above a configurable `maxPriceUsd` (default `$0.10`).
- Every x402 payment is a single-use EIP-3009 authorization with a 60-second deadline. No allowances are issued; a leaked key can only spend what's in the wallet at the moment of signing, only at advertised prices.
- Optional `onPaymentRequested` hook lets callers approve/deny each call programmatically.

## Repo layout

```
packages/
├── 2s-sdk/     @2sio/sdk — typed client
└── 2s-mcp/     @2sio/mcp — MCP server (depends on 2s-sdk)
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
