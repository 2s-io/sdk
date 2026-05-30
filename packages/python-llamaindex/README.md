# llama-index-tools-twosio

LlamaIndex tools for [2s.io](https://2s.io) — pay-per-call AI agent APIs on Base via the [x402](https://x402.org) protocol.

**No signup. No API keys. No monthly fees.** Just a USDC-funded EVM wallet on Base mainnet. Each call settles per-request in USDC.

```bash
pip install llama-index-tools-twosio
```

```python
import asyncio
import os
from llama_index_tools_twosio import get_twosio_tools
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.anthropic import Anthropic

tools = get_twosio_tools(private_key=os.environ["EVM_PRIVATE_KEY"])
agent = FunctionAgent(tools=tools, llm=Anthropic(model="claude-haiku-4-5"))
response = asyncio.run(agent.run("Find recent patents for 'neural network beamforming'."))
print(response)
```

The agent picks the right 2s.io endpoint, calls it, pays in USDC, and returns the result — transparent to your model.

## What's in the box

Each tool wraps one [2s.io](https://2s.io) endpoint with a clear description and a typed pydantic schema. The curated set covers the highest-leverage workflows:

| Tool | Endpoint | What it does | Price |
|---|---|---|---|
| `twosio_patents_search` | `patents.search` | USPTO patent application search | $0.0018 |
| `twosio_papers_search` | `papers.search` | Unified arXiv + PubMed + Semantic Scholar search | $0.0024 |
| `twosio_law_case_search` | `law.case-search` | US court opinion discovery (~9M opinions) | $0.0036 |
| `twosio_law_case_verify` | `law.case-verify` | Citation anti-hallucination check | $0.006 |
| `twosio_law_sanctions_check` | `law.sanctions-check` | OFAC SDN screening (KYC/AML) | $0.0048 |
| `twosio_wikipedia_summary` | `wikipedia.summary` | Wikipedia REST API summary | $0.001 |
| `twosio_weather_zip` | `weather.zip` | US NWS current weather by ZIP | $0.0012 |
| `twosio_geocode_address` | `geocode.address` | Address → lat/lon (LocationIQ) | $0.001 |
| `twosio_ai_summarize` | `ai.summarize` | URL → concise summary (Tier 2, LLM-backed) | $0.0225 |
| `twosio_crypto_gas_oracle` | `crypto.gas-oracle` | Live EVM gas oracle | $0.001 |

The full 2s.io catalog has 39 endpoints. To use one not in the curated set, build a tool manually:

```python
from llama_index_tools_twosio import twosio_tool
from llama_index_tools_twosio._endpoints import EndpointSpec, Param
from twosio import TwoS

client = TwoS(private_key=os.environ["EVM_PRIVATE_KEY"])

custom = twosio_tool(client, EndpointSpec(
    name="twosio_dns_lookup",
    short_name="dns.lookup",
    description="Resolve a hostname against public DNS resolvers.",
    sdk_path=("dns", "lookup"),
    params=[
        Param("name", str, "Hostname to resolve."),
        Param("type", str, "Record type (A | AAAA | MX | TXT | NS).", required=False),
    ],
))
```

The full live catalog: <https://2s.io/api/directory> · OpenAPI: <https://2s.io/api/openapi>.

## Filters

```python
# Only the legal tools:
tools = get_twosio_tools(private_key=KEY, include=["law.case-search", "law.sanctions-check"])

# Everything except the LLM-backed (Tier 2) ones:
tools = get_twosio_tools(private_key=KEY, exclude=["ai.summarize"])
```

## How payment works

Every tool call runs through the underlying `2sio` SDK, which:

1. Hits the 2s.io endpoint.
2. Receives `HTTP 402 Payment Required` with an x402 envelope (price + recipient + EIP-3009 challenge).
3. Signs the `transferWithAuthorization` with your private key.
4. Retries with the signed payload.
5. Returns the response. The `meta.settlement` block in each result includes the on-chain tx hash.

You only pay for successful calls.

## License

MIT.

## Links

- 2s.io: <https://2s.io>
- Source: <https://github.com/2s-io/sdk>
- Issues: <https://github.com/2s-io/sdk/issues>
- Underlying SDK: [`2sio` on PyPI](https://pypi.org/project/2sio/)
