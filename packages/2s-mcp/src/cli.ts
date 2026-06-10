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
  solanaSigner?: string
  maxPriceUsd?: number
  trial?: boolean
} {
  const args = argv.slice(2)
  const out: ReturnType<typeof parseFlags> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--signer') out.signer = args[++i]
    else if (a === '--solana-signer') out.solanaSigner = args[++i]
    else if (a === '--max-price') out.maxPriceUsd = Number(args[++i])
    else if (a === '--trial') out.trial = true
    else if (a === '--help' || a === '-h') {
      console.error(
        'usage: 2sio-mcp [--signer 0x<64hex>] [--solana-signer <base58>] [--max-price 0.10] [--trial]\n' +
          '  Env: EVM_PRIVATE_KEY=0x<64hex>            (Base USDC settlement)\n' +
          '       SOLANA_PRIVATE_KEY=<base58>          (Solana SPL-USDC settlement)\n' +
          '       TWOS_TRIAL=1                         (free try-before-you-buy, no key)\n' +
          '  Set a key to pay per call, or --trial / TWOS_TRIAL=1 to make free trial\n' +
          '  calls (1 per endpoint per hour) so you can verify tools before paying.\n' +
          '  2s.io accepts USDC on Base OR Solana via x402. No API keys.',
      )
      process.exit(0)
    }
  }
  return out
}

async function main() {
  const flags = parseFlags(process.argv)
  let signerHex = flags.signer ?? process.env.EVM_PRIVATE_KEY
  const solanaKey = flags.solanaSigner ?? process.env.SOLANA_PRIVATE_KEY

  // Registry scanners (Glama, Smithery, etc.) probe servers with an
  // all-zero placeholder key, which is 64 hex but not a valid secp256k1
  // scalar — privateKeyToAccount would throw fatally. Treat it as "no
  // key" so the server starts in introspection mode and tool discovery
  // works, which is exactly what a scanner wants.
  if (signerHex && /^0x0{64}$/.test(signerHex)) {
    console.error(
      '[2sio-mcp] EVM_PRIVATE_KEY is an all-zero placeholder — ignoring it.\n' +
        '  Set a real key to make paid calls; continuing without one.',
    )
    signerHex = undefined
  }

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

  // x402 mode — happy path. Either or both rails can be configured.
  if (signerHex || solanaKey) {
    const opts: Parameters<typeof createTwoSioMcpServer>[0] = {
      maxPriceUsd: flags.maxPriceUsd,
    }
    if (signerHex) {
      // Cast: when the MCP package and the SDK package each pull in their
      // own copy of viem (e.g. during local file: linking), TypeScript treats
      // the two LocalAccount types as distinct even though they're identical.
      // The cast is harmless at runtime.
      try {
        opts.signer = privateKeyToAccount(signerHex as Hex) as never
      } catch {
        // 64 hex but not a valid secp256k1 scalar (zero is handled above;
        // this catches out-of-range values like 0xfff...f).
        console.error(
          '[2sio-mcp] error: EVM_PRIVATE_KEY is 64 hex but not a valid\n' +
            '  secp256k1 private key. Generate a real key and try again.',
        )
        process.exit(2)
      }
    }
    if (solanaKey) {
      opts.solanaPrivateKey = solanaKey
    }
    const server = createTwoSioMcpServer(opts)
    await server.connect(new StdioServerTransport())
    return
  }

  // Trial mode — no key, but the caller opted into free try-before-you-buy
  // calls (1 per endpoint per hour). Tools run for real (no payment) so an
  // agent can verify the catalog works before funding a wallet.
  const trial = flags.trial || /^(1|true|yes|on)$/i.test(process.env.TWOS_TRIAL ?? '')
  if (trial) {
    console.error(
      '[2sio-mcp] starting in TRIAL mode — free calls, 1 per endpoint per hour.\n' +
        '  Set EVM_PRIVATE_KEY / SOLANA_PRIVATE_KEY to pay per call for unlimited access.',
    )
    const server = createTwoSioMcpServer({ trial: true, maxPriceUsd: flags.maxPriceUsd })
    await server.connect(new StdioServerTransport())
    return
  }

  // Introspection mode — no credentials supplied. The server still starts
  // and responds to list_tools so MCP hosts (Smithery, Glama, Claude
  // Desktop, etc.) can discover the tool catalog. Calls to tools will
  // error until a key is provided.
  console.error(
    '[2sio-mcp] starting in introspection mode — no signer configured.\n' +
      '  Set EVM_PRIVATE_KEY=0x<64hex>  to pay in USDC on Base, OR\n' +
      '  set SOLANA_PRIVATE_KEY=<base58> to pay in USDC on Solana.\n' +
      '  Either or both. Tool discovery works without a key.',
  )
  const noopSigner = {
    address: '0x0000000000000000000000000000000000000000' as Hex,
    signTypedData: async () => {
      throw new Error(
        '@2sio/mcp: server started in introspection mode. Set EVM_PRIVATE_KEY or SOLANA_PRIVATE_KEY to make paid calls.',
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
