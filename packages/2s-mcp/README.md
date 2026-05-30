# @2sio/mcp

**MCP server for [2s.io](https://2s.io) — gives any MCP-aware AI agent pay-per-call access to 39+ APIs.**

[Model Context Protocol](https://modelcontextprotocol.io) is the standard for AI agents to discover and use tools. This package runs a local MCP server that exposes every 2s.io endpoint (patents, AI, law, geocoding, weather, crypto, etc.) as a callable tool. Plug it into Claude Desktop, AgentKit, Cline, Continue, or any other MCP host.

```bash
npx @2sio/mcp --signer 0x...
```

No accounts to create. The server signs an EIP-3009 USDC authorization on-the-fly for each call. Settles on Base in ~2 seconds. Prices start at $0.001/call.

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

Restart Claude Desktop. The agent now has 39+ new tools — patents search, sanctions screening, structured webpage extraction, image description, gas oracle, and more.

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
