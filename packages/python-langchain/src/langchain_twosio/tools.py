"""LangChain `StructuredTool` factories that wrap 2s.io endpoints.

Usage::

    from langchain_twosio import get_twosio_tools
    tools = get_twosio_tools(private_key=os.environ["EVM_PRIVATE_KEY"])
    agent = create_react_agent(llm, tools)

`get_twosio_tools` returns one `StructuredTool` per curated endpoint. Each tool's
`run` method invokes the underlying `2sio` SDK, which transparently handles the
x402 payment loop (no signup, no API keys — just a USDC-funded EVM wallet).
"""

from __future__ import annotations

from typing import Any, Callable, Optional, Sequence

from langchain_core.tools import StructuredTool

from langchain_twosio._endpoints import (
    ENDPOINT_SPECS,
    EndpointSpec,
    build_args_model,
    resolve_method,
)


def _format_call_result(result: Any) -> str:
    """Convert a 2sio CallResult into a string the LLM can read.

    LangChain tools return strings. We serialize the `data` payload as JSON
    and prepend a small line with the settlement tx (the LLM rarely needs it,
    but it's there for debugging).
    """

    import json

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


def twosio_tool(client: Any, spec: EndpointSpec) -> StructuredTool:
    """Build one StructuredTool from a spec + a TwoS client instance."""

    method = resolve_method(client, spec.sdk_path)
    args_model = build_args_model(spec)

    def _call(**kwargs: Any) -> str:
        # Drop None values so SDK defaults apply.
        cleaned = {k: v for k, v in kwargs.items() if v is not None}
        return _format_call_result(method(**cleaned))

    return StructuredTool.from_function(
        func=_call,
        name=spec.name,
        description=spec.description,
        args_schema=args_model,
    )


def get_twosio_tools(
    *,
    private_key: Optional[str] = None,
    client: Optional[Any] = None,
    base_url: Optional[str] = None,
    include: Optional[Sequence[str]] = None,
    exclude: Optional[Sequence[str]] = None,
) -> list[StructuredTool]:
    """Return one StructuredTool per curated 2s.io endpoint.

    Provide either:
        - ``private_key``: EVM private key (0x...) funded with USDC on Base.
          A `2sio.TwoS` client is constructed for you.
        - ``client``: a pre-built `2sio.TwoS` instance.

    Optional filters:
        - ``include``: only include tools whose name OR short_name is in this list.
        - ``exclude``: drop tools whose name OR short_name is in this list.
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
    tools: list[StructuredTool] = []
    for spec in ENDPOINT_SPECS:
        if inc is not None and not (spec.name in inc or spec.short_name in inc):
            continue
        if spec.name in exc or spec.short_name in exc:
            continue
        tools.append(twosio_tool(client, spec))
    return tools
