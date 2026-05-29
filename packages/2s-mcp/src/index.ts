/**
 * @2sio/mcp — Model Context Protocol server for 2s.io.
 *
 * Exposes every endpoint of the @2sio/sdk as an MCP tool. Plug into
 * Claude Desktop, AgentKit, Cline, or any MCP host to give an agent
 * pay-per-call access to 39+ AI/data/utility APIs.
 *
 * Usage as a library:
 *
 *   import { createTwoSioMcpServer } from '@2sio/mcp'
 *   import { privateKeyToAccount } from 'viem/accounts'
 *
 *   const server = createTwoSioMcpServer({
 *     signer: privateKeyToAccount('0x...'),
 *   })
 *   // wire `server` to your MCP transport
 *
 * Or run the bundled CLI (stdio transport, suitable for Claude Desktop
 * MCP config):
 *
 *   npx @2sio/mcp --signer-env EVM_PRIVATE_KEY
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { TwoS, type TwoSConfig } from '@2sio/sdk'

import { buildToolList, type ToolDef } from './tools.js'

export interface CreateMcpServerOptions extends TwoSConfig {
  /** Server name shown to MCP hosts. Defaults to `2sio`. */
  name?: string
  /** Server version. Defaults to package.json version (set at build). */
  version?: string
}

export function createTwoSioMcpServer(opts: CreateMcpServerOptions): Server {
  const client = new TwoS(opts)
  const tools: ToolDef[] = buildToolList(client)
  const toolByName = new Map(tools.map((t) => [t.name, t]))

  const server = new Server(
    {
      name: opts.name ?? '2sio',
      version: opts.version ?? '0.1.0',
    },
    {
      capabilities: { tools: {} },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolByName.get(req.params.name)
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      }
    }
    try {
      const result = await tool.invoke(req.params.arguments ?? {})
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                data: result.data,
                cost_usd: result.costUsd,
                settlement: result.settlement,
                balance_usd: result.balanceUsd,
              },
              null,
              2,
            ),
          },
        ],
      }
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `2sio.${tool.name} failed: ${(err as Error).message}`,
          },
        ],
      }
    }
  })

  return server
}

export type { ToolDef } from './tools.js'
