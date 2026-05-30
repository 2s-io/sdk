"""LangChain tools for 2s.io.

`get_twosio_tools(private_key=...)` returns a list of `StructuredTool` instances —
one per 2s.io endpoint — ready to plug into a LangChain agent. Each tool wraps a
typed call against the `2sio` SDK, which handles the x402 payment loop
(no signup, no API keys; only a USDC-funded EVM wallet on Base mainnet).
"""

from langchain_twosio.tools import get_twosio_tools, twosio_tool, ENDPOINT_SPECS

__all__ = ["get_twosio_tools", "twosio_tool", "ENDPOINT_SPECS"]
__version__ = "0.1.0"
