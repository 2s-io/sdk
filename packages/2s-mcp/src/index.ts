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
 *
 *   const server = createTwoSioMcpServer({
 *     privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
 *   })
 *   // wire `server` to your MCP transport
 *
 * Or run the bundled CLI (stdio transport, suitable for Claude Desktop):
 *
 *   EVM_PRIVATE_KEY=0x...  npx @2sio/mcp
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { TwoS, type TwoSConfig } from '@2sio/sdk'

import { createRequire } from 'node:module'

import { buildToolList, type ToolDef } from './tools.js'

// Read from package.json at load time so initialize.serverInfo always
// matches the published version. (Was a hand-pinned constant; it sat at
// 0.2.0 through thirteen releases before the 2026-06-03 audit caught it.)
const SERVER_VERSION: string = (() => {
  try {
    return createRequire(import.meta.url)('../package.json').version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

export interface CreateMcpServerOptions extends TwoSConfig {
  /** Server name shown to MCP hosts. Defaults to `2sio`. */
  name?: string
  /** Server version. Defaults to the package version. */
  version?: string
}

export function createTwoSioMcpServer(opts: CreateMcpServerOptions): Server {
  const client = new TwoS(opts)
  const tools: ToolDef[] = buildToolList(client)
  const toolByName = new Map(tools.map((t) => [t.name, t]))

  const server = new Server(
    {
      name: opts.name ?? '2sio',
      version: opts.version ?? SERVER_VERSION,
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
