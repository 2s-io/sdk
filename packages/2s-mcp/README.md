# @2sio/mcp

**MCP server for [2s.io](https://2s.io) — the (most) everything API. Gives any MCP-aware AI agent pay-per-call access to hundreds of ground-truth data endpoints.**

[Model Context Protocol](https://modelcontextprotocol.io) is the standard for AI agents to discover and use tools. This package runs a local MCP server that exposes every 2s.io endpoint as a callable tool. Plug it into Claude Desktop, AgentKit, Cline, Continue, or any other MCP host.

```bash
npx @2sio/mcp --signer 0x...
```

No accounts to create. The server signs for whichever chain you configured a key on — Base USDC (EIP-3009) or Solana SPL-USDC. Settles in ~2 seconds. Prices start at $0.001/call. 2s is an open-ended experiment in maximally-comprehensive agent infrastructure — the toolset grows continually (300+ endpoints across 95 groups and counting).

### What's exposed

A single MCP install gives the agent tools spanning, among others:

- **Patents & trademarks** — USPTO patent search/detail/documents, trademark full-text search
- **Legal & courts** — federal & state case search, citation verification, OFAC sanctions screening (CourtListener / Free Law Project)
- **Financial filings & markets** — SEC EDGAR filings, equities, FX & currency conversion, crypto, treasury rates, bank routing, tax
- **Government & public records** — Federal Register, Congress, FEC, FEMA disasters, BLS, US Census, nonprofits, licenses, lobbying & foreign-agent filings
- **Science & medicine** — arXiv / PubMed / Semantic Scholar papers, ICD-10, RxNorm, drug pricing, clinical trials, chemistry, gene/protein/species, nutrition
- **Vehicles & transport** — NHTSA VIN decode, recalls, fuel economy, NCAP safety; aircraft registry; live flights; airports; maritime vessels
- **Agriculture, soil & energy** — NASS crop stats, USDM drought, SSURGO soil profiles + hardiness zones, electricity generation mix & rates
- **Security** — CVE + CISA KEV + EPSS, email-security, HTTP headers, password-exposure (HIBP), RPKI, CT logs, IOC reputation, CWE / ATT&CK / CAPEC, exploit availability
- **Geospatial & weather** — geocoding, NWS/NOAA forecasts, climate, earthquakes, tides, timezones, places, parks
- **Reference data** — Census, College Scorecard, USAJOBS + BLS, books, music (MusicBrainz), country & ISO codes, news, space & satellites
- **Business & property** — company registries, KYB-360 screening, property records, email/phone validation, domain intel
- **Web & data utilities** — URL → markdown, screenshots, schema extraction, TLS inspection, EDI/EDIFACT, hashing, barcodes, image description, AI summarization, audio transcription
- **Agent primitives** — memory, marketplace, knowledge-delta, atomic batch settlement, natural-language endpoint search

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

Restart Claude Desktop. The agent now has 300+ new tools — patent search, court-case lookup, SEC filings, VIN decode, ICD-10 lookup, sanctions screening, CVE/KEV security data, structured webpage extraction, geocoding, weather, and much more.

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

- Default `maxPriceUsd` is `$0.10` — the server refuses to sign any call advertising a higher price. Override via `--max-price` flag or the SDK option.
- All payments use EIP-3009 single-use authorizations with a 60-second deadline. No spending allowances are issued; even if the key is compromised at rest, the attacker can only spend what's in the wallet at the moment of signing — and only at advertised prices.
- The key is read from env / argv into memory only; it never appears in any outgoing 2s.io request.

## Tools exposed

Same set as `@2sio/sdk`. See <https://2s.io/api/directory> for the live catalog and <https://2s.io/.well-known/x402> for the machine-readable manifest.

## Links

- Site: <https://2s.io>
- Source: <https://github.com/2s-io/sdk>
- SDK: [`@2sio/sdk`](https://www.npmjs.com/package/@2sio/sdk)
- License: MIT
