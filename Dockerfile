# 2sio MCP server — repo-root Dockerfile for Glama release builds.
#
# Glama's builder only supports Debian base images (debian:trixie-slim or
# debian:bookworm-slim). trixie ships nodejs 20.x from plain apt, which
# meets the package's engines requirement (node >=20) without a
# third-party apt repo; bookworm only ships 18.x, so don't switch the
# build spec to bookworm without also adding NodeSource here.
#
# Smithery and generic MCP hosts use packages/2s-mcp/Dockerfile
# (node:22-alpine) instead — keep the two in sync when changing behavior.
#
# The server speaks MCP over stdio. Introspection (tools/list) works
# without credentials — tool calls require EVM_PRIVATE_KEY (x402 payment)
# or SOLANA_PRIVATE_KEY. Placeholder all-zero keys are tolerated (the
# server falls back to introspection mode; @2sio/mcp >= 1.13.1).

FROM debian:trixie-slim

LABEL org.opencontainers.image.title="@2sio/mcp"
LABEL org.opencontainers.image.description="MCP server for 2s.io — pay-per-call AI agent APIs settled in USDC via x402 (Base + Solana)."
LABEL org.opencontainers.image.source="https://github.com/2s-io/sdk"
LABEL org.opencontainers.image.url="https://2s.io"
LABEL org.opencontainers.image.licenses="MIT"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @2sio/mcp@latest \
    && npm cache clean --force

# Run as non-root for hosts that enforce a non-zero UID.
RUN useradd -m -u 1001 mcp
USER mcp
WORKDIR /home/mcp

# stdio is the MCP transport — no port to expose.
ENTRYPOINT ["2sio-mcp"]
