# 2s.io SDK examples

Each script is a self-contained agent workflow that uses `@2sio/sdk` (TypeScript) or `2sio` (Python) to call 2s.io's pay-per-call API. They're meant to be readable, copy-pasteable starting points — not production code.

All examples require a USDC-funded EVM wallet on Base mainnet. Set `EVM_PRIVATE_KEY=0x...` in the environment before running.

## TypeScript

Install: `npm i @2sio/sdk`

| File | What it does |
|---|---|
| [paying-agent-base.ts](./paying-agent-base.ts) | Minimal hello-world: one paid call, log the result + tx hash. |
| [patents-prior-art.ts](./patents-prior-art.ts) | Patent prep workflow — search USPTO for prior art across multiple queries, dedupe, surface candidates. |
| [legal-research-chain.ts](./legal-research-chain.ts) | Chained legal research: case-search → case-verify (anti-hallucination) → opinion (full text). |
| [disaster-situational-awareness.ts](./disaster-situational-awareness.ts) | Real-time weather + quakes + tides + sun for a coordinate via the `/api/earth/now` composite. |
| [url-to-clean-markdown.ts](./url-to-clean-markdown.ts) | Fetch a web page, strip chrome, return article body as markdown — ready for RAG/summarization. |
| [typed-extraction.ts](./typed-extraction.ts) | Pass a URL + JSON Schema, get back data that matches the schema exactly. |
| [security-cve-triage.ts](./security-cve-triage.ts) | Vulnerability triage — enrich a scanner's CVE list with CISA KEV + EPSS + public-exploit signals and rank by real patch urgency. |
| [company-kyb-dossier.ts](./company-kyb-dossier.ts) | KYB onboarding — fuzzy-resolve a free-text company name to a GLEIF LEI, then pull a one-call SAM/OFAC/GLEIF/SEC dossier. |
| [durable-agent-worker.ts](./durable-agent-worker.ts) | Exactly-once work loop on the control plane — `lock` (single-leader lease) + `queue` (lease/ack with visibility timeout) + `store` (persist results) so stateless agent replicas coordinate without standing up their own infra. |
| [identity-crosswalk.ts](./identity-crosswalk.ts) | Crosswalk one entity across identifier systems — ticker → SEC CIK, ISIN, LEI, then a unified identity bundle — so an agent gets stable join keys across feeds without maintaining crosswalk tables. |

## Python

Install: `pip install 2sio`

| File | What it does |
|---|---|
| [sanctions-batch-screen.py](./sanctions-batch-screen.py) | Batch KYC/AML screening against the live OFAC SDN list. |
| [screenshot-archive.py](./screenshot-archive.py) | Capture screenshots of a list of URLs with manifest metadata, for visual provenance / change detection. |
| [zip-context-bundle.py](./zip-context-bundle.py) | Parallel-fetch demographics, weather, and address for any US ZIP code. |

## Claude Desktop MCP

[claude-desktop-mcp.md](./claude-desktop-mcp.md) — install `@2sio/mcp` as a stdio MCP server for Claude Desktop and call 2s.io endpoints from inside a chat.

## Pricing reference

Each call's price is set per-endpoint and surfaced in the response's `meta.cost.usd` field. Today's bands:

- Tier 0 (most endpoints): $0.001 – $0.006 / call
- Tier 2 (LLM-backed: ai/extract, ai/describe-image, ai/summarize): $0.006 – $0.03 / call

The full live catalog is at <https://2s.io/api/directory>.

## License

MIT.
