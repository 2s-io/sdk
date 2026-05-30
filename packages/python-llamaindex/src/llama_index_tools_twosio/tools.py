"""LlamaIndex `FunctionTool` factories that wrap 2s.io endpoints.

Usage::

    import asyncio
    from llama_index_tools_twosio import get_twosio_tools
    tools = get_twosio_tools(private_key=os.environ["EVM_PRIVATE_KEY"])

    from llama_index.core.agent.workflow import FunctionAgent
    from llama_index.llms.anthropic import Anthropic
    agent = FunctionAgent(tools=tools, llm=Anthropic(model="claude-haiku-4-5"))
    response = asyncio.run(agent.run("Find recent patents for 'neural network beamforming'."))

Each tool wraps a typed call against the `2sio` SDK, which handles the x402
payment loop (no signup, no API keys — just a USDC-funded EVM wallet on Base).
"""

from __future__ import annotations

import json
from typing import Any, Optional, Sequence

from llama_index.core.tools import FunctionTool, ToolMetadata

from llama_index_tools_twosio._endpoints import (
    ENDPOINT_SPECS,
    EndpointSpec,
    build_args_model,
    resolve_method,
)


def _format_call_result(result: Any) -> str:
    if hasattr(result, "data"):
        payload = {
            "endpoint": getattr(result, "endpoint", None),
            "data": getattr(result, "data", None),
        }
        settlement = getattr(result, "settlement", None)
        if settlement:
            payload["settlement"] = settlement
        return json.dumps(payload, indent=2, default=str)
    return json.dumps(result, indent=2, default=str)


def twosio_tool(client: Any, spec: EndpointSpec) -> FunctionTool:
    """Build one LlamaIndex FunctionTool from a spec + a TwoS client."""

    method = resolve_method(client, spec.sdk_path)
    args_model = build_args_model(spec)

    def _call(**kwargs: Any) -> str:
        cleaned = {k: v for k, v in kwargs.items() if v is not None}
        return _format_call_result(method(**cleaned))

    return FunctionTool.from_defaults(
        fn=_call,
        name=spec.name,
        description=spec.description,
        fn_schema=args_model,
    )


def get_twosio_tools(
    *,
    private_key: Optional[str] = None,
    client: Optional[Any] = None,
    base_url: Optional[str] = None,
    include: Optional[Sequence[str]] = None,
    exclude: Optional[Sequence[str]] = None,
) -> list[FunctionTool]:
    """Return one FunctionTool per curated 2s.io endpoint.

    Provide either:
        - ``private_key``: EVM private key (0x...) funded with USDC on Base.
        - ``client``: a pre-built ``2sio.TwoS`` instance.

    Optional ``include`` / ``exclude`` filter by tool name OR short_name.
    """

    if client is None:
        if not private_key:
            raise ValueError(
                "get_twosio_tools requires either `private_key` (EVM 0x... key) or `client` (2sio.TwoS instance)."
            )
        from twosio import TwoS

        kwargs: dict[str, Any] = {"private_key": private_key}
        if base_url:
            kwargs["base_url"] = base_url
        client = TwoS(**kwargs)

    inc = set(include) if include else None
    exc = set(exclude) if exclude else set()
    tools: list[FunctionTool] = []
    for spec in ENDPOINT_SPECS:
        if inc is not None and not (spec.name in inc or spec.short_name in inc):
            continue
        if spec.name in exc or spec.short_name in exc:
            continue
        tools.append(twosio_tool(client, spec))
    return tools
