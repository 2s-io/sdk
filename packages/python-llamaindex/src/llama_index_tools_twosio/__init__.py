"""LlamaIndex tools for 2s.io.

`get_twosio_tools(private_key=...)` returns a list of LlamaIndex `FunctionTool`
instances — one per 2s.io endpoint — ready to plug into a LlamaIndex agent.
Each tool wraps a typed call against the `2sio` SDK, which handles the x402
payment loop (no signup, no API keys; only a USDC-funded EVM wallet on Base).
"""

from llama_index_tools_twosio.tools import get_twosio_tools, twosio_tool, ENDPOINT_SPECS

__all__ = ["get_twosio_tools", "twosio_tool", "ENDPOINT_SPECS"]
__version__ = "0.1.3"
