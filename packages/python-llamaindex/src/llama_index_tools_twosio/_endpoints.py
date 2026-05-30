"""Curated endpoint specs for the langchain-twosio + llama-index-tools-twosio adapters.

Each spec describes one 2s.io endpoint as a pydantic-friendly args schema and the
SDK method that backs it. We curate rather than auto-derive from /openapi.json
so:
  - the package works fully offline at import time
  - we get to write hand-tuned tool descriptions optimized for LLM tool selection
  - args have Python-friendly types + descriptions

New endpoints get added here by hand; the SDK side stays the canonical source.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Sequence


@dataclass(frozen=True)
class Param:
    name: str
    type_: type
    description: str
    required: bool = True
    default: Any = None


@dataclass(frozen=True)
class EndpointSpec:
    """One endpoint, as exposed to LangChain / LlamaIndex agents."""

    name: str  # tool name, e.g. "twosio_patents_search"
    short_name: str  # human reference, e.g. "patents.search"
    description: str
    params: Sequence[Param] = field(default_factory=list)
    # Path through the TwoS client to reach the method. ("patents", "search") => client.patents.search(...)
    sdk_path: tuple[str, ...] = ()
    price_usd: float = 0.0


# Curated set — covers the 10 highest-leverage endpoints. Add more as needed.
ENDPOINT_SPECS: list[EndpointSpec] = [
    EndpointSpec(
        name="twosio_patents_search",
        short_name="patents.search",
        description=(
            "Search US patent applications and grants (USPTO Open Data Portal). "
            "Returns the most recent matches with application number, title, "
            "filing date, inventors, and a USPTO Patent Center URL. Use this when "
            "the user asks about patent filings, prior art, or invention disclosures. "
            "Costs ~$0.0018 per call."
        ),
        sdk_path=("patents", "search"),
        price_usd=0.0018,
        params=[
            Param("q", str, "Free-text search across patent titles and abstracts. 2+ chars."),
            Param("yearFrom", int, "Earliest filing year (inclusive).", required=False),
            Param("yearTo", int, "Latest filing year (inclusive).", required=False),
            Param("applicationType", str, "Utility | Design | Plant | Reissue.", required=False),
            Param("limit", int, "Results per page (1-100). Defaults to 10.", required=False, default=10),
            Param("offset", int, "0-based page offset.", required=False, default=0),
        ],
    ),
    EndpointSpec(
        name="twosio_papers_search",
        short_name="papers.search",
        description=(
            "Search academic papers across arXiv, PubMed, and Semantic Scholar in one "
            "call. Returns title, authors, DOI/arXiv id, abstract, publication date, "
            "and source link per hit. Use this for any 'find recent research on X' "
            "or 'has anyone published about Y' workflow. Costs ~$0.0024 per call."
        ),
        sdk_path=("papers", "search"),
        price_usd=0.0024,
        params=[
            Param("q", str, "Free-text query (1-500 chars)."),
            Param("limit", int, "Results to return (1-20). Defaults to 10.", required=False, default=10),
            Param("since", str, "Earliest publication date (YYYY-MM-DD).", required=False),
        ],
    ),
    EndpointSpec(
        name="twosio_law_case_search",
        short_name="law.case-search",
        description=(
            "Search US court opinions (SCOTUS, federal circuits, state appellate/supreme — "
            "~9M opinions via CourtListener). Returns matched cases with court, year, "
            "docket, reporter citations, citation count, and canonical URL. Use this to "
            "DISCOVER relevant cases. Pair with twosio_law_case_verify to confirm a "
            "specific citation. Costs ~$0.0036 per call."
        ),
        sdk_path=("law", "case_search"),
        price_usd=0.0036,
        params=[
            Param("q", str, "Free-text query: party names, keywords, docket #, or citation."),
            Param("limit", int, "Results (1-20). Default 10.", required=False, default=10),
            Param("court", str, "Comma-separated court slugs (e.g. 'scotus,ca9').", required=False),
        ],
    ),
    EndpointSpec(
        name="twosio_law_case_verify",
        short_name="law.case-verify",
        description=(
            "Anti-hallucination citation check: given a passage of text that contains "
            "one or more citations (e.g. 'as held in Brown v. Board, 347 U.S. 483 (1954)'), "
            "the endpoint extracts every citation and verifies each against the live "
            "CourtListener corpus, returning canonical case name, court, year, and URL. "
            "Costs ~$0.006 per call."
        ),
        sdk_path=("law", "case_verify"),
        price_usd=0.006,
        params=[
            Param("text", str, "A passage of legal text containing one or more case citations."),
        ],
    ),
    EndpointSpec(
        name="twosio_law_sanctions_check",
        short_name="law.sanctions-check",
        description=(
            "OFAC SDN screening (KYC/AML). Given a name, returns sanction-list matches "
            "with program, source URL, and similarity score. Backed by the live OFAC SDN "
            "dataset (refreshed daily). Use this in any onboarding or counterparty-"
            "screening flow. Costs ~$0.0048 per call."
        ),
        sdk_path=("law", "sanctions_check"),
        price_usd=0.0048,
        params=[
            Param("query", str, "Name to screen (person, company, vessel, or aircraft)."),
            Param("threshold", float, "Similarity floor (0.0-1.0). Default 0.4. Scores >= 0.85 are flagged as high-confidence by the endpoint.", required=False),
            Param("limit", int, "Max matches returned (1-100). Default 10.", required=False),
        ],
    ),
    EndpointSpec(
        name="twosio_wikipedia_summary",
        short_name="wikipedia.summary",
        description=(
            "Fetch a Wikipedia page summary in any language (BCP-47 code) via the "
            "official Wikipedia REST API. Returns extract, thumbnail URL, and the "
            "canonical page URL. Useful when you need an authoritative encyclopedic "
            "summary instead of model recall. Costs ~$0.001 per call."
        ),
        sdk_path=("wikipedia", "summary"),
        price_usd=0.001,
        params=[
            Param("title", str, "Page title (URL-friendly form, e.g. 'ATP_synthase')."),
        ],
    ),
    EndpointSpec(
        name="twosio_weather_zip",
        short_name="weather.zip",
        description=(
            "Current weather conditions for a US ZIP code via the US National "
            "Weather Service. Returns temperature, wind, humidity, conditions. "
            "Public-domain source, no licensing risk. Costs ~$0.0012 per call."
        ),
        sdk_path=("weather", "zip"),
        price_usd=0.0012,
        params=[
            Param("zip", str, "Five-digit US ZIP code (e.g. '94043')."),
        ],
    ),
    EndpointSpec(
        name="twosio_geocode_address",
        short_name="geocode.address",
        description=(
            "Forward geocode an address to (lat, lon) via LocationIQ. Returns the "
            "best match's coordinates, formatted address, and components. Use this "
            "when the user gives a street address you need to plot, route to, or "
            "feed into another geo endpoint. Costs ~$0.001 per call."
        ),
        sdk_path=("geocode", "address"),
        price_usd=0.001,
        params=[
            Param("q", str, "Address or place name to geocode (e.g. '1 Infinite Loop, Cupertino')."),
            Param("limit", int, "Max results (1-10). Default 5.", required=False),
            Param("country", str, "ISO 3166-1 alpha-2 country code to bias results.", required=False),
        ],
    ),
    EndpointSpec(
        name="twosio_ai_summarize",
        short_name="ai.summarize",
        description=(
            "Summarize the contents of a web page. Pass a URL; 2s fetches it, strips "
            "chrome, and returns a concise summary (Tier 2 — LLM-backed). Use for "
            "'tldr this article' workflows. Costs ~$0.0225 per call; the LLM upstream "
            "cost is included."
        ),
        sdk_path=("ai", "summarize"),
        price_usd=0.0225,
        params=[
            Param("url", str, "HTTPS URL to summarize."),
            Param("instruction", str, "Optional focus hint (e.g. 'summarize for an executive').", required=False),
        ],
    ),
    EndpointSpec(
        name="twosio_crypto_gas_oracle",
        short_name="crypto.gas-oracle",
        description=(
            "Live EVM gas oracle. Returns the latest block's baseFeePerGas plus "
            "slow / standard / fast priority-fee tiers (p25 / p50 / p75 over the "
            "trailing 4 blocks) and a 21k-gas transfer cost projection. Chains: "
            "base, ethereum, polygon, arbitrum, optimism. Real-time (~5s freshness). "
            "Costs ~$0.001 per call."
        ),
        sdk_path=("crypto", "gas_oracle"),
        price_usd=0.001,
        params=[
            Param("chain", str, "EVM chain: base | ethereum | polygon | arbitrum | optimism."),
        ],
    ),
]


def resolve_method(client: Any, path: tuple[str, ...]) -> Callable[..., Any]:
    """Walk the dotted SDK path and return the callable."""

    obj: Any = client
    for part in path:
        obj = getattr(obj, part)
    if not callable(obj):
        raise TypeError(f"Resolved object at {path} is not callable.")
    return obj


def build_args_model(spec: EndpointSpec) -> type:
    """Return a pydantic BaseModel class describing the spec's args."""

    from pydantic import BaseModel, Field, create_model

    fields: dict[str, Any] = {}
    for p in spec.params:
        if p.required:
            fields[p.name] = (p.type_, Field(..., description=p.description))
        else:
            default = p.default if p.default is not None else None
            fields[p.name] = (Optional[p.type_], Field(default=default, description=p.description))
    name = "".join(part.capitalize() for part in spec.name.split("_")) + "Args"
    return create_model(name, __base__=BaseModel, **fields)
