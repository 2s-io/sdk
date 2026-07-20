# @2sio/mcp

**MCP server for [2s.io](https://2s.io) — gives any MCP-aware agent 575+ pay-per-call tools: more ground-truth data than any other x402 API, a full AI gateway (chat, image, multi-model consensus), and agent infrastructure (storage, locks, queues, schedules, watchers).**

**upto billing (new on 2s):** AI endpoints also accept the x402 `upto` scheme — authorize the quoted max, get settled for your **actual usage** (a real on-chain example settled at 1/42nd of the quote). Exact-scheme calls work unchanged.


[Model Context Protocol](https://modelcontextprotocol.io) is the standard for AI agents to discover and use tools. This package runs a local MCP server that exposes every 2s.io endpoint as a callable tool. Plug it into Claude Desktop, AgentKit, Cline, Continue, or any other MCP host.

```bash
npx @2sio/mcp --signer 0x...
```

No accounts to create. The server signs for whichever chain you configured a key on — Base USDC (EIP-3009) or Solana SPL-USDC. Settles in ~2 seconds. Prices start at $0.001/call. 2s is an open-ended experiment in maximally-comprehensive agent infrastructure — the toolset grows continually (575+ endpoints across 113+ groups and counting).

### Hosted (connect by URL, no install)

Prefer not to run anything? Point any MCP host at the hosted server:

```
https://2s.io/mcp
```

Streamable-HTTP transport; set header `X-EVM-Private-Key: 0x…` (an EVM key funded with USDC on Base) and the server signs + settles x402 per call. **Security tradeoff: with the hosted server your private key transits 2s's infrastructure to sign — for keys that never leave your machine, run this package locally (above) or use the [`@2sio/sdk`](https://www.npmjs.com/package/@2sio/sdk) instead.**

### 🔔 Watchers — push, not poll

Beyond read tools, 2s exposes **watchers**: the agent arms one and 2s POSTs a **signed callback the moment something happens** — a wallet moves, a stock crosses a price, a company reports earnings — so the agent never has to poll. Flat $0.05 to arm; signed + retried delivery with a status backstop. Tools: `watchers.crypto-address-activity`, `watchers.stock-price`, `watchers.earnings` (+ `watchers.status` / `watchers.cancel`).

### What's exposed

A single MCP install gives the agent tools spanning, among others:

- **Security** — CVE lookup (NVD + CISA KEV + EPSS), email-security, HTTP security headers, password-exposure, RPKI, CT logs, IOC reputation, CWE / ATT&CK / CAPEC, exploit availability
- **Patents & trademarks** — USPTO patent search/detail/documents, trademark full-text search
- **Legal & courts** — federal & state case search and citation verification (CourtListener / Free Law Project)
- **Financial filings & markets** — SEC EDGAR filings, equities, FX, crypto, treasury rates
- **Government & public records** — Federal Register, Congress, FEC, BLS, US Census, nonprofits, licenses
- **Science & medicine** — arXiv / PubMed / Semantic Scholar papers, ICD-10, clinical trials, chemistry, nutrition
- **Vehicles & aviation** — NHTSA VIN decode & recalls, aircraft registry, flights, airports
- **Energy, agriculture & maritime** — energy prices & production, USDA agriculture, soil, vessel & port data
- **Geospatial & weather** — geocoding, NWS/NOAA forecasts, climate, earthquakes, tides, places, parks
- **Business & property** — company registries, GLEIF LEI, KYB, property records
- **Web & data utilities** — URL → markdown, screenshots, schema extraction, validators, EDI, hashing, barcodes, image description, AI summarization
- **Agent primitives** — memory, marketplace, knowledge-delta, batch settlement
- **Control plane** — wallet-scoped agent infrastructure: distributed locks/leases, durable message queues, scheduled cron callbacks, pub/sub topics with fan-out
- **Storage** — pay-per-call wallet-keyed persistence: key-value, documents, vector / full-text search, private blobs
- **Watchers (push, not poll)** — arm a signed callback for when a wallet moves, a stock crosses a price, or a company reports earnings

See the [live catalog](https://2s.io/api/directory) for everything currently shipped.

### Try it free first

Pass `--trial` (or set `TWOS_TRIAL=1`) to make real calls without paying — one free call per endpoint per hour, no key required. Drop the flag and configure a key when you're ready to pay per call.

## Claude Desktop setup

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "2sio": {
      "command": "npx",
      "args": ["-y", "@2sio/mcp"],
      "env": {
        "EVM_PRIVATE_KEY": "0x...your_funded_base_mainnet_key..."
      }
    }
  }
}
```

Restart Claude Desktop. The agent now has 575+ new tools — patent search, court-case lookup, SEC filings, VIN decode, ICD-10 lookup, sanctions screening, structured webpage extraction, secret/PII redaction, geocoding, weather, distributed locks/queues/schedules, wallet-keyed storage, multi-model consensus, ID crosswalks, and much more.

## AgentKit / programmatic use

```ts
import { createTwoSioMcpServer } from '@2sio/mcp'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = createTwoSioMcpServer({
  privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
  maxPriceUsd: 0.05,
})
await server.connect(new StdioServerTransport())
```

## Safety

- There is **no default price cap** (`maxPriceUsd` defaults to `Infinity`) — set `--max-price` (or the `maxPriceUsd` option) to opt into a ceiling above which the server refuses to sign.
- All payments use EIP-3009 single-use authorizations with a 60-second deadline. No spending allowances are issued; even if the key is compromised at rest, the attacker can only spend what's in the wallet at the moment of signing — and only at advertised prices.
- The key is read from env / argv into memory only; it never appears in any outgoing 2s.io request.

## Tools exposed

Same set as `@2sio/sdk`. See <https://2s.io/api/directory> for the live catalog and <https://2s.io/.well-known/x402> for the machine-readable manifest.

## Links

- Site: <https://2s.io>
- Source: <https://github.com/2s-io/sdk>
- SDK: [`@2sio/sdk`](https://www.npmjs.com/package/@2sio/sdk)
- License: MIT
