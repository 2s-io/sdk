#!/usr/bin/env node
/**
 * 2sio MCP server CLI — stdio transport, suitable for Claude Desktop /
 * AgentKit / any MCP host that spawns a child process.
 *
 * Usage:
 *
 *   # private key passed via env (recommended — never appears in process listing)
 *   EVM_PRIVATE_KEY=0x...  npx @2sio/mcp
 *
 *   # private key passed via flag (less secure)
 *   npx @2sio/mcp --signer 0x...
 *
 *   # bearer mode (pre-funded account on 2s.io)
 *   TWOSIO_API_KEY=2s_...  npx @2sio/mcp --bearer
 *
 * Claude Desktop config snippet (claude_desktop_config.json):
 *
 *   {
 *     "mcpServers": {
 *       "2sio": {
 *         "command": "npx",
 *         "args": ["-y", "@2sio/mcp"],
 *         "env": { "EVM_PRIVATE_KEY": "0x..." }
 *       }
 *     }
 *   }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import { createTwoSioMcpServer } from './index.js'

function parseFlags(argv: string[]): {
  signer?: string
  bearer?: boolean
  maxPriceUsd?: number
} {
  const args = argv.slice(2)
  const out: ReturnType<typeof parseFlags> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--signer') out.signer = args[++i]
    else if (a === '--bearer') out.bearer = true
    else if (a === '--max-price') out.maxPriceUsd = Number(args[++i])
    else if (a === '--help' || a === '-h') {
      console.error(
        'usage: 2sio-mcp [--signer 0x... | --bearer] [--max-price 0.10]\n' +
          '  Env: EVM_PRIVATE_KEY for x402 mode, TWOSIO_API_KEY for bearer mode.',
      )
      process.exit(0)
    }
  }
  return out
}

async function main() {
  const flags = parseFlags(process.argv)
  const signerHex = flags.signer ?? process.env.EVM_PRIVATE_KEY
  const apiKey = process.env.TWOSIO_API_KEY

  // Bearer mode
  if (flags.bearer || (apiKey && !signerHex)) {
    if (!apiKey) {
      console.error('error: bearer mode requested but TWOSIO_API_KEY is not set')
      process.exit(2)
    }
    const server = createTwoSioMcpServer({
      apiKey,
      maxPriceUsd: flags.maxPriceUsd,
    })
    await server.connect(new StdioServerTransport())
    return
  }

  // x402 mode
  if (signerHex && /^0x[0-9a-fA-F]{64}$/.test(signerHex)) {
    const server = createTwoSioMcpServer({
      // Cast: when the MCP package and the SDK package each pull in their
      // own copy of viem (e.g. during local file: linking), TypeScript treats
      // the two LocalAccount types as distinct even though they're identical.
      // The cast is harmless at runtime.
      signer: privateKeyToAccount(signerHex as Hex) as never,
      maxPriceUsd: flags.maxPriceUsd,
    })
    await server.connect(new StdioServerTransport())
    return
  }

  // Introspection mode — no credentials supplied. The server still starts
  // and responds to list_tools so MCP hosts (Glama, Claude Desktop, etc.)
  // can discover its tool catalog. Calls to tools will error until either
  // EVM_PRIVATE_KEY or TWOSIO_API_KEY is provided. This is what makes the
  // server pass listing checks on directories like glama.ai.
  console.error(
    '[2sio-mcp] starting in introspection mode — no credentials configured.\n' +
      '  Set EVM_PRIVATE_KEY for x402 payments, or TWOSIO_API_KEY for bearer\n' +
      '  billing, to enable tool calls. Tool discovery works regardless.',
  )
  // Use a no-op signer that lets the SDK construct cleanly but throws on use.
  const noopSigner = {
    address: '0x0000000000000000000000000000000000000000' as Hex,
    signTypedData: async () => {
      throw new Error(
        '@2sio/mcp: server started in introspection mode. Set EVM_PRIVATE_KEY or TWOSIO_API_KEY to make paid calls.',
      )
    },
  } as never
  const server = createTwoSioMcpServer({
    signer: noopSigner,
    maxPriceUsd: flags.maxPriceUsd,
  })
  await server.connect(new StdioServerTransport())
}

main().catch((err) => {
  console.error('[2sio-mcp] fatal:', err)
  process.exit(1)
})
