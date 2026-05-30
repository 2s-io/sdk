#!/usr/bin/env node
/**
 * 2sio MCP server CLI — stdio transport, suitable for Claude Desktop /
 * AgentKit / any MCP host that spawns a child process.
 *
 * Usage:
 *
 *   # private key via env (recommended — never appears in process listing)
 *   EVM_PRIVATE_KEY=0x...  npx @2sio/mcp
 *
 *   # private key via flag (must be a 64-hex EVM key, not a wallet address)
 *   npx @2sio/mcp --signer 0x<64 hex chars>
 *
 * 2s.io is x402-only. Pay-per-call USDC on Base — no API keys, no accounts.
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

const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

function parseFlags(argv: string[]): {
  signer?: string
  maxPriceUsd?: number
} {
  const args = argv.slice(2)
  const out: ReturnType<typeof parseFlags> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--signer') out.signer = args[++i]
    else if (a === '--max-price') out.maxPriceUsd = Number(args[++i])
    else if (a === '--help' || a === '-h') {
      console.error(
        'usage: 2sio-mcp [--signer 0x<64hex>] [--max-price 0.10]\n' +
          '  Env: EVM_PRIVATE_KEY=0x... (recommended).\n' +
          '  2s.io is x402-only — pay-per-call USDC on Base mainnet, no API keys.',
      )
      process.exit(0)
    }
  }
  return out
}

async function main() {
  const flags = parseFlags(process.argv)
  const signerHex = flags.signer ?? process.env.EVM_PRIVATE_KEY

  // Validate input early — common confusion is passing a wallet address
  // (40 hex) instead of a private key (64 hex). The introspection-mode
  // fallback would then silently swallow this, so catch it loudly.
  if (signerHex && !PRIVATE_KEY_RE.test(signerHex)) {
    if (ADDRESS_RE.test(signerHex)) {
      console.error(
        '[2sio-mcp] error: looks like you passed a wallet address (40 hex),\n' +
          '  but --signer / EVM_PRIVATE_KEY expects an EVM PRIVATE KEY (64 hex).\n' +
          '  The address is what we credit funds TO; the private key is what\n' +
          '  signs the payment. Don\'t share the private key — only set it as\n' +
          '  EVM_PRIVATE_KEY in the MCP host config that runs locally.',
      )
    } else {
      console.error(
        '[2sio-mcp] error: --signer / EVM_PRIVATE_KEY must be a 64-character\n' +
          '  hex EVM private key (e.g. 0x1234...cdef). Got something else.',
      )
    }
    process.exit(2)
  }

  // x402 mode — happy path
  if (signerHex) {
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
  // and responds to list_tools so MCP hosts (Smithery, Glama, Claude
  // Desktop, etc.) can discover the tool catalog. Calls to tools will
  // error until EVM_PRIVATE_KEY is provided.
  console.error(
    '[2sio-mcp] starting in introspection mode — no EVM_PRIVATE_KEY set.\n' +
      '  Set EVM_PRIVATE_KEY=0x<64hex> to enable paid tool calls.\n' +
      '  Tool discovery works without a key.',
  )
  const noopSigner = {
    address: '0x0000000000000000000000000000000000000000' as Hex,
    signTypedData: async () => {
      throw new Error(
        '@2sio/mcp: server started in introspection mode. Set EVM_PRIVATE_KEY=0x<64hex> to make paid calls.',
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
