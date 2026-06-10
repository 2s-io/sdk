# 2sio MCP server — Docker image suitable for Glama, Smithery, and any
# MCP host that runs servers in a container.
#
# Build:    docker build -t 2sio/mcp .
# Run:      docker run --rm -i -e EVM_PRIVATE_KEY=0x... 2sio/mcp
#
# The server speaks MCP over stdio (the canonical transport). MCP hosts
# spawn the container with `docker run -i ...` and pipe JSON-RPC through
# stdin/stdout. Introspection (list_tools) works without credentials —
# tool calls require EVM_PRIVATE_KEY (x402 payment, 0x + 64 hex). 2s.io is
# x402-only; there is no bearer / API-key path on the public surface.

FROM node:22-alpine

LABEL org.opencontainers.image.title="@2sio/mcp"
LABEL org.opencontainers.image.description="MCP server for 2s.io — pay-per-call AI agent APIs on Base via x402."
LABEL org.opencontainers.image.source="https://github.com/2s-io/sdk"
LABEL org.opencontainers.image.url="https://2s.io"
LABEL org.opencontainers.image.licenses="MIT"

# Install the latest published package from npm.
RUN npm install -g @2sio/mcp@latest \
    && npm cache clean --force

# Run as non-root for hosts that enforce a non-zero UID.
RUN adduser -D -u 1001 mcp
USER mcp
WORKDIR /home/mcp

# stdio is the MCP transport — no port to expose.
ENTRYPOINT ["2sio-mcp"]
