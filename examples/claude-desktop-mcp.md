# Wiring `@2sio/mcp` into Claude Desktop

Claude Desktop launches MCP servers as child processes via the `mcpServers` block of `claude_desktop_config.json`.

## Config file location

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

## Minimal config

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

Restart Claude Desktop. Open a new conversation — the model now has access to all 39 2s.io tools (patents search, sanctions screening, AI summarization, image description, geocoding, weather, gas oracle, etc.). It will sign and pay automatically per call.

## Safer: bearer mode

If you'd rather pre-fund a balance than expose a private key:

1. Hit `https://2s.io/api/account/create` once to get an API key + deposit address.
2. Send USDC to the deposit address.
3. Use the API key in the config:

```json
{
  "mcpServers": {
    "2sio": {
      "command": "npx",
      "args": ["-y", "@2sio/mcp", "--bearer"],
      "env": { "TWOSIO_API_KEY": "2s_..." }
    }
  }
}
```

## Capping per-call spend

```json
{
  "mcpServers": {
    "2sio": {
      "command": "npx",
      "args": ["-y", "@2sio/mcp", "--max-price", "0.02"],
      "env": { "EVM_PRIVATE_KEY": "0x..." }
    }
  }
}
```

The server will refuse any tool call whose advertised price exceeds the cap, regardless of what the model requests.
