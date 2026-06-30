"""
TwoS client implementation. Synchronous + async variants share a request
core that handles 402-aware retries.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional, Union

import httpx

DEFAULT_BASE = "https://2s.io"
# No default price ceiling — 2s prices each endpoint by its own cost/margin and
# some are intentionally premium. Callers opt into a local cap via max_price_usd.
DEFAULT_MAX_PRICE_USD = float("inf")


def _run_coro_sync(coro):
    """Run an awaitable to completion from sync code, even when an event loop is already running.

    The x402 Python SDK's `create_payment_payload` is async-only, but TwoS exposes
    a sync surface (the canonical use case is a research script or a sync LangChain
    tool body). `asyncio.run` would fail if the caller is already inside a loop
    (e.g. LangGraph's async agent path), so we always shunt to a fresh thread
    running its own event loop. ~1ms overhead per paid call; robust everywhere.
    """

    import asyncio
    import concurrent.futures

    def _runner(c):
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(c)
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        return ex.submit(_runner, coro).result()


class TwoSError(Exception):
    """HTTP error from 2s.io after payment (4xx/5xx)."""

    def __init__(self, message: str, status: int, code: Optional[str], url: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.url = url


class PaymentRefusedError(Exception):
    """Local refusal — price exceeded ``max_price_usd`` or hook denied."""

    def __init__(self, message: str, url: str, advertised_usd: float):
        super().__init__(message)
        self.url = url
        self.advertised_usd = advertised_usd


@dataclass
class CallResult:
    """Normalized return value for every endpoint call."""

    data: Any
    """Parsed response body."""
    endpoint: str
    """Endpoint id, e.g. ``"patents.search"``."""
    cost_usd: float = 0.0
    """Final amount paid in USD."""
    settlement: Optional[dict] = None
    """x402 settlement info: tx_hash, network, success."""
    balance_usd: Optional[float] = None
    """Balance after debit, on bearer calls."""


class _Group:
    """Marker base for namespaced endpoint groups (client.patents, client.ai, ...)."""

    def __init__(self, client: "TwoS"):
        self._c = client


class _Patents(_Group):
    def epo_biblio(self, *, number: str, format: str | None = None) -> CallResult:
        """Bibliographic record for a patent publication via EPO OPS: invention titles (multiple languages), applicants, inventors, IPC classifications, application number, and the abstract. Worldwide coverage b"""
        query: dict = {"number": number}
        if format is not None:
            query["format"] = format
        return self._c.request("GET", "/api/patents/epo-biblio", endpoint="patents.epo-biblio", query=query)

    def epo_family(self, *, number: str, format: str | None = None) -> CallResult:
        """INPADOC patent family for a publication via EPO OPS — every worldwide equivalent of the same invention (same priority), each with country, document number, kind code, and combined publication number. """
        query: dict = {"number": number}
        if format is not None:
            query["format"] = format
        return self._c.request("GET", "/api/patents/epo-family", endpoint="patents.epo-family", query=query)

    def epo_legal(self, *, number: str, format: str | None = None) -> CallResult:
        """INPADOC legal-status events for a patent publication via EPO OPS: the timeline of procedural events (examination, grant, designations, national-phase entries, lapses, withdrawals) each with an event c"""
        query: dict = {"number": number}
        if format is not None:
            query["format"] = format
        return self._c.request("GET", "/api/patents/epo-legal", endpoint="patents.epo-legal", query=query)

    def epo_search(self, *, q: str, limit: int | None = None) -> CallResult:
        """Search worldwide patent publications via the European Patent Office's Open Patent Services (OPS). Pass a CQL query (e.g. ti=quantum computing, in=tesla, pa=siemens, cpc=H01M, pn=EP1000000) and get mat"""
        query: dict = {"q": q}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/patents/epo-search", endpoint="patents.epo-search", query=query)

    def search(self, **kwargs) -> CallResult:
        return self._c.request("GET", "/api/patents/search", endpoint="patents.search", query=kwargs)

    def detail(self, applicationNumber: str) -> CallResult:
        return self._c.request(
            "GET", "/api/patents/detail",
            endpoint="patents.detail",
            query={"applicationNumber": applicationNumber},
        )

    def documents(self, applicationNumber: str) -> CallResult:
        return self._c.request(
            "GET", "/api/patents/documents",
            endpoint="patents.documents",
            query={"applicationNumber": applicationNumber},
        )


class _Time(_Group):
    def parse(self, *, input: str, tz: str | None = None) -> CallResult:
        """Parse a timestamp or date string into canonical forms — zero-dependency. Accepts unix seconds/millis or any standard date string (ISO-8601, RFC-2822, etc.). Returns UTC ISO, unix seconds + millis, RFC"""
        query: dict = {"input": input}
        if tz is not None:
            query["tz"] = tz
        return self._c.request("GET", "/api/time/parse", endpoint="time.parse", query=query)



class _Watchers(_Group):
    def package_release(self, *, registry: str, name: str, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a package publishes a new version — track your dependencies. Arm once, pay once. registry is 'npm' or 'pypi'; name is the package name (e.g. react, requests). Fires"""
        body: dict = {"registry": registry, "name": name, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/package-release", endpoint="watchers.package-release", body=body)

    def ioc_reputation(self, *, ioc: str, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when an indicator of compromise (IP or domain) changes malicious status across threat feeds. Arm once, pay once. Pass ioc (an IP address or domain). Fires when the malic"""
        body: dict = {"ioc": ioc, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/ioc-reputation", endpoint="watchers.ioc-reputation", body=body)

    def http_headers(self, *, url: str, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a website's HTTP security-headers grade changes (e.g. a regression from A to C). Arm once, pay once. Pass url. Fires when the grade changes; bounded by maxFires/exp"""
        body: dict = {"url": url, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/http-headers", endpoint="watchers.http-headers", body=body)

    def dns(self, *, host: str, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a host's DNS records change. Arm once, pay once. Pass host (e.g. example.com). Fires when the resolved answers change (e.g. an A/AAAA/CNAME/MX update); bounded by m"""
        body: dict = {"host": host, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/dns", endpoint="watchers.dns", body=body)

    def whois(self, *, domain: str, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a domain's WHOIS registration changes — registrar, expiry, or status. Arm once, pay once. Pass domain. Fires on any WHOIS change (e.g. transfer, renewal, expiry shi"""
        body: dict = {"domain": domain, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/whois", endpoint="watchers.whois", body=body)

    def fear_greed(self, *, conditionType: str, threshold: float, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when the Crypto Fear & Greed index crosses a level (e.g. drops into Extreme Fear). Arm once, pay once. conditionType 'above'/'below'; threshold is the index value 0–100."""
        body: dict = {"conditionType": conditionType, "threshold": threshold, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/fear-greed", endpoint="watchers.fear-greed", body=body)

    def fred_series(self, *, seriesId: str, conditionType: str, threshold: float, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a FRED economic series' latest value crosses a level. Arm once, pay once. Pass seriesId (e.g. DGS10 = 10yr Treasury, UNRATE = unemployment, CPIAUCSL = CPI, FEDFUNDS"""
        body: dict = {"seriesId": seriesId, "conditionType": conditionType, "threshold": threshold, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/fred-series", endpoint="watchers.fred-series", body=body)

    def patent(self, *, query: str, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a new USPTO patent matching your query appears. Arm once, pay once. Pass query (keywords, assignee, etc.). Fires once per new patent (deduped by application number)"""
        body: dict = {"query": query, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/patent", endpoint="watchers.patent", body=body)

    def paper(self, *, query: str, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a new academic paper matching your query is published (arXiv / PubMed / Semantic Scholar). Arm once, pay once. Pass query (keywords, author, topic). Fires once per """
        body: dict = {"query": query, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/paper", endpoint="watchers.paper", body=body)

    def product_recall(self, *, callbackUrl: str, keyword: str | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a new US product recall is published (CPSC). Arm once, pay once. Optionally pass keyword to only fire on recalls whose title contains it (e.g. a brand or product). """
        body: dict = {"callbackUrl": callbackUrl}
        if keyword is not None:
            body["keyword"] = keyword
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/product-recall", endpoint="watchers.product-recall", body=body)

    def fx_rate(self, *, base: str, quote: str, conditionType: str, threshold: float, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when an FX pair crosses a rate you set. Arm once, pay once. base + quote are 3-letter ISO currency codes (e.g. base USD, quote EUR). conditionType 'above'/'below'; thres"""
        body: dict = {"base": base, "quote": quote, "conditionType": conditionType, "threshold": threshold, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/fx-rate", endpoint="watchers.fx-rate", body=body)

    def funding_rate(self, *, coin: str, conditionType: str, threshold: float, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a Hyperliquid perpetual's hourly funding rate crosses a level (e.g. flips negative). Arm once, pay once. Pass coin (e.g. BTC, ETH). conditionType 'above'/'below'; t"""
        body: dict = {"coin": coin, "conditionType": conditionType, "threshold": threshold, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/funding-rate", endpoint="watchers.funding-rate", body=body)

    def prediction_market(self, *, conditionId: str, conditionType: str, threshold: float, callbackUrl: str, outcomeIndex: int | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a Polymarket outcome's implied probability crosses a level. Arm once, pay once. Pass conditionId (the market's condition id) and outcomeIndex (0 = first outcome, us"""
        body: dict = {"conditionId": conditionId, "conditionType": conditionType, "threshold": threshold, "callbackUrl": callbackUrl}
        if outcomeIndex is not None:
            body["outcomeIndex"] = outcomeIndex
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/prediction-market", endpoint="watchers.prediction-market", body=body)

    def sec_filing(self, *, ticker: str, callbackUrl: str, form: str | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a US company files with the SEC (EDGAR). Arm once, pay once. Pass ticker; optionally form to only fire on a specific filing type (e.g. 8-K, 10-K, 13F, 4). Fires onc"""
        body: dict = {"ticker": ticker, "callbackUrl": callbackUrl}
        if form is not None:
            body["form"] = form
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/sec-filing", endpoint="watchers.sec-filing", body=body)

    def company_news(self, *, ticker: str, callbackUrl: str, keyword: str | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a new news article is published about a US company. Arm once, pay once. Pass ticker; optionally keyword to only fire on headlines containing it. Fires once per new """
        body: dict = {"ticker": ticker, "callbackUrl": callbackUrl}
        if keyword is not None:
            body["keyword"] = keyword
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/company-news", endpoint="watchers.company-news", body=body)

    def ipo(self, *, callbackUrl: str, keyword: str | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a new US IPO appears on the calendar. Arm once, pay once. Optionally pass keyword to only fire when the company name/symbol matches. Fires once per new IPO (deduped"""
        body: dict = {"callbackUrl": callbackUrl}
        if keyword is not None:
            body["keyword"] = keyword
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/ipo", endpoint="watchers.ipo", body=body)

    def federal_register(self, *, callbackUrl: str, type: str | None = None, agency: str | None = None, keyword: str | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a new US Federal Register document is published. Arm once, pay once. Optionally filter by type (RULE / PRORULE / NOTICE / PRESDOCU), agency (slug, e.g. environmenta"""
        body: dict = {"callbackUrl": callbackUrl}
        if type is not None:
            body["type"] = type
        if agency is not None:
            body["agency"] = agency
        if keyword is not None:
            body["keyword"] = keyword
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/federal-register", endpoint="watchers.federal-register", body=body)

    def weather_alert(self, *, area: str, callbackUrl: str, severity: str | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when the US National Weather Service issues a new alert for an area. Arm once, pay once. Pass area (2-letter state/territory code, e.g. CA, TX); optionally severity to o"""
        body: dict = {"area": area, "callbackUrl": callbackUrl}
        if severity is not None:
            body["severity"] = severity
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/weather-alert", endpoint="watchers.weather-alert", body=body)

    def earthquake(self, *, lat: float, lon: float, callbackUrl: str, radiusKm: float | None = None, minMagnitude: float | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when USGS reports a new earthquake near a location above a magnitude. Arm once, pay once. Pass lat, lon, optional radiusKm (default 500) and minMagnitude (default 4). Fi"""
        body: dict = {"lat": lat, "lon": lon, "callbackUrl": callbackUrl}
        if radiusKm is not None:
            body["radiusKm"] = radiusKm
        if minMagnitude is not None:
            body["minMagnitude"] = minMagnitude
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/earthquake", endpoint="watchers.earthquake", body=body)

    def flight_status(self, *, ident: str, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a flight's status changes (e.g. Scheduled → Delayed → Departed → Landed). Arm once, pay once. Pass ident (airline flight designator like UAL1 / UA1, or a tail numbe"""
        body: dict = {"ident": ident, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/flight-status", endpoint="watchers.flight-status", body=body)

    def token_price(self, *, tokenId: str, conditionType: str, threshold: float, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a crypto asset crosses a price you set. Arm once, pay once (no account, no API key) — we poll the spot price and POST your custom payload to callbackUrl the moment """
        body: dict = {"tokenId": tokenId, "conditionType": conditionType, "threshold": threshold, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/token-price", endpoint="watchers.token-price", body=body)

    def gas_price(self, *, chain: str, conditionType: str, threshold: float, callbackUrl: str, tier: str | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when EVM gas crosses a level you set — e.g. "wake me when Ethereum gas drops below 10 gwei." Arm once, pay once (no account, no API key). chain: base | ethereum | polygo"""
        body: dict = {"chain": chain, "conditionType": conditionType, "threshold": threshold, "callbackUrl": callbackUrl}
        if tier is not None:
            body["tier"] = tier
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/gas-price", endpoint="watchers.gas-price", body=body)

    def business_earnings(self, *, ticker: str, callbackUrl: str, trigger: str | None = None, daysBefore: int | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback around a US company's earnings. Arm once, pay once (no account, no API key). trigger 'reported' (default) fires when results post — with reported EPS vs estimate, the su"""
        body: dict = {"ticker": ticker, "callbackUrl": callbackUrl}
        if trigger is not None:
            body["trigger"] = trigger
        if daysBefore is not None:
            body["daysBefore"] = daysBefore
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/business-earnings", endpoint="watchers.business-earnings", body=body)

    def stock_price(self, *, ticker: str, conditionType: str, threshold: float, callbackUrl: str, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback when a US stock crosses a price you set. Arm once, pay once (no account, no API key) — we poll the quote during US market hours and POST your custom payload to callbackU"""
        body: dict = {"ticker": ticker, "conditionType": conditionType, "threshold": threshold, "callbackUrl": callbackUrl}
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/stock-price", endpoint="watchers.stock-price", body=body)

    def cancel(self, *, watcherId: str) -> CallResult:
        """Cancel an active watcher by watcherId — it stops watching immediately. Flat-fee model: no refund of the unused window (nothing is held or owed). Idempotent. Pairs with watchers.crypto-address-activity"""
        body: dict = {"watcherId": watcherId}
        return self._c.request("POST", "/api/watchers/cancel", endpoint="watchers.cancel", body=body)

    def crypto_address_activity(self, *, chain: str, address: str, callbackUrl: str, direction: str | None = None, assetTypes: Any | None = None, minValueUsd: float | None = None, payload: Any | None = None, expiresInSeconds: int | None = None, maxFires: int | None = None, label: str | None = None) -> CallResult:
        """WATCHER: get a signed callback the moment a crypto address transacts. Arm once, pay once (no account, no API key) — we watch Base, Ethereum, or Bitcoin and POST your custom payload to callbackUrl when"""
        body: dict = {"chain": chain, "address": address, "callbackUrl": callbackUrl}
        if direction is not None:
            body["direction"] = direction
        if assetTypes is not None:
            body["assetTypes"] = assetTypes
        if minValueUsd is not None:
            body["minValueUsd"] = minValueUsd
        if payload is not None:
            body["payload"] = payload
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if maxFires is not None:
            body["maxFires"] = maxFires
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/watchers/crypto-address-activity", endpoint="watchers.crypto-address-activity", body=body)

    def status(self, *, watcherId: str) -> CallResult:
        """Status of a watcher by watcherId: state (armed/completed/expired/cancelled), fires used/remaining, expiry, recent deliveries (with HTTP result + attempt count), and any UNDELIVERED events with their f"""
        query: dict = {"watcherId": watcherId}
        return self._c.request("GET", "/api/watchers/status", endpoint="watchers.status", query=query)



class _Markets(_Group):
    def status(self, *, exchange: str | None = None) -> CallResult:
        """Is a stock exchange open right now? Pass exchange (default US); returns whether trading is open, the current session (pre-market, regular, post-market, or closed), whether today is a market holiday, t"""
        query: dict = {}
        if exchange is not None:
            query["exchange"] = exchange
        return self._c.request("GET", "/api/markets/status", endpoint="markets.status", query=query)

    def holiday(self, *, exchange: str | None = None) -> CallResult:
        """Stock-exchange holiday calendar. Pass exchange (default US); returns the list of upcoming market holidays with the date, holiday name, whether the session is a full close or an early close, and the tr"""
        query: dict = {}
        if exchange is not None:
            query["exchange"] = exchange
        return self._c.request("GET", "/api/markets/holiday", endpoint="markets.holiday", query=query)



class _Store(_Group):
    def blob_delete(self, *, ns: str, key: str) -> CallResult:
        """STORE: delete a file you uploaded, scoped to YOUR wallet..."""
        body: dict = {"ns": ns, "key": key}
        return self._c.request("POST", "/api/store/blob-delete", endpoint="store.blob-delete", body=body)

    def blob_get(self, *, ns: str, key: str) -> CallResult:
        """STORE: download a file you uploaded with store.blob-put, in..."""
        body: dict = {"ns": ns, "key": key}
        return self._c.request("POST", "/api/store/blob-get", endpoint="store.blob-get", body=body)

    def blob_list(self, *, ns: str, prefix: str | None = None, limit: int | None = None, after: str | None = None) -> CallResult:
        """STORE: list the files you've uploaded in a namespace..."""
        body: dict = {"ns": ns}
        if prefix is not None:
            body["prefix"] = prefix
        if limit is not None:
            body["limit"] = limit
        if after is not None:
            body["after"] = after
        return self._c.request("POST", "/api/store/blob-list", endpoint="store.blob-list", body=body)

    def blob_put(self, *, ns: str, key: str, data: str, contentType: str | None = None) -> CallResult:
        """STORE: upload a file (any bytes) in a single paid call..."""
        body: dict = {"ns": ns, "key": key, "data": data}
        if contentType is not None:
            body["contentType"] = contentType
        return self._c.request("POST", "/api/store/blob-put", endpoint="store.blob-put", body=body)

    def doc_delete(self, *, ns: str, id: str) -> CallResult:
        """STORE: delete a stored document by id, scoped to YOUR wallet."""
        body: dict = {"ns": ns, "id": id}
        return self._c.request("POST", "/api/store/doc-delete", endpoint="store.doc-delete", body=body)

    def doc_get(self, *, ns: str, id: str) -> CallResult:
        """STORE: fetch a stored document by id, scoped to YOUR wallet."""
        body: dict = {"ns": ns, "id": id}
        return self._c.request("POST", "/api/store/doc-get", endpoint="store.doc-get", body=body)

    def doc_put(self, *, ns: str, id: str, body: str, meta: str | None = None) -> CallResult:
        """STORE: index a text document for full-text keyword search..."""
        body: dict = {"ns": ns, "id": id, "body": body}
        if meta is not None:
            body["meta"] = meta
        return self._c.request("POST", "/api/store/doc-put", endpoint="store.doc-put", body=body)

    def doc_search(self, *, ns: str, query: str, limit: int | None = None) -> CallResult:
        """STORE: full-text keyword search over documents you stored..."""
        body: dict = {"ns": ns, "query": query}
        if limit is not None:
            body["limit"] = limit
        return self._c.request("POST", "/api/store/doc-search", endpoint="store.doc-search", body=body)

    def kv_delete(self, *, ns: str, key: str) -> CallResult:
        """STORE: delete a key/value you stored, scoped to YOUR wallet."""
        body: dict = {"ns": ns, "key": key}
        return self._c.request("POST", "/api/store/kv-delete", endpoint="store.kv-delete", body=body)

    def kv_get(self, *, ns: str, key: str) -> CallResult:
        """STORE: read back a JSON value you stored with store.kv-put..."""
        body: dict = {"ns": ns, "key": key}
        return self._c.request("POST", "/api/store/kv-get", endpoint="store.kv-get", body=body)

    def kv_put(self, *, ns: str, key: str, value: str | None = None) -> CallResult:
        """STORE: persist a JSON value under a key, scoped to YOUR..."""
        body: dict = {"ns": ns, "key": key}
        if value is not None:
            body["value"] = value
        return self._c.request("POST", "/api/store/kv-put", endpoint="store.kv-put", body=body)

    def kv_scan(self, *, ns: str, prefix: str | None = None, limit: int | None = None, after: str | None = None, values: bool | None = None) -> CallResult:
        """STORE: list keys in a namespace, scoped to YOUR wallet..."""
        body: dict = {"ns": ns}
        if prefix is not None:
            body["prefix"] = prefix
        if limit is not None:
            body["limit"] = limit
        if after is not None:
            body["after"] = after
        if values is not None:
            body["values"] = values
        return self._c.request("POST", "/api/store/kv-scan", endpoint="store.kv-scan", body=body)

    def usage(self) -> CallResult:
        """STORE: report how much storage YOUR wallet is using..."""
        return self._c.request("POST", "/api/store/usage", endpoint="store.usage")

    def vector_delete(self, *, ns: str, id: str) -> CallResult:
        """STORE: delete a vector by id from a namespace, scoped to..."""
        body: dict = {"ns": ns, "id": id}
        return self._c.request("POST", "/api/store/vector-delete", endpoint="store.vector-delete", body=body)

    def vector_query(self, *, ns: str, embedding: Any, topK: int | None = None) -> CallResult:
        """STORE: nearest-neighbor search over vectors you upserted in..."""
        body: dict = {"ns": ns, "embedding": embedding}
        if topK is not None:
            body["topK"] = topK
        return self._c.request("POST", "/api/store/vector-query", endpoint="store.vector-query", body=body)

    def vector_upsert(self, *, ns: str, id: str, embedding: Any, body: str | None = None, meta: str | None = None) -> CallResult:
        """STORE: upsert a vector for semantic retrieval, scoped to..."""
        body: dict = {"ns": ns, "id": id, "embedding": embedding}
        if body is not None:
            body["body"] = body
        if meta is not None:
            body["meta"] = meta
        return self._c.request("POST", "/api/store/vector-upsert", endpoint="store.vector-upsert", body=body)



class _Lock(_Group):
    def acquire(self, *, key: str, ttlSeconds: int) -> CallResult:
        """LOCK: acquire a distributed lock/lease, scoped to YOUR wallet."""
        body: dict = {"key": key, "ttlSeconds": ttlSeconds}
        return self._c.request("POST", "/api/lock/acquire", endpoint="lock.acquire", body=body)

    def release(self, *, key: str, token: str) -> CallResult:
        """LOCK: release a lock you hold, scoped to YOUR wallet."""
        body: dict = {"key": key, "token": token}
        return self._c.request("POST", "/api/lock/release", endpoint="lock.release", body=body)

    def renew(self, *, key: str, token: str, ttlSeconds: int) -> CallResult:
        """LOCK: extend a lock you hold, scoped to YOUR wallet."""
        body: dict = {"key": key, "token": token, "ttlSeconds": ttlSeconds}
        return self._c.request("POST", "/api/lock/renew", endpoint="lock.renew", body=body)



class _Pubsub(_Group):
    def create_topic(self, *, name: str) -> CallResult:
        """PUBSUB: create a topic you own, scoped to YOUR wallet."""
        body: dict = {"name": name}
        return self._c.request("POST", "/api/pubsub/create-topic", endpoint="pubsub.create-topic", body=body)

    def publish(self, *, topicId: str, message: str | None = None) -> CallResult:
        """PUBSUB: publish a message to a topic YOU own, fanning out a..."""
        body: dict = {"topicId": topicId}
        if message is not None:
            body["message"] = message
        return self._c.request("POST", "/api/pubsub/publish", endpoint="pubsub.publish", body=body)

    def subscribe(self, *, topicId: str, callbackUrl: str, label: str | None = None) -> CallResult:
        """PUBSUB: subscribe a callbackUrl to a topic by its topicId..."""
        body: dict = {"topicId": topicId, "callbackUrl": callbackUrl}
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/pubsub/subscribe", endpoint="pubsub.subscribe", body=body)

    def unsubscribe(self, *, subscriptionId: str) -> CallResult:
        """PUBSUB: remove one of YOUR subscriptions by its..."""
        body: dict = {"subscriptionId": subscriptionId}
        return self._c.request("POST", "/api/pubsub/unsubscribe", endpoint="pubsub.unsubscribe", body=body)



class _Queue(_Group):
    def ack(self, *, queue: str, id: str, leaseToken: str) -> CallResult:
        """QUEUE: confirm a leased message is processed - deletes it..."""
        body: dict = {"queue": queue, "id": id, "leaseToken": leaseToken}
        return self._c.request("POST", "/api/queue/ack", endpoint="queue.ack", body=body)

    def enqueue(self, *, queue: str, body: str | None = None, maxAttempts: int | None = None) -> CallResult:
        """QUEUE: append a message to a durable, wallet-scoped queue."""
        body: dict = {"queue": queue}
        if body is not None:
            body["body"] = body
        if maxAttempts is not None:
            body["maxAttempts"] = maxAttempts
        return self._c.request("POST", "/api/queue/enqueue", endpoint="queue.enqueue", body=body)

    def lease(self, *, queue: str, count: int | None = None, visibilitySeconds: int | None = None) -> CallResult:
        """QUEUE: atomically claim up to `count` messages for..."""
        body: dict = {"queue": queue}
        if count is not None:
            body["count"] = count
        if visibilitySeconds is not None:
            body["visibilitySeconds"] = visibilitySeconds
        return self._c.request("POST", "/api/queue/lease", endpoint="queue.lease", body=body)

    def stats(self, *, queue: str) -> CallResult:
        """QUEUE: depth of a queue, scoped to YOUR wallet - counts of..."""
        body: dict = {"queue": queue}
        return self._c.request("POST", "/api/queue/stats", endpoint="queue.stats", body=body)



class _Schedule(_Group):
    def cancel(self, *, scheduleId: str) -> CallResult:
        """SCHEDULE: stop an active schedule immediately, scoped to..."""
        body: dict = {"scheduleId": scheduleId}
        return self._c.request("POST", "/api/schedule/cancel", endpoint="schedule.cancel", body=body)

    def create(self, *, callbackUrl: str, at: str | None = None, everySeconds: int | None = None, payload: Any | None = None, maxFires: int | None = None, expiresInSeconds: int | None = None, label: str | None = None) -> CallResult:
        """SCHEDULE: arm a time-driven callback, scoped to YOUR wallet..."""
        body: dict = {"callbackUrl": callbackUrl}
        if at is not None:
            body["at"] = at
        if everySeconds is not None:
            body["everySeconds"] = everySeconds
        if payload is not None:
            body["payload"] = payload
        if maxFires is not None:
            body["maxFires"] = maxFires
        if expiresInSeconds is not None:
            body["expiresInSeconds"] = expiresInSeconds
        if label is not None:
            body["label"] = label
        return self._c.request("POST", "/api/schedule/create", endpoint="schedule.create", body=body)

    def status(self, *, scheduleId: str) -> CallResult:
        """SCHEDULE: check a schedule's state, scoped to YOUR wallet..."""
        body: dict = {"scheduleId": scheduleId}
        return self._c.request("POST", "/api/schedule/status", endpoint="schedule.status", body=body)



class _Class(_Group):
    def industry_resolve(self, *, system: str, code: str) -> CallResult:
        """Cross-walk an industry code across NAICS ↔ SIC ↔ ISIC Rev.4 ↔ NACE Rev.2 (Census + UN concordances)."""
        query: dict = {"system": system, "code": code}
        return self._c.request("GET", "/api/class/industry-resolve", endpoint="class.industry-resolve", query=query)



class _Tcg(_Group):
    def games(self) -> CallResult:
        """List all trading-card games/categories (Magic, Pokemon, Yu-Gi-Oh, Lorcana, etc.) with their ids."""
        return self._c.request("GET", "/api/tcg/games", endpoint="tcg.games")

    def sets(self, *, game: str, q: str | None = None, limit: int | None = None) -> CallResult:
        """List sets for a trading-card game. Pass game (categoryId or name) + optional q name filter."""
        query: dict = {"game": game}
        if q is not None:
            query["q"] = q
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/tcg/sets", endpoint="tcg.sets", query=query)

    def set_prices(self, *, game: str, set: str, limit: int | None = None) -> CallResult:
        """All cards in a set with current market/low/mid/high prices (TCGplayer-derived). Pass game + set (groupId)."""
        query: dict = {"game": game, "set": set}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/tcg/set-prices", endpoint="tcg.set-prices", query=query)

    def card(self, *, game: str, set: str, productId: str) -> CallResult:
        """A single trading card's current prices (all subtypes/printings). Pass game + set (groupId) + productId."""
        query: dict = {"game": game, "set": set, "productId": productId}
        return self._c.request("GET", "/api/tcg/card", endpoint="tcg.card", query=query)



class _Crypto(_Group):
    def kimchi_premium(self, *, symbol: str | None = None) -> CallResult:
        """Korean-exchange crypto premium: Upbit KRW price vs global USD price (x USD/KRW), as a %. Pass symbol(s)."""
        query: dict = {}
        if symbol is not None:
            query["symbol"] = symbol
        return self._c.request("GET", "/api/crypto/kimchi-premium", endpoint="crypto.kimchi-premium", query=query)

    def balances(self, *, address: str, chain: str | None = None, tokens: str | None = None) -> CallResult:
        """Live native + ERC-20 token balances for an EVM address (Base, Ethereum, Polygon, Arbitrum, Optimism; keyless). Returns the native-coin balance and, for any ERC-20 contract addresses you pass, the symb"""
        query: dict = {"address": address}
        if chain is not None:
            query["chain"] = chain
        if tokens is not None:
            query["tokens"] = tokens
        return self._c.request("GET", "/api/crypto/balances", endpoint="crypto.balances", query=query)

    def btc_address(self, *, address: str) -> CallResult:
        """Bitcoin address summary (free/keyless): confirmed balance (sats + BTC), total received/sent, transaction count, funded/spent output counts, and pending mempool balance + tx count. Works for any BTC ad"""
        query: dict = {"address": address}
        return self._c.request("GET", "/api/crypto/btc-address", endpoint="crypto.btc-address", query=query)

    def btc_mempool(self, *, minBtc: float | None = None) -> CallResult:
        """Bitcoin mempool state (free/keyless): current unconfirmed tx count, total vsize, and total fees, plus the most recent transactions (whale radar) — filter with minBtc to surface only large pending tran"""
        query: dict = {}
        if minBtc is not None:
            query["minBtc"] = minBtc
        return self._c.request("GET", "/api/crypto/btc-mempool", endpoint="crypto.btc-mempool", query=query)

    def btc_tx(self, *, txid: str) -> CallResult:
        """Bitcoin transaction lookup by txid (free/keyless): confirmed status + confirmation count (vs current tip), block height + time, fee (sats + BTC), total output value, size/weight, and input/output coun"""
        query: dict = {"txid": txid}
        return self._c.request("GET", "/api/crypto/btc-tx", endpoint="crypto.btc-tx", query=query)

    def btc_utxos(self, *, address: str, limit: int | None = None) -> CallResult:
        """Unspent transaction outputs (UTXOs) for a Bitcoin address (free/keyless): each with txid, output index, value (sats + BTC), confirmation status, and block height. Sorted largest-first. For coin select"""
        query: dict = {"address": address}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/crypto/btc-utxos", endpoint="crypto.btc-utxos", query=query)

    def cex_klines(self, *, pair: str, interval: str | None = None, limit: int | None = None) -> CallResult:
        """Centralized-exchange OHLCV candlesticks for a spot trading pair (e.g. BTC-USD, ETH-USD, SOL-USD), free/keyless. Pass interval (1m/5m/15m/1h/6h/1d) and limit. Each bar: time, open, high, low, close, vo"""
        query: dict = {"pair": pair}
        if interval is not None:
            query["interval"] = interval
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/crypto/cex-klines", endpoint="crypto.cex-klines", query=query)

    def cex_ticker(self, *, pair: str) -> CallResult:
        """Centralized-exchange 24h ticker for a spot pair (e.g. BTC-USD), free/keyless: current price, best bid/ask, 24h open/high/low, 24h + 30d volume, and 24h percent change. Real CEX spot quote — distinct f"""
        query: dict = {"pair": pair}
        return self._c.request("GET", "/api/crypto/cex-ticker", endpoint="crypto.cex-ticker", query=query)

    def decode_calldata(self, *, data: str) -> CallResult:
        """Decode raw EVM transaction calldata. POST { data } (0x-prefixed hex). Resolves the 4-byte function selector to its human signature(s) via the openchain.xyz database, then ABI-decodes the parameters (a"""
        body: dict = {"data": data}
        return self._c.request("POST", "/api/crypto/decode-calldata", endpoint="crypto.decode-calldata", body=body)

    def nft(self, *, address: str, tokenId: str, chain: str | None = None, metadata: str | None = None) -> CallResult:
        """Live ERC-721 NFT read (Base, Ethereum, Polygon, Arbitrum, Optimism; keyless). Given a contract + tokenId: returns current owner, collection name/symbol, and tokenURI (IPFS auto-resolved to a gateway U"""
        query: dict = {"address": address, "tokenId": tokenId}
        if chain is not None:
            query["chain"] = chain
        if metadata is not None:
            query["metadata"] = metadata
        return self._c.request("GET", "/api/crypto/nft", endpoint="crypto.nft", query=query)

    def nft_security(self, *, address: str, chainId: int | None = None) -> CallResult:
        """NFT collection risk screening via GoPlus (free, keyless). For an ERC-721/1155 contract: verification/trust-list status, open-source + proxy flags, privileged-minting, restricted-approval, transfer-wit"""
        query: dict = {"address": address}
        if chainId is not None:
            query["chainId"] = chainId
        return self._c.request("GET", "/api/crypto/nft-security", endpoint="crypto.nft-security", query=query)

    def token_metadata(self, *, address: str, chain: str | None = None) -> CallResult:
        """Live on-chain token metadata for an ERC-20 or ERC-721 contract (Base, Ethereum, Polygon, Arbitrum, Optimism; keyless). Returns name, symbol, decimals, detected standard, and total supply (raw + format"""
        query: dict = {"address": address}
        if chain is not None:
            query["chain"] = chain
        return self._c.request("GET", "/api/crypto/token-metadata", endpoint="crypto.token-metadata", query=query)

    def vrf(self, *, seed: str) -> CallResult:
        """Verifiable random function — deterministic, publicly verifiable randomness bound to your seed and signed by the 2s key. proof = deterministic EIP-191 signature over the seed (same seed always yields t"""
        query: dict = {"seed": seed}
        return self._c.request("GET", "/api/crypto/vrf", endpoint="crypto.vrf", query=query)


    def defi(self, *, protocol: str | None = None, chain: str | None = None, limit: int | None = None) -> CallResult:
        """DeFi TVL via DefiLlama: protocol=<slug> or chain=<name> for one, or omit
        for the top protocols + total DeFi TVL. GET { protocol?, chain?, limit? }."""
        q: dict[str, Any] = {}
        if protocol is not None:
            q["protocol"] = protocol
        if chain is not None:
            q["chain"] = chain
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/defi", endpoint="crypto.defi", query=q)

    def contract(self, *, chain: str, address: str, selector: str | None = None) -> CallResult:
        """Decode an EVM contract: Sourcify verified ABI + function/event signatures
        + proxy, with optional 4-byte selector decode. GET { chain, address, selector? }."""
        q: dict[str, Any] = {"chain": chain, "address": address}
        if selector is not None:
            q["selector"] = selector
        return self._c.request("GET", "/api/crypto/contract", endpoint="crypto.contract", query=q)

    def fear_greed(self, *, limit: int | None = None) -> CallResult:
        """Crypto Fear & Greed Index (0-100 sentiment + classification). Pass limit
        (1-90) for history, or omit for the current reading."""
        q: dict[str, Any] = {}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/fear-greed", endpoint="crypto.fear-greed", query=q)

    def markets(self, *, limit: int | None = None) -> CallResult:
        """Top cryptocurrencies by market cap (price, mcap, 24h volume, 24h/7d change). Pass limit (1-100)."""
        q: dict[str, Any] = {}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/markets", endpoint="crypto.markets", query=q)

    def global_(self) -> CallResult:
        """Whole-crypto-market overview: total mcap, volume, BTC/ETH dominance, active-coin count."""
        return self._c.request("GET", "/api/crypto/global", endpoint="crypto.global", query={})

    def trending(self) -> CallResult:
        """Most-searched trending cryptocurrencies right now (symbol, name, rank, price)."""
        return self._c.request("GET", "/api/crypto/trending", endpoint="crypto.trending", query={})

    def ens_resolve(self, *, query: str) -> CallResult:
        """ENS forward+reverse resolution on Ethereum mainnet (live RPC). Param: query."""
        return self._c.request("GET", "/api/crypto/ens-resolve", endpoint="crypto.ens-resolve", query={"query": query})

    def address_validate(self, *, chain: str, address: str) -> CallResult:
        return self._c.request(
            "GET", "/api/crypto/address-validate",
            endpoint="crypto.address-validate",
            query={"chain": chain, "address": address},
        )

    def tx(self, *, chain: str, hash: str) -> CallResult:
        """Live EVM transaction status + receipt by hash. Chains: base, ethereum, polygon, arbitrum, optimism."""
        return self._c.request(
            "GET", "/api/crypto/tx",
            endpoint="crypto.tx",
            query={"chain": chain, "hash": hash},
        )

    def gas_oracle(self, *, chain: str = "base") -> CallResult:
        return self._c.request(
            "GET", "/api/crypto/gas-oracle",
            endpoint="crypto.gas-oracle",
            query={"chain": chain},
        )

    def btc_fees(self) -> CallResult:
        """Current Bitcoin fee rates (sat/vByte) + mempool backlog."""
        return self._c.request("GET", "/api/crypto/btc-fees", endpoint="crypto.btc-fees", query={})

    def token_price(self, *, ids: str, vs: Optional[str] = None) -> CallResult:
        """Spot price + market data by CoinGecko asset ids.

        ids: comma-separated lowercase CoinGecko ids ("bitcoin,ethereum"),
        NOT ticker symbols. vs: quote currencies, default "usd".
        """
        q: dict[str, Any] = {"ids": ids}
        if vs is not None:
            q["vs"] = vs
        return self._c.request("GET", "/api/crypto/token-price", endpoint="crypto.token-price", query=q)

    def address_history(
        self,
        *,
        address: str,
        chain_id: int | None = None,
        page: int | None = None,
        offset: int | None = None,
        sort: str | None = None,
        start_block: int | None = None,
        end_block: int | None = None,
    ) -> CallResult:
        """Native-coin transaction history for an EVM address (chainId defaults to 1 Ethereum)."""
        q: dict[str, Any] = {"address": address}
        if chain_id is not None:
            q["chainId"] = chain_id
        if page is not None:
            q["page"] = page
        if offset is not None:
            q["offset"] = offset
        if sort is not None:
            q["sort"] = sort
        if start_block is not None:
            q["startBlock"] = start_block
        if end_block is not None:
            q["endBlock"] = end_block
        return self._c.request("GET", "/api/crypto/address-history", endpoint="crypto.address-history", query=q)

    def address_safety(self, *, chain_id: str, address: str) -> CallResult:
        """Risk/safety signals for an EVM wallet address. chainId e.g. 1, 56, 137, 8453."""
        return self._c.request(
            "GET", "/api/crypto/address-safety",
            endpoint="crypto.address-safety",
            query={"chainId": chain_id, "address": address},
        )

    def address_screen(self, *, address: str) -> CallResult:
        """Screen any-chain wallet address against OFAC sanctions lists."""
        return self._c.request(
            "GET", "/api/crypto/address-screen",
            endpoint="crypto.address-screen",
            query={"address": address},
        )

    def chain_tvl_history(self, *, chain: str, limit: int | None = None) -> CallResult:
        """Historical daily TVL for a chain via DefiLlama. limit = most-recent N points (default 90)."""
        q: dict[str, Any] = {"chain": chain}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/chain-tvl-history", endpoint="crypto.chain-tvl-history", query=q)

    def coin(self, *, id: str) -> CallResult:
        """Full coin profile by CoinGecko id (price, market data, supply, links)."""
        return self._c.request("GET", "/api/crypto/coin", endpoint="crypto.coin", query={"id": id})

    def coin_history(self, *, id: str, days: int | None = None, vs: str | None = None) -> CallResult:
        """Historical market chart for a CoinGecko coin. days (1-365, default 7), vs (default usd)."""
        q: dict[str, Any] = {"id": id}
        if days is not None:
            q["days"] = days
        if vs is not None:
            q["vs"] = vs
        return self._c.request("GET", "/api/crypto/coin-history", endpoint="crypto.coin-history", query=q)

    def defi_chains(self, *, limit: int | None = None) -> CallResult:
        """Chains ranked by DeFi TVL (DefiLlama)."""
        q: dict[str, Any] = {}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/defi-chains", endpoint="crypto.defi-chains", query=q)

    def defi_fees(self, *, kind: str | None = None, sort: str | None = None, limit: int | None = None) -> CallResult:
        """Protocol fees/revenue leaderboard via DefiLlama. kind: fees|dexs; sort: total24h|total7d|total30d."""
        q: dict[str, Any] = {}
        if kind is not None:
            q["kind"] = kind
        if sort is not None:
            q["sort"] = sort
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/defi-fees", endpoint="crypto.defi-fees", query=q)

    def defi_protocol_history(self, *, slug: str, limit: int | None = None) -> CallResult:
        """Historical daily TVL for a DefiLlama protocol slug. limit = most-recent N points (default 90)."""
        q: dict[str, Any] = {"slug": slug}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/defi-protocol-history", endpoint="crypto.defi-protocol-history", query=q)

    def defi_yields(
        self,
        *,
        chain: str | None = None,
        project: str | None = None,
        symbol: str | None = None,
        min_apy: float | None = None,
        min_tvl_usd: float | None = None,
        sort: str | None = None,
        limit: int | None = None,
    ) -> CallResult:
        """DeFi yield pools via DefiLlama. Filter by chain/project/symbol/minApy/minTvlUsd; sort: apy|tvl."""
        q: dict[str, Any] = {}
        if chain is not None:
            q["chain"] = chain
        if project is not None:
            q["project"] = project
        if symbol is not None:
            q["symbol"] = symbol
        if min_apy is not None:
            q["minApy"] = min_apy
        if min_tvl_usd is not None:
            q["minTvlUsd"] = min_tvl_usd
        if sort is not None:
            q["sort"] = sort
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/defi-yields", endpoint="crypto.defi-yields", query=q)

    def dex_networks(self, *, limit: int | None = None) -> CallResult:
        """Supported DEX networks via GeckoTerminal."""
        q: dict[str, Any] = {}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/dex-networks", endpoint="crypto.dex-networks", query=q)

    def dex_ohlcv(
        self,
        *,
        network: str,
        address: str,
        timeframe: str | None = None,
        aggregate: int | None = None,
        limit: int | None = None,
    ) -> CallResult:
        """OHLCV candles for a DEX pool via GeckoTerminal. address = pool address; timeframe: day|hour|minute."""
        q: dict[str, Any] = {"network": network, "address": address}
        if timeframe is not None:
            q["timeframe"] = timeframe
        if aggregate is not None:
            q["aggregate"] = aggregate
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/dex-ohlcv", endpoint="crypto.dex-ohlcv", query=q)

    def dex_pools(self, *, network: str, kind: str | None = None, limit: int | None = None) -> CallResult:
        """Trending or new DEX pools on a network via GeckoTerminal. kind: trending|new."""
        q: dict[str, Any] = {"network": network}
        if kind is not None:
            q["kind"] = kind
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/dex-pools", endpoint="crypto.dex-pools", query=q)

    def dex_search(self, *, query: str, network: str | None = None, limit: int | None = None) -> CallResult:
        """Search DEX pools/tokens by name, symbol, or contract via GeckoTerminal."""
        q: dict[str, Any] = {"query": query}
        if network is not None:
            q["network"] = network
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/dex-search", endpoint="crypto.dex-search", query=q)

    def dex_token_pools(self, *, network: str, address: str, limit: int | None = None) -> CallResult:
        """Pools for a given token contract on a network via GeckoTerminal."""
        q: dict[str, Any] = {"network": network, "address": address}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/dex-token-pools", endpoint="crypto.dex-token-pools", query=q)

    def hyperliquid_funding(self, *, coin: str | None = None, sort: str | None = None, limit: int | None = None) -> CallResult:
        """Hyperliquid perp funding/OI/volume. sort: oi|volume|funding."""
        q: dict[str, Any] = {}
        if coin is not None:
            q["coin"] = coin
        if sort is not None:
            q["sort"] = sort
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/hyperliquid-funding", endpoint="crypto.hyperliquid-funding", query=q)

    def hyperliquid_predicted_funding(self, *, coin: str | None = None, limit: int | None = None) -> CallResult:
        """Predicted per-venue funding rates from Hyperliquid."""
        q: dict[str, Any] = {}
        if coin is not None:
            q["coin"] = coin
        if limit is not None:
            q["limit"] = limit
        return self._c.request(
            "GET", "/api/crypto/hyperliquid-predicted-funding",
            endpoint="crypto.hyperliquid-predicted-funding", query=q,
        )

    def stablecoins(self, *, limit: int | None = None) -> CallResult:
        """Stablecoins ranked by circulating USD (DefiLlama): price, peg type/mechanism."""
        q: dict[str, Any] = {}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/crypto/stablecoins", endpoint="crypto.stablecoins", query=q)

    def token_info(self, *, network: str, address: str) -> CallResult:
        """Token metadata for a contract on a network via GeckoTerminal."""
        return self._c.request(
            "GET", "/api/crypto/token-info",
            endpoint="crypto.token-info",
            query={"network": network, "address": address},
        )

    def token_safety(self, *, chain_id: str, address: str) -> CallResult:
        """Token contract safety/honeypot checks for an EVM token. chainId e.g. 1, 56, 137, 8453."""
        return self._c.request(
            "GET", "/api/crypto/token-safety",
            endpoint="crypto.token-safety",
            query={"chainId": chain_id, "address": address},
        )

    def token_transfers(
        self,
        *,
        address: str,
        chain_id: int | None = None,
        contract_address: str | None = None,
        page: int | None = None,
        offset: int | None = None,
        sort: str | None = None,
    ) -> CallResult:
        """ERC-20 token transfer history for an EVM address (chainId defaults to 1 Ethereum)."""
        q: dict[str, Any] = {"address": address}
        if chain_id is not None:
            q["chainId"] = chain_id
        if contract_address is not None:
            q["contractAddress"] = contract_address
        if page is not None:
            q["page"] = page
        if offset is not None:
            q["offset"] = offset
        if sort is not None:
            q["sort"] = sort
        return self._c.request("GET", "/api/crypto/token-transfers", endpoint="crypto.token-transfers", query=q)


class _Ai(_Group):
    def chat(self, *, model: str, messages: Any, max_tokens: int | None = None, temperature: float | None = None, top_p: float | None = None, stop: str | None = None) -> CallResult:
        """OpenAI-compatible chat completions across every frontier model on one endpoint — GPT-5, Claude, Gemini, Grok, DeepSeek, Llama, Mistral and ~290 more. POST { model, messages, max_tokens?, temperature?,"""
        body: dict = {"model": model, "messages": messages}
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        if temperature is not None:
            body["temperature"] = temperature
        if top_p is not None:
            body["top_p"] = top_p
        if stop is not None:
            body["stop"] = stop
        return self._c.request("POST", "/api/ai/chat", endpoint="ai.chat", body=body)

    def image(self, *, model: str, prompt: str, n: int | None = None, size: str | None = None) -> CallResult:
        """Generate images from a text prompt across the gateway’s image models (gpt-image, Gemini image, FLUX, Grok Imagine, …) on one endpoint. POST { model, prompt, n?, size? } → OpenAI-style { created, data:"""
        body: dict = {"model": model, "prompt": prompt}
        if n is not None:
            body["n"] = n
        if size is not None:
            body["size"] = size
        return self._c.request("POST", "/api/ai/image", endpoint="ai.image", body=body)

    def council(self, *, prompt: str, mode: str | None = None, models: Any | None = None, maxTokens: int | None = None) -> CallResult:
        """Ask several frontier models the same question and get one synthesized consensus answer with a confidence score and points of dissent. Preset councils (fast/balanced/deep) or a custom set of models. Dy"""
        body: dict = {"prompt": prompt}
        if mode is not None:
            body["mode"] = mode
        if models is not None:
            body["models"] = models
        if maxTokens is not None:
            body["maxTokens"] = maxTokens
        return self._c.request("POST", "/api/ai/council", endpoint="ai.council", body=body)

    def ocr(self, *, imageUrl: str, instruction: str | None = None) -> CallResult:
        """OCR + layout extraction. POST { imageUrl, instruction? }. Returns verbatim transcribed text in reading order, any detected tables as markdown, the primary language, and a handwriting flag. For reading"""
        body: dict = {"imageUrl": imageUrl}
        if instruction is not None:
            body["instruction"] = instruction
        return self._c.request("POST", "/api/ai/ocr", endpoint="ai.ocr", body=body)

    def research(self, *, query: str, urls: Any | None = None) -> CallResult:
        """Grounded research brief. POST { query, urls? }. Gathers sources (Wikipedia + any URLs you supply), then synthesizes a factual, cited brief: a 2-4 sentence summary, key facts, and the source list. Grou"""
        body: dict = {"query": query}
        if urls is not None:
            body["urls"] = urls
        return self._c.request("POST", "/api/ai/research", endpoint="ai.research", body=body)

    def web_answer(self, *, query: str, topic: str | None = None, maxResults: int | None = None) -> CallResult:
        """Answer a question from the live web. POST { query, topic?, maxResults? }. Runs a deep web search and returns a synthesized, citation-backed answer plus the ranked source pages (title, URL, snippet). F"""
        body: dict = {"query": query}
        if topic is not None:
            body["topic"] = topic
        if maxResults is not None:
            body["maxResults"] = maxResults
        return self._c.request("POST", "/api/ai/web-answer", endpoint="ai.web-answer", body=body)

    def summarize(self, *, url: str, instruction: Optional[str] = None) -> CallResult:
        body = {"url": url}
        if instruction is not None:
            body["instruction"] = instruction
        return self._c.request("POST", "/api/ai/summarize", endpoint="ai.summarize", body=body)

    def translate(
        self,
        *,
        text: str,
        target_language: str,
        source_language: Optional[str] = None,
    ) -> CallResult:
        """Translate text via Claude Haiku.

        Server params: text (1-6000 chars), targetLanguage (BCP-47), and
        optional sourceLanguage (auto-detected when omitted).
        """
        body: dict[str, Any] = {"text": text, "targetLanguage": target_language}
        if source_language is not None:
            body["sourceLanguage"] = source_language
        return self._c.request("POST", "/api/ai/translate", endpoint="ai.translate", body=body)

    def extract(self, *, url: str, schema: dict, instruction: Optional[str] = None) -> CallResult:
        body: dict[str, Any] = {"url": url, "schema": schema}
        if instruction is not None:
            body["instruction"] = instruction
        return self._c.request("POST", "/api/ai/extract", endpoint="ai.extract", body=body)

    def describe_image(
        self,
        *,
        image_url: str,
        instruction: Optional[str] = None,
    ) -> CallResult:
        """Describe an image via Claude Haiku vision.

        Server params: imageUrl (HTTPS URL, ≤1MB image), optional instruction.
        """
        body: dict[str, Any] = {"imageUrl": image_url}
        if instruction is not None:
            body["instruction"] = instruction
        return self._c.request("POST", "/api/ai/describe-image", endpoint="ai.describe-image", body=body)

    def screenshot(
        self,
        *,
        url: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        full_page: Optional[bool] = None,
        format: Optional[str] = None,
        quality: Optional[int] = None,
        wait_until: Optional[str] = None,
        timeout_ms: Optional[int] = None,
        device_scale_factor: Optional[int] = None,
        block_ads: Optional[bool] = None,
    ) -> CallResult:
        """Render a URL to an image.

        Server accepts: width (320-3840), height (320-2160), fullPage, format
        ('png'|'jpeg'|'webp'), quality (1-100), waitUntil
        ('load'|'domcontentloaded'|'networkidle0'|'networkidle2'), timeoutMs
        (1000-15000), deviceScaleFactor (1-3), blockAds. All optional.

        Defaults (server-side): width=1280, height=720, fullPage=false,
        format=png, waitUntil=networkidle2, timeoutMs=8000, deviceScaleFactor=1,
        blockAds=true.
        """
        body: dict[str, Any] = {"url": url}
        if width is not None:
            body["width"] = width
        if height is not None:
            body["height"] = height
        if full_page is not None:
            body["fullPage"] = full_page
        if format is not None:
            body["format"] = format
        if quality is not None:
            body["quality"] = quality
        if wait_until is not None:
            body["waitUntil"] = wait_until
        if timeout_ms is not None:
            body["timeoutMs"] = timeout_ms
        if device_scale_factor is not None:
            body["deviceScaleFactor"] = device_scale_factor
        if block_ads is not None:
            body["blockAds"] = block_ads
        return self._c.request("POST", "/api/ai/screenshot", endpoint="ai.screenshot", body=body)

    def classify(self, *, text: str, labels: list, multi_label: bool | None = None) -> CallResult:
        """Zero-shot classify text against candidate labels. labels: 2-20 strings."""
        body: dict[str, Any] = {"text": text, "labels": labels}
        if multi_label is not None:
            body["multiLabel"] = multi_label
        return self._c.request("POST", "/api/ai/classify", endpoint="ai.classify", body=body)

    def entities(self, *, text: str) -> CallResult:
        """Named-entity recognition: extract entities (text, type, mentions) from text."""
        return self._c.request("POST", "/api/ai/entities", endpoint="ai.entities", body={"text": text})

    def moderate(self, *, text: str) -> CallResult:
        """Content moderation: flagged boolean + per-category booleans and scores."""
        return self._c.request("POST", "/api/ai/moderate", endpoint="ai.moderate", body={"text": text})

    def pii(self, *, text: str) -> CallResult:
        """Detect personally identifiable information (types + entities) in text."""
        return self._c.request("POST", "/api/ai/pii", endpoint="ai.pii", body={"text": text})

    def sentiment(self, *, text: str) -> CallResult:
        """Sentiment analysis: sentiment label, score, confidence, rationale."""
        return self._c.request("POST", "/api/ai/sentiment", endpoint="ai.sentiment", body={"text": text})


class _Law(_Group):
    def docket_search(
        self,
        *,
        q: Optional[str] = None,
        court: Optional[str] = None,
        docket_number: Optional[str] = None,
        filed_after: Optional[str] = None,
        filed_before: Optional[str] = None,
        page: Optional[int] = None,
    ) -> CallResult:
        """Federal court dockets (civil + criminal) via RECAP/CourtListener.

        Server params: q, court, docketNumber, filedAfter, filedBefore, page.
        """
        qq: dict[str, Any] = {}
        if q is not None:
            qq["q"] = q
        if court is not None:
            qq["court"] = court
        if docket_number is not None:
            qq["docketNumber"] = docket_number
        if filed_after is not None:
            qq["filedAfter"] = filed_after
        if filed_before is not None:
            qq["filedBefore"] = filed_before
        if page is not None:
            qq["page"] = page
        return self._c.request("GET", "/api/law/docket-search", endpoint="law.docket-search", query=qq)

    def case_search(
        self,
        *,
        q: str,
        court: Optional[str] = None,
        filed_after: Optional[str] = None,
        filed_before: Optional[str] = None,
        order: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Search US case law via CourtListener.

        Server params: q, court (comma-separated slugs), filedAfter/filedBefore
        (yyyy-mm-dd), order (one of relevance|dateFiled-desc|dateFiled-asc|
        citeCount-desc), limit (1-20, default 10).
        """
        query: dict[str, Any] = {"q": q}
        if court is not None:
            query["court"] = court
        if filed_after is not None:
            query["filedAfter"] = filed_after
        if filed_before is not None:
            query["filedBefore"] = filed_before
        if order is not None:
            query["order"] = order
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/law/case-search", endpoint="law.case-search", query=query)

    def case_verify(self, *, text: str) -> CallResult:
        """Verify legal citations inside a passage of text.

        Server expects POST /api/law/case-verify { text }. Anti-hallucination
        for legal LLM output.
        """
        return self._c.request(
            "POST", "/api/law/case-verify",
            endpoint="law.case-verify",
            body={"text": text},
        )

    def citation_check(
        self,
        *,
        text: str | None = None,
        quotes: list[dict] | None = None,
    ) -> CallResult:
        """Anti-hallucination checker for legal references.

        POST /api/law/citation-check. Pass text to verify existence of every cited
        case (CourtListener) + US Code + CFR reference; and/or quotes=[{citation, quote}]
        to deterministically verify an attributed quote actually appears in the cited
        opinion. Checks facts (existence, quote presence), not legal appropriateness.
        """
        body: dict[str, Any] = {}
        if text is not None:
            body["text"] = text
        if quotes is not None:
            body["quotes"] = quotes
        return self._c.request(
            "POST", "/api/law/citation-check",
            endpoint="law.citation-check",
            body=body,
        )

    def sanctions_check(
        self,
        *,
        query: str,
        threshold: Optional[float] = None,
        limit: Optional[int] = None,
        source_list: Optional[str] = None,
    ) -> CallResult:
        """Fuzzy-match a name against OFAC SDN.

        Server expects POST /api/law/sanctions-check
        { query, threshold?, limit?, sourceList? }. Default threshold 0.4.
        """
        body: dict[str, Any] = {"query": query}
        if threshold is not None:
            body["threshold"] = threshold
        if limit is not None:
            body["limit"] = limit
        if source_list is not None:
            body["sourceList"] = source_list
        return self._c.request(
            "POST", "/api/law/sanctions-check",
            endpoint="law.sanctions-check",
            body=body,
        )

    def federal_register(
        self,
        *,
        q: str,
        type: Optional[str] = None,
        agency: Optional[str] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Search US Federal Register documents.

        Server params: q, type (RULE|PRORULE|NOTICE|PRESDOCU), agency (slug),
        since/until (yyyy-mm-dd), limit (1-20, default 10).
        """
        query: dict[str, Any] = {"q": q}
        if type is not None:
            query["type"] = type
        if agency is not None:
            query["agency"] = agency
        if since is not None:
            query["since"] = since
        if until is not None:
            query["until"] = until
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/law/federal-register", endpoint="law.federal-register", query=query)

    def cfr_section(
        self,
        *,
        title: int,
        section: str,
        date: Optional[str] = None,
    ) -> CallResult:
        """Fetch the full text of a US CFR section by title + section number.

        Server params: title (1-50), section ("part.section", e.g. "1026.43"
        or "240.10b-5"), optional date (yyyy-mm-dd, point-in-time back to
        2017-01-03; defaults to the latest available text).
        """
        query: dict[str, Any] = {"title": title, "section": section}
        if date is not None:
            query["date"] = date
        return self._c.request("GET", "/api/law/cfr-section", endpoint="law.cfr-section", query=query)

    def usc_section(
        self,
        *,
        title: int,
        section: str,
        include_notes: Optional[bool] = None,
    ) -> CallResult:
        """Fetch the current text of a United States Code section.

        Server params: title (1-54), section ("107", "78j", "1395w-4"),
        optional includeNotes (adds amendment history / editorial notes).
        """
        query: dict[str, Any] = {"title": title, "section": section}
        if include_notes is not None:
            query["includeNotes"] = "true" if include_notes else "false"
        return self._c.request("GET", "/api/law/usc-section", endpoint="law.usc-section", query=query)

    def trademark_status(
        self,
        *,
        serial_number: Optional[str] = None,
        registration_number: Optional[str] = None,
    ) -> CallResult:
        """US trademark status via USPTO TSDR.

        Exactly one of serial_number (8 digits) or registration_number.
        Returns mark, LIVE/DEAD status, owner, dates, classes.
        """
        if (serial_number is None) == (registration_number is None):
            raise ValueError("trademark_status() requires exactly one of serial_number or registration_number.")
        q: dict[str, Any] = {}
        if serial_number is not None: q["serialNumber"] = serial_number
        if registration_number is not None: q["registrationNumber"] = registration_number
        return self._c.request("GET", "/api/law/trademark-status", endpoint="law.trademark-status", query=q)

    def trademark_search(
        self,
        *,
        query: Optional[str] = None,
        serial: Optional[str] = None,
        registration_number: Optional[str] = None,
        field: Optional[str] = None,
        status: Optional[str] = None,
        intl_class: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """Full-text search of US trademarks (USPTO bulk corpus).

        Pass query for wordmark/owner/goods search, or serial /
        registration_number for an exact record. field=mark|owner|all,
        status=live|all (default live), intl_class=Nice class.
        """
        if query is None and serial is None and registration_number is None:
            raise ValueError("trademark_search() requires one of query, serial, or registration_number.")
        q: dict[str, Any] = {}
        if query is not None: q["query"] = query
        if serial is not None: q["serial"] = serial
        if registration_number is not None: q["registrationNumber"] = registration_number
        if field is not None: q["field"] = field
        if status is not None: q["status"] = status
        if intl_class is not None: q["intlClass"] = intl_class
        if limit is not None: q["limit"] = limit
        if offset is not None: q["offset"] = offset
        return self._c.request("GET", "/api/law/trademark-search", endpoint="law.trademark-search", query=q)

    def opinion(
        self,
        *,
        opinion_id: Optional[int] = None,
        citation: Optional[str] = None,
    ) -> CallResult:
        """Fetch a full US court opinion by CourtListener ID OR by citation.

        Server expects POST /api/law/opinion with exactly one of
        { opinionId } or { citation }.
        """
        if (opinion_id is None) == (citation is None):
            raise ValueError("opinion() requires exactly one of opinion_id or citation.")
        body: dict[str, Any] = {}
        if opinion_id is not None:
            body["opinionId"] = opinion_id
        if citation is not None:
            body["citation"] = citation
        return self._c.request(
            "POST", "/api/law/opinion",
            endpoint="law.opinion",
            body=body,
        )

    def attorney_lookup(
        self,
        *,
        name: Optional[str] = None,
        firm_name: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """CourtListener attorney search. Supply name and/or firm_name.

        Server params: name, firmName, limit (1-50, default 10). Case-insensitive
        match via Title-Case + __startswith on CourtListener.
        """
        if name is None and firm_name is None:
            raise ValueError("attorney_lookup() requires at least one of name or firm_name.")
        query: dict[str, Any] = {}
        if name is not None:
            query["name"] = name
        if firm_name is not None:
            query["firmName"] = firm_name
        if limit is not None:
            query["limit"] = limit
        return self._c.request(
            "GET", "/api/law/attorney-lookup",
            endpoint="law.attorney-lookup",
            query=query,
        )

    def judge_lookup(self, *, name: str, limit: Optional[int] = None) -> CallResult:
        """CourtListener federal judge lookup by name.

        Server params: name (required), limit (1-50, default 10).
        """
        query: dict[str, Any] = {"name": name}
        if limit is not None:
            query["limit"] = limit
        return self._c.request(
            "GET", "/api/law/judge-lookup",
            endpoint="law.judge-lookup",
            query=query,
        )


class _Finance(_Group):
    def mortgage_pulse(self) -> CallResult:
        """US mortgage & housing-rate snapshot from FRED: 30yr/15yr mortgage, 10yr treasury, fed funds, median home price, housing starts — latest values in one call."""
        return self._c.request("GET", "/api/finance/mortgage-pulse", endpoint="finance.mortgage-pulse")

    def central_bank_rates(self, *, bank: str | None = None) -> CallResult:
        """Current policy/benchmark rates across major central banks (US Fed, ECB, BoJ, BoE) in one normalized call, via FRED."""
        query: dict = {}
        if bank is not None:
            query["bank"] = bank
        return self._c.request("GET", "/api/finance/central-bank-rates", endpoint="finance.central-bank-rates", query=query)

    def security_resolve(self, *, ticker: str | None = None, isin: str | None = None, lei: str | None = None) -> CallResult:
        """Universal security-identifier resolver: give one of ticker, isin, or lei → get ticker, CIK, FIGI, LEI, ISINs, and issuer name (SEC + OpenFIGI + GLEIF)."""
        query: dict = {}
        if ticker is not None:
            query["ticker"] = ticker
        if isin is not None:
            query["isin"] = isin
        if lei is not None:
            query["lei"] = lei
        return self._c.request("GET", "/api/finance/security-resolve", endpoint="finance.security-resolve", query=query)

    def cik_ticker(self, *, ticker: str | None = None, cik: str | None = None) -> CallResult:
        """Resolve between SEC CIK and stock ticker(s), both directions, with all share classes + exchange (SEC company_tickers_exchange)."""
        query: dict = {}
        if ticker is not None:
            query["ticker"] = ticker
        if cik is not None:
            query["cik"] = cik
        return self._c.request("GET", "/api/finance/cik-ticker", endpoint="finance.cik-ticker", query=query)

    def bank_id_resolve(self, *, bic: str | None = None, lei: str | None = None, fdic_cert: str | None = None) -> CallResult:
        """Bank/financial-institution identifier resolver: give one of bic, lei, or fdic_cert → bridge BIC↔LEI (GLEIF) + FDIC record."""
        query: dict = {}
        if bic is not None:
            query["bic"] = bic
        if lei is not None:
            query["lei"] = lei
        if fdic_cert is not None:
            query["fdic_cert"] = fdic_cert
        return self._c.request("GET", "/api/finance/bank-id-resolve", endpoint="finance.bank-id-resolve", query=query)

    def form_144(self, *, q: str | None = None, startDate: str | None = None, endDate: str | None = None, limit: int | None = None) -> CallResult:
        """SEC Form 144 filings — notices of PROPOSED insider stock sales (intent to sell restricted/control shares), newest first, via EDGAR full-text search. Market-wide by default, or filter by ticker/company"""
        query: dict = {}
        if q is not None:
            query["q"] = q
        if startDate is not None:
            query["startDate"] = startDate
        if endDate is not None:
            query["endDate"] = endDate
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/finance/form-144", endpoint="finance.form-144", query=query)

    def amortize(
        self,
        *,
        principal: float,
        annual_rate_pct: float,
        term_months: Optional[int] = None,
        term_years: Optional[float] = None,
        extra_monthly: Optional[float] = None,
    ) -> CallResult:
        """Loan/mortgage amortization schedule (deterministic). Provide term_months or term_years."""
        q: dict = {"principal": principal, "annualRatePct": annual_rate_pct}
        if term_months is not None:
            q["termMonths"] = term_months
        if term_years is not None:
            q["termYears"] = term_years
        if extra_monthly is not None:
            q["extraMonthly"] = extra_monthly
        return self._c.request("GET", "/api/finance/amortize", endpoint="finance.amortize", query=q)

    def company_profile(
        self,
        *,
        ticker: str,
        form_type: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Company 360 by ticker — SEC filings + XBRL fundamentals + insider trades, merged.

        Server params: ticker, formType, limit.
        """
        q: dict[str, Any] = {"ticker": ticker}
        if form_type is not None:
            q["formType"] = form_type
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/finance/company-profile", endpoint="finance.company-profile", query=q)

    def sec_filings(
        self,
        *,
        ticker: str,
        form_type: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Recent SEC filings for a US public company by ticker.

        Server params: ticker (case-insensitive), formType (e.g. 10-K, 10-Q, 8-K),
        limit (1-50, default 10).
        """
        query: dict[str, Any] = {"ticker": ticker}
        if form_type is not None:
            query["formType"] = form_type
        if limit is not None:
            query["limit"] = limit
        return self._c.request(
            "GET", "/api/finance/sec-filings",
            endpoint="finance.sec-filings",
            query=query,
        )

    def company_facts(
        self,
        *,
        ticker: str,
        metrics: Optional[str] = None,
        annual_limit: Optional[int] = None,
        quarterly_limit: Optional[int] = None,
    ) -> CallResult:
        """Curated XBRL financial metrics for a US public company by ticker.

        Server params: ticker, metrics (comma-separated subset of curated keys),
        annualLimit (1-20, default 4), quarterlyLimit (0-20, default 4).
        """
        query: dict[str, Any] = {"ticker": ticker}
        if metrics is not None:
            query["metrics"] = metrics
        if annual_limit is not None:
            query["annualLimit"] = annual_limit
        if quarterly_limit is not None:
            query["quarterlyLimit"] = quarterly_limit
        return self._c.request(
            "GET", "/api/finance/company-facts",
            endpoint="finance.company-facts",
            query=query,
        )

    def xbrl_frames(self, *, tag: str, period: str, unit: Optional[str] = None, taxonomy: Optional[str] = None,
                    sort: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """SEC XBRL Frames — one concept across ALL filers for a period (cross-company)."""
        q: dict[str, Any] = {"tag": tag, "period": period}
        if unit is not None: q["unit"] = unit
        if taxonomy is not None: q["taxonomy"] = taxonomy
        if sort is not None: q["sort"] = sort
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/finance/xbrl-frames", endpoint="finance.xbrl-frames", query=q)

    def insider_trades(
        self,
        *,
        ticker: str,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Recent SEC Form 4 insider transactions by ticker.

        Server params: ticker, limit (1-10, default 5). Each filing is parsed
        from raw XML; bounded tight because each is its own upstream call.
        """
        query: dict[str, Any] = {"ticker": ticker}
        if limit is not None:
            query["limit"] = limit
        return self._c.request(
            "GET", "/api/finance/insider-trades",
            endpoint="finance.insider-trades",
            query=query,
        )

    def ifsc_india(self, *, ifsc: str) -> CallResult:
        """Indian bank branch lookup by IFSC code."""
        return self._c.request("GET", "/api/finance/ifsc-india", endpoint="finance.ifsc-india", query={"ifsc": ifsc})

    def bin(self, *, bin: str) -> CallResult:
        """Card BIN/IIN lookup: brand, card type, issuing bank, country."""
        return self._c.request("GET", "/api/finance/bin", endpoint="finance.bin", query={"bin": bin})

    def figi(self, *, id_type: str, id_value: str, exch_code: Optional[str] = None,
             currency: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """OpenFIGI mapping: identifier (ISIN/CUSIP/SEDOL/TICKER/FIGI) -> FIGI(s) + metadata."""
        q: dict[str, Any] = {"idType": id_type, "idValue": id_value}
        if exch_code is not None: q["exchCode"] = exch_code
        if currency is not None: q["currency"] = currency
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/finance/figi", endpoint="finance.figi", query=q)

    def figi_search(self, *, query: str, exch_code: Optional[str] = None, security_type: Optional[str] = None,
                    market_sector: Optional[str] = None, start: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """OpenFIGI free-text security search (+ filters + cursor)."""
        q: dict[str, Any] = {"query": query}
        if exch_code is not None: q["exchCode"] = exch_code
        if security_type is not None: q["securityType"] = security_type
        if market_sector is not None: q["marketSector"] = market_sector
        if start is not None: q["start"] = start
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/finance/figi-search", endpoint="finance.figi-search", query=q)

    def thirteen_f(
        self,
        *,
        manager_cik: str,
        form_type: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Parsed institutional holdings (13F-HR) for an investment manager by CIK.

        Server params: managerCik (numeric, e.g. 1067983 for Berkshire), formType
        (default 13F-HR; try 13F-HR/A for amendments), limit (1-200, default 25).
        Sorted by value descending.
        """
        query: dict[str, Any] = {"managerCik": manager_cik}
        if form_type is not None:
            query["formType"] = form_type
        if limit is not None:
            query["limit"] = limit
        return self._c.request(
            "GET", "/api/finance/thirteen-f",
            endpoint="finance.thirteen-f",
            query=query,
        )


class _Geocode(_Group):
    def address(
        self,
        *,
        q: str,
        limit: Optional[int] = None,
        country: Optional[str] = None,
    ) -> CallResult:
        """Forward-geocode a free-text address.

        Server params: q (the query string), limit (1-10, default 5),
        country (2-letter ISO-3166 code, optional filter).
        """
        query: dict[str, Any] = {"q": q}
        if limit is not None:
            query["limit"] = limit
        if country is not None:
            query["country"] = country
        return self._c.request("GET", "/api/geocode/address", endpoint="geocode.address", query=query)

    def reverse(self, *, lat: float, lon: float) -> CallResult:
        return self._c.request("GET", "/api/geocode/reverse", endpoint="geocode.reverse", query={"lat": lat, "lon": lon})


class _Aircraft(_Group):

    def profile(
        self, *, tail: Optional[str] = None, icao24: Optional[str] = None, threshold: Optional[float] = None,
    ) -> CallResult:
        """Aircraft identity + OFAC sanctions screen of owner/operator. Params: tail, icao24, threshold."""
        q: dict[str, Any] = {}
        if tail is not None: q["tail"] = tail
        if icao24 is not None: q["icao24"] = icao24
        if threshold is not None: q["threshold"] = threshold
        return self._c.request("GET", "/api/aircraft/profile", endpoint="aircraft.profile", query=q)

    def lookup(self, *, tail: Optional[str] = None, icao24: Optional[str] = None) -> CallResult:
        """US-registered aircraft by tail (N-number) or icao24 Mode-S hex.

        Pass exactly one of tail / icao24. Returns make/model/owner/operator
        + the icao24 that links to live ADS-B flight-tracking. ~307k airframes
        (OpenSky Network, CC-BY-SA).
        """
        q: dict[str, Any] = {}
        if tail is not None:
            q["tail"] = tail
        if icao24 is not None:
            q["icao24"] = icao24
        return self._c.request("GET", "/api/aircraft/lookup", endpoint="aircraft.lookup", query=q)


class _Airport(_Group):
    def lookup(self, *, code: str) -> CallResult:
        """Look up an airport by IATA (3-letter) or ICAO (4-letter) code."""
        return self._c.request(
            "GET", "/api/airport/lookup",
            endpoint="airport.lookup",
            query={"code": code},
        )

    def near(
        self,
        *,
        lat: float,
        lon: float,
        radius_km: Optional[float] = None,
        limit: Optional[int] = None,
        type: Optional[str] = None,
        country: Optional[str] = None,
        scheduled_service: Optional[bool] = None,
    ) -> CallResult:
        """Find airports near a coordinate.

        Server params: lat/lon, radius_km (1-2000, default 200), limit (1-100,
        default 20), type (one of large_airport|medium_airport|small_airport|
        heliport|seaplane_base|balloonport|closed), country (ISO 3166-1
        alpha-2), scheduled_service (commercial-service only).
        """
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if radius_km is not None:
            q["radius_km"] = radius_km
        if limit is not None:
            q["limit"] = limit
        if type is not None:
            q["type"] = type
        if country is not None:
            q["country"] = country
        if scheduled_service is not None:
            q["scheduled_service"] = scheduled_service
        return self._c.request("GET", "/api/airport/near", endpoint="airport.near", query=q)


class _Weather(_Group):
    def zip(self, *, zip: str) -> CallResult:
        return self._c.request("GET", "/api/weather/zip", endpoint="weather.zip", query={"zip": zip})

    def alerts(
        self,
        *,
        point: Optional[str] = None,
        area: Optional[str] = None,
        severity: Optional[str] = None,
        urgency: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Live US National Weather Service active alerts.

        Provide exactly one of `point` ("lat,lon") or `area` (2-letter US
        state / marine code). Optional severity/urgency filter.
        """
        q: dict[str, Any] = {}
        if point is not None:
            q["point"] = point
        if area is not None:
            q["area"] = area
        if severity is not None:
            q["severity"] = severity
        if urgency is not None:
            q["urgency"] = urgency
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/weather/alerts", endpoint="weather.alerts", query=q)

    def forecast(self, *, lat: float, lon: float, hourly: bool | None = None, limit: int | None = None) -> CallResult:
        """NWS multi-day (or hourly) forecast for a US coordinate. Pass lat + lon;
        hourly=True for an hourly forecast. Returns periods with temp, wind, precip, text."""
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if hourly is not None:
            q["hourly"] = hourly
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/weather/forecast", endpoint="weather.forecast", query=q)

    def air_quality(self, *, lat: float, lon: float) -> CallResult:
        """Current air quality (US/EU AQI + PM2.5/PM10/ozone/NO2/SO2/CO) for a coordinate, global."""
        return self._c.request("GET", "/api/weather/air-quality", endpoint="weather.air-quality", query={"lat": lat, "lon": lon})

    def marine(self, *, lat: float, lon: float) -> CallResult:
        """Current marine/sea-state (waves + swell) for an ocean/coastal coordinate."""
        return self._c.request("GET", "/api/weather/marine", endpoint="weather.marine", query={"lat": lat, "lon": lon})

    def history(self, *, lat: float, lon: float, start: str, end: str) -> CallResult:
        """Historical daily weather (ERA5) for a coordinate + date range (start, end YYYY-MM-DD, <=366d)."""
        return self._c.request("GET", "/api/weather/history", endpoint="weather.history", query={"lat": lat, "lon": lon, "start": start, "end": end})


class _Dns(_Group):
    def lookup(
        self,
        *,
        host: str,
        types: Optional[str] = None,
        resolver: Optional[str] = None,
    ) -> CallResult:
        """DNS lookup over DoH.

        Server params: host (FQDN), types (comma-separated string from
        A,AAAA,MX,TXT,NS,CNAME,SOA), resolver (one of cloudflare|google|
        quad9|opendns).
        """
        q: dict[str, Any] = {"host": host}
        if types is not None:
            q["types"] = types
        if resolver is not None:
            q["resolver"] = resolver
        return self._c.request("GET", "/api/dns/lookup", endpoint="dns.lookup", query=q)


class _Domain(_Group):
    def whois(self, *, domain: str) -> CallResult:
        return self._c.request("GET", "/api/domain/whois", endpoint="domain.whois", query={"domain": domain})

    def intel(self, *, domain: str) -> CallResult:
        """Domain recon dossier — DNS + WHOIS/RDAP + live TLS certificate in one call."""
        return self._c.request("GET", "/api/domain/intel", endpoint="domain.intel", query={"domain": domain})

    def email_security(self, *, domain: str, dkim_selector: str | None = None) -> CallResult:
        """Email-auth / DNS-security posture grade (SPF/DKIM/DMARC/MTA-STS/DNSSEC/CAA/BIMI) from live DNS."""
        q: dict = {"domain": domain}
        if dkim_selector is not None:
            q["dkimSelector"] = dkim_selector
        return self._c.request("GET", "/api/domain/email-security", endpoint="domain.email-security", query=q)

    def ct_logs(self, *, domain: str, limit: int | None = None) -> CallResult:
        """Certificate Transparency recon — subdomains + issued certs for a domain (certSpotter/crt.sh)."""
        q: dict = {"domain": domain}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/domain/ct-logs", endpoint="domain.ct-logs", query=q)


class _Email(_Group):
    def validate(self, *, email: str, check_mx: bool | None = None) -> CallResult:
        """Email signals: RFC syntax, disposable/role/free flags, MX-record presence
        (via DoH). NOT a deliverability guarantee."""
        q: dict = {"email": email}
        if check_mx is not None:
            q["checkMx"] = check_mx
        return self._c.request("GET", "/api/email/validate", endpoint="email.validate", query=q)


class _Travel(_Group):
    def advisory(self, *, country: str | None = None) -> CallResult:
        """US State Dept travel advisories (live). Omit country for the full list."""
        q: dict = {}
        if country is not None:
            q["country"] = country
        return self._c.request("GET", "/api/travel/advisory", endpoint="travel.advisory", query=q)

    def visa(self, *, passport: str, destination: str) -> CallResult:
        """Visa requirement for a passport x destination (ISO alpha-3/alpha-2/name)."""
        return self._c.request("GET", "/api/travel/visa", endpoint="travel.visa", query={"passport": passport, "destination": destination})


class _Url(_Group):
    def unfurl(self, *, url: str) -> CallResult:
        return self._c.request("GET", "/api/url/unfurl", endpoint="url.unfurl", query={"url": url})

    def clean(
        self,
        *,
        url: str,
        format: Optional[str] = None,
    ) -> CallResult:
        """Fetch URL → de-cluttered article content.

        Server params: url, format. markdown (default) | text | both return a
        JSON envelope; html returns a self-contained reader page and pdf a
        typeset reading document (both as raw bytes in result.data).
        """
        q: dict[str, Any] = {"url": url}
        if format is not None:
            q["format"] = format
        return self._c.request("GET", "/api/url/clean", endpoint="url.clean", query=q)

    def render(
        self,
        *,
        url: str,
        format: Optional[str] = None,
        wait_until: Optional[str] = None,
        timeout_ms: Optional[int] = None,
    ) -> CallResult:
        """Like clean() but renders the page in a real headless browser (JS run).

        For client-rendered / SPA pages where clean()'s raw fetch sees an empty
        shell. Tier 2 (~10x clean()). Same formats. Server params: url, format,
        waitUntil (load|domcontentloaded|networkidle0|networkidle2), timeoutMs.
        """
        q: dict[str, Any] = {"url": url}
        if format is not None:
            q["format"] = format
        if wait_until is not None:
            q["waitUntil"] = wait_until
        if timeout_ms is not None:
            q["timeoutMs"] = timeout_ms
        return self._c.request("GET", "/api/url/render", endpoint="url.render", query=q)

    def map(
        self,
        *,
        url: str,
        limit: Optional[int] = None,
        same_host_only: Optional[bool] = None,
    ) -> CallResult:
        """Discover the URLs a page or sitemap points at, in a single fetch.

        <loc> entries from an XML sitemap/sitemap-index, or <a href> links from
        an HTML page (auto-detected). Resolved-absolute, deduped, http(s)-only.
        Stateless, no JS, NOT a recursive crawler — re-call on a child sitemap
        or discovered page to go deeper. Server params: url, limit (1-2000),
        sameHostOnly.
        """
        q: dict[str, Any] = {"url": url}
        if limit is not None:
            q["limit"] = limit
        if same_host_only is not None:
            q["sameHostOnly"] = "true" if same_host_only else "false"
        return self._c.request("GET", "/api/url/map", endpoint="url.map", query=q)


class _Wikipedia(_Group):
    def summary(self, *, title: str, lang: Optional[str] = None) -> CallResult:
        """Wikipedia page summary.

        Server params: title, lang (BCP-47, default 'en').
        """
        q: dict[str, Any] = {"title": title}
        if lang is not None:
            q["lang"] = lang
        return self._c.request("GET", "/api/wikipedia/summary", endpoint="wikipedia.summary", query=q)


class _Papers(_Group):
    def search(
        self,
        *,
        q: str,
        limit: Optional[int] = None,
        since: Optional[str] = None,
        sources: Optional[str] = None,
    ) -> CallResult:
        """Unified academic paper search (arXiv + PubMed + Semantic Scholar).

        Server params: q, limit (1-20, default 10), since (yyyy-mm-dd),
        sources (comma-separated subset of: arxiv,pubmed,semanticscholar).
        """
        query: dict[str, Any] = {"q": q}
        if limit is not None:
            query["limit"] = limit
        if since is not None:
            query["since"] = since
        if sources is not None:
            query["sources"] = sources
        return self._c.request("GET", "/api/papers/search", endpoint="papers.search", query=query)


class _Geo(_Group):
    def zip_resolve(self, *, zip: str) -> CallResult:
        """Resolve a US ZIP to its census tract(s), county, CBSA, and congressional district, each with HUD-USPS address-count allocation ratios."""
        query: dict = {"zip": zip}
        return self._c.request("GET", "/api/geo/zip-resolve", endpoint="geo.zip-resolve", query=query)

    def ip(self, *, ip: str) -> CallResult:
        return self._c.request("GET", "/api/geo/ip", endpoint="geo.ip", query={"ip": ip})

    def elevation(self, *, lat: float, lon: float) -> CallResult:
        """Ground elevation (meters + feet) for a coordinate, global. Pass lat + lon."""
        return self._c.request("GET", "/api/geo/elevation", endpoint="geo.elevation", query={"lat": lat, "lon": lon})

    def postal(self, *, postal_code: str, country: Optional[str] = None) -> CallResult:
        """Postal/ZIP code → place + admin divisions + coordinates (international, default US)."""
        q: dict[str, Any] = {"postalCode": postal_code}
        if country is not None: q["country"] = country
        return self._c.request("GET", "/api/geo/postal", endpoint="geo.postal", query=q)

    def flood_zone(self, *, lat: float, lon: float) -> CallResult:
        """FEMA flood zone for a coordinate (lat/lon).

        Returns the FEMA flood zone code, Special-Flood-Hazard-Area flag,
        plain-language risk level, base flood elevation, and FIRM panel.
        FEMA NFHL, free and keyless.
        """
        return self._c.request(
            "GET", "/api/geo/flood-zone", endpoint="geo.flood-zone",
            query={"lat": lat, "lon": lon},
        )

    def location_dossier(
        self,
        *,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        address: Optional[str] = None,
        zip: Optional[str] = None,
        risk_category: Optional[str] = None,
        site_class: Optional[str] = None,
    ) -> CallResult:
        """Static risk/context dossier for a US location.

        Pass lat+lon or address (geocoded for you); optional zip adds ACS
        demographics. Composes Census place context + FEMA flood zone + USGS
        ASCE 7-16 seismic + nearest NOAA station, each isolated. Free, keyless.
        """
        q: dict[str, Any] = {}
        if lat is not None: q["lat"] = lat
        if lon is not None: q["lon"] = lon
        if address is not None: q["address"] = address
        if zip is not None: q["zip"] = zip
        if risk_category is not None: q["riskCategory"] = risk_category
        if site_class is not None: q["siteClass"] = site_class
        return self._c.request(
            "GET", "/api/geo/location-dossier", endpoint="geo.location-dossier", query=q,
        )

    def nearby(
        self,
        *,
        lat: float,
        lon: float,
        radius_km: Optional[float] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Airports + schools + climate stations + recent quakes around a coordinate.

        Per-category found/error blocks with distances. radius_km default 25 (max 200).
        """
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if radius_km is not None: q["radiusKm"] = radius_km
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/geo/nearby", endpoint="geo.nearby", query=q)


class _Person(_Group):
    def cross_registry(self, *, name: str, limit: Optional[int] = None) -> CallResult:
        """Name sweep across FINRA brokers, attorneys, inmates, TX trades + real-estate.

        Name-matched CANDIDATES, not identity-resolved.
        """
        q: dict[str, Any] = {"name": name}
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/person/cross-registry", endpoint="person.cross-registry", query=q)


class _Ipinfo(_Group):
    def bulk(self, *, ips: list[str]) -> CallResult:
        return self._c.request("POST", "/api/ipinfo/bulk", endpoint="ipinfo.bulk", body={"ips": ips})


class _Hash(_Group):
    def compute(self, **kwargs) -> CallResult:
        return self._c.request("POST", "/api/hash/compute", endpoint="hash.compute", body=kwargs)


class _Validate(_Group):
    def iban(self, *, iban: str) -> CallResult:
        """Validate an IBAN (ISO 13616 length + mod-97 checksum); returns valid flag + canonical form."""
        return self._c.request("GET", "/api/validate/iban", endpoint="validate.iban", query={"iban": iban})

    def gtin(self, *, gtin: str) -> CallResult:
        """Validate a GTIN/UPC/EAN/ISBN check digit; normalizes to canonical GTIN-14."""
        return self._c.request("GET", "/api/validate/gtin", endpoint="validate.gtin", query={"gtin": gtin})

    def aba(self, *, routing_number: str) -> CallResult:
        """Validate a US ABA routing number (Federal Reserve weighted mod-10 checksum)."""
        return self._c.request("GET", "/api/validate/aba", endpoint="validate.aba", query={"routingNumber": routing_number})

    def lei(self, *, lei: str) -> CallResult:
        """Validate a Legal Entity Identifier (LEI, ISO 17442 mod-97-10 check digits)."""
        return self._c.request("GET", "/api/validate/lei", endpoint="validate.lei", query={"lei": lei})

    def bic(self, *, bic: str) -> CallResult:
        """Validate a SWIFT/BIC code (ISO 9362 structure + ISO country)."""
        return self._c.request("GET", "/api/validate/bic", endpoint="validate.bic", query={"bic": bic})

    def gln(self, *, gln: str) -> CallResult:
        """Validate a GS1 GLN (Global Location Number, 13-digit mod-10)."""
        return self._c.request("GET", "/api/validate/gln", endpoint="validate.gln", query={"gln": gln})

    def sscc(self, *, sscc: str) -> CallResult:
        """Validate a GS1 SSCC (Serial Shipping Container Code, 18-digit mod-10)."""
        return self._c.request("GET", "/api/validate/sscc", endpoint="validate.sscc", query={"sscc": sscc})

    def isin(self, *, isin: str) -> CallResult:
        """Validate an ISIN (ISO 6166 securities identifier); returns country, NSIN, embedded CUSIP (US/CA)."""
        return self._c.request("GET", "/api/validate/isin", endpoint="validate.isin", query={"isin": isin})

    def cusip(self, *, cusip: str) -> CallResult:
        """Validate a CUSIP (US/Canada securities identifier, mod-10 check digit)."""
        return self._c.request("GET", "/api/validate/cusip", endpoint="validate.cusip", query={"cusip": cusip})

    def batch(self, *, items: list[dict]) -> CallResult:
        """Validate up to 100 mixed identifiers in one call. items=[{"type","value"}];
        type is one of iban, gtin, aba, lei, bic, gln, sscc, isin, cusip. One bad item
        degrades to its own valid:false and never fails the batch."""
        return self._c.request("POST", "/api/validate/batch", endpoint="validate.batch", body={"items": items})


class _Inflation(_Group):
    def calculator(self, *, amount: float, from_: str, to: str | None = None) -> CallResult:
        """Adjust a $ amount for inflation between two dates via CPI-U. Pass amount +
        from_ (YYYY/YYYY-MM/YYYY-MM-DD) + optional to (defaults to latest CPI)."""
        q: dict[str, Any] = {"amount": amount, "from": from_}
        if to is not None:
            q["to"] = to
        return self._c.request("GET", "/api/inflation/calculator", endpoint="inflation.calculator", query=q)

    def rates(self, *, measure: str | None = None) -> CallResult:
        """Current US inflation by measure (cpi, core-cpi, pce, core-pce, ppi, ...) with
        index level + YoY/MoM. Pass measure or omit for all."""
        q: dict[str, Any] = {}
        if measure is not None:
            q["measure"] = measure
        return self._c.request("GET", "/api/inflation/rates", endpoint="inflation.rates", query=q)

    def expectations(self) -> CallResult:
        """US inflation expectations: TIPS breakevens (5y/10y), 5y5y forward, U-Mich survey."""
        return self._c.request("GET", "/api/inflation/expectations", endpoint="inflation.expectations", query={})

    def hicp(self, *, country: str | None = None) -> CallResult:
        """EU harmonized inflation (HICP annual rate) by country/aggregate. Pass country
        (Eurostat geo: DE, FR, EL=Greece, EA20=euro area, EU27_2020=EU) or omit for all."""
        q: dict[str, Any] = {}
        if country is not None:
            q["country"] = country
        return self._c.request("GET", "/api/inflation/hicp", endpoint="inflation.hicp", query=q)


class _Econ(_Group):
    def cot(self, *, market: str, limit: int | None = None) -> CallResult:
        """CFTC Commitments of Traders (COT) — weekly futures positioning for a market (free/keyless). Match a market by name (e.g. 'E-MINI S&P', 'GOLD', 'CRUDE OIL', 'BITCOIN'). Each weekly report: open interes"""
        query: dict = {"market": market}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/econ/cot", endpoint="econ.cot", query=query)

    def indicator(self, *, indicator: str | None = None) -> CallResult:
        """Latest US macro indicator reading + YoY (unemployment-rate, fed-funds-rate,
        real-gdp, gdp-growth, 10y-treasury, nonfarm-payrolls, ...). Pass indicator or omit for all."""
        q: dict[str, Any] = {}
        if indicator is not None:
            q["indicator"] = indicator
        return self._c.request("GET", "/api/econ/indicator", endpoint="econ.indicator", query=q)

    def fred(self, *, series_id: Optional[str] = None, query: Optional[str] = None, limit: Optional[int] = None,
             start: Optional[str] = None, end: Optional[str] = None) -> CallResult:
        """Any FRED series by id (metadata + observations) or full-text catalog search."""
        q: dict[str, Any] = {}
        if series_id is not None: q["seriesId"] = series_id
        if query is not None: q["query"] = query
        if limit is not None: q["limit"] = limit
        if start is not None: q["start"] = start
        if end is not None: q["end"] = end
        return self._c.request("GET", "/api/econ/fred", endpoint="econ.fred", query=q)

    def fred_releases(self, *, from_date: Optional[str] = None, name: Optional[str] = None,
                      release_id: Optional[int] = None, limit: Optional[int] = None) -> CallResult:
        """FRED economic-data release calendar — upcoming report dates."""
        q: dict[str, Any] = {}
        if from_date is not None: q["from"] = from_date
        if name is not None: q["name"] = name
        if release_id is not None: q["releaseId"] = release_id
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/econ/fred-releases", endpoint="econ.fred-releases", query=q)

    def fred_vintage(self, *, series_id: str, as_of: Optional[str] = None, start: Optional[str] = None,
                     end: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """FRED ALFRED point-in-time / vintage data — values as known on a past date."""
        q: dict[str, Any] = {"seriesId": series_id}
        if as_of is not None: q["asOf"] = as_of
        if start is not None: q["start"] = start
        if end is not None: q["end"] = end
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/econ/fred-vintage", endpoint="econ.fred-vintage", query=q)

    def fred_categories(self, *, category_id: Optional[int] = None, series_limit: Optional[int] = None) -> CallResult:
        """Browse the FRED category tree to discover series."""
        q: dict[str, Any] = {}
        if category_id is not None: q["categoryId"] = category_id
        if series_limit is not None: q["seriesLimit"] = series_limit
        return self._c.request("GET", "/api/econ/fred-categories", endpoint="econ.fred-categories", query=q)

    def fred_regional(self, *, series_id: str, date: Optional[str] = None) -> CallResult:
        """FRED regional data — one series across all US states/counties/metros for a period."""
        q: dict[str, Any] = {"seriesId": series_id}
        if date is not None: q["date"] = date
        return self._c.request("GET", "/api/econ/fred-regional", endpoint="econ.fred-regional", query=q)

    def yield_curve(self) -> CallResult:
        """Current US Treasury yield curve (1M-30Y) + 2s10s/3m10y spreads + inversion flag."""
        return self._c.request("GET", "/api/econ/yield-curve", endpoint="econ.yield-curve", query={})

    def commodity(self, *, commodity: str | None = None) -> CallResult:
        """Latest benchmark commodity price + % change (wti, brent, natural-gas, gasoline,
        diesel, copper, aluminum, corn, wheat, sugar, ...). Pass commodity or omit for all."""
        q: dict[str, Any] = {}
        if commodity is not None:
            q["commodity"] = commodity
        return self._c.request("GET", "/api/econ/commodity", endpoint="econ.commodity", query=q)

    def recession(self) -> CallResult:
        """Composite US recession-signal dashboard: NY Fed probability + Sahm rule +
        10y2y inversion, each with a triggered flag + count of signals flashing."""
        return self._c.request("GET", "/api/econ/recession", endpoint="econ.recession", query={})


class _Edi(_Group):
    def parse(self, *, edi: str) -> CallResult:
        """Parse a raw ANSI X12 EDI document into structured, named JSON + semantic
        summary (auto-detects delimiters; decodes 850/810/855/856/997 etc.). POST { edi }."""
        return self._c.request("POST", "/api/edi/parse", endpoint="edi.parse", body={"edi": edi})

    def edifact(self, *, edi: str) -> CallResult:
        """Parse a raw UN/EDIFACT document (international B2B EDI — counterpart to X12)
        into structured, named JSON + semantic summary (reads UNA delimiters; decodes
        ORDERS/INVOIC/DESADV/ORDRSP/CONTRL). POST { edi }."""
        return self._c.request("POST", "/api/edi/edifact", endpoint="edi.edifact", body={"edi": edi})

    def edifact_generate(
        self,
        *,
        type: str,
        sender_id: str,
        recipient_id: str,
        document_number: str,
        items: list,
        parties: list | None = None,
        date: str | None = None,
        total: float | None = None,
        sender_qualifier: str | None = None,
        recipient_qualifier: str | None = None,
        control_ref: str | None = None,
    ) -> CallResult:
        """Generate an outbound UN/EDIFACT ORDERS or INVOIC from JSON -> meta.edi.
        POST { type, senderId, recipientId, documentNumber, items, ... }."""
        body: dict[str, Any] = {"type": type, "senderId": sender_id, "recipientId": recipient_id, "documentNumber": document_number, "items": items}
        if parties is not None:
            body["parties"] = parties
        if date is not None:
            body["date"] = date
        if total is not None:
            body["total"] = total
        if sender_qualifier is not None:
            body["senderQualifier"] = sender_qualifier
        if recipient_qualifier is not None:
            body["recipientQualifier"] = recipient_qualifier
        if control_ref is not None:
            body["controlRef"] = control_ref
        return self._c.request("POST", "/api/edi/edifact-generate", endpoint="edi.edifact-generate", body=body)

    def ack(self, *, edi: str, status: str | None = None, control_number: str | None = None) -> CallResult:
        """Generate the X12 997 Functional Acknowledgment for a received interchange.
        meta.ack = ready-to-send 997 (sender/receiver mirrored, AK9 counts correct).
        status: A=Accepted (default), E/P/R/M/W/X. POST { edi, status?, controlNumber? }."""
        body: dict = {"edi": edi}
        if status is not None:
            body["status"] = status
        if control_number is not None:
            body["controlNumber"] = control_number
        return self._c.request("POST", "/api/edi/ack", endpoint="edi.ack", body=body)

    def generate(self, *, type: str, sender_id: str, receiver_id: str, document_number: str, items: list, po_number: str | None = None, date: str | None = None, parties: list | None = None, total: float | None = None) -> CallResult:
        """Generate an outbound X12 850 (PO) or 810 (Invoice) from JSON → meta.edi.
        POST { type, senderId, receiverId, documentNumber, items, … }."""
        body: dict[str, Any] = {"type": type, "senderId": sender_id, "receiverId": receiver_id, "documentNumber": document_number, "items": items}
        if po_number is not None:
            body["poNumber"] = po_number
        if date is not None:
            body["date"] = date
        if parties is not None:
            body["parties"] = parties
        if total is not None:
            body["total"] = total
        return self._c.request("POST", "/api/edi/generate", endpoint="edi.generate", body=body)


class _Factcheck(_Group):
    def search(
        self,
        *,
        query: str,
        language: str | None = None,
        max_age_days: int | None = None,
        publisher: str | None = None,
        limit: int | None = None,
    ) -> CallResult:
        """Search published fact-checks (ClaimReview) by claim text → claims with
        publishers, verdicts (textualRating), and review URLs. Google Fact Check Tools."""
        q: dict = {"query": query}
        if language is not None:
            q["language"] = language
        if max_age_days is not None:
            q["maxAgeDays"] = max_age_days
        if publisher is not None:
            q["publisher"] = publisher
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/factcheck/search", endpoint="factcheck.search", query=q)


class _Aviation(_Group):
    def metar(self, *, ids: str) -> CallResult:
        """Current aviation weather observation(s) (METAR) for comma-separated ICAO ids."""
        return self._c.request("GET", "/api/aviation/metar", endpoint="aviation.metar", query={"ids": ids})

    def taf(self, *, ids: str) -> CallResult:
        """Terminal Aerodrome Forecast(s) (TAF) for comma-separated ICAO ids."""
        return self._c.request("GET", "/api/aviation/taf", endpoint="aviation.taf", query={"ids": ids})

    def sigmet(self, *, hazard: Optional[str] = None, hours: Optional[int] = None, limit: Optional[int] = None) -> CallResult:
        """Active in-flight hazard advisories (SIGMETs/AIRMETs) from NOAA."""
        q: dict[str, Any] = {}
        if hazard is not None: q["hazard"] = hazard
        if hours is not None: q["hours"] = hours
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/aviation/sigmet", endpoint="aviation.sigmet", query=q)

    def accidents(
        self,
        *,
        registration: Optional[str] = None,
        state: Optional[str] = None,
        make: Optional[str] = None,
        model: Optional[str] = None,
        city: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """NTSB civil aviation accident/incident history (CAROL). At least one filter required."""
        q: dict[str, Any] = {}
        if registration is not None: q["registration"] = registration
        if state is not None: q["state"] = state
        if make is not None: q["make"] = make
        if model is not None: q["model"] = model
        if city is not None: q["city"] = city
        if date_from is not None: q["dateFrom"] = date_from
        if date_to is not None: q["dateTo"] = date_to
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/aviation/accidents", endpoint="aviation.accidents", query=q)


class _Dev(_Group):
    def crates_search(self, *, q: str, limit: int | None = None) -> CallResult:
        """Search crates.io for Rust packages (keyless). Each result: name, latest stable version, description, total + recent downloads, and repository/homepage/documentation links. For agents discovering or ve"""
        query: dict = {"q": q}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/dev/crates-search", endpoint="dev.crates-search", query=query)

    def csv_to_json(self, *, csv: str, delimiter: str | None = None, header: bool | None = None) -> CallResult:
        """Convert CSV/TSV text to a JSON array. POST { csv, delimiter?, header? }. Auto-detects comma vs tab, handles quoted fields and escaped quotes, and coerces numbers/booleans/empty→null. With header=true """
        body: dict = {"csv": csv}
        if delimiter is not None:
            body["delimiter"] = delimiter
        if header is not None:
            body["header"] = header
        return self._c.request("POST", "/api/dev/csv-to-json", endpoint="dev.csv-to-json", body=body)

    def diff_json(self, *, a: str | None = None, b: str | None = None) -> CallResult:
        """Structured deep diff of two JSON values. POST { a, b }. Returns a list of changes, each with a dot-path and type (added / removed / changed) plus from/to values, and a total change count. For change-d"""
        body: dict = {}
        if a is not None:
            body["a"] = a
        if b is not None:
            body["b"] = b
        return self._c.request("POST", "/api/dev/diff-json", endpoint="dev.diff-json", body=body)

    def flatten_json(self, *, data: str | None = None, delimiter: str | None = None) -> CallResult:
        """Flatten a nested JSON object/array into dot-notation keys. POST { data, delimiter? }. E.g. {a:{b:[1,2]}} → {"a.b.0":1,"a.b.1":2}. Useful for diffing, CSV export, search indexing, or feeding flat key/v"""
        body: dict = {}
        if data is not None:
            body["data"] = data
        if delimiter is not None:
            body["delimiter"] = delimiter
        return self._c.request("POST", "/api/dev/flatten-json", endpoint="dev.flatten-json", body=body)

    def gitlab_search(self, *, q: str, limit: int | None = None) -> CallResult:
        """Search public GitLab projects (keyless), ranked by stars. Each result: full name, path, description, star and fork counts, web URL, last-activity timestamp, and topics. Complements code.repo-lookup (G"""
        query: dict = {"q": q}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/dev/gitlab-search", endpoint="dev.gitlab-search", query=query)

    def json_to_csv(self, *, data: Any, delimiter: str | None = None) -> CallResult:
        """Convert a JSON array of objects to CSV. POST { data, delimiter? }. Column headers are the union of keys across all rows; values are CSV-escaped (quotes, commas, newlines), nested objects are JSON-stri"""
        body: dict = {"data": data}
        if delimiter is not None:
            body["delimiter"] = delimiter
        return self._c.request("POST", "/api/dev/json-to-csv", endpoint="dev.json-to-csv", body=body)

    def json_to_typescript(self, *, sample: str | None = None, rootName: str | None = None) -> CallResult:
        """Infer a TypeScript interface from a sample JSON value. POST { sample, rootName? }. Handles nested objects, arrays (merged element type), and primitives; merges keys across array elements. Returns a re"""
        body: dict = {}
        if sample is not None:
            body["sample"] = sample
        if rootName is not None:
            body["rootName"] = rootName
        return self._c.request("POST", "/api/dev/json-to-typescript", endpoint="dev.json-to-typescript", body=body)

    def json_to_zod(self, *, sample: str | None = None, name: str | None = None) -> CallResult:
        """Infer a Zod schema from a sample JSON value. POST { sample, name? }. Handles nested objects, arrays, and primitives, merging keys across array elements. Returns a ready-to-paste `const name = z.object"""
        body: dict = {}
        if sample is not None:
            body["sample"] = sample
        if name is not None:
            body["name"] = name
        return self._c.request("POST", "/api/dev/json-to-zod", endpoint="dev.json-to-zod", body=body)

    def jwt_decode(self, *, token: str) -> CallResult:
        """Decode a JWT without verifying its signature. POST { token }. Returns the decoded header and payload, plus issuedAt/expiresAt/notBefore as ISO timestamps, and expired / notYetValid flags. Signature is"""
        body: dict = {"token": token}
        return self._c.request("POST", "/api/dev/jwt-decode", endpoint="dev.jwt-decode", body=body)

    def npm_search(self, *, q: str, limit: int | None = None) -> CallResult:
        """Search the npm registry for JavaScript/TypeScript packages (keyless). Each result: name, latest version, description, keywords, publisher, last-publish date, and npm/homepage/repository links. For age"""
        query: dict = {"q": q}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/dev/npm-search", endpoint="dev.npm-search", query=query)

    def regex_test(self, *, pattern: str, input: str, flags: str | None = None) -> CallResult:
        """Test a JavaScript regular expression against input text. POST { pattern, flags?, input }. Returns each match with its index, numbered capture groups, and named groups (up to 1000 matches with the g fl"""
        body: dict = {"pattern": pattern, "input": input}
        if flags is not None:
            body["flags"] = flags
        return self._c.request("POST", "/api/dev/regex-test", endpoint="dev.regex-test", body=body)

    def stackoverflow_search(self, *, q: str, sort: str | None = None, limit: int | None = None) -> CallResult:
        """Search Stack Overflow questions (keyless). Each result: title, link, score, answer count, answered flag, view count, tags, creation date, and question id. Sort by relevance, votes, activity, or creati"""
        query: dict = {"q": q}
        if sort is not None:
            query["sort"] = sort
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/dev/stackoverflow-search", endpoint="dev.stackoverflow-search", query=query)

    def uuid(self, *, version: str | None = None, count: int | None = None) -> CallResult:
        """Generate UUIDs. version v4 (random) or v7 (time-ordered, sortable); count 1-100. Cryptographically random. Pure compute, no upstream."""
        query: dict = {}
        if version is not None:
            query["version"] = version
        if count is not None:
            query["count"] = count
        return self._c.request("GET", "/api/dev/uuid", endpoint="dev.uuid", query=query)

    def rfc(self, *, number: str) -> CallResult:
        """IETF RFC lookup by number → status, title, authors, obsoletes/updates chain (bundled index)."""
        return self._c.request("GET", "/api/dev/rfc", endpoint="dev.rfc", query={"number": number})

    def preflight(self, *, command: str, probe: bool | None = None) -> CallResult:
        """Preflight gate: is a shell command runnable? Parses method/URL/headers and
        returns verdict (runnable/invalid) + per-check evidence. Static + deterministic
        by default; probe=True adds a guarded live HEAD (SSRF-safe). POST { command, probe? }."""
        body: dict = {"command": command}
        if probe is not None:
            body["probe"] = probe
        return self._c.request("POST", "/api/dev/preflight", endpoint="dev.preflight", body=body)


class _Security(_Group):
    def ics_advisories(self, *, q: str | None = None, limit: int | None = None) -> CallResult:
        """Latest CISA ICS/OT security advisories (industrial control systems) — id, title, link, date, summary. Optional keyword filter."""
        query: dict = {}
        if q is not None:
            query["q"] = q
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/security/ics-advisories", endpoint="security.ics-advisories", query=query)

    def cve(self, *, cve: str) -> CallResult:
        """Resolve a CVE (e.g. 'CVE-2021-44228') across NVD (record + CVSS + CWE),
        CISA KEV (actively-exploited + ransomware flag), and EPSS (exploit
        probability) in one call. KEV + EPSS sections degrade independently."""
        return self._c.request("GET", "/api/security/cve", endpoint="security.cve", query={"cve": cve})

    def cve_changes(self, *, since: str, until: str | None = None, keyword: str | None = None, cpe: str | None = None, limit: int | None = None) -> CallResult:
        """CVE change feed — CVEs MODIFIED within a window (NVD lastMod), each flagged if
        now CISA known-exploited. since=YYYY-MM-DD/ISO; window <=120 days. Pollable delta."""
        q: dict[str, Any] = {"since": since}
        if until is not None: q["until"] = until
        if keyword is not None: q["keyword"] = keyword
        if cpe is not None: q["cpe"] = cpe
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/security/cve-changes", endpoint="security.cve-changes", query=q)

    def http_headers(self, *, url: str) -> CallResult:
        """Fetch a URL and grade its HTTP security headers (CSP/HSTS/X-Frame/…). SSRF-guarded."""
        return self._c.request("GET", "/api/security/http-headers", endpoint="security.http-headers", query={"url": url})

    def password_exposure(self, *, password: str | None = None, sha1: str | None = None) -> CallResult:
        """Check a password against breach corpora via HIBP k-anonymity (only a 5-char SHA-1
        prefix is sent upstream). Pass password (hashed server-side) or sha1 (zero-knowledge)."""
        body: dict = {}
        if password is not None: body["password"] = password
        if sha1 is not None: body["sha1"] = sha1
        return self._c.request("POST", "/api/security/password-exposure", endpoint="security.password-exposure", body=body)

    def ioc_reputation(self, *, ioc: str) -> CallResult:
        """Threat-intel reputation for an IP/domain/URL/hash (abuse.ch + Feodo + Tor + Spamhaus DROP)."""
        return self._c.request("GET", "/api/security/ioc-reputation", endpoint="security.ioc-reputation", query={"ioc": ioc})

    def ip_reputation(self, *, ip: str) -> CallResult:
        """Multi-source IP reputation + combined authority score (AbuseIPDB + abuse.ch + blocklist.de + StopForumSpam)."""
        return self._c.request("GET", "/api/security/ip-reputation", endpoint="security.ip-reputation", query={"ip": ip})

    def ip_abuse(self, *, ip: str, max_age_in_days: int | None = None, verbose: bool | None = None) -> CallResult:
        """AbuseIPDB single-IP abuse check — confidence score, reports, usage type, ISP (verbose adds report records)."""
        q: dict = {"ip": ip}
        if max_age_in_days is not None: q["maxAgeInDays"] = max_age_in_days
        if verbose is not None: q["verbose"] = verbose
        return self._c.request("GET", "/api/security/ip-abuse", endpoint="security.ip-abuse", query=q)

    def ip_blacklist(self, *, confidence_minimum: int | None = None, limit: int | None = None,
                     ip_version: int | None = None, only_countries: str | None = None,
                     except_countries: str | None = None) -> CallResult:
        """AbuseIPDB bulk blacklist — worst-offender IPs above a confidence threshold (fail2ban firewall feed)."""
        q: dict = {}
        if confidence_minimum is not None: q["confidenceMinimum"] = confidence_minimum
        if limit is not None: q["limit"] = limit
        if ip_version is not None: q["ipVersion"] = ip_version
        if only_countries is not None: q["onlyCountries"] = only_countries
        if except_countries is not None: q["exceptCountries"] = except_countries
        return self._c.request("GET", "/api/security/ip-blacklist", endpoint="security.ip-blacklist", query=q)

    def ip_block(self, *, network: str, max_age_in_days: int | None = None, limit: int | None = None) -> CallResult:
        """AbuseIPDB subnet (CIDR) check — which IPs inside a network block have been reported."""
        q: dict = {"network": network}
        if max_age_in_days is not None: q["maxAgeInDays"] = max_age_in_days
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/security/ip-block", endpoint="security.ip-block", query=q)

    def cwe(self, *, id: str | None = None, query: str | None = None, limit: int | None = None) -> CallResult:
        """MITRE CWE weakness lookup by id (CWE-79) or keyword search (bundled, anti-hallucination)."""
        q: dict = {}
        if id is not None: q["id"] = id
        if query is not None: q["query"] = query
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/security/cwe", endpoint="security.cwe", query=q)

    def attack(self, *, id: str | None = None, query: str | None = None, limit: int | None = None) -> CallResult:
        """MITRE ATT&CK Enterprise technique lookup by id (T1059) or keyword search (bundled)."""
        q: dict = {}
        if id is not None: q["id"] = id
        if query is not None: q["query"] = query
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/security/attack", endpoint="security.attack", query=q)

    def capec(self, *, id: str | None = None, query: str | None = None, limit: int | None = None) -> CallResult:
        """MITRE CAPEC attack-pattern lookup by id (CAPEC-66) or keyword search (bundled)."""
        q: dict = {}
        if id is not None: q["id"] = id
        if query is not None: q["query"] = query
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/security/capec", endpoint="security.capec", query=q)

    def exploit_availability(self, *, cve: str) -> CallResult:
        """Does public exploit code exist for a CVE (Exploit-DB)? Weaponized-triage signal beyond KEV/EPSS."""
        return self._c.request("GET", "/api/security/exploit-availability", endpoint="security.exploit-availability", query={"cve": cve})

    def package(self, *, ecosystem: str, name: str, version: str | None = None) -> CallResult:
        """Package security + provenance in one call: OSV vulnerabilities + deps.dev
        license/deprecation + OpenSSF Scorecard health. ecosystem = npm/pypi/go/
        maven/cargo/nuget. GET { ecosystem, name, version? }."""
        q: dict[str, Any] = {"ecosystem": ecosystem, "name": name}
        if version is not None:
            q["version"] = version
        return self._c.request("GET", "/api/security/package", endpoint="security.package", query=q)

    def cve_search(self, *, product: str | None = None, cpe: str | None = None, limit: int | None = None) -> CallResult:
        """Find CVEs affecting a product (NVD search). product=keyword or cpe=exact
        CPE 2.3. Newest-first w/ CVSS. GET { product? | cpe?, limit? }."""
        q: dict[str, Any] = {}
        if product is not None:
            q["product"] = product
        if cpe is not None:
            q["cpe"] = cpe
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/security/cve-search", endpoint="security.cve-search", query=q)


class _Water(_Group):
    def gauge(self, *, site: str) -> CallResult:
        """Real-time USGS river/stream conditions (streamflow, gage height, temp) for a site number."""
        return self._c.request("GET", "/api/water/gauge", endpoint="water.gauge", query={"site": site})


class _Tax(_Group):

    def vat(self, *, vat: str | None = None, country: str | None = None, number: str | None = None) -> CallResult:
        """Validate an EU VAT number against the live VIES register. Pass vat (full
        identifier like 'DE811569869') OR country + number. Returns valid, countryCode,
        vatNumber, and (when disclosed) name + address."""
        q: dict = {}
        if vat is not None:
            q["vat"] = vat
        if country is not None:
            q["country"] = country
        if number is not None:
            q["number"] = number
        return self._c.request("GET", "/api/tax/vat", endpoint="tax.vat", query=q)

    def vat_rates(self, *, country: str | None = None) -> CallResult:
        """Current EU VAT rates by member state (European Commission TEDB).

        Pass country (ISO 2-letter; Greece is EL) for one state, or omit for all 27.
        Each item returns standardRate, reducedRates, every rate category, and the
        date in force. Pairs with vat() (number validation).
        """
        q: dict = {}
        if country is not None:
            q["country"] = country
        return self._c.request("GET", "/api/tax/vat-rates", endpoint="tax.vat-rates", query=q)


class _Calendar(_Group):
    def earnings(self, *, from_: str | None = None, to: str | None = None, ticker: str | None = None) -> CallResult:
        """Earnings release calendar — which US-listed companies report earnings in a date window, with expected and (once reported) actual EPS and revenue, and the time of day (before/after market). Pass a from"""
        query: dict = {}
        if from_ is not None:
            query["from"] = from_
        if to is not None:
            query["to"] = to
        if ticker is not None:
            query["ticker"] = ticker
        return self._c.request("GET", "/api/calendar/earnings", endpoint="calendar.earnings", query=query)

    def ipo(self, *, from_: str | None = None, to: str | None = None) -> CallResult:
        """IPO calendar — companies going public (or recently public) in a date window, with the expected date, symbol, name, exchange, price range, number of shares, total offering value, and status (expected/p"""
        query: dict = {}
        if from_ is not None:
            query["from"] = from_
        if to is not None:
            query["to"] = to
        return self._c.request("GET", "/api/calendar/ipo", endpoint="calendar.ipo", query=query)

    def holidays(self, *, country: str, year: int, region: Optional[str] = None,
                 types: Optional[str] = None, lang: Optional[str] = None) -> CallResult:
        """Official holidays for a country/region + year, exact observed dates incl. substitute days."""
        q: dict[str, Any] = {"country": country, "year": year}
        if region is not None:
            q["region"] = region
        if types is not None:
            q["types"] = types
        if lang is not None:
            q["lang"] = lang
        return self._c.request("GET", "/api/calendar/holidays", endpoint="calendar.holidays", query=q)

    def business_days(self, *, country: str, start: str, add_days: Optional[int] = None,
                      end: Optional[str] = None, region: Optional[str] = None,
                      weekend: Optional[str] = None, types: Optional[str] = None) -> CallResult:
        """Holiday-aware business-day math: start+add_days (shift), start+end (count), start alone (check)."""
        q: dict[str, Any] = {"country": country, "start": start}
        if add_days is not None:
            q["addDays"] = add_days
        if end is not None:
            q["end"] = end
        if region is not None:
            q["region"] = region
        if weekend is not None:
            q["weekend"] = weekend
        if types is not None:
            q["types"] = types
        return self._c.request("GET", "/api/calendar/business-days", endpoint="calendar.business-days", query=q)


class _Convert(_Group):
    def unit(self, *, value: float, from_: str, to: str) -> CallResult:
        """Convert a value between units of measure (mass/length/volume/area/temperature)."""
        return self._c.request("GET", "/api/convert/unit", endpoint="convert.unit",
                                query={"value": value, "from": from_, "to": to})

    def currency(self, *, from_: str, to: str, amount: Optional[float] = None, date: Optional[str] = None) -> CallResult:
        """Convert an amount between currencies at a live or historical ECB rate.

        from_ + to are 3-letter ISO 4217 codes; amount default 1; date YYYY-MM-DD
        for a historical rate (omit for latest). Live Frankfurter/ECB, never stale.
        """
        q: dict[str, Any] = {"from": from_, "to": to}
        if amount is not None: q["amount"] = amount
        if date is not None: q["date"] = date
        return self._c.request("GET", "/api/convert/currency", endpoint="convert.currency", query=q)


class _Iso(_Group):
    def currency(self, *, code: Optional[str] = None, country: Optional[str] = None) -> CallResult:
        """ISO 4217 currency by code (USD or 840) or country → name, numeric, minor units, countries."""
        if code is None and country is None:
            raise ValueError("currency() requires code or country.")
        q: dict[str, Any] = {}
        if code is not None: q["code"] = code
        if country is not None: q["country"] = country
        return self._c.request("GET", "/api/iso/currency", endpoint="iso.currency", query=q)

    def language(self, *, code: Optional[str] = None, name: Optional[str] = None) -> CallResult:
        """ISO 639 language by code (en/ger/deu) or name → English name + all sibling codes."""
        if code is None and name is None:
            raise ValueError("language() requires code or name.")
        q: dict[str, Any] = {}
        if code is not None: q["code"] = code
        if name is not None: q["name"] = name
        return self._c.request("GET", "/api/iso/language", endpoint="iso.language", query=q)

    def subdivision(self, *, code: Optional[str] = None, country: Optional[str] = None) -> CallResult:
        """ISO 3166-2 subdivision by code (US-CA) or country (US → list)."""
        if code is None and country is None:
            raise ValueError("subdivision() requires code or country.")
        q: dict[str, Any] = {}
        if code is not None: q["code"] = code
        if country is not None: q["country"] = country
        return self._c.request("GET", "/api/iso/subdivision", endpoint="iso.subdivision", query=q)


class _Trade(_Group):
    def commodity_resolve(self, *, system: str, code: str) -> CallResult:
        """Cross-walk a traded-good code across HS ↔ HTS ↔ Schedule B ↔ NAICS (+ SITC) via the shared HS6 (Census concordances)."""
        query: dict = {"system": system, "code": code}
        return self._c.request("GET", "/api/trade/commodity-resolve", endpoint="trade.commodity-resolve", query=query)

    def tariff(self, *, code: Optional[str] = None, query: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """US Harmonized Tariff Schedule: exact code lookup or free-text search → HS codes + duty rates."""
        if code is None and query is None:
            raise ValueError("tariff() requires one of code or query.")
        q: dict[str, Any] = {}
        if code is not None: q["code"] = code
        if query is not None: q["query"] = query
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/trade/tariff", endpoint="trade.tariff", query=q)

    def locode(
        self,
        *,
        locode: Optional[str] = None,
        query: Optional[str] = None,
        country: Optional[str] = None,
        function: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """UN/LOCODE: exact code lookup (e.g. USNYC) or name search with country/function filters."""
        if locode is None and query is None:
            raise ValueError("locode() requires one of locode or query.")
        q: dict[str, Any] = {}
        if locode is not None: q["locode"] = locode
        if query is not None: q["query"] = query
        if country is not None: q["country"] = country
        if function is not None: q["function"] = function
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/trade/locode", endpoint="trade.locode", query=q)

    def flows(
        self,
        *,
        reporter: str,
        year: str,
        partner: Optional[str] = None,
        flow: Optional[str] = None,
        commodity: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Annual international merchandise-trade flows (UN Comtrade, HS).

        reporter/partner = ISO-2/ISO-3 ('US'/'USA'), UN M49 number, or 'World'.
        commodity = 'TOTAL' (default), an HS code, or 'AG2'/'AG4'/'AG6' breakdown.
        flow = export|import. Returns trade value (USD), weight, quantity per HS commodity.
        """
        q: dict[str, Any] = {"reporter": reporter, "year": year}
        if partner is not None: q["partner"] = partner
        if flow is not None: q["flow"] = flow
        if commodity is not None: q["commodity"] = commodity
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/trade/flows", endpoint="trade.flows", query=q)


class _Quakes(_Group):
    def recent(
        self,
        *,
        lat: float,
        lon: float,
        radius_km: Optional[float] = None,
        hours: Optional[int] = None,
        min_magnitude: Optional[float] = None,
    ) -> CallResult:
        """Recent earthquakes near a coordinate (USGS).

        Server params: lat, lon (both required), radius_km (1-1000, default
        500), hours (1-720, default 24), min_magnitude (0-10, default 2.0).
        """
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if radius_km is not None:
            q["radius_km"] = radius_km
        if hours is not None:
            q["hours"] = hours
        if min_magnitude is not None:
            q["min_magnitude"] = min_magnitude
        return self._c.request("GET", "/api/quakes/recent", endpoint="quakes.recent", query=q)


class _Sunrise(_Group):
    def compute(self, *, lat: float, lon: float, date: str) -> CallResult:
        """Sunrise/sunset/twilight times for a lat/lon on a date.

        Server params: lat, lon, date (yyyy-mm-dd — REQUIRED).
        """
        return self._c.request(
            "GET", "/api/sunrise/compute", endpoint="sunrise.compute",
            query={"lat": lat, "lon": lon, "date": date},
        )


class _Tides(_Group):
    def now(
        self,
        *,
        lat: float,
        lon: float,
        radius_km: Optional[float] = None,
        hours: Optional[int] = None,
    ) -> CallResult:
        """NOAA tide predictions near a coast.

        Server params: lat, lon, radius_km (1-500, default 100), hours
        (1-72, default 24).
        """
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if radius_km is not None:
            q["radius_km"] = radius_km
        if hours is not None:
            q["hours"] = hours
        return self._c.request("GET", "/api/tides/now", endpoint="tides.now", query=q)


class _Medical(_Group):
    def taxonomy_specialty(self, *, code: str) -> CallResult:
        """Decode a NUCC provider-taxonomy code → grouping, classification, specialization, and display name."""
        query: dict = {"code": code}
        return self._c.request("GET", "/api/medical/taxonomy-specialty", endpoint="medical.taxonomy-specialty", query=query)

    def provider_id_resolve(self, *, npi: str) -> CallResult:
        """Resolve an NPI to provider identity + every taxonomy decoded to specialty (NPPES + NUCC). CCN deferred."""
        query: dict = {"npi": npi}
        return self._c.request("GET", "/api/medical/provider-id-resolve", endpoint="medical.provider-id-resolve", query=query)

    def drug_price(
        self,
        *,
        ndc: Optional[str] = None,
        name: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """CMS NADAC drug acquisition cost by ndc or name (live; current-year dataset auto-resolved)."""
        q: dict = {}
        if ndc is not None:
            q["ndc"] = ndc
        if name is not None:
            q["name"] = name
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/medical/drug-price", endpoint="medical.drug-price", query=q)

    def rxnorm(
        self,
        *,
        term: Optional[str] = None,
        rxcui: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Normalize/verify drug names against RxNorm (NIH).

        Exactly one of term (free text, ranked candidates) or rxcui
        (canonical concept + ingredients/brands/dose forms).
        """
        if (term is None) == (rxcui is None):
            raise ValueError("rxnorm() requires exactly one of term or rxcui.")
        q: dict[str, Any] = {}
        if term is not None: q["term"] = term
        if rxcui is not None: q["rxcui"] = rxcui
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/medical/rxnorm", endpoint="medical.rxnorm", query=q)

    def drug_status(
        self,
        *,
        drug: Optional[str] = None,
        rxcui: Optional[str] = None,
        ndc: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Drug situational awareness: FDA shortage + recall status + NDC metadata.

        Provide one of drug (free-text name, resolved via RxNorm), rxcui, or
        ndc. Returns hasCurrentShortage / hasOpenRecall plus per-source
        found/error blocks. Free, public-domain FDA + NIH data.
        """
        if drug is None and rxcui is None and ndc is None:
            raise ValueError("drug_status() requires one of drug, rxcui, or ndc.")
        q: dict[str, Any] = {}
        if drug is not None: q["drug"] = drug
        if rxcui is not None: q["rxcui"] = rxcui
        if ndc is not None: q["ndc"] = ndc
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/medical/drug-status", endpoint="medical.drug-status", query=q)

    def drug_label(
        self,
        *,
        drug: Optional[str] = None,
        ndc: Optional[str] = None,
        rxcui: Optional[str] = None,
        set_id: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Authoritative FDA drug label (Structured Product Labeling / SPL).

        Provide one of drug (brand/generic/substance name), ndc, rxcui, or
        set_id. Returns the FDA-approved label split into sections (boxed
        warning, indications, dosage, contraindications, warnings, adverse
        reactions, drug interactions, special populations, pregnancy,
        mechanism of action, ingredients) plus identity metadata and a
        hasBoxedWarning flag. Free, public-domain FDA data.
        """
        if drug is None and ndc is None and rxcui is None and set_id is None:
            raise ValueError("drug_label() requires one of drug, ndc, rxcui, or set_id.")
        q: dict[str, Any] = {}
        if drug is not None: q["drug"] = drug
        if ndc is not None: q["ndc"] = ndc
        if rxcui is not None: q["rxcui"] = rxcui
        if set_id is not None: q["setId"] = set_id
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/medical/drug-label", endpoint="medical.drug-label", query=q)

    def icd10(
        self,
        *,
        code: Optional[str] = None,
        q: Optional[str] = None,
        billable_only: Optional[bool] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Verify an ICD-10-CM diagnosis code or keyword-search the official US set.

        Provide exactly one of code (e.g. "E11.9" or "E119" — verifies the
        code and lists more-specific child codes) or q (keyword search over
        official descriptions). billable_only restricts results to codes
        valid for claim submission; limit caps results (1-50, default 10).
        CMS/NCHS public-domain data, refreshed each US fiscal year.
        """
        query: dict[str, Any] = {}
        if code is not None:
            query["code"] = code
        if q is not None:
            query["q"] = q
        if billable_only is not None:
            query["billable_only"] = billable_only
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/medical/icd10", endpoint="medical.icd10", query=query)

    def drug_approval(self, *, drug: Optional[str] = None, application_number: Optional[str] = None,
                      sponsor: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """Drugs@FDA approval history (applications, products, submissions)."""
        q: dict[str, Any] = {}
        if drug is not None: q["drug"] = drug
        if application_number is not None: q["applicationNumber"] = application_number
        if sponsor is not None: q["sponsor"] = sponsor
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/medical/drug-approval", endpoint="medical.drug-approval", query=q)

    def device_510k(self, *, device: Optional[str] = None, applicant: Optional[str] = None,
                    product_code: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """FDA 510(k) premarket clearances by device/applicant/product code."""
        q: dict[str, Any] = {}
        if device is not None: q["device"] = device
        if applicant is not None: q["applicant"] = applicant
        if product_code is not None: q["productCode"] = product_code
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/medical/device-510k", endpoint="medical.device-510k", query=q)

    def device_classification(self, *, device: Optional[str] = None, product_code: Optional[str] = None,
                              limit: Optional[int] = None) -> CallResult:
        """FDA device classification (class, regulation, controls)."""
        q: dict[str, Any] = {}
        if device is not None: q["device"] = device
        if product_code is not None: q["productCode"] = product_code
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/medical/device-classification", endpoint="medical.device-classification", query=q)

    def device_udi(self, *, device: Optional[str] = None, company: Optional[str] = None,
                   udi: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """FDA GUDID device lookup by UDI/brand/company."""
        q: dict[str, Any] = {}
        if device is not None: q["device"] = device
        if company is not None: q["company"] = company
        if udi is not None: q["udi"] = udi
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/medical/device-udi", endpoint="medical.device-udi", query=q)

    def device_recall(self, *, device: Optional[str] = None, firm: Optional[str] = None,
                      classification: Optional[str] = None, status: Optional[str] = None,
                      state: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """FDA medical-device recalls by device/firm/classification/status/state.

        Omit all filters for the most recent recalls nationwide. Returns recall
        number, classification, status, reason, quantity, recalling firm, and
        dates. Free, public-domain FDA data.
        """
        q: dict[str, Any] = {}
        if device is not None: q["device"] = device
        if firm is not None: q["firm"] = firm
        if classification is not None: q["classification"] = classification
        if status is not None: q["status"] = status
        if state is not None: q["state"] = state
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/medical/device-recall", endpoint="medical.device-recall", query=q)

    def npi(self, *, npi: Optional[str] = None, first_name: Optional[str] = None, last_name: Optional[str] = None,
            organization: Optional[str] = None, state: Optional[str] = None, taxonomy: Optional[str] = None,
            limit: Optional[int] = None) -> CallResult:
        """CMS NPPES provider lookup by NPI / name / organization (+state/taxonomy)."""
        q: dict[str, Any] = {}
        if npi is not None: q["npi"] = npi
        if first_name is not None: q["firstName"] = first_name
        if last_name is not None: q["lastName"] = last_name
        if organization is not None: q["organization"] = organization
        if state is not None: q["state"] = state
        if taxonomy is not None: q["taxonomy"] = taxonomy
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/medical/npi", endpoint="medical.npi", query=q)

    def genetics(self, *, term: str) -> CallResult:
        """MedlinePlus Genetics reference for a condition or gene."""
        return self._c.request("GET", "/api/medical/genetics", endpoint="medical.genetics", query={"term": term})


class _Timezone(_Group):
    def lookup(
        self,
        *,
        lat: float,
        lon: float,
        at: Optional[str] = None,
    ) -> CallResult:
        """Resolve a coordinate to its IANA timezone + current local wall time.

        Pure-compute polygon lookup against a CC0 timezone boundary index;
        offsets + DST come from the runtime tzdata so transition rules stay
        current. Args: lat (-90..90), lon (-180..180), at (optional ISO 8601
        instant; defaults to now).
        """
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if at is not None:
            q["at"] = at
        return self._c.request("GET", "/api/timezone/lookup", endpoint="timezone.lookup", query=q)


class _Earth(_Group):
    def now(
        self,
        *,
        lat: float,
        lon: float,
        radius_km: Optional[float] = None,
        hours: Optional[int] = None,
        min_magnitude: Optional[float] = None,
    ) -> CallResult:
        """Composite "what's happening at this place right now" snapshot.

        Server params: lat, lon, radius_km (1-1000, default 500), hours
        (1-168, default 24), min_magnitude (0-10, default 2.0).
        """
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if radius_km is not None:
            q["radius_km"] = radius_km
        if hours is not None:
            q["hours"] = hours
        if min_magnitude is not None:
            q["min_magnitude"] = min_magnitude
        return self._c.request("GET", "/api/earth/now", endpoint="earth.now", query=q)

    def events(
        self,
        *,
        status: str = "open",
        limit: int = 20,
        days: Optional[int] = None,
        category: Optional[str] = None,
        bbox: Optional[str] = None,
    ) -> CallResult:
        """Active and historical global natural events via NASA EONET v3.

        status = open | closed | all. category = drought | dustHaze | earthquakes |
        floods | landslides | manmade | seaLakeIce | severeStorms | snow |
        tempExtremes | volcanoes | waterColor | wildfires. bbox = minLon,maxLat,maxLon,minLat.
        """
        q: dict[str, Any] = {"status": status, "limit": limit}
        if days is not None: q["days"] = days
        if category is not None: q["category"] = category
        if bbox is not None: q["bbox"] = bbox
        return self._c.request("GET", "/api/earth/events", endpoint="earth.events", query=q)


class _Climate(_Group):
    def station_near(
        self,
        *,
        lat: float,
        lon: float,
        radius_km: Optional[float] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """NOAA weather stations near a coordinate.

        Server params: lat, lon, radius_km (1-5000), limit (1-100).
        """
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if radius_km is not None:
            q["radius_km"] = radius_km
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/climate/station-near", endpoint="climate.station-near", query=q)

    def station_history(
        self,
        *,
        station: str,
        start_date: str,
        end_date: str,
        data_types: Optional[str] = None,
    ) -> CallResult:
        """Daily observed weather (NOAA GHCN-Daily) for one station + date range.

        Server params: station (GHCN id, e.g. USW00094728), startDate/endDate
        (YYYY-MM-DD, <=366 days), dataTypes (comma-separated: TMAX,TMIN,TAVG,
        PRCP,SNOW,SNWD,AWND,WSF2,WSF5,EVAP; default TMAX,TMIN,PRCP).
        """
        q: dict[str, Any] = {"station": station, "startDate": start_date, "endDate": end_date}
        if data_types is not None:
            q["dataTypes"] = data_types
        return self._c.request("GET", "/api/climate/station-history", endpoint="climate.station-history", query=q)


class _Stocks(_Group):
    def screener(self, *, concept: str, period: str, unit: str | None = None, op: str | None = None, value: float | None = None, ratioConcept: str | None = None, sort: str | None = None, limit: int | None = None) -> CallResult:
        """Fundamental stock screener over SEC XBRL frames: filter/sort all filers by a concept (or a ratio of two concepts) for a period."""
        query: dict = {"concept": concept, "period": period}
        if unit is not None:
            query["unit"] = unit
        if op is not None:
            query["op"] = op
        if value is not None:
            query["value"] = value
        if ratioConcept is not None:
            query["ratioConcept"] = ratioConcept
        if sort is not None:
            query["sort"] = sort
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/stocks/screener", endpoint="stocks.screener", query=query)

    def metrics(self, *, ticker: str) -> CallResult:
        """Key fundamental metrics and 52-week price statistics for a US-listed company. Pass ticker; returns headline valuation, margin, and per-share figures — P/E, P/B, P/S, PEG, EV/EBITDA, gross/operating/ne"""
        query: dict = {"ticker": ticker}
        return self._c.request("GET", "/api/stocks/metrics", endpoint="stocks.metrics", query=query)

    def peers(self, *, ticker: str, grouping: str | None = None) -> CallResult:
        """Peer companies for a US-listed ticker — other companies in the same sector and sub-industry, useful for comparables, relative valuation, and screening. Pass ticker (optionally grouping to control how """
        query: dict = {"ticker": ticker}
        if grouping is not None:
            query["grouping"] = grouping
        return self._c.request("GET", "/api/stocks/peers", endpoint="stocks.peers", query=query)

    def earnings_surprises(self, *, ticker: str, limit: int | None = None) -> CallResult:
        """Historical quarterly earnings surprises for a US-listed company — reported (actual) EPS vs the analyst consensus estimate, the absolute surprise, and the surprise percentage, for the most recent quart"""
        query: dict = {"ticker": ticker}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/stocks/earnings-surprises", endpoint="stocks.earnings-surprises", query=query)

    def recommendations(self, *, ticker: str) -> CallResult:
        """Analyst recommendation trend for a US-listed company — the number of analysts rating it strong buy, buy, hold, sell, and strong sell, snapshotted per month (newest first). Pass ticker. Use it to see t"""
        query: dict = {"ticker": ticker}
        return self._c.request("GET", "/api/stocks/recommendations", endpoint="stocks.recommendations", query=query)

    def company_news(self, *, ticker: str, from_: str | None = None, to: str | None = None, limit: int | None = None) -> CallResult:
        """Recent news articles about a specific US-listed company. Pass ticker and optionally a from/to date window (YYYY-MM-DD; defaults to the last 14 days); returns headlines with source, summary, URL, image"""
        query: dict = {"ticker": ticker}
        if from_ is not None:
            query["from"] = from_
        if to is not None:
            query["to"] = to
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/stocks/company-news", endpoint="stocks.company-news", query=query)

    def insider_sentiment(self, *, ticker: str, from_: str | None = None, to: str | None = None) -> CallResult:
        """Aggregated insider sentiment for a US-listed company, by month. For each month returns the net change in insider share holdings and Finnhub's MSPR (Monthly Share Purchase Ratio, −100 to +100 — higher """
        query: dict = {"ticker": ticker}
        if from_ is not None:
            query["from"] = from_
        if to is not None:
            query["to"] = to
        return self._c.request("GET", "/api/stocks/insider-sentiment", endpoint="stocks.insider-sentiment", query=query)

    def financials_reported(self, *, ticker: str, freq: str | None = None, limit: int | None = None) -> CallResult:
        """As-reported financial statements for a US-listed company, exactly as filed with the SEC — balance sheet, income statement, and cash-flow statement line items, parsed from each 10-K/10-Q. Pass ticker a"""
        query: dict = {"ticker": ticker}
        if freq is not None:
            query["freq"] = freq
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/stocks/financials-reported", endpoint="stocks.financials-reported", query=query)

    def symbols(self, *, q: str | None = None, exchange: str | None = None, limit: int | None = None) -> CallResult:
        """Search or list the tradable equity symbol universe for an exchange. Pass q to substring-match on symbol or company name (case-insensitive), and/or exchange (default US) and limit. Returns matching lis"""
        query: dict = {}
        if q is not None:
            query["q"] = q
        if exchange is not None:
            query["exchange"] = exchange
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/stocks/symbols", endpoint="stocks.symbols", query=query)

    def lobbying(self, *, ticker: str, from_: str | None = None, to: str | None = None, limit: int | None = None) -> CallResult:
        """US federal lobbying disclosures for a public company (sourced from US Senate LDA filings). Pass ticker and optionally a from/to window (YYYY-MM-DD; defaults to ~3 years); returns each filing with the """
        query: dict = {"ticker": ticker}
        if from_ is not None:
            query["from"] = from_
        if to is not None:
            query["to"] = to
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/stocks/lobbying", endpoint="stocks.lobbying", query=query)

    def gov_spending(self, *, ticker: str, from_: str | None = None, to: str | None = None, limit: int | None = None) -> CallResult:
        """US federal government spending awarded to a public company (sourced from USAspending). Pass ticker and optionally a from/to window (YYYY-MM-DD; defaults to ~2 years); returns each award with the recip"""
        query: dict = {"ticker": ticker}
        if from_ is not None:
            query["from"] = from_
        if to is not None:
            query["to"] = to
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/stocks/gov-spending", endpoint="stocks.gov-spending", query=query)

    def h1b_visas(self, *, ticker: str, from_: str | None = None, to: str | None = None, limit: int | None = None) -> CallResult:
        """US work-visa (H-1B and related) applications filed by a public company, sourced from Department of Labor LCA disclosures. Pass ticker and optionally a from/to window (YYYY-MM-DD; defaults to ~2 years)"""
        query: dict = {"ticker": ticker}
        if from_ is not None:
            query["from"] = from_
        if to is not None:
            query["to"] = to
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/stocks/h1b-visas", endpoint="stocks.h1b-visas", query=query)

    def patents(self, *, ticker: str, from_: str | None = None, to: str | None = None, limit: int | None = None) -> CallResult:
        """USPTO patent activity associated with a public company. Pass ticker and optionally a from/to window (YYYY-MM-DD; defaults to ~2 years); returns each record with the application number, patent number ("""
        query: dict = {"ticker": ticker}
        if from_ is not None:
            query["from"] = from_
        if to is not None:
            query["to"] = to
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/stocks/patents", endpoint="stocks.patents", query=query)

    def quote(self, *, ticker: str) -> CallResult:
        """Latest daily stock quote for a US ticker (Massive / formerly Polygon.io).

        EOD/delayed: OHLCV, VWAP, change vs prior session, company metadata.
        """
        return self._c.request("GET", "/api/stocks/quote", endpoint="stocks.quote", query={"ticker": ticker})


class _Nutrition(_Group):
    def food(
        self,
        *,
        query: Optional[str] = None,
        fdc_id: Optional[int] = None,
        data_type: Optional[str] = None,
        limit: Optional[int] = None,
        page: Optional[int] = None,
    ) -> CallResult:
        """USDA FoodData Central: search foods by name OR fetch one nutrient profile.

        Exactly one of query (search) or fdc_id (detail). data_type filters
        search: Foundation | SR Legacy | Survey (FNDDS) | Branded.
        """
        if (query is None) == (fdc_id is None):
            raise ValueError("food() requires exactly one of query or fdc_id.")
        q: dict[str, Any] = {}
        if query is not None: q["query"] = query
        if fdc_id is not None: q["fdcId"] = fdc_id
        if data_type is not None: q["dataType"] = data_type
        if limit is not None: q["limit"] = limit
        if page is not None: q["page"] = page
        return self._c.request("GET", "/api/nutrition/food", endpoint="nutrition.food", query=q)


class _Tld(_Group):
    def info(
        self,
        *,
        tld: Optional[str] = None,
        domain: Optional[str] = None,
    ) -> CallResult:
        """IANA TLD metadata and/or Public-Suffix-List domain analysis.

        Exactly one of tld ("io") or domain ("shop.example.co.uk"). Domain
        mode returns publicSuffix, registrableDomain, subdomain, matched PSL
        rule, and icann/private section.
        """
        if (tld is None) == (domain is None):
            raise ValueError("info() requires exactly one of tld or domain.")
        q: dict[str, Any] = {}
        if tld is not None: q["tld"] = tld
        if domain is not None: q["domain"] = domain
        return self._c.request("GET", "/api/tld/info", endpoint="tld.info", query=q)


class _Census(_Group):
    def zipcode(self, *, zip: str) -> CallResult:
        return self._c.request("GET", "/api/census/zipcode", endpoint="census.zipcode", query={"zip": zip})

    def demographics(self, *, state: str, county: Optional[str] = None, year: Optional[int] = None) -> CallResult:
        """US Census ACS 5-year demographics for a state or county."""
        q: dict[str, Any] = {"state": state}
        if county is not None: q["county"] = county
        if year is not None: q["year"] = year
        return self._c.request("GET", "/api/census/demographics", endpoint="census.demographics", query=q)


class _Account(_Group):
    def balance(self) -> CallResult:
        return self._c.request("GET", "/api/account/balance", endpoint="account.balance")


class _Agriculture(_Group):
    def drought(self, *, area: str, weeks: Optional[int] = None) -> CallResult:
        """US Drought Monitor severity for a county (5-digit FIPS) or state (2-letter), weekly."""
        query: dict[str, Any] = {"area": area}
        if weeks is not None:
            query["weeks"] = weeks
        return self._c.request("GET", "/api/agriculture/drought", endpoint="agriculture.drought", query=query)

    def stats(self, *, commodity_desc: str, **filters: Any) -> CallResult:
        """USDA NASS QuickStats — crop/livestock yields, acreage, production, prices.

        Requires commodity_desc plus at least one bound (year / year__GE / year__LE /
        state_alpha / agg_level_desc / short_desc). 50k-row cap upstream.
        """
        query: dict[str, Any] = {"commodity_desc": commodity_desc}
        for k, v in filters.items():
            if v is not None:
                query[k] = v
        return self._c.request("GET", "/api/agriculture/stats", endpoint="agriculture.stats", query=query)


class _Soil(_Group):
    def profile(self, *, lat: float, lon: float) -> CallResult:
        """SSURGO soil profile (map unit + ranked components) for a US lat/lng."""
        return self._c.request("GET", "/api/soil/profile", endpoint="soil.profile", query={"lat": lat, "lon": lon})

    def hardiness_zone(self, *, zip: str) -> CallResult:
        """USDA plant hardiness zone for a US ZIP code."""
        return self._c.request("GET", "/api/soil/hardiness-zone", endpoint="soil.hardiness-zone", query={"zip": zip})


class _Telecom(_Group):
    def fcc_filings(self, *, proceeding: str, filer: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """Search FCC ECFS filings for a proceeding/docket."""
        q: dict[str, Any] = {"proceeding": proceeding}
        if filer is not None:
            q["filer"] = filer
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/telecom/fcc-filings", endpoint="telecom.fcc-filings", query=q)

    def market_area(self, *, lat: float, lon: float) -> CallResult:
        """Map a lat/lon to its FCC spectrum market areas (CMA/BTA/MTA/PEA) + census block."""
        return self._c.request("GET", "/api/telecom/market-area", endpoint="telecom.market-area", query={"lat": lat, "lon": lon})


class _Occupation(_Group):
    def profile(self, *, code: str) -> CallResult:
        """Full O*NET occupation dossier (skills/knowledge/abilities/tasks/tech) by SOC/O*NET-SOC code."""
        return self._c.request("GET", "/api/occupation/profile", endpoint="occupation.profile", query={"code": code})

    def search(self, *, keyword: str, limit: Optional[int] = None) -> CallResult:
        """Find O*NET occupations by keyword."""
        q: dict[str, Any] = {"keyword": keyword}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/occupation/search", endpoint="occupation.search", query=q)

    def related(self, *, code: str, limit: Optional[int] = None) -> CallResult:
        """Related/career-adjacent occupations for a code."""
        q: dict[str, Any] = {"code": code}
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/occupation/related", endpoint="occupation.related", query=q)


class _Labor(_Group):
    def wages(self, *, soc: str, state: Optional[str] = None) -> CallResult:
        """BLS OEWS occupational wages by SOC code, nationally or by US state."""
        q: dict[str, Any] = {"soc": soc}
        if state is not None:
            q["state"] = state
        return self._c.request("GET", "/api/labor/wages", endpoint="labor.wages", query=q)

    def openings(self, *, measure: Optional[str] = None, months: Optional[int] = None) -> CallResult:
        """BLS JOLTS turnover (openings/hires/quits/layoffs/separations), national monthly."""
        q: dict[str, Any] = {}
        if measure is not None:
            q["measure"] = measure
        if months is not None:
            q["months"] = months
        return self._c.request("GET", "/api/labor/openings", endpoint="labor.openings", query=q)

    def unemployment(self, *, area: str, measure: Optional[str] = None, months: Optional[int] = None) -> CallResult:
        """BLS unemployment for 'US' or a 2-letter state, monthly."""
        q: dict[str, Any] = {"area": area}
        if measure is not None:
            q["measure"] = measure
        if months is not None:
            q["months"] = months
        return self._c.request("GET", "/api/labor/unemployment", endpoint="labor.unemployment", query=q)


class _Maritime(_Group):
    def vessel(self, *, name: Optional[str] = None, callSign: Optional[str] = None, officialNumber: Optional[str] = None,
               hullNumber: Optional[str] = None, flag: Optional[str] = None, service: Optional[str] = None,
               buildYear: Optional[str] = None, vesselId: Optional[str] = None) -> CallResult:
        """Search the USCG PSIX vessel registry by name/callsign/official number/HIN/flag/etc."""
        q: dict[str, Any] = {}
        for k, v in {"name": name, "callSign": callSign, "officialNumber": officialNumber, "hullNumber": hullNumber,
                     "flag": flag, "service": service, "buildYear": buildYear, "vesselId": vesselId}.items():
            if v is not None:
                q[k] = v
        return self._c.request("GET", "/api/maritime/vessel", endpoint="maritime.vessel", query=q)

    def cases(self, *, vesselId: str) -> CallResult:
        """USCG activity / port-state-control case history for a vessel id."""
        return self._c.request("GET", "/api/maritime/cases", endpoint="maritime.cases", query={"vesselId": vesselId})

    def port(self, *, portName: Optional[str] = None, country: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """NGA World Port Index lookup by port name and/or country.

        Returns ports with location, harbor type, depths, max vessel size, UN/LOCODE.
        Public-domain (NGA). At least one of portName / country required.
        """
        q: dict[str, Any] = {}
        if portName is not None: q["portName"] = portName
        if country is not None: q["country"] = country
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/maritime/port", endpoint="maritime.port", query=q)


class _Music(_Group):
    def recording(self, *, artist: Optional[str] = None, title: Optional[str] = None, query: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """Resolve a recording/song from MusicBrainz (CC0) by artist+title or query."""
        q: dict[str, Any] = {}
        for k, v in {"artist": artist, "title": title, "query": query, "limit": limit}.items():
            if v is not None:
                q[k] = v
        return self._c.request("GET", "/api/music/recording", endpoint="music.recording", query=q)

    def artist(self, *, name: Optional[str] = None, query: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """Resolve an artist from MusicBrainz (CC0) by name or query."""
        q: dict[str, Any] = {}
        for k, v in {"name": name, "query": query, "limit": limit}.items():
            if v is not None:
                q[k] = v
        return self._c.request("GET", "/api/music/artist", endpoint="music.artist", query=q)

    def release(self, *, barcode: Optional[str] = None, artist: Optional[str] = None, album: Optional[str] = None, query: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """Resolve a release/album from MusicBrainz (CC0) by barcode, artist+album, or query."""
        q: dict[str, Any] = {}
        for k, v in {"barcode": barcode, "artist": artist, "album": album, "query": query, "limit": limit}.items():
            if v is not None:
                q[k] = v
        return self._c.request("GET", "/api/music/release", endpoint="music.release", query=q)


class _Batch(_Group):
    def run(self, *, calls: list) -> CallResult:
        """Run up to 50 catalog calls behind one x402 payment.

        Price = sum of the sub-call prices (no discount). Atomic: every sub-call
        must succeed or nothing is charged. Each `calls` item is
        {"endpoint": "<group>.<name>", "params": {...}}. Excludes bearer-only,
        deprecated, variable-priced, and metered-upstream endpoints.
        """
        return self._c.request("POST", "/api/batch/run", endpoint="batch.run", body={"calls": calls})


class _Poi(_Group):
    def near(
        self,
        *,
        lat: float,
        lon: float,
        category: str,
        radius_m: int = 1000,
        limit: int = 20,
    ) -> CallResult:
        """Find points of interest near a coord. OSM-backed via Overpass.

        Categories: see /api/directory for the canonical list (restaurant,
        cafe, hospital, pharmacy, school, etc.).
        """
        return self._c.request(
            "GET", "/api/poi/near", endpoint="poi.near",
            query={
                "lat": lat,
                "lon": lon,
                "category": category,
                "radius_m": radius_m,
                "limit": limit,
            },
        )


class _Barcode(_Group):
    def generate(
        self,
        *,
        data: dict,
        format: Optional[str] = None,
    ) -> CallResult:
        """Generate barcode/QR. Returns raw image bytes in ``result.data``.

        ``data`` is the server's nested payload, e.g.
        ``{"type": "url", "url": "https://..."}`` or
        ``{"type": "text", "text": "..."}``.
        """
        body: dict[str, Any] = {"data": data}
        if format is not None:
            body["format"] = format
        return self._c.request(
            "POST", "/api/barcode/generate",
            endpoint="barcode.generate",
            body=body,
        )


class _Countdown(_Group):
    def gif(
        self,
        *,
        end_date: str,
        template: Optional[str] = None,
        seconds: Optional[int] = None,
        fps: Optional[int] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        **extra: Any,
    ) -> CallResult:
        """Animated countdown GIF.

        Server params: endDate (ISO-8601 UTC datetime, REQUIRED), plus many
        optional style controls (template, seconds, fps, width, height,
        labels, colors, fonts). Returns raw GIF bytes in ``result.data``.
        Pass any additional style params via kwargs and they'll be forwarded
        verbatim — see /api/openapi for the full schema.
        """
        q: dict[str, Any] = {"endDate": end_date}
        if template is not None:
            q["template"] = template
        if seconds is not None:
            q["seconds"] = seconds
        if fps is not None:
            q["fps"] = fps
        if width is not None:
            q["width"] = width
        if height is not None:
            q["height"] = height
        q.update(extra)
        return self._c.request(
            "GET", "/api/countdown/gif",
            endpoint="countdown.gif",
            query=q,
        )


class _Image(_Group):
    def compress(
        self,
        *,
        url: Optional[str] = None,
        image_base64: Optional[str] = None,
        format: Optional[str] = None,
        quality: Optional[int] = None,
        lossy: Optional[bool] = None,
        effort: Optional[int] = None,
    ) -> CallResult:
        """Compress an image. Returns compressed bytes in ``result.data``.

        Server requires exactly one of url or imageBase64. Optional:
        format (auto|png|jpeg|webp|avif), quality (1-100), lossy (bool),
        effort (1-10).
        """
        if (url is None) == (image_base64 is None):
            raise ValueError("image.compress requires exactly one of url= or image_base64=.")
        body: dict[str, Any] = {}
        if url is not None:
            body["url"] = url
        if image_base64 is not None:
            body["imageBase64"] = image_base64
        if format is not None:
            body["format"] = format
        if quality is not None:
            body["quality"] = quality
        if lossy is not None:
            body["lossy"] = lossy
        if effort is not None:
            body["effort"] = effort
        return self._c.request(
            "POST", "/api/image/compress",
            endpoint="image.compress",
            body=body,
        )


class _Phone(_Group):
    def normalize(self, *, phone: str, default_region: Optional[str] = None) -> CallResult:
        """E.164-normalize and classify a phone number via libphonenumber."""
        q: dict[str, Any] = {"phone": phone}
        if default_region is not None:
            q["defaultRegion"] = default_region
        return self._c.request("GET", "/api/phone/normalize", endpoint="phone.normalize", query=q)



class _Bio(_Group):
    def species(self, *, name: str) -> CallResult:
        """Resolve a species to the GBIF taxonomic backbone. Server param: name."""
        return self._c.request("GET", "/api/bio/species", endpoint="bio.species", query={"name": name})

    def gene(self, *, symbol: str, taxid: Optional[int] = None) -> CallResult:
        """Gene identity (NCBI) + reviewed protein (UniProt). Server params: symbol, taxid (default 9606)."""
        q: dict[str, Any] = {"symbol": symbol}
        if taxid is not None:
            q["taxid"] = taxid
        return self._c.request("GET", "/api/bio/gene", endpoint="bio.gene", query=q)

    def protein(self, *, accession: str) -> CallResult:
        """Full UniProtKB protein entry by accession. Param: accession."""
        return self._c.request("GET", "/api/bio/protein", endpoint="bio.protein", query={"accession": accession})


class _Space(_Group):
    def weather(self) -> CallResult:
        """Current NOAA space-weather snapshot (Kp index, solar flux, aurora)."""
        return self._c.request("GET", "/api/space/weather", endpoint="space.weather")

    def body(self, *, q: str) -> CallResult:
        """Asteroid/comet physical + orbital params from JPL Small-Body Database. Server param: q."""
        return self._c.request("GET", "/api/space/body", endpoint="space.body", query={"q": q})

    def close_approaches(
        self, *, date_min: Optional[str] = None, date_max: Optional[str] = None,
        dist_max_au: Optional[float] = None, limit: Optional[int] = None,
    ) -> CallResult:
        """Near-Earth-object close approaches (JPL CAD). Server params: dateMin, dateMax, distMaxAu, limit."""
        q: dict[str, Any] = {}
        if date_min is not None: q["dateMin"] = date_min
        if date_max is not None: q["dateMax"] = date_max
        if dist_max_au is not None: q["distMaxAu"] = dist_max_au
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/space/close-approaches", endpoint="space.close-approaches", query=q)

    def satellite(
        self, *, norad_id: int, lat: Optional[float] = None, lon: Optional[float] = None,
        alt_km: Optional[float] = None, at: Optional[str] = None,
    ) -> CallResult:
        """Current satellite position via Celestrak + SGP4. Server params: noradId, lat, lon, altKm, at."""
        q: dict[str, Any] = {"noradId": norad_id}
        if lat is not None: q["lat"] = lat
        if lon is not None: q["lon"] = lon
        if alt_km is not None: q["altKm"] = alt_km
        if at is not None: q["at"] = at
        return self._c.request("GET", "/api/space/satellite", endpoint="space.satellite", query=q)

    def satellites(
        self, *, q: Optional[str] = None, owner: Optional[str] = None, type: Optional[str] = None,
        norad_id: Optional[int] = None, intl_designator: Optional[str] = None,
        launch_year_from: Optional[int] = None, launch_year_to: Optional[int] = None,
        on_orbit: Optional[bool] = None, limit: Optional[int] = None, offset: Optional[int] = None,
    ) -> CallResult:
        """Search the satellite catalog (SATCAT, ~69k objects). Filter by q (name), owner
        (US/PRC/CIS… or a name), type (payload|rocket body|debris|unknown), launch-year range,
        intl_designator prefix, on_orbit, or norad_id. The envelope total is the full count
        matching — so on_orbit=True, type='payload' answers 'how many active satellites'."""
        params: dict[str, Any] = {}
        if q is not None: params["q"] = q
        if owner is not None: params["owner"] = owner
        if type is not None: params["type"] = type
        if norad_id is not None: params["noradId"] = norad_id
        if intl_designator is not None: params["intlDesignator"] = intl_designator
        if launch_year_from is not None: params["launchYearFrom"] = launch_year_from
        if launch_year_to is not None: params["launchYearTo"] = launch_year_to
        if on_orbit is not None: params["onOrbit"] = "true" if on_orbit else "false"
        if limit is not None: params["limit"] = limit
        if offset is not None: params["offset"] = offset
        return self._c.request("GET", "/api/space/satellites", endpoint="space.satellites", query=params)

    def launches(
        self, *, when: Optional[str] = None, search: Optional[str] = None,
        limit: Optional[int] = None, offset: Optional[int] = None,
    ) -> CallResult:
        """Upcoming/recent orbital launches (Launch Library 2). Server params: when, search, limit, offset."""
        q: dict[str, Any] = {}
        if when is not None: q["when"] = when
        if search is not None: q["search"] = search
        if limit is not None: q["limit"] = limit
        if offset is not None: q["offset"] = offset
        return self._c.request("GET", "/api/space/launches", endpoint="space.launches", query=q)

    def sky_tonight(
        self, *, lat: float, lon: float, altitude_m: Optional[float] = None, at: Optional[str] = None,
    ) -> CallResult:
        """Observer-local sky almanac (computed). Server params: lat, lon, altitudeM, at."""
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if altitude_m is not None: q["altitudeM"] = altitude_m
        if at is not None: q["at"] = at
        return self._c.request("GET", "/api/space/sky-tonight", endpoint="space.sky-tonight", query=q)

    def exoplanet(
        self, *, name: Optional[str] = None, host_star: Optional[str] = None,
        discovery_year: Optional[int] = None, method: Optional[str] = None, limit: Optional[int] = None,
    ) -> CallResult:
        """Confirmed exoplanets (NASA Exoplanet Archive). Server params: name, hostStar, discoveryYear, method, limit."""
        q: dict[str, Any] = {}
        if name is not None: q["name"] = name
        if host_star is not None: q["hostStar"] = host_star
        if discovery_year is not None: q["discoveryYear"] = discovery_year
        if method is not None: q["method"] = method
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/space/exoplanet", endpoint="space.exoplanet", query=q)

    def skywatch(self, *, lat: float, lon: float, altitude_m: Optional[float] = None) -> CallResult:
        """Synthesis: what's notable in your sky now — almanac + close approaches + ISS. Params: lat, lon, altitudeM."""
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if altitude_m is not None:
            q["altitudeM"] = altitude_m
        return self._c.request("GET", "/api/space/skywatch", endpoint="space.skywatch", query=q)

    def system(self, *, host_star: str) -> CallResult:
        """Synthesis: a host star's planetary system + computed habitable zone. Param: hostStar."""
        return self._c.request("GET", "/api/space/system", endpoint="space.system", query={"hostStar": host_star})

    def observe(
        self, *, body: str, lat: Optional[float] = None, lon: Optional[float] = None,
        alt_km: Optional[float] = None, at: Optional[str] = None,
    ) -> CallResult:
        """Asteroid/comet sky position + observability (computed). Params: body, lat, lon, altKm, at."""
        q: dict[str, Any] = {"body": body}
        if lat is not None: q["lat"] = lat
        if lon is not None: q["lon"] = lon
        if alt_km is not None: q["altKm"] = alt_km
        if at is not None: q["at"] = at
        return self._c.request("GET", "/api/space/observe", endpoint="space.observe", query=q)


class _Vehicle(_Group):
    def fuel_economy(self, *, year: int, make: str, model: str) -> CallResult:
        """EPA/DOE fuel-economy, fuel-cost, and emissions by year/make/model (one entry
        per powertrain config: MPG city/hwy/combined, CO2 g/mi, annual fuel cost, …)."""
        return self._c.request("GET", "/api/vehicle/fuel-economy", endpoint="vehicle.fuel-economy", query={"year": year, "make": make, "model": model})

    def canadian_specs(self, *, year: int, make: str, model: str | None = None) -> CallResult:
        """NHTSA vPIC Canadian Vehicle Specifications — dimensions/weights by year/make(/model)."""
        q: dict = {"year": year, "make": make}
        if model is not None:
            q["model"] = model
        return self._c.request("GET", "/api/vehicle/canadian-specs", endpoint="vehicle.canadian-specs", query=q)

    def profile(
        self,
        *,
        vin: str,
        model_year: Optional[int] = None,
    ) -> CallResult:
        """Vehicle 360 by VIN — decode + this vehicle's recalls + complaints, merged.

        Server params: vin (17 chars), modelYear.
        """
        q: dict[str, Any] = {"vin": vin}
        if model_year is not None:
            q["modelYear"] = model_year
        return self._c.request("GET", "/api/vehicle/profile", endpoint="vehicle.profile", query=q)

    def vin_decode(self, *, vin: str, model_year: Optional[int] = None) -> CallResult:
        """Decode a 17-char VIN via NHTSA vPIC."""
        q: dict[str, Any] = {"vin": vin}
        if model_year is not None:
            q["modelYear"] = model_year
        return self._c.request("GET", "/api/vehicle/vin-decode", endpoint="vehicle.vin-decode", query=q)

    def recalls(
        self,
        *,
        vin: Optional[str] = None,
        make: Optional[str] = None,
        model: Optional[str] = None,
        model_year: Optional[int] = None,
        nhtsa_id: Optional[str] = None,
    ) -> CallResult:
        """NHTSA recall lookup. Supply VIN, or make/model/year, or campaign ID."""
        q: dict[str, Any] = {}
        if vin is not None: q["vin"] = vin
        if make is not None: q["make"] = make
        if model is not None: q["model"] = model
        if model_year is not None: q["modelYear"] = model_year
        if nhtsa_id is not None: q["nhtsaId"] = nhtsa_id
        return self._c.request("GET", "/api/vehicle/recalls", endpoint="vehicle.recalls", query=q)

    def complaints(
        self,
        *,
        make: Optional[str] = None,
        model: Optional[str] = None,
        model_year: Optional[int] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> CallResult:
        """NHTSA consumer complaints by make/model/year."""
        q: dict[str, Any] = {"limit": limit, "offset": offset}
        if make is not None: q["make"] = make
        if model is not None: q["model"] = model
        if model_year is not None: q["modelYear"] = model_year
        return self._c.request("GET", "/api/vehicle/complaints", endpoint="vehicle.complaints", query=q)

    def investigations(self, *, limit: int = 20, offset: int = 0) -> CallResult:
        """NHTSA open investigations (newest first)."""
        return self._c.request(
            "GET", "/api/vehicle/investigations", endpoint="vehicle.investigations",
            query={"limit": limit, "offset": offset},
        )

    def safety_ratings(self, *, make: str, model: str, model_year: int) -> CallResult:
        """NHTSA NCAP 5-Star crash-test ratings by make/model/year."""
        return self._c.request(
            "GET", "/api/vehicle/safety-ratings", endpoint="vehicle.safety-ratings",
            query={"make": make, "model": model, "modelYear": model_year},
        )


    def models(self, *, make: str, model_year: int) -> CallResult:
        """List all models offered by a make in a given model year (vPIC)."""
        return self._c.request(
            "GET", "/api/vehicle/models", endpoint="vehicle.models",
            query={"make": make, "modelYear": model_year},
        )

    def decode_wmi(self, *, wmi: str) -> CallResult:
        """Decode a 3-character World Manufacturer Identifier."""
        return self._c.request(
            "GET", "/api/vehicle/decode-wmi", endpoint="vehicle.decode-wmi",
            query={"wmi": wmi},
        )

    def manufacturers(self, *, page: int = 1) -> CallResult:
        """Paginated NHTSA manufacturer list."""
        return self._c.request(
            "GET", "/api/vehicle/manufacturers", endpoint="vehicle.manufacturers",
            query={"page": page},
        )




class _Html(_Group):
    def to_markdown(self, *, html: str) -> CallResult:
        """Convert supplied HTML to clean reading markdown (no fetch). Param: html."""
        return self._c.request("POST", "/api/html/to-markdown", endpoint="html.to-markdown", body={"html": html})


class _Tls(_Group):
    def cert_info(self, *, host: str, port: Optional[int] = None) -> CallResult:
        """Live TLS handshake -> server certificate detail. Params: host, port."""
        q: dict[str, Any] = {"host": host}
        if port is not None:
            q["port"] = port
        return self._c.request("GET", "/api/tls/cert-info", endpoint="tls.cert-info", query=q)


class _Business(_Group):
    def id_resolve(self, *, name: str | None = None, lei: str | None = None, cik: str | None = None, ticker: str | None = None) -> CallResult:
        """Company legal-entity resolver: give one of name, lei, cik, or ticker → LEI, CIK, ticker(s), jurisdiction, canonical name (SEC + GLEIF)."""
        query: dict = {}
        if name is not None:
            query["name"] = name
        if lei is not None:
            query["lei"] = lei
        if cik is not None:
            query["cik"] = cik
        if ticker is not None:
            query["ticker"] = ticker
        return self._c.request("GET", "/api/business/id-resolve", endpoint="business.id-resolve", query=query)

    def fi_companies(self, *, name: str, limit: int | None = None) -> CallResult:
        """Official Finnish company registry search (PRH/YTJ avoindata, Finnish Patent & Registration Office). Search by company name. Each result: Business ID (Y-tunnus), current name, company form, trade-regis"""
        query: dict = {"name": name}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/business/fi-companies", endpoint="business.fi-companies", query=query)

    def fr_companies(self, *, q: str, limit: int | None = None) -> CallResult:
        """Official French company registry search (annuaire des entreprises / data.gouv.fr). Search by company name, SIREN, SIRET, or director. Each result: SIREN, legal name, legal-form code, primary NAF activ"""
        query: dict = {"q": q}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/business/fr-companies", endpoint="business.fr-companies", query=query)

    def lei_hierarchy(self, *, lei: str, childLimit: int | None = None) -> CallResult:
        """Corporate ownership graph for a legal entity by LEI (GLEIF Level-2 relationships, live). Returns the direct parent and ultimate parent (each: LEI, legal name, jurisdiction, country, status), the direc"""
        query: dict = {"lei": lei}
        if childLimit is not None:
            query["childLimit"] = childLimit
        return self._c.request("GET", "/api/business/lei-hierarchy", endpoint="business.lei-hierarchy", query=query)

    def lei_isins(self, *, lei: str | None = None, isin: str | None = None, limit: int | None = None) -> CallResult:
        """ISIN ↔ LEI mapping (GLEIF, live, CC0). Two modes: pass lei to list every ISIN (security identifier) issued by that entity; or pass isin to resolve the issuer's LEI (with legal name, jurisdiction, coun"""
        query: dict = {}
        if lei is not None:
            query["lei"] = lei
        if isin is not None:
            query["isin"] = isin
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/business/lei-isins", endpoint="business.lei-isins", query=query)

    def no_companies(self, *, name: str, limit: int | None = None) -> CallResult:
        """Official Norwegian company registry search (Brønnøysund Enhetsregisteret). Search by company name. Each result: organisation number, name, organisation form, primary industry (NACE), employee count, r"""
        query: dict = {"name": name}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/business/no-companies", endpoint="business.no-companies", query=query)

    def pl_krs(self, *, krs: str, register: str | None = None) -> CallResult:
        """Official Polish company registry lookup by KRS number (KRS — Ministry of Justice, current extract / OdpisAktualny). Returns legal name, legal form, NIP and REGON identifiers, KRS registration date, sh"""
        query: dict = {"krs": krs}
        if register is not None:
            query["register"] = register
        return self._c.request("GET", "/api/business/pl-krs", endpoint="business.pl-krs", query=query)


    def entity_screen(
        self, *, state: str, name: Optional[str] = None, entity_id: Optional[str] = None,
        threshold: Optional[float] = None, limit: Optional[int] = None,
    ) -> CallResult:
        """Registry lookup + OFAC sanctions screen of entity + agent. Params: state, name, entityId, threshold, limit."""
        q: dict[str, Any] = {"state": state}
        if name is not None: q["name"] = name
        if entity_id is not None: q["entityId"] = entity_id
        if threshold is not None: q["threshold"] = threshold
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/business/entity-screen", endpoint="business.entity-screen", query=q)

    def sos_search(
        self,
        *,
        state: str,
        name: Optional[str] = None,
        entity_id: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """State Secretary-of-State business registry search (NY, CO), normalized.

        Server params: state, name, entityId, limit, offset.
        """
        q: dict[str, Any] = {"state": state}
        if name is not None:
            q["name"] = name
        if entity_id is not None:
            q["entityId"] = entity_id
        if limit is not None:
            q["limit"] = limit
        if offset is not None:
            q["offset"] = offset
        return self._c.request("GET", "/api/business/sos-search", endpoint="business.sos-search", query=q)

    def br_cnpj(self, *, cnpj: str) -> CallResult:
        """Brazilian company registry lookup by CNPJ."""
        return self._c.request("GET", "/api/business/br-cnpj", endpoint="business.br-cnpj", query={"cnpj": cnpj})

    def uk_companies(self, *, query: Optional[str] = None, company_number: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """UK Companies House: name search OR companyNumber -> profile + officers."""
        q: dict[str, Any] = {}
        if query is not None: q["query"] = query
        if company_number is not None: q["companyNumber"] = company_number
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/business/uk-companies", endpoint="business.uk-companies", query=q)

    def entity_profile(
        self,
        *,
        state: str,
        entity_id: Optional[str] = None,
        account_number: Optional[str] = None,
        name: Optional[str] = None,
        filings_limit: Optional[int] = None,
    ) -> CallResult:
        """Full business-entity dossier (v1: CT) — master + officers + registered agent + filings.

        Resolve by entity_id, account_number, or name. Server params:
        state, entityId, accountNumber, name, filingsLimit.
        """
        if entity_id is None and account_number is None and name is None:
            raise ValueError("entity_profile() requires one of entity_id, account_number, or name.")
        q: dict[str, Any] = {"state": state}
        if entity_id is not None:
            q["entityId"] = entity_id
        if account_number is not None:
            q["accountNumber"] = account_number
        if name is not None:
            q["name"] = name
        if filings_limit is not None:
            q["filingsLimit"] = filings_limit
        return self._c.request("GET", "/api/business/entity-profile", endpoint="business.entity-profile", query=q)

    def naics(
        self,
        *,
        code: Optional[str] = None,
        query: Optional[str] = None,
        level: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """NAICS 2022 industry-code lookup or free-text industry search (US Census).

        Server params: code (exact 2-6 digit code or sector range like 31-33, XOR with query),
        query (free-text search), level (2=sector ... 6=national industry, search mode), limit.
        """
        q: dict[str, Any] = {}
        if code is not None:
            q["code"] = code
        if query is not None:
            q["query"] = query
        if level is not None:
            q["level"] = level
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/business/naics", endpoint="business.naics", query=q)

    def lei(
        self,
        *,
        lei: Optional[str] = None,
        query: Optional[str] = None,
        country: Optional[str] = None,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """GLEIF Legal Entity Identifier registry lookup or name search (ISO 17442, ~2.6M entities).

        Server params: lei (exact 20-char LEI, XOR with query), query (free-text legal/other
        name search), country (HQ ISO 2-letter filter), status (active|all), limit, offset.
        Returns LEI, legal name, jurisdiction, category, legal form, status, HQ address, dates.
        """
        q: dict[str, Any] = {}
        if lei is not None:
            q["lei"] = lei
        if query is not None:
            q["query"] = query
        if country is not None:
            q["country"] = country
        if status is not None:
            q["status"] = status
        if limit is not None:
            q["limit"] = limit
        if offset is not None:
            q["offset"] = offset
        return self._c.request("GET", "/api/business/lei", endpoint="business.lei", query=q)

    def entity_match(
        self,
        *,
        name: str,
        country: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Fuzzy-resolve a messy company name to its canonical GLEIF LEI with a
        similarity score + high/medium/low confidence (KYB / record linkage).

        Tolerant of legal-suffix noise, word order, ampersands, punctuation, and
        former/alternate names. Returns ranked candidates + a meta.bestMatch
        (null below medium confidence). Optional country = ISO-2 HQ filter.
        """
        q: dict[str, Any] = {"name": name}
        if country is not None:
            q["country"] = country
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/business/entity-match", endpoint="business.entity-match", query=q)

    def kyb_360(
        self,
        *,
        name: str,
        state: Optional[str] = None,
        ticker: Optional[str] = None,
        threshold: Optional[float] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Full company KYB dossier: SAM registration/exclusions, OFAC sanctions,
        GLEIF LEI, USAspending awards, FARA, USPTO trademarks (+ SEC EDGAR if
        ticker). Returns riskFlags + cleared (debarment+sanctions) + per-source
        blocks. Probabilistic name match — verify with a hard id before acting."""
        q: dict[str, Any] = {"name": name}
        if state is not None:
            q["state"] = state
        if ticker is not None:
            q["ticker"] = ticker
        if threshold is not None:
            q["threshold"] = threshold
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/business/kyb-360", endpoint="business.kyb-360", query=q)


class _Net(_Group):
    def ip_resolve(self, *, ip: str) -> CallResult:
        """Resolve an IP to its ASN, holder org, RIR allocation block, ISP, and geo in one call."""
        query: dict = {"ip": ip}
        return self._c.request("GET", "/api/net/ip-resolve", endpoint="net.ip-resolve", query=query)

    def asn(self, *, asn: str) -> CallResult:
        """Autonomous System (BGP) intelligence by AS number (e.g. "AS3333").

        Returns the AS holder, allocation block, announced status, and live
        routing: announced prefixes/IPs, RIS peer visibility, neighbour count.
        RIPEstat (RIPE NCC), free.
        """
        return self._c.request("GET", "/api/net/asn", endpoint="net.asn", query={"asn": asn})

    def mac_vendor(self, *, mac: str) -> CallResult:
        """Resolve a MAC address or OUI prefix to its IEEE-registered vendor.

        Accepts any format (FC:FB:FB:01:02:03, fcfbfb, a 9-hex MA-S prefix, …).
        Longest-prefix match across the IEEE MA-L/MA-M/MA-S registries; also
        decodes multicast / locally-administered / randomized-privacy bits.
        Bundled authoritative IEEE data, free.
        """
        return self._c.request("GET", "/api/net/mac-vendor", endpoint="net.mac-vendor", query={"mac": mac})

    def rpki_validity(self, *, asn: str, prefix: str) -> CallResult:
        """RPKI route-origin validation for an (ASN, prefix) pair — valid/invalid/unknown
        BGP-hijack signal (RIPEstat). asn=AS15169, prefix=8.8.8.0/24."""
        return self._c.request("GET", "/api/net/rpki-validity", endpoint="net.rpki-validity", query={"asn": asn, "prefix": prefix})


class _Product(_Group):
    def gtin(self, *, gtin: str, identity: Optional[bool] = None) -> CallResult:
        """Decode/validate a UPC/EAN/GTIN/ISBN barcode + fresh best-effort product identity."""
        q: dict[str, Any] = {"gtin": gtin}
        if identity is not None:
            q["identity"] = identity
        return self._c.request("GET", "/api/product/gtin", endpoint="product.gtin", query=q)


class _Research(_Group):
    def org(
        self,
        *,
        id: Optional[str] = None,
        name: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Resolve a research organization via ROR (id or name). Free, CC0."""
        if id is None and name is None:
            raise ValueError("org() requires id or name.")
        q: dict[str, Any] = {}
        if id is not None: q["id"] = id
        if name is not None: q["name"] = name
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/research/org", endpoint="research.org", query=q)

    def author(self, *, orcid: str, works_limit: Optional[int] = None) -> CallResult:
        """ORCID researcher profile by iD: name, affiliations, works. Free."""
        q: dict[str, Any] = {"orcid": orcid}
        if works_limit is not None: q["worksLimit"] = works_limit
        return self._c.request("GET", "/api/research/author", endpoint="research.author", query=q)

    def funding(
        self,
        *,
        term: Optional[str] = None,
        org: Optional[str] = None,
        pi: Optional[str] = None,
        fiscal_year: Optional[int] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """NIH RePORTER federal grant search by term/org/pi/fiscal_year. Free."""
        if term is None and org is None and pi is None and fiscal_year is None:
            raise ValueError("funding() requires at least one of term, org, pi, or fiscal_year.")
        q: dict[str, Any] = {}
        if term is not None: q["term"] = term
        if org is not None: q["org"] = org
        if pi is not None: q["pi"] = pi
        if fiscal_year is not None: q["fiscalYear"] = fiscal_year
        if limit is not None: q["limit"] = limit
        if offset is not None: q["offset"] = offset
        return self._c.request("GET", "/api/research/funding", endpoint="research.funding", query=q)


class _Gov(_Group):
    def fair_market_rent(self, *, fips: str | None = None, state: str | None = None, year: str | None = None) -> CallResult:
        """HUD Fair Market Rents by area (Efficiency–4BR). Pass a 5-digit county FIPS or a 2-letter state, optional year."""
        query: dict = {}
        if fips is not None:
            query["fips"] = fips
        if state is not None:
            query["state"] = state
        if year is not None:
            query["year"] = year
        return self._c.request("GET", "/api/gov/fair-market-rent", endpoint="gov.fair-market-rent", query=query)

    def income_limits(self, *, fips: str | None = None, state: str | None = None, year: str | None = None) -> CallResult:
        """HUD income limits (median income + extremely-low/very-low/low thresholds by household size). Pass a 5-digit county FIPS or 2-letter state, optional year."""
        query: dict = {}
        if fips is not None:
            query["fips"] = fips
        if state is not None:
            query["state"] = state
        if year is not None:
            query["year"] = year
        return self._c.request("GET", "/api/gov/income-limits", endpoint="gov.income-limits", query=query)

    def contract_opportunities(
        self,
        *,
        posted_from: str,
        posted_to: str,
        title: Optional[str] = None,
        naics: Optional[str] = None,
        state: Optional[str] = None,
        set_aside: Optional[str] = None,
        ptype: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """Active US federal contract opportunities (SAM.gov).

        Requires posted_from + posted_to (MM/DD/YYYY, <=1yr span). Optional
        title/naics/state/set_aside/ptype filters. Distinct from
        usaspending_awards (past awards) — this is what is OPEN to bid now.
        """
        q: dict[str, Any] = {"postedFrom": posted_from, "postedTo": posted_to}
        if title is not None: q["title"] = title
        if naics is not None: q["naics"] = naics
        if state is not None: q["state"] = state
        if set_aside is not None: q["setAside"] = set_aside
        if ptype is not None: q["ptype"] = ptype
        if limit is not None: q["limit"] = limit
        if offset is not None: q["offset"] = offset
        return self._c.request("GET", "/api/gov/contract-opportunities", endpoint="gov.contract-opportunities", query=q)

    def entity(
        self,
        *,
        legal_business_name: Optional[str] = None,
        uei_sam: Optional[str] = None,
        cage_code: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """SAM.gov registered-entity lookup by UEI / CAGE / legal business name."""
        if legal_business_name is None and uei_sam is None and cage_code is None:
            raise ValueError("entity() requires one of legal_business_name, uei_sam, or cage_code.")
        q: dict[str, Any] = {}
        if legal_business_name is not None: q["legalBusinessName"] = legal_business_name
        if uei_sam is not None: q["ueiSAM"] = uei_sam
        if cage_code is not None: q["cageCode"] = cage_code
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/entity", endpoint="gov.entity", query=q)

    def exclusions(
        self,
        *,
        name: Optional[str] = None,
        uei_sam: Optional[str] = None,
        cage_code: Optional[str] = None,
        classification_type: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """SAM.gov federal exclusions (debarment/suspension) check.

        Search by name / uei_sam / cage_code. Distinct from
        law.sanctions_check (OFAC) — this is federal procurement debarment.
        """
        if name is None and uei_sam is None and cage_code is None:
            raise ValueError("exclusions() requires one of name, uei_sam, or cage_code.")
        q: dict[str, Any] = {}
        if name is not None: q["name"] = name
        if uei_sam is not None: q["ueiSAM"] = uei_sam
        if cage_code is not None: q["cageCode"] = cage_code
        if classification_type is not None: q["classificationType"] = classification_type
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/exclusions", endpoint="gov.exclusions", query=q)

    def counterparty(
        self,
        *,
        name: str,
        state: Optional[str] = None,
        threshold: Optional[float] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Federal counterparty due-diligence dossier on one name.

        Composes SAM registration + SAM exclusions + OFAC sanctions + GLEIF
        LEI + USAspending awards. Returns riskFlags, a cleared boolean, a
        summary, and per-source found/error blocks.
        """
        q: dict[str, Any] = {"name": name}
        if state is not None: q["state"] = state
        if threshold is not None: q["threshold"] = threshold
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/counterparty", endpoint="gov.counterparty", query=q)

    def foreign_agents(self, *, name: str, limit: Optional[int] = None) -> CallResult:
        """Search active FARA (Foreign Agents Registration Act) registrants by name.

        Returns isRegisteredForeignAgent, a KYB-safe bestMatch (null below
        medium confidence), and scored candidates with registration number,
        date, and city/state. DOJ FARA eFile, free and keyless.
        """
        q: dict[str, Any] = {"name": name}
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/foreign-agents", endpoint="gov.foreign-agents", query=q)

    def risk_index(
        self,
        *,
        county_fips: Optional[str] = None,
        state: Optional[str] = None,
        county: Optional[str] = None,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
    ) -> CallResult:
        """FEMA National Risk Index for a US county.

        Look up by county_fips (5-digit STCOFIPS), state + county name, or a
        lat/lon point. Returns the composite Risk Index + component scores +
        per-hazard ratings for all 18 natural hazards. Free, public-domain.
        """
        q: dict[str, Any] = {}
        if county_fips is not None: q["countyFips"] = county_fips
        if state is not None: q["state"] = state
        if county is not None: q["county"] = county
        if lat is not None: q["lat"] = lat
        if lon is not None: q["lon"] = lon
        return self._c.request("GET", "/api/gov/risk-index", endpoint="gov.risk-index", query=q)

    def fcc_id(self, *, fcc_id: str) -> CallResult:
        """Resolve an FCC ID to its grantee/manufacturer.

        Pass any FCC ID form (BCG-E3217A, BCGE3217A). Returns the grantee code,
        product code, and grantee company (name, location, registration date)
        via the FCC EAS open dataset. Free, keyless.
        """
        return self._c.request("GET", "/api/gov/fcc-id", endpoint="gov.fcc-id", query={"fccId": fcc_id})

    def nfip_claims(
        self,
        *,
        state: str,
        county: Optional[str] = None,
        zip: Optional[str] = None,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """FEMA NFIP flood-insurance claims history for a US location.

        Requires state (2-letter); narrow by county FIPS / zip / year-of-loss
        range. Returns total match count + recent redacted claims (net payouts,
        flood zone, cause, water depth). FEMA redacts city. Public-domain (OpenFEMA).
        """
        q: dict[str, Any] = {"state": state}
        if county is not None: q["county"] = county
        if zip is not None: q["zip"] = zip
        if year_from is not None: q["yearFrom"] = year_from
        if year_to is not None: q["yearTo"] = year_to
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/nfip-claims", endpoint="gov.nfip-claims", query=q)

    def hazard_mitigation(
        self,
        *,
        state: Optional[str] = None,
        disaster_number: Optional[int] = None,
        program_fy: Optional[int] = None,
        program_area: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """FEMA Hazard Mitigation Assistance (HMA) funded projects.

        Pre/post-disaster mitigation grants (HMGP, BRIC/PDM, FMA). At least one
        filter required: state (2-letter), disaster_number, program_fy, program_area.
        Returns total match count + projects (federal share, benefit-cost ratio,
        project type, recipient). Public-domain (OpenFEMA).
        """
        q: dict[str, Any] = {}
        if state is not None: q["state"] = state
        if disaster_number is not None: q["disasterNumber"] = disaster_number
        if program_fy is not None: q["programFy"] = program_fy
        if program_area is not None: q["programArea"] = program_area
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/hazard-mitigation", endpoint="gov.hazard-mitigation", query=q)

    def public_assistance(
        self,
        *,
        state: Optional[str] = None,
        disaster_number: Optional[int] = None,
        incident_type: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """FEMA Public Assistance (PA) funded project details.

        Post-disaster infrastructure-recovery grants. Provide state and/or
        disaster_number (one required); optionally refine by incident_type.
        Returns total match count + projects (federal share, damage category,
        applicant, county). Public-domain (OpenFEMA).
        """
        q: dict[str, Any] = {}
        if state is not None: q["state"] = state
        if disaster_number is not None: q["disasterNumber"] = disaster_number
        if incident_type is not None: q["incidentType"] = incident_type
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/public-assistance", endpoint="gov.public-assistance", query=q)

    def fec(self, *, name: Optional[str] = None, candidate_id: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """FEC federal campaign finance.

        name → candidate search (identity). candidate_id → financial totals
        (receipts, disbursements, cash on hand, contributions). Public-domain (FEC).
        """
        q: dict[str, Any] = {}
        if name is not None: q["name"] = name
        if candidate_id is not None: q["candidateId"] = candidate_id
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/fec", endpoint="gov.fec", query=q)

    def usajobs(self, *, keyword: Optional[str] = None, location: Optional[str] = None,
                organization: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """Open US federal job postings (USAJOBS).

        Filter by keyword / location / organization (at least one). Returns title,
        agency, location, salary, grade, close date, apply link. Public-domain (OPM).
        """
        q: dict[str, Any] = {}
        if keyword is not None: q["keyword"] = keyword
        if location is not None: q["location"] = location
        if organization is not None: q["organization"] = organization
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/usajobs", endpoint="gov.usajobs", query=q)

    def uk_crime(self, *, lat: float, lng: float, month: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """UK street-level crime around a lat/lng (+optional month)."""
        q: dict[str, Any] = {"lat": lat, "lng": lng}
        if month is not None: q["month"] = month
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/uk-crime", endpoint="gov.uk-crime", query=q)

    def bea_gdp(self, *, state: str, year: Optional[int] = None, limit: Optional[int] = None) -> CallResult:
        """Quarterly real GDP by US state (BEA Regional).

        state (2-letter) + optional year → real GDP (millions chained USD) per
        quarter, newest first. Public-domain (BEA).
        """
        q: dict[str, Any] = {"state": state}
        if year is not None: q["year"] = year
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/bea-gdp", endpoint="gov.bea-gdp", query=q)

    def eu_tenders(self, *, country: Optional[str] = None, cpv: Optional[str] = None, keyword: Optional[str] = None,
                   query: Optional[str] = None, limit: Optional[int] = None, page: Optional[int] = None) -> CallResult:
        """Search EU public-procurement notices (TED)."""
        q: dict[str, Any] = {}
        if country is not None: q["country"] = country
        if cpv is not None: q["cpv"] = cpv
        if keyword is not None: q["keyword"] = keyword
        if query is not None: q["query"] = query
        if limit is not None: q["limit"] = limit
        if page is not None: q["page"] = page
        return self._c.request("GET", "/api/gov/eu-tenders", endpoint="gov.eu-tenders", query=q)

    def disaster_declarations(
        self,
        *,
        state: Optional[str] = None,
        disaster_number: Optional[int] = None,
        declaration_type: Optional[str] = None,
        incident_type: Optional[str] = None,
        county: Optional[str] = None,
        fy_declared: Optional[int] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """FEMA federal disaster & emergency declarations (since 1953).

        Filter by state / disaster_number / declaration_type (DR/EM/FM/FS/FW) /
        incident_type (Hurricane, Fire, Flood, …) / county FIPS / fy_declared /
        declaration date range. No filter → most recent declarations nationwide.
        Returns total match count + records (one per designated county/area) with
        title, dates, designated area, FEMA region, and assistance programs.
        Public-domain (OpenFEMA).
        """
        q: dict[str, Any] = {}
        if state is not None: q["state"] = state
        if disaster_number is not None: q["disasterNumber"] = disaster_number
        if declaration_type is not None: q["declarationType"] = declaration_type
        if incident_type is not None: q["incidentType"] = incident_type
        if county is not None: q["county"] = county
        if fy_declared is not None: q["fyDeclared"] = fy_declared
        if from_date is not None: q["fromDate"] = from_date
        if to_date is not None: q["toDate"] = to_date
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/disaster-declarations", endpoint="gov.disaster-declarations", query=q)

    def disaster_assistance(
        self,
        *,
        program: Optional[str] = None,
        tenancy: Optional[str] = None,
        disaster_number: Optional[int] = None,
        state: Optional[str] = None,
        zip_code: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """FEMA disaster assistance dollars by disaster/place.

        program='individuals' (default) → Individuals & Households Program (IHP)
        approved housing assistance, one record per ZIP per disaster (tenancy=
        'owner' default or 'renter'). program='public' → Public Assistance
        funded-project summaries, one record per applicant per disaster with the
        federally obligated amount. Filter by disaster_number (join key to
        gov.disaster-declarations), state (2-letter), zip_code (5-digit, IHP only).
        Public-domain (OpenFEMA).
        """
        q: dict[str, Any] = {}
        if program is not None: q["program"] = program
        if tenancy is not None: q["tenancy"] = tenancy
        if disaster_number is not None: q["disasterNumber"] = disaster_number
        if state is not None: q["state"] = state
        if zip_code is not None: q["zipCode"] = zip_code
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/disaster-assistance", endpoint="gov.disaster-assistance", query=q)

    def carrier_safety(
        self,
        *,
        dot: Optional[int] = None,
        name: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """FMCSA motor-carrier safety profile.

        Pass dot (USDOT number) for the full record (authority/status, safety
        rating, crash + inspection history, CSA BASICs), or name to search →
        matching carriers with DOT numbers. Free, public-domain US DOT data.
        """
        q: dict[str, Any] = {}
        if dot is not None: q["dot"] = dot
        if name is not None: q["name"] = name
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/gov/carrier-safety", endpoint="gov.carrier-safety", query=q)

    def representatives(
        self,
        *,
        address: Optional[str] = None,
        state: Optional[str] = None,
        district: Optional[object] = None,
    ) -> CallResult:
        """US Congress members for a location.

        Pass address (geocoded to district) or state[+district]. Returns the
        House rep + 2 senators with party, Bioguide IDs, phone, office, contact
        form. State-only → senators; DC/territories → delegate. Bundled CC0 data.
        """
        q: dict[str, Any] = {}
        if address is not None: q["address"] = address
        if state is not None: q["state"] = state
        if district is not None: q["district"] = district
        return self._c.request("GET", "/api/gov/representatives", endpoint="gov.representatives", query=q)

    def district(self, *, address: str) -> CallResult:
        """US address → congressional district (119th) + state + county via the
        Census geocoder. GET { address }."""
        return self._c.request("GET", "/api/gov/district", endpoint="gov.district", query={"address": address})

    def inmate_locator(
        self,
        *,
        last_name: Optional[str] = None,
        first_name: Optional[str] = None,
        middle_name: Optional[str] = None,
        inmate_number: Optional[str] = None,
        age: Optional[int] = None,
        sex: Optional[str] = None,
        race: Optional[str] = None,
    ) -> CallResult:
        """Federal Bureau of Prisons inmate locator (1982-present).

        Server params: lastName, firstName, middleName, inmateNumber, age, sex, race.
        """
        q: dict[str, Any] = {}
        if last_name is not None:
            q["lastName"] = last_name
        if first_name is not None:
            q["firstName"] = first_name
        if middle_name is not None:
            q["middleName"] = middle_name
        if inmate_number is not None:
            q["inmateNumber"] = inmate_number
        if age is not None:
            q["age"] = age
        if sex is not None:
            q["sex"] = sex
        if race is not None:
            q["race"] = race
        return self._c.request("GET", "/api/gov/inmate-locator", endpoint="gov.inmate-locator", query=q)

    def lobbying_filings(
        self,
        *,
        registrant: Optional[str] = None,
        client: Optional[str] = None,
        lobbyist: Optional[str] = None,
        year: Optional[int] = None,
        period: Optional[str] = None,
        type: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> CallResult:
        """US Senate lobbying disclosures (LDA filings).

        Server params: registrant, client, lobbyist, year, period, type, page, pageSize.
        """
        q: dict[str, Any] = {}
        if registrant is not None:
            q["registrant"] = registrant
        if client is not None:
            q["client"] = client
        if lobbyist is not None:
            q["lobbyist"] = lobbyist
        if year is not None:
            q["year"] = year
        if period is not None:
            q["period"] = period
        if type is not None:
            q["type"] = type
        if page is not None:
            q["page"] = page
        if page_size is not None:
            q["pageSize"] = page_size
        return self._c.request("GET", "/api/gov/lobbying-filings", endpoint="gov.lobbying-filings", query=q)

    def congress_filings(
        self, *, q: Optional[str] = None, state: Optional[str] = None, type: Optional[str] = None,
        chamber: Optional[str] = None, year: Optional[int] = None,
        date_from: Optional[str] = None, date_to: Optional[str] = None,
        limit: Optional[int] = None, offset: Optional[int] = None,
    ) -> CallResult:
        """US House financial-disclosure filings incl. Periodic Transaction Reports (PTRs,
        the STOCK Act stock-trade disclosures). Defaults to PTRs; type='annual'|'candidate'|
        'amendment'|'all' for others. Filter by q (member name), state, year, date range.
        envelope total = count. 2008->present, refreshed daily (current-to-the-filing)."""
        params: dict[str, Any] = {}
        if q is not None: params["q"] = q
        if state is not None: params["state"] = state
        if type is not None: params["type"] = type
        if chamber is not None: params["chamber"] = chamber
        if year is not None: params["year"] = year
        if date_from is not None: params["dateFrom"] = date_from
        if date_to is not None: params["dateTo"] = date_to
        if limit is not None: params["limit"] = limit
        if offset is not None: params["offset"] = offset
        return self._c.request("GET", "/api/gov/congress-filings", endpoint="gov.congress-filings", query=params)

    def congress_trades(
        self, *, q: Optional[str] = None, ticker: Optional[str] = None, type: Optional[str] = None,
        chamber: Optional[str] = None, state: Optional[str] = None,
        date_from: Optional[str] = None, date_to: Optional[str] = None,
        limit: Optional[int] = None, offset: Optional[int] = None,
    ) -> CallResult:
        """US Congress member stock trades parsed from STOCK Act PTRs. Filter by q (member),
        ticker, type ('purchase'|'sale'|'exchange'), state, chamber, transaction-date range.
        Amounts are disclosed RANGES (amountMin/amountMax), not exact. envelope total = count."""
        params: dict[str, Any] = {}
        if q is not None: params["q"] = q
        if ticker is not None: params["ticker"] = ticker
        if type is not None: params["type"] = type
        if chamber is not None: params["chamber"] = chamber
        if state is not None: params["state"] = state
        if date_from is not None: params["dateFrom"] = date_from
        if date_to is not None: params["dateTo"] = date_to
        if limit is not None: params["limit"] = limit
        if offset is not None: params["offset"] = offset
        return self._c.request("GET", "/api/gov/congress-trades", endpoint="gov.congress-trades", query=params)

    def congress_bill(self, **kwargs: Any) -> CallResult:
        """US Congressional bill lookup or filtered list (Library of Congress)."""
        return self._c.request("GET", "/api/gov/congress-bill", endpoint="gov.congress-bill", query=kwargs)

    def congress_member(self, **kwargs: Any) -> CallResult:
        """US Congress member lookup by bioguide ID or filtered list."""
        return self._c.request("GET", "/api/gov/congress-member", endpoint="gov.congress-member", query=kwargs)

    def fec_candidate(self, **kwargs: Any) -> CallResult:
        """US federal political candidate search (OpenFEC)."""
        return self._c.request("GET", "/api/gov/fec-candidate", endpoint="gov.fec-candidate", query=kwargs)

    def fec_committee(self, **kwargs: Any) -> CallResult:
        """US federal political committee search (OpenFEC)."""
        return self._c.request("GET", "/api/gov/fec-committee", endpoint="gov.fec-committee", query=kwargs)

    def fec_contributions(self, **kwargs: Any) -> CallResult:
        """FEC Schedule A — itemized contributions to federal political committees."""
        return self._c.request("GET", "/api/gov/fec-contributions", endpoint="gov.fec-contributions", query=kwargs)

    def fec_expenditures(self, **kwargs: Any) -> CallResult:
        """FEC Schedule B — itemized committee disbursements."""
        return self._c.request("GET", "/api/gov/fec-expenditures", endpoint="gov.fec-expenditures", query=kwargs)

    def fec_totals(self, *, scope: str, **kwargs: Any) -> CallResult:
        """FEC aggregate financial totals (candidates or committees)."""
        return self._c.request("GET", "/api/gov/fec-totals", endpoint="gov.fec-totals", query={"scope": scope, **kwargs})

    def congress_committee(self, **kwargs: Any) -> CallResult:
        """US Congressional committee list or single-committee detail."""
        return self._c.request("GET", "/api/gov/congress-committee", endpoint="gov.congress-committee", query=kwargs)

    def congress_amendment(self, **kwargs: Any) -> CallResult:
        """US Congressional amendments lookup or list."""
        return self._c.request("GET", "/api/gov/congress-amendment", endpoint="gov.congress-amendment", query=kwargs)

    def congress_nomination(self, **kwargs: Any) -> CallResult:
        """US presidential nominations sent to the Senate."""
        return self._c.request("GET", "/api/gov/congress-nomination", endpoint="gov.congress-nomination", query=kwargs)

    def congress_hearing(self, **kwargs: Any) -> CallResult:
        """US Congressional hearings."""
        return self._c.request("GET", "/api/gov/congress-hearing", endpoint="gov.congress-hearing", query=kwargs)

    def congress_treaty(self, **kwargs: Any) -> CallResult:
        """International treaties transmitted to the US Senate."""
        return self._c.request("GET", "/api/gov/congress-treaty", endpoint="gov.congress-treaty", query=kwargs)

    def congress_record(self, **kwargs: Any) -> CallResult:
        """Daily Congressional Record issues."""
        return self._c.request("GET", "/api/gov/congress-record", endpoint="gov.congress-record", query=kwargs)

    def bill_summaries(self, **kwargs: Any) -> CallResult:
        """Latest US Congressional bill summaries (CRS-authored)."""
        return self._c.request("GET", "/api/gov/bill-summaries", endpoint="gov.bill-summaries", query=kwargs)

    def osha_inspections(self, **kwargs: Any) -> CallResult:
        """OSHA inspection records via US Department of Labor Open Data Portal."""
        return self._c.request("GET", "/api/gov/osha-inspections", endpoint="gov.osha-inspections", query=kwargs)

    def osha_violations(self, **kwargs: Any) -> CallResult:
        """OSHA citation / violation records via DOL Open Data Portal."""
        return self._c.request("GET", "/api/gov/osha-violations", endpoint="gov.osha-violations", query=kwargs)

    def osha_accidents(self, **kwargs: Any) -> CallResult:
        """OSHA-investigated workplace accident reports via DOL Open Data Portal."""
        return self._c.request("GET", "/api/gov/osha-accidents", endpoint="gov.osha-accidents", query=kwargs)

    def msha_accidents(self, **kwargs: Any) -> CallResult:
        """MSHA mine safety accident records via DOL Open Data Portal."""
        return self._c.request("GET", "/api/gov/msha-accidents", endpoint="gov.msha-accidents", query=kwargs)

    def fda_drug_events(
        self, *, drug: str, reaction: Optional[str] = None, limit: int = 10,
    ) -> CallResult:
        """FDA adverse drug event reports (FAERS). Search by drug name + optional MedDRA reaction."""
        q: dict[str, Any] = {"drug": drug, "limit": limit}
        if reaction is not None: q["reaction"] = reaction
        return self._c.request("GET", "/api/gov/fda-drug-events", endpoint="gov.fda-drug-events", query=q)

    def fda_recalls(
        self,
        *,
        drug: Optional[str] = None,
        classification: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
    ) -> CallResult:
        """FDA drug recall enforcement reports. classification: 'I' | 'II' | 'III'."""
        q: dict[str, Any] = {"limit": limit}
        if drug is not None: q["drug"] = drug
        if classification is not None: q["classification"] = classification
        if status is not None: q["status"] = status
        return self._c.request("GET", "/api/gov/fda-recalls", endpoint="gov.fda-recalls", query=q)

    def product_recalls(
        self,
        *,
        title: Optional[str] = None,
        product_name: Optional[str] = None,
        recall_number: Optional[str] = None,
        date_start: Optional[str] = None,
        date_end: Optional[str] = None,
        limit: int = 20,
    ) -> CallResult:
        """CPSC consumer-product recalls (SaferProducts.gov), newest first. All
        filters optional; none set returns the last 12 months. Dates YYYY-MM-DD."""
        q: dict[str, Any] = {"limit": limit}
        if title is not None: q["title"] = title
        if product_name is not None: q["productName"] = product_name
        if recall_number is not None: q["recallNumber"] = recall_number
        if date_start is not None: q["dateStart"] = date_start
        if date_end is not None: q["dateEnd"] = date_end
        return self._c.request("GET", "/api/gov/product-recalls", endpoint="gov.product-recalls", query=q)

    def fda_food_recalls(
        self,
        *,
        product: Optional[str] = None,
        classification: Optional[str] = None,
        status: Optional[str] = None,
        state: Optional[str] = None,
        limit: int = 20,
    ) -> CallResult:
        """FDA food recall enforcement reports."""
        q: dict[str, Any] = {"limit": limit}
        if product is not None: q["product"] = product
        if classification is not None: q["classification"] = classification
        if status is not None: q["status"] = status
        if state is not None: q["state"] = state
        return self._c.request("GET", "/api/gov/fda-food-recalls", endpoint="gov.fda-food-recalls", query=q)

    def fda_device_events(
        self,
        *,
        device: Optional[str] = None,
        manufacturer: Optional[str] = None,
        problem: Optional[str] = None,
        limit: int = 20,
    ) -> CallResult:
        """FDA medical device adverse event reports (MAUDE)."""
        q: dict[str, Any] = {"limit": limit}
        if device is not None: q["device"] = device
        if manufacturer is not None: q["manufacturer"] = manufacturer
        if problem is not None: q["problem"] = problem
        return self._c.request("GET", "/api/gov/fda-device-events", endpoint="gov.fda-device-events", query=q)

    def fda_animalvet_events(
        self,
        *,
        drug: Optional[str] = None,
        species: Optional[str] = None,
        reaction: Optional[str] = None,
        limit: int = 20,
    ) -> CallResult:
        """FDA animal/veterinary adverse event reports."""
        q: dict[str, Any] = {"limit": limit}
        if drug is not None: q["drug"] = drug
        if species is not None: q["species"] = species
        if reaction is not None: q["reaction"] = reaction
        return self._c.request("GET", "/api/gov/fda-animalvet-events", endpoint="gov.fda-animalvet-events", query=q)

    def house_votes(
        self,
        *,
        year: Optional[int] = None,
        congress: Optional[int] = None,
        result: Optional[str] = None,
        bill: Optional[str] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 25,
        offset: int = 0,
    ) -> CallResult:
        """US House roll-call votes (locally aggregated, daily)."""
        q: dict[str, Any] = {"limit": limit, "offset": offset}
        if year is not None: q["year"] = year
        if congress is not None: q["congress"] = congress
        if result is not None: q["result"] = result
        if bill is not None: q["bill"] = bill
        if since is not None: q["since"] = since
        if until is not None: q["until"] = until
        return self._c.request("GET", "/api/gov/house-votes", endpoint="gov.house-votes", query=q)

    def senate_votes(
        self,
        *,
        congress: Optional[int] = None,
        session: Optional[int] = None,
        result: Optional[str] = None,
        document: Optional[str] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 25,
        offset: int = 0,
    ) -> CallResult:
        """US Senate roll-call votes (locally aggregated, daily)."""
        q: dict[str, Any] = {"limit": limit, "offset": offset}
        if congress is not None: q["congress"] = congress
        if session is not None: q["session"] = session
        if result is not None: q["result"] = result
        if document is not None: q["document"] = document
        if since is not None: q["since"] = since
        if until is not None: q["until"] = until
        return self._c.request("GET", "/api/gov/senate-votes", endpoint="gov.senate-votes", query=q)

    def usaspending_awards(
        self,
        *,
        recipient: Optional[str] = None,
        agency: Optional[str] = None,
        recipient_state: Optional[str] = None,
        award_type: Optional[str] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 25,
        page: int = 1,
    ) -> CallResult:
        """Federal awards search via USAspending.gov. award_type: contracts|grants|loans|direct_payments|other."""
        q: dict[str, Any] = {"limit": limit, "page": page}
        if recipient is not None: q["recipient"] = recipient
        if agency is not None: q["agency"] = agency
        if recipient_state is not None: q["recipientState"] = recipient_state
        if award_type is not None: q["awardType"] = award_type
        if since is not None: q["since"] = since
        if until is not None: q["until"] = until
        return self._c.request("GET", "/api/gov/usaspending-awards", endpoint="gov.usaspending-awards", query=q)

    def usgs_water(
        self,
        *,
        lat: float,
        lon: float,
        radius: float = 0.5,
        variables: Optional[str] = None,
        limit: int = 25,
    ) -> CallResult:
        """Real-time USGS water gauge readings in a bbox around lat/lon."""
        q: dict[str, Any] = {"lat": lat, "lon": lon, "radius": radius, "limit": limit}
        if variables is not None: q["variables"] = variables
        return self._c.request("GET", "/api/gov/usgs-water", endpoint="gov.usgs-water", query=q)

    def epa_facilities(
        self,
        *,
        state: str,
        name: Optional[str] = None,
        program: Optional[str] = None,
        limit: int = 25,
        offset: int = 0,
    ) -> CallResult:
        """EPA Facility Registry Service (FRS) by state + optional name + program."""
        q: dict[str, Any] = {"state": state, "limit": limit, "offset": offset}
        if name is not None: q["name"] = name
        if program is not None: q["program"] = program
        return self._c.request("GET", "/api/gov/epa-facilities", endpoint="gov.epa-facilities", query=q)

    def federal_register_recent(
        self,
        *,
        type: Optional[str] = None,
        agency: Optional[str] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 25,
        page: int = 1,
    ) -> CallResult:
        """Newest Federal Register documents — chronological feed for compliance change-detection. type: RULE|PRORULE|NOTICE|PRESDOCU."""
        q: dict[str, Any] = {"limit": limit, "page": page}
        if type is not None: q["type"] = type
        if agency is not None: q["agency"] = agency
        if since is not None: q["since"] = since
        if until is not None: q["until"] = until
        return self._c.request("GET", "/api/gov/federal-register-recent", endpoint="gov.federal-register-recent", query=q)


class _Chem(_Group):
    def compound(
        self,
        *,
        cid: Optional[int] = None,
        name: Optional[str] = None,
        smiles: Optional[str] = None,
        inchikey: Optional[str] = None,
    ) -> CallResult:
        """Look up a chemical compound by cid, name, smiles, or inchikey (NIH PubChem)."""
        q: dict[str, Any] = {}
        if cid is not None: q["cid"] = cid
        if name is not None: q["name"] = name
        if smiles is not None: q["smiles"] = smiles
        if inchikey is not None: q["inchikey"] = inchikey
        return self._c.request("GET", "/api/chem/compound", endpoint="chem.compound", query=q)


class _Agent(_Group):
    """Agent-native primitives: knowledge-delta."""
    def knowledge_delta(
        self,
        *,
        topic: str,
        since: str,
        until: Optional[str] = None,
        max_events: int = 20,
    ) -> CallResult:
        """What's happened in <topic> since <date>? Multi-source delta. Tier 2."""
        body: dict[str, Any] = {"topic": topic, "since": since, "maxEvents": max_events}
        if until is not None: body["until"] = until
        return self._c.request("POST", "/api/agent/knowledge-delta", endpoint="agent.knowledge-delta", body=body)


class _Bank(_Group):
    def lookup(
        self,
        *,
        name: Optional[str] = None,
        cert: Optional[str] = None,
        rssd_id: Optional[str] = None,
        state: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 10,
        offset: int = 0,
    ) -> CallResult:
        """FDIC-insured US bank directory."""
        q: dict[str, Any] = {"limit": limit, "offset": offset}
        if name is not None: q["name"] = name
        if cert is not None: q["cert"] = cert
        if rssd_id is not None: q["rssdId"] = rssd_id
        if state is not None: q["state"] = state
        if status is not None: q["status"] = status
        return self._c.request("GET", "/api/bank/lookup", endpoint="bank.lookup", query=q)


class _License(_Group):
    def real_estate(
        self,
        *,
        state: str,
        name: Optional[str] = None,
        license_number: Optional[str] = None,
        license_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """US real-estate license verification (currently TX TREC).

        Server params: state, name, licenseNumber, licenseType, status, limit, offset.
        """
        q: dict[str, Any] = {"state": state}
        if name is not None:
            q["name"] = name
        if license_number is not None:
            q["licenseNumber"] = license_number
        if license_type is not None:
            q["licenseType"] = license_type
        if status is not None:
            q["status"] = status
        if limit is not None:
            q["limit"] = limit
        if offset is not None:
            q["offset"] = offset
        return self._c.request("GET", "/api/license/real-estate", endpoint="license.real-estate", query=q)

    def trades(
        self,
        *,
        state: str,
        name: Optional[str] = None,
        license_number: Optional[str] = None,
        license_type: Optional[str] = None,
        county: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """US trade/occupational license verification (currently TX TDLR).

        Server params: state, name, licenseNumber, licenseType, county, limit, offset.
        """
        q: dict[str, Any] = {"state": state}
        if name is not None:
            q["name"] = name
        if license_number is not None:
            q["licenseNumber"] = license_number
        if license_type is not None:
            q["licenseType"] = license_type
        if county is not None:
            q["county"] = county
        if limit is not None:
            q["limit"] = limit
        if offset is not None:
            q["offset"] = offset
        return self._c.request("GET", "/api/license/trades", endpoint="license.trades", query=q)

    def medical(
        self,
        *,
        npi: Optional[str] = None,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        name: Optional[str] = None,
        state: Optional[str] = None,
        enumeration_type: Optional[str] = None,
        limit: int = 10,
        skip: int = 0,
    ) -> CallResult:
        """NPPES NPI registry — US healthcare provider lookup."""
        q: dict[str, Any] = {"limit": limit, "skip": skip}
        if npi is not None: q["npi"] = npi
        if first_name is not None: q["firstName"] = first_name
        if last_name is not None: q["lastName"] = last_name
        if name is not None: q["name"] = name
        if state is not None: q["state"] = state
        if enumeration_type is not None: q["enumerationType"] = enumeration_type
        return self._c.request("GET", "/api/license/medical", endpoint="license.medical", query=q)

    def broker(
        self,
        *,
        query: Optional[str] = None,
        crd: Optional[str] = None,
        limit: int = 10,
        offset: int = 0,
    ) -> CallResult:
        """FINRA BrokerCheck — registered US brokers / advisors."""
        q: dict[str, Any] = {"limit": limit, "offset": offset}
        if query is not None: q["query"] = query
        if crd is not None: q["crd"] = crd
        return self._c.request("GET", "/api/license/broker", endpoint="license.broker", query=q)


class _Health(_Group):
    def disease_surveillance(
        self,
        *,
        condition: Optional[str] = None,
        location: Optional[str] = None,
        year: Optional[int] = None,
        weeks: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Current US disease surveillance (CDC NNDSS weekly counts). At least one of condition/location required."""
        q: dict[str, Any] = {}
        if condition is not None: q["condition"] = condition
        if location is not None: q["location"] = location
        if year is not None: q["year"] = year
        if weeks is not None: q["weeks"] = weeks
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/health/disease-surveillance", endpoint="health.disease-surveillance", query=q)

    def provider_profile(self, *, npi: str) -> CallResult:
        """Provider 360 by NPI — NPPES identity + Open Payments + Medicare billing, merged.

        Server param: npi (10 digits).
        """
        return self._c.request("GET", "/api/health/provider-profile", endpoint="health.provider-profile", query={"npi": npi})

    def hospital_quality(
        self,
        *,
        facility_id: Optional[str] = None,
        state: Optional[str] = None,
        city: Optional[str] = None,
        name: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """CMS Care Compare hospital quality (star rating + measure domains).

        Server params: facilityId, state, city, name, limit, offset.
        """
        q: dict[str, Any] = {}
        if facility_id is not None:
            q["facilityId"] = facility_id
        if state is not None:
            q["state"] = state
        if city is not None:
            q["city"] = city
        if name is not None:
            q["name"] = name
        if limit is not None:
            q["limit"] = limit
        if offset is not None:
            q["offset"] = offset
        return self._c.request("GET", "/api/health/hospital-quality", endpoint="health.hospital-quality", query=q)

    def medicare_provider(
        self,
        *,
        npi: Optional[str] = None,
        last_name: Optional[str] = None,
        state: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """Medicare utilization + payments by provider NPI (CMS annual dataset).

        Server params: npi, lastName, state, limit, offset.
        """
        q: dict[str, Any] = {}
        if npi is not None:
            q["npi"] = npi
        if last_name is not None:
            q["lastName"] = last_name
        if state is not None:
            q["state"] = state
        if limit is not None:
            q["limit"] = limit
        if offset is not None:
            q["offset"] = offset
        return self._c.request("GET", "/api/health/medicare-provider", endpoint="health.medicare-provider", query=q)

    def mortality_stats(
        self,
        *,
        dataset: Optional[str] = None,
        state: Optional[str] = None,
        year: Optional[int] = None,
        cause: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """US mortality statistics (CDC NCHS).

        Server params: dataset (leading-causes|weekly-counts), state, year, cause, limit, offset.
        """
        q: dict[str, Any] = {}
        if dataset is not None:
            q["dataset"] = dataset
        if state is not None:
            q["state"] = state
        if year is not None:
            q["year"] = year
        if cause is not None:
            q["cause"] = cause
        if limit is not None:
            q["limit"] = limit
        if offset is not None:
            q["offset"] = offset
        return self._c.request("GET", "/api/health/mortality-stats", endpoint="health.mortality-stats", query=q)

    def hospital_lookup(
        self,
        *,
        facility_id: Optional[str] = None,
        name: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        hospital_type: Optional[str] = None,
        min_rating: Optional[int] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> CallResult:
        """CMS Care Compare hospital lookup."""
        q: dict[str, Any] = {"limit": limit, "offset": offset}
        if facility_id is not None: q["facilityId"] = facility_id
        if name is not None: q["name"] = name
        if city is not None: q["city"] = city
        if state is not None: q["state"] = state
        if hospital_type is not None: q["hospitalType"] = hospital_type
        if min_rating is not None: q["minRating"] = min_rating
        return self._c.request("GET", "/api/health/hospital-lookup", endpoint="health.hospital-lookup", query=q)

    def open_payments(
        self,
        *,
        npi: Optional[str] = None,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        payer_name: Optional[str] = None,
        state: Optional[str] = None,
        min_amount: Optional[float] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> CallResult:
        """CMS Open Payments — Sunshine Act payments to US physicians."""
        q: dict[str, Any] = {"limit": limit, "offset": offset}
        if npi is not None: q["npi"] = npi
        if first_name is not None: q["firstName"] = first_name
        if last_name is not None: q["lastName"] = last_name
        if payer_name is not None: q["payerName"] = payer_name
        if state is not None: q["state"] = state
        if min_amount is not None: q["minAmount"] = min_amount
        return self._c.request("GET", "/api/health/open-payments", endpoint="health.open-payments", query=q)


class _WorldBank(_Group):
    def indicator(
        self,
        *,
        country: str,
        indicator: str,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        limit: int = 50,
        page: int = 1,
    ) -> CallResult:
        """World Bank Open Data indicator time series."""
        q: dict[str, Any] = {"country": country, "indicator": indicator, "limit": limit, "page": page}
        if year_from is not None: q["yearFrom"] = year_from
        if year_to is not None: q["yearTo"] = year_to
        return self._c.request("GET", "/api/worldbank/indicator", endpoint="worldbank.indicator", query=q)


class _Book(_Group):
    def search(
        self,
        *,
        q: Optional[str] = None,
        title: Optional[str] = None,
        author: Optional[str] = None,
        isbn: Optional[str] = None,
        limit: int = 10,
        page: int = 1,
    ) -> CallResult:
        """Open Library book metadata search."""
        query: dict[str, Any] = {"limit": limit, "page": page}
        if q is not None: query["q"] = q
        if title is not None: query["title"] = title
        if author is not None: query["author"] = author
        if isbn is not None: query["isbn"] = isbn
        return self._c.request("GET", "/api/book/search", endpoint="book.search", query=query)


class _Clinical(_Group):
    def trial_search(
        self,
        *,
        query: Optional[str] = None,
        nct_id: Optional[str] = None,
        status: Optional[str] = None,
        sponsor: Optional[str] = None,
        phase: Optional[str] = None,
        country: Optional[str] = None,
        page_size: int = 10,
        page_token: Optional[str] = None,
    ) -> CallResult:
        """ClinicalTrials.gov study search."""
        q: dict[str, Any] = {"pageSize": page_size}
        if query is not None: q["query"] = query
        if nct_id is not None: q["nctId"] = nct_id
        if status is not None: q["status"] = status
        if sponsor is not None: q["sponsor"] = sponsor
        if phase is not None: q["phase"] = phase
        if country is not None: q["country"] = country
        if page_token is not None: q["pageToken"] = page_token
        return self._c.request("GET", "/api/clinical/trial-search", endpoint="clinical.trial-search", query=q)

    def study_detail(self, *, nct_id: str) -> CallResult:
        """Full ClinicalTrials.gov study record by NCT id."""
        return self._c.request("GET", "/api/clinical/study-detail", endpoint="clinical.study-detail", query={"nctId": nct_id})


class _Code(_Group):
    def repo_lookup(self, *, repo: str) -> CallResult:
        """GitHub repo lookup by 'owner/name'."""
        return self._c.request("GET", "/api/code/repo-lookup", endpoint="code.repo-lookup", query={"repo": repo})


class _Wikidata(_Group):
    def entity(
        self,
        *,
        id: str,
        languages: str = "en",
        include_claims: bool = True,
        max_claims_per_property: int = 10,
    ) -> CallResult:
        """Wikidata entity (Q/P/L/M/S id) lookup."""
        return self._c.request(
            "GET", "/api/wikidata/entity", endpoint="wikidata.entity",
            query={"id": id, "languages": languages, "includeClaims": include_claims, "maxClaimsPerProperty": max_claims_per_property},
        )


class _Paper(_Group):
    def doi_lookup(self, *, doi: str) -> CallResult:
        """Crossref DOI bibliographic metadata lookup."""
        return self._c.request("GET", "/api/paper/doi-lookup", endpoint="paper.doi-lookup", query={"doi": doi})


class _Registry(_Group):
    def npm_lookup(self, *, name: str) -> CallResult:
        return self._c.request("GET", "/api/registry/npm-lookup", endpoint="registry.npm-lookup", query={"name": name})

    def pypi_lookup(self, *, name: str) -> CallResult:
        return self._c.request("GET", "/api/registry/pypi-lookup", endpoint="registry.pypi-lookup", query={"name": name})


class _Fx(_Group):
    def rates(
        self,
        *,
        base: str = "USD",
        symbols: Optional[str] = None,
        date: Optional[str] = None,
        amount: float = 1.0,
    ) -> CallResult:
        q: dict[str, Any] = {"base": base, "amount": amount}
        if symbols is not None: q["symbols"] = symbols
        if date is not None: q["date"] = date
        return self._c.request("GET", "/api/fx/rates", endpoint="fx.rates", query=q)

    def timeseries(
        self,
        *,
        start: str,
        base: str = "USD",
        symbols: Optional[str] = None,
        end: Optional[str] = None,
        amount: float = 1.0,
    ) -> CallResult:
        q: dict[str, Any] = {"base": base, "start": start, "amount": amount}
        if symbols is not None: q["symbols"] = symbols
        if end is not None: q["end"] = end
        return self._c.request("GET", "/api/fx/timeseries", endpoint="fx.timeseries", query=q)


class _Bls(_Group):
    def series(
        self,
        *,
        series_ids: str,
        start_year: Optional[int] = None,
        end_year: Optional[int] = None,
    ) -> CallResult:
        q: dict[str, Any] = {"seriesIds": series_ids}
        if start_year is not None: q["startYear"] = start_year
        if end_year is not None: q["endYear"] = end_year
        return self._c.request("GET", "/api/bls/series", endpoint="bls.series", query=q)


class _Edu(_Group):
    def school_lookup(
        self,
        *,
        name: Optional[str] = None,
        district: Optional[str] = None,
        state: Optional[str] = None,
        city: Optional[str] = None,
        zip: Optional[str] = None,
        ncessch: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> CallResult:
        """Every US public K-12 school (~102k, NCES CCD).

        Server params: name, district, state, city, zip, ncessch, limit, offset.
        """
        q: dict[str, Any] = {}
        if name is not None:
            q["name"] = name
        if district is not None:
            q["district"] = district
        if state is not None:
            q["state"] = state
        if city is not None:
            q["city"] = city
        if zip is not None:
            q["zip"] = zip
        if ncessch is not None:
            q["ncessch"] = ncessch
        if limit is not None:
            q["limit"] = limit
        if offset is not None:
            q["offset"] = offset
        return self._c.request("GET", "/api/edu/school-lookup", endpoint="edu.school-lookup", query=q)

    def college_scorecard(self, **kwargs: Any) -> CallResult:
        """US college search via Department of Education College Scorecard."""
        return self._c.request("GET", "/api/edu/college-scorecard", endpoint="edu.college-scorecard", query=kwargs)


class _Energy(_Group):
    def solar_forecast(self, *, latitude: float, longitude: float, days: int | None = None) -> CallResult:
        """Solar irradiance + PV-yield forecast for any coordinate (free/keyless, global). Returns a daily 1-16 day forecast: GHI (kWh/m²), peak sun hours, sunshine hours, and estimated yield per kWp of panels ("""
        query: dict = {"latitude": latitude, "longitude": longitude}
        if days is not None:
            query["days"] = days
        return self._c.request("GET", "/api/energy/solar-forecast", endpoint="energy.solar-forecast", query=query)

    def fuel_stations(self, **kwargs: Any) -> CallResult:
        """NREL alternative-fuel station locator (EV chargers, propane, CNG, etc.)."""
        return self._c.request("GET", "/api/energy/fuel-stations", endpoint="energy.fuel-stations", query=kwargs)

    def solar_resource(self, *, lat: float, lon: float) -> CallResult:
        """NREL solar resource averages (NSRDB) for a lat/lon."""
        return self._c.request("GET", "/api/energy/solar-resource", endpoint="energy.solar-resource", query={"lat": lat, "lon": lon})

    def prices(self, *, series: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """US energy benchmark prices (EIA). Omit series for a snapshot of all benchmarks;
        pass one of wti_crude / brent_crude / henry_hub_gas / gasoline_regular / diesel /
        electricity_retail for its recent time series."""
        q: dict[str, Any] = {}
        if series is not None: q["series"] = series
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/energy/prices", endpoint="energy.prices", query=q)

    def generation_mix(self, *, location: str) -> CallResult:
        """Electricity generation mix by fuel type for a US state or 'US' (EIA, latest month + shares)."""
        return self._c.request("GET", "/api/energy/generation-mix", endpoint="energy.generation-mix", query={"location": location})

    def electricity_rates(self, *, state: str, sector: Optional[str] = None, months: Optional[int] = None) -> CallResult:
        """Retail electricity price + sales for a US state by sector, monthly (EIA)."""
        q: dict[str, Any] = {"state": state}
        if sector is not None: q["sector"] = sector
        if months is not None: q["months"] = months
        return self._c.request("GET", "/api/energy/electricity-rates", endpoint="energy.electricity-rates", query=q)

    def carbon_intensity_uk(self) -> CallResult:
        """Great Britain grid carbon intensity + generation mix."""
        return self._c.request("GET", "/api/energy/carbon-intensity-uk", endpoint="energy.carbon-intensity-uk", query={})

    def utility_rates(self, *, lat: float, lon: float, limit: Optional[int] = None) -> CallResult:
        """Serving utility + rate-plan summaries for a lat/lon (OpenEI URDB, CC0)."""
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/energy/utility-rates", endpoint="energy.utility-rates", query=q)


class _Park(_Group):
    def lookup(
        self,
        *,
        resource: str,
        park_code: Optional[str] = None,
        state: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 10,
        start: int = 0,
    ) -> CallResult:
        """NPS API — resource = parks | alerts | campgrounds | events | newsreleases | thingstodo | visitorcenters."""
        query: dict[str, Any] = {"resource": resource, "limit": limit, "start": start}
        if park_code is not None: query["parkCode"] = park_code
        if state is not None: query["state"] = state
        if q is not None: query["q"] = q
        return self._c.request("GET", "/api/park/lookup", endpoint="park.lookup", query=query)


class _Recreation(_Group):
    def search(
        self,
        *,
        resource: str,
        query: Optional[str] = None,
        state: Optional[str] = None,
        activity: Optional[int] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        radius: Optional[float] = None,
        last_updated: Optional[str] = None,
        limit: int = 25,
        offset: int = 0,
    ) -> CallResult:
        """RIDB (Recreation.gov) — resource = recareas | facilities | campsites | permits | tours | events | activities."""
        q: dict[str, Any] = {"resource": resource, "limit": limit, "offset": offset}
        if query is not None: q["query"] = query
        if state is not None: q["state"] = state
        if activity is not None: q["activity"] = activity
        if latitude is not None: q["latitude"] = latitude
        if longitude is not None: q["longitude"] = longitude
        if radius is not None: q["radius"] = radius
        if last_updated is not None: q["lastUpdated"] = last_updated
        return self._c.request("GET", "/api/recreation/search", endpoint="recreation.search", query=q)


class _Property(_Group):
    def nyc_parcel_lookup(
        self,
        *,
        bbl: Optional[str] = None,
        address: Optional[str] = None,
        borough: Optional[str] = None,
    ) -> CallResult:
        """NYC tax-lot lookup via PLUTO. Pass bbl (10-digit) or address (with optional borough)."""
        q: dict[str, Any] = {}
        if bbl is not None: q["bbl"] = bbl
        if address is not None: q["address"] = address
        if borough is not None: q["borough"] = borough
        return self._c.request("GET", "/api/property/nyc-parcel-lookup", endpoint="property.nyc-parcel-lookup", query=q)

    def nyc_deed_history(self, *, bbl: str, limit: int = 25, offset: int = 0) -> CallResult:
        """NYC ACRIS deed + mortgage history for a BBL."""
        return self._c.request(
            "GET", "/api/property/nyc-deed-history", endpoint="property.nyc-deed-history",
            query={"bbl": bbl, "limit": limit, "offset": offset},
        )

    def nyc_permits(
        self,
        *,
        bbl: Optional[str] = None,
        address: Optional[str] = None,
        job_type: Optional[str] = None,
        permit_status: Optional[str] = None,
        limit: int = 25,
        offset: int = 0,
    ) -> CallResult:
        """NYC DOB construction permits."""
        q: dict[str, Any] = {"limit": limit, "offset": offset}
        if bbl is not None: q["bbl"] = bbl
        if address is not None: q["address"] = address
        if job_type is not None: q["jobType"] = job_type
        if permit_status is not None: q["permitStatus"] = permit_status
        return self._c.request("GET", "/api/property/nyc-permits", endpoint="property.nyc-permits", query=q)

    def nyc_violations(
        self,
        *,
        bbl: Optional[str] = None,
        address: Optional[str] = None,
        class_code: Optional[str] = None,
        current_status_only: bool = False,
        limit: int = 25,
        offset: int = 0,
    ) -> CallResult:
        """NYC HPD housing violations."""
        q: dict[str, Any] = {"limit": limit, "offset": offset}
        if bbl is not None: q["bbl"] = bbl
        if address is not None: q["address"] = address
        if class_code is not None: q["classCode"] = class_code
        if current_status_only: q["currentStatusOnly"] = True
        return self._c.request("GET", "/api/property/nyc-violations", endpoint="property.nyc-violations", query=q)


class _Treasury(_Group):
    def debt(self, **kwargs: Any) -> CallResult:
        """US National Debt — daily Debt to the Penny."""
        return self._c.request("GET", "/api/treasury/debt", endpoint="treasury.debt", query=kwargs)

    def cash(self, **kwargs: Any) -> CallResult:
        """Daily Treasury Statement (DTS) operating cash balance."""
        return self._c.request("GET", "/api/treasury/cash", endpoint="treasury.cash", query=kwargs)

    def exchange_rates(self, **kwargs: Any) -> CallResult:
        """Official US Treasury exchange rates (quarterly)."""
        return self._c.request("GET", "/api/treasury/exchange-rates", endpoint="treasury.exchange-rates", query=kwargs)

    def monthly_statement(self, **kwargs: Any) -> CallResult:
        """Monthly Treasury Statement (MTS) — Table 4 federal receipts by source."""
        return self._c.request("GET", "/api/treasury/monthly-statement", endpoint="treasury.monthly-statement", query=kwargs)


class _Job(_Group):
    def federal_search(self, **kwargs: Any) -> CallResult:
        """USAJobs current federal job posting search."""
        return self._c.request("GET", "/api/job/federal-search", endpoint="job.federal-search", query=kwargs)

    def federal_codes(self, *, name: str) -> CallResult:
        """USAJobs reference codelist (33 lookup tables)."""
        return self._c.request("GET", "/api/job/federal-codes", endpoint="job.federal-codes", query={"name": name})


class _Food(_Group):
    def barcode_lookup(self, *, barcode: str) -> CallResult:
        """Food product lookup by UPC/EAN barcode via Open Food Facts (CC0)."""
        return self._c.request(
            "GET", "/api/food/barcode-lookup", endpoint="food.barcode-lookup",
            query={"barcode": barcode},
        )

    def hygiene_uk(self, *, name: Optional[str] = None, postcode: Optional[str] = None, limit: Optional[int] = None) -> CallResult:
        """UK Food Standards Agency hygiene ratings."""
        q: dict[str, Any] = {}
        if name is not None: q["name"] = name
        if postcode is not None: q["postcode"] = postcode
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/food/hygiene-uk", endpoint="food.hygiene-uk", query=q)


class _Word(_Group):
    def define(self, *, word: str) -> CallResult:
        """English dictionary entry via dictionaryapi.dev (Wiktionary, CC BY-SA)."""
        return self._c.request(
            "GET", "/api/word/define", endpoint="word.define", query={"word": word},
        )

    def related(self, *, word: str, relation: str, limit: int = 25) -> CallResult:
        """Related-word lookup via Datamuse.

        relation = rhymes | near-rhymes | synonyms | antonyms | means | triggers |
                   homophones | sounds-like | spelled-like | follows-from | preceded-by
        """
        return self._c.request(
            "GET", "/api/word/related", endpoint="word.related",
            query={"word": word, "relation": relation, "limit": limit},
        )


class _Country(_Group):
    def financials(self, *, code: str | None = None) -> CallResult:
        """Country-level financial and credit reference data: sovereign credit rating, equity risk premium, country risk premium, default spread, currency (name + ISO code), region/sub-region, and ISO country co"""
        query: dict = {}
        if code is not None:
            query["code"] = code
        return self._c.request("GET", "/api/country/financials", endpoint="country.financials", query=query)

    def lookup(
        self,
        *,
        alpha2: Optional[str] = None,
        alpha3: Optional[str] = None,
        name: Optional[str] = None,
        full_text: bool = False,
    ) -> CallResult:
        """Country metadata via REST Countries — names, ISO codes, capital,
        population, languages, currencies, calling code, flag, coords."""
        q: dict[str, Any] = {"fullText": full_text}
        if alpha2 is not None: q["alpha2"] = alpha2
        if alpha3 is not None: q["alpha3"] = alpha3
        if name is not None: q["name"] = name
        return self._c.request("GET", "/api/country/lookup", endpoint="country.lookup", query=q)


class _Chinese(_Group):
    def convert(self, *, text: str, from_: str, to: str) -> CallResult:
        """Convert Chinese text between variants (cn|tw|twp|hk|t|jp). from_=source, to=target."""
        return self._c.request(
            "GET", "/api/chinese/convert",
            endpoint="chinese.convert",
            query={"text": text, "from": from_, "to": to},
        )

    def detect(self, *, text: str) -> CallResult:
        """Detect Chinese script (simplified|traditional|mixed|han-common|none) + Han char counts."""
        return self._c.request("GET", "/api/chinese/detect", endpoint="chinese.detect", query={"text": text})

    def pinyin(self, *, text: str, tone: str | None = None, segmented: bool | None = None) -> CallResult:
        """Convert Chinese text to pinyin. tone: symbol|num|none; segmented = per-word array."""
        q: dict[str, Any] = {"text": text}
        if tone is not None:
            q["tone"] = tone
        if segmented is not None:
            q["segmented"] = segmented
        return self._c.request("GET", "/api/chinese/pinyin", endpoint="chinese.pinyin", query=q)


class _Feedback(_Group):
    def send(
        self,
        *,
        message: str,
        subject: str | None = None,
        name: str | None = None,
        from_: str | None = None,
    ) -> CallResult:
        """Send a message to the 2s team. from_ = your email (reply-to + sender)."""
        body: dict[str, Any] = {"message": message}
        if subject is not None:
            body["subject"] = subject
        if name is not None:
            body["name"] = name
        if from_ is not None:
            body["from"] = from_
        return self._c.request("POST", "/api/feedback/send", endpoint="feedback.send", body=body)


class _Github(_Group):
    def branches(self, *, owner: str, repo: str, per_page: int | None = None, page: int | None = None) -> CallResult:
        """List branches for a GitHub repo."""
        q: dict[str, Any] = {"owner": owner, "repo": repo}
        if per_page is not None:
            q["perPage"] = per_page
        if page is not None:
            q["page"] = page
        return self._c.request("GET", "/api/github/branches", endpoint="github.branches", query=q)

    def commits(
        self,
        *,
        owner: str,
        repo: str,
        sha: str | None = None,
        path: str | None = None,
        author: str | None = None,
        per_page: int | None = None,
        page: int | None = None,
    ) -> CallResult:
        """List commits for a GitHub repo. sha = branch/tag/sha to start from."""
        q: dict[str, Any] = {"owner": owner, "repo": repo}
        if sha is not None:
            q["sha"] = sha
        if path is not None:
            q["path"] = path
        if author is not None:
            q["author"] = author
        if per_page is not None:
            q["perPage"] = per_page
        if page is not None:
            q["page"] = page
        return self._c.request("GET", "/api/github/commits", endpoint="github.commits", query=q)

    def contributors(self, *, owner: str, repo: str, per_page: int | None = None, page: int | None = None) -> CallResult:
        """List contributors for a GitHub repo."""
        q: dict[str, Any] = {"owner": owner, "repo": repo}
        if per_page is not None:
            q["perPage"] = per_page
        if page is not None:
            q["page"] = page
        return self._c.request("GET", "/api/github/contributors", endpoint="github.contributors", query=q)

    def issues(
        self,
        *,
        owner: str,
        repo: str,
        state: str | None = None,
        labels: str | None = None,
        per_page: int | None = None,
        page: int | None = None,
    ) -> CallResult:
        """List issues for a GitHub repo. state: open|closed|all."""
        q: dict[str, Any] = {"owner": owner, "repo": repo}
        if state is not None:
            q["state"] = state
        if labels is not None:
            q["labels"] = labels
        if per_page is not None:
            q["perPage"] = per_page
        if page is not None:
            q["page"] = page
        return self._c.request("GET", "/api/github/issues", endpoint="github.issues", query=q)

    def languages(self, *, owner: str, repo: str) -> CallResult:
        """Language breakdown (bytes + percent) for a GitHub repo."""
        return self._c.request(
            "GET", "/api/github/languages",
            endpoint="github.languages",
            query={"owner": owner, "repo": repo},
        )

    def pulls(
        self,
        *,
        owner: str,
        repo: str,
        state: str | None = None,
        per_page: int | None = None,
        page: int | None = None,
    ) -> CallResult:
        """List pull requests for a GitHub repo. state: open|closed|all."""
        q: dict[str, Any] = {"owner": owner, "repo": repo}
        if state is not None:
            q["state"] = state
        if per_page is not None:
            q["perPage"] = per_page
        if page is not None:
            q["page"] = page
        return self._c.request("GET", "/api/github/pulls", endpoint="github.pulls", query=q)

    def readme(self, *, owner: str, repo: str, ref: str | None = None) -> CallResult:
        """Decoded README for a GitHub repo. ref = branch/tag/sha."""
        q: dict[str, Any] = {"owner": owner, "repo": repo}
        if ref is not None:
            q["ref"] = ref
        return self._c.request("GET", "/api/github/readme", endpoint="github.readme", query=q)

    def releases(self, *, owner: str, repo: str, per_page: int | None = None, page: int | None = None) -> CallResult:
        """List releases (newest first) for a GitHub repo."""
        q: dict[str, Any] = {"owner": owner, "repo": repo}
        if per_page is not None:
            q["perPage"] = per_page
        if page is not None:
            q["page"] = page
        return self._c.request("GET", "/api/github/releases", endpoint="github.releases", query=q)

    def repo(self, *, owner: str, repo: str) -> CallResult:
        """Repository metadata for a GitHub repo."""
        return self._c.request(
            "GET", "/api/github/repo",
            endpoint="github.repo",
            query={"owner": owner, "repo": repo},
        )

    def repos(
        self,
        *,
        owner: str,
        sort: str | None = None,
        type: str | None = None,
        per_page: int | None = None,
        page: int | None = None,
    ) -> CallResult:
        """List repos for a user/org. sort: updated|created|pushed|full_name; type: owner|member|all."""
        q: dict[str, Any] = {"owner": owner}
        if sort is not None:
            q["sort"] = sort
        if type is not None:
            q["type"] = type
        if per_page is not None:
            q["perPage"] = per_page
        if page is not None:
            q["page"] = page
        return self._c.request("GET", "/api/github/repos", endpoint="github.repos", query=q)

    def search_code(self, *, q: str, per_page: int | None = None, page: int | None = None) -> CallResult:
        """Search code across GitHub. q = code search query."""
        query: dict[str, Any] = {"q": q}
        if per_page is not None:
            query["perPage"] = per_page
        if page is not None:
            query["page"] = page
        return self._c.request("GET", "/api/github/search-code", endpoint="github.search-code", query=query)

    def search_repos(
        self,
        *,
        q: str,
        sort: str | None = None,
        order: str | None = None,
        per_page: int | None = None,
        page: int | None = None,
    ) -> CallResult:
        """Search repositories on GitHub. sort: stars|forks|help-wanted-issues|updated; order: asc|desc."""
        query: dict[str, Any] = {"q": q}
        if sort is not None:
            query["sort"] = sort
        if order is not None:
            query["order"] = order
        if per_page is not None:
            query["perPage"] = per_page
        if page is not None:
            query["page"] = page
        return self._c.request("GET", "/api/github/search-repos", endpoint="github.search-repos", query=query)

    def tags(self, *, owner: str, repo: str, per_page: int | None = None, page: int | None = None) -> CallResult:
        """List tags for a GitHub repo."""
        q: dict[str, Any] = {"owner": owner, "repo": repo}
        if per_page is not None:
            q["perPage"] = per_page
        if page is not None:
            q["page"] = page
        return self._c.request("GET", "/api/github/tags", endpoint="github.tags", query=q)

    def user(self, *, username: str) -> CallResult:
        """GitHub user/org profile by username."""
        return self._c.request("GET", "/api/github/user", endpoint="github.user", query={"username": username})


class _Predict(_Group):
    def search(self, *, q: str, limit: int | None = None, status: str | None = None) -> CallResult:
        """Cross-venue prediction-market keyword search (Polymarket + Kalshi + Limitless) with a venue tag on each hit."""
        query: dict = {"q": q}
        if limit is not None:
            query["limit"] = limit
        if status is not None:
            query["status"] = status
        return self._c.request("GET", "/api/predict/search", endpoint="predict.search", query=query)

    def events(self, *, q: str | None = None, limit: int | None = None, offset: int | None = None, closed: bool | None = None, order: str | None = None) -> CallResult:
        """Polymarket events (containers grouping related markets) with prices and volume."""
        query: dict = {}
        if q is not None:
            query["q"] = q
        if limit is not None:
            query["limit"] = limit
        if offset is not None:
            query["offset"] = offset
        if closed is not None:
            query["closed"] = closed
        if order is not None:
            query["order"] = order
        return self._c.request("GET", "/api/predict/events", endpoint="predict.events", query=query)

    def crypto_updown(self, *, limit: int | None = None) -> CallResult:
        """Polymarket crypto up/down markets (BTC/ETH/SPX hourly-daily directional)."""
        query: dict = {}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/predict/crypto-updown", endpoint="predict.crypto-updown", query=query)

    def leaderboard(self, *, rankBy: str | None = None, window: str | None = None, limit: int | None = None) -> CallResult:
        """Polymarket smart-wallet leaderboard ranked by PnL or volume."""
        query: dict = {}
        if rankBy is not None:
            query["rankBy"] = rankBy
        if window is not None:
            query["window"] = window
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/predict/leaderboard", endpoint="predict.leaderboard", query=query)

    def positions(self, *, address: str, limit: int | None = None) -> CallResult:
        """A wallet's open Polymarket positions with value and PnL."""
        query: dict = {"address": address}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/predict/positions", endpoint="predict.positions", query=query)

    def activity(self, *, address: str, limit: int | None = None, type: str | None = None) -> CallResult:
        """A wallet's Polymarket trade/merge/split/redeem activity."""
        query: dict = {"address": address}
        if limit is not None:
            query["limit"] = limit
        if type is not None:
            query["type"] = type
        return self._c.request("GET", "/api/predict/activity", endpoint="predict.activity", query=query)

    def matched_pairs(self, *, limit: int | None = None, minScore: float | None = None) -> CallResult:
        """Cross-venue equivalent market pairs (same question on Polymarket vs Kalshi) with price spread for arbitrage spotting (heuristic)."""
        query: dict = {}
        if limit is not None:
            query["limit"] = limit
        if minScore is not None:
            query["minScore"] = minScore
        return self._c.request("GET", "/api/predict/matched-pairs", endpoint="predict.matched-pairs", query=query)

    def sports(self, *, category: str | None = None, limit: int | None = None) -> CallResult:
        """Sports prediction markets (game outcomes) across Polymarket + Kalshi."""
        query: dict = {}
        if category is not None:
            query["category"] = category
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/predict/sports", endpoint="predict.sports", query=query)

    def holders(self, *, market: str, limit: int | None = None) -> CallResult:
        """Top holders of a Polymarket market, grouped by outcome token (conditionId). Each holder: wallet, trader name, position size, outcome index, and verified flag. Reveals concentration and smart-money pos"""
        query: dict = {"market": market}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/predict/holders", endpoint="predict.holders", query=query)

    def limitless_markets(self, *, limit: int | None = None) -> CallResult:
        """Active prediction markets on Limitless Exchange (on-chain, Base; keyless). Each market: conditionId, title, slug, description, status, live YES/NO prices, volume, liquidity, collateral token, expirati"""
        query: dict = {}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/predict/limitless-markets", endpoint="predict.limitless-markets", query=query)

    def kalshi_events(
        self,
        *,
        limit: int | None = None,
        cursor: str | None = None,
        status: str | None = None,
        series_ticker: str | None = None,
    ) -> CallResult:
        """List Kalshi events. status: unopened|open|closed|settled."""
        q: dict[str, Any] = {}
        if limit is not None:
            q["limit"] = limit
        if cursor is not None:
            q["cursor"] = cursor
        if status is not None:
            q["status"] = status
        if series_ticker is not None:
            q["seriesTicker"] = series_ticker
        return self._c.request("GET", "/api/predict/kalshi-events", endpoint="predict.kalshi-events", query=q)

    def kalshi_market(self, *, ticker: str) -> CallResult:
        """A single Kalshi market by ticker."""
        return self._c.request("GET", "/api/predict/kalshi-market", endpoint="predict.kalshi-market", query={"ticker": ticker})

    def kalshi_markets(
        self,
        *,
        limit: int | None = None,
        cursor: str | None = None,
        event_ticker: str | None = None,
        series_ticker: str | None = None,
        status: str | None = None,
        tickers: str | None = None,
    ) -> CallResult:
        """List Kalshi markets. tickers = comma-separated; status: unopened|open|closed|settled."""
        q: dict[str, Any] = {}
        if limit is not None:
            q["limit"] = limit
        if cursor is not None:
            q["cursor"] = cursor
        if event_ticker is not None:
            q["eventTicker"] = event_ticker
        if series_ticker is not None:
            q["seriesTicker"] = series_ticker
        if status is not None:
            q["status"] = status
        if tickers is not None:
            q["tickers"] = tickers
        return self._c.request("GET", "/api/predict/kalshi-markets", endpoint="predict.kalshi-markets", query=q)

    def kalshi_orderbook(self, *, ticker: str, depth: int | None = None) -> CallResult:
        """Order book for a Kalshi market by ticker. depth = levels (1-100)."""
        q: dict[str, Any] = {"ticker": ticker}
        if depth is not None:
            q["depth"] = depth
        return self._c.request("GET", "/api/predict/kalshi-orderbook", endpoint="predict.kalshi-orderbook", query=q)

    def kalshi_trades(self, *, ticker: str | None = None, limit: int | None = None, cursor: str | None = None) -> CallResult:
        """Recent Kalshi trades, optionally filtered to one ticker."""
        q: dict[str, Any] = {}
        if ticker is not None:
            q["ticker"] = ticker
        if limit is not None:
            q["limit"] = limit
        if cursor is not None:
            q["cursor"] = cursor
        return self._c.request("GET", "/api/predict/kalshi-trades", endpoint="predict.kalshi-trades", query=q)

    def market(self, *, condition_id: str | None = None, slug: str | None = None, id: str | None = None) -> CallResult:
        """A single Polymarket market by conditionId, slug, or id."""
        q: dict[str, Any] = {}
        if condition_id is not None:
            q["conditionId"] = condition_id
        if slug is not None:
            q["slug"] = slug
        if id is not None:
            q["id"] = id
        return self._c.request("GET", "/api/predict/market", endpoint="predict.market", query=q)

    def markets(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        active: bool | None = None,
        closed: bool | None = None,
        order: str | None = None,
        ascending: bool | None = None,
        tag_id: int | None = None,
    ) -> CallResult:
        """List Polymarket markets. order: volume|liquidity|endDate|startDate."""
        q: dict[str, Any] = {}
        if limit is not None:
            q["limit"] = limit
        if offset is not None:
            q["offset"] = offset
        if active is not None:
            q["active"] = active
        if closed is not None:
            q["closed"] = closed
        if order is not None:
            q["order"] = order
        if ascending is not None:
            q["ascending"] = ascending
        if tag_id is not None:
            q["tagId"] = tag_id
        return self._c.request("GET", "/api/predict/markets", endpoint="predict.markets", query=q)

    def orderbook(self, *, token_id: str) -> CallResult:
        """Polymarket CLOB order book for an outcome token id."""
        return self._c.request("GET", "/api/predict/orderbook", endpoint="predict.orderbook", query={"tokenId": token_id})

    def price(self, *, token_id: str) -> CallResult:
        """Polymarket bid/ask/mid for an outcome token id."""
        return self._c.request("GET", "/api/predict/price", endpoint="predict.price", query={"tokenId": token_id})

    def price_history(self, *, token_id: str, interval: str | None = None, fidelity: int | None = None) -> CallResult:
        """Polymarket price history for a token. interval: 1h|6h|1d|1w|1m|max."""
        q: dict[str, Any] = {"tokenId": token_id}
        if interval is not None:
            q["interval"] = interval
        if fidelity is not None:
            q["fidelity"] = fidelity
        return self._c.request("GET", "/api/predict/price-history", endpoint="predict.price-history", query=q)

    def trades(self, *, market: str | None = None, user: str | None = None, limit: int | None = None) -> CallResult:
        """Polymarket trades. market = conditionId; user = wallet address."""
        q: dict[str, Any] = {}
        if market is not None:
            q["market"] = market
        if user is not None:
            q["user"] = user
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/predict/trades", endpoint="predict.trades", query=q)

    def wallet(self, *, address: str) -> CallResult:
        """Polymarket wallet portfolio + positions by (proxy) address."""
        return self._c.request("GET", "/api/predict/wallet", endpoint="predict.wallet", query={"address": address})

    def whales(self, *, limit: int | None = None, min_usd: float | None = None) -> CallResult:
        """Largest recent Polymarket trades. minUsd = only trades at/above this USD notional."""
        q: dict[str, Any] = {}
        if limit is not None:
            q["limit"] = limit
        if min_usd is not None:
            q["minUsd"] = min_usd
        return self._c.request("GET", "/api/predict/whales", endpoint="predict.whales", query=q)


class _Sports(_Group):
    def nba_teams(self, *, id: int | None = None) -> CallResult:
        """NBA teams (all 30, or one by id) — conference, division, city, abbreviation."""
        query: dict = {}
        if id is not None:
            query["id"] = id
        return self._c.request("GET", "/api/sports/nba-teams", endpoint="sports.nba-teams", query=query)

    def nba_players(self, *, search: str | None = None, cursor: str | None = None, per_page: int | None = None) -> CallResult:
        """Search NBA players by name → position, height, weight, jersey, team."""
        query: dict = {}
        if search is not None:
            query["search"] = search
        if cursor is not None:
            query["cursor"] = cursor
        if per_page is not None:
            query["per_page"] = per_page
        return self._c.request("GET", "/api/sports/nba-players", endpoint="sports.nba-players", query=query)

    def nba_games(self, *, season: int | None = None, date: str | None = None, team_id: int | None = None, cursor: str | None = None, per_page: int | None = None) -> CallResult:
        """NBA games (schedule + scores) by season, date, or team — status, scores, home/visitor teams."""
        query: dict = {}
        if season is not None:
            query["season"] = season
        if date is not None:
            query["date"] = date
        if team_id is not None:
            query["team_id"] = team_id
        if cursor is not None:
            query["cursor"] = cursor
        if per_page is not None:
            query["per_page"] = per_page
        return self._c.request("GET", "/api/sports/nba-games", endpoint="sports.nba-games", query=query)

    def nfl_teams(self, *, id: int | None = None) -> CallResult:
        """NFL teams (all 32, or one by id) — conference, division, location, abbreviation."""
        query: dict = {}
        if id is not None:
            query["id"] = id
        return self._c.request("GET", "/api/sports/nfl-teams", endpoint="sports.nfl-teams", query=query)

    def nfl_players(self, *, search: str | None = None, cursor: str | None = None, per_page: int | None = None) -> CallResult:
        """Search NFL players by name → position, team, experience."""
        query: dict = {}
        if search is not None:
            query["search"] = search
        if cursor is not None:
            query["cursor"] = cursor
        if per_page is not None:
            query["per_page"] = per_page
        return self._c.request("GET", "/api/sports/nfl-players", endpoint="sports.nfl-players", query=query)

    def nfl_games(self, *, season: int | None = None, week: int | None = None, team_id: int | None = None, cursor: str | None = None, per_page: int | None = None) -> CallResult:
        """NFL games (schedule + scores) by season, week, or team — status, scores, venue."""
        query: dict = {}
        if season is not None:
            query["season"] = season
        if week is not None:
            query["week"] = week
        if team_id is not None:
            query["team_id"] = team_id
        if cursor is not None:
            query["cursor"] = cursor
        if per_page is not None:
            query["per_page"] = per_page
        return self._c.request("GET", "/api/sports/nfl-games", endpoint="sports.nfl-games", query=query)

    def mlb_schedule(self, *, date: str | None = None, team_id: int | None = None) -> CallResult:
        """MLB schedule. date YYYY-MM-DD (default today); teamId filters to one club."""
        q: dict[str, Any] = {}
        if date is not None:
            q["date"] = date
        if team_id is not None:
            q["teamId"] = team_id
        return self._c.request("GET", "/api/sports/mlb-schedule", endpoint="sports.mlb-schedule", query=q)

    def mlb_standings(self, *, season: int | None = None) -> CallResult:
        """MLB standings for a season (defaults to current year)."""
        q: dict[str, Any] = {}
        if season is not None:
            q["season"] = season
        return self._c.request("GET", "/api/sports/mlb-standings", endpoint="sports.mlb-standings", query=q)

    def nhl_schedule(self, *, date: str | None = None, team: str | None = None) -> CallResult:
        """NHL schedule. date YYYY-MM-DD anchor (default today); team = 3-letter abbrev (TOR, BOS, EDM)."""
        q: dict[str, Any] = {}
        if date is not None:
            q["date"] = date
        if team is not None:
            q["team"] = team
        return self._c.request("GET", "/api/sports/nhl-schedule", endpoint="sports.nhl-schedule", query=q)

    def nhl_scores(self, *, date: str | None = None) -> CallResult:
        """NHL scores for a date (YYYY-MM-DD; default today)."""
        q: dict[str, Any] = {}
        if date is not None:
            q["date"] = date
        return self._c.request("GET", "/api/sports/nhl-scores", endpoint="sports.nhl-scores", query=q)

    def nhl_standings(self) -> CallResult:
        """Current NHL standings (team records by conference/division)."""
        return self._c.request("GET", "/api/sports/nhl-standings", endpoint="sports.nhl-standings", query={})


class _News(_Group):
    def hn_top(self, *, kind: str = "top", limit: int = 30) -> CallResult:
        """Hacker News feed (top | new | best | ask | show | job)."""
        return self._c.request(
            "GET", "/api/news/hn-top", endpoint="news.hn-top",
            query={"kind": kind, "limit": limit},
        )

    def hn_item(self, *, id: int) -> CallResult:
        """Fetch a Hacker News item (story/comment/job/poll) by numeric id."""
        return self._c.request(
            "GET", "/api/news/hn-item", endpoint="news.hn-item",
            query={"id": id},
        )

    def search(
        self,
        *,
        q: str,
        count: Optional[int] = None,
        offset: Optional[int] = None,
        country: Optional[str] = None,
        freshness: Optional[str] = None,
    ) -> CallResult:
        """Live news search: headlines with source, age, breaking flag.

        freshness: pd (past day) | pw | pm | py.
        """
        query: dict[str, Any] = {"q": q}
        if count is not None: query["count"] = count
        if offset is not None: query["offset"] = offset
        if country is not None: query["country"] = country
        if freshness is not None: query["freshness"] = freshness
        return self._c.request("GET", "/api/news/search", endpoint="news.search", query=query)

    def hn_search(
        self,
        *,
        query: str | None = None,
        tags: str | None = None,
        sort: str | None = None,
        author: str | None = None,
        limit: int | None = None,
    ) -> CallResult:
        """Search Hacker News (Algolia). tags: story|comment|ask_hn|show_hn|poll; sort: relevance|date."""
        q: dict[str, Any] = {}
        if query is not None:
            q["query"] = query
        if tags is not None:
            q["tags"] = tags
        if sort is not None:
            q["sort"] = sort
        if author is not None:
            q["author"] = author
        if limit is not None:
            q["limit"] = limit
        return self._c.request("GET", "/api/news/hn-search", endpoint="news.hn-search", query=q)

    def hn_user(self, *, username: str) -> CallResult:
        """Hacker News user profile (karma, about, created, submitted count)."""
        return self._c.request("GET", "/api/news/hn-user", endpoint="news.hn-user", query={"username": username})


class _Search(_Group):
    def ai(self, *, q: str, maxResults: int | None = None, topic: str | None = None) -> CallResult:
        """AI web search optimized for agents. Returns ranked results with the relevant extracted content of each page (not just a link + blurb), plus a relevance score. topic=news for recent reporting. Distinct"""
        query: dict = {"q": q}
        if maxResults is not None:
            query["maxResults"] = maxResults
        if topic is not None:
            query["topic"] = topic
        return self._c.request("GET", "/api/search/ai", endpoint="search.ai", query=query)

    def crawl(self, *, url: str, limit: int | None = None, maxDepth: int | None = None, instructions: str | None = None) -> CallResult:
        """Crawl a site and return clean page content. POST { url, limit?, maxDepth?, instructions? }. Follows links from the start URL (up to 10 pages, depth ≤2) and returns each page's extracted content. Optio"""
        body: dict = {"url": url}
        if limit is not None:
            body["limit"] = limit
        if maxDepth is not None:
            body["maxDepth"] = maxDepth
        if instructions is not None:
            body["instructions"] = instructions
        return self._c.request("POST", "/api/search/crawl", endpoint="search.crawl", body=body)

    def extract(self, *, urls: Any, depth: str | None = None) -> CallResult:
        """Extract clean, LLM-ready content from up to 5 URLs in one call. POST { urls[], depth? }. Returns the main text content of each page (JS-rendered, boilerplate stripped) plus a list of any URLs that fai"""
        body: dict = {"urls": urls}
        if depth is not None:
            body["depth"] = depth
        return self._c.request("POST", "/api/search/extract", endpoint="search.extract", body=body)

    def endpoints(self, *, q: str, limit: Optional[int] = None) -> CallResult:
        """Find 2s endpoints matching a natural-language query (e.g. "screen a company for sanctions")."""
        query: dict[str, Any] = {"q": q}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/search/endpoints", endpoint="search.endpoints", query=query)

    def web(
        self,
        *,
        q: str,
        count: Optional[int] = None,
        offset: Optional[int] = None,
        country: Optional[str] = None,
        freshness: Optional[str] = None,
        safesearch: Optional[str] = None,
    ) -> CallResult:
        """Live web search: ranked results with title, url, snippet, site, age.

        freshness: pd | pw | pm | py | YYYY-MM-DDtoYYYY-MM-DD.
        safesearch: off | moderate | strict.
        """
        query: dict[str, Any] = {"q": q}
        if count is not None: query["count"] = count
        if offset is not None: query["offset"] = offset
        if country is not None: query["country"] = country
        if freshness is not None: query["freshness"] = freshness
        if safesearch is not None: query["safesearch"] = safesearch
        return self._c.request("GET", "/api/search/web", endpoint="search.web", query=query)


class _Flight(_Group):
    def airport_board(self, *, airport: str, type: str | None = None, limit: int | None = None) -> CallResult:
        """Live airport activity board (FlightAware AeroAPI). For an airport (ICAO like KSFO or IATA like SFO), returns recent/upcoming departures or arrivals — flight ident, registration, aircraft type, origin/"""
        query: dict = {"airport": airport}
        if type is not None:
            query["type"] = type
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/flight/airport-board", endpoint="flight.airport-board", query=query)

    def route_schedule(self, *, origin: str, destination: str, startDate: str, endDate: str, limit: int | None = None) -> CallResult:
        """Scheduled flights between two airports over a date window (FlightAware AeroAPI). Pass origin and destination (ICAO or IATA) plus startDate/endDate; returns scheduled flights with ident, operator, airc"""
        query: dict = {"origin": origin, "destination": destination, "startDate": startDate, "endDate": endDate}
        if limit is not None:
            query["limit"] = limit
        return self._c.request("GET", "/api/flight/route-schedule", endpoint="flight.route-schedule", query=query)

    def status(
        self,
        *,
        ident: str,
        ident_type: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Live flight status by designator (UAL1 / UA1) or tail number.

        ident_type: designator | registration | fa_flight_id.
        """
        q: dict[str, Any] = {"ident": ident}
        if ident_type is not None: q["identType"] = ident_type
        if limit is not None: q["limit"] = limit
        return self._c.request("GET", "/api/flight/status", endpoint="flight.status", query=q)


class _Transcribe(_Group):
    def audio(
        self,
        *,
        url: str,
        language: Optional[str] = None,
        diarize: Optional[bool] = None,
    ) -> CallResult:
        """Transcribe an audio file URL (<=15 MB, <=15 min).

        Returns transcript, confidence, duration, language, word timestamps,
        and speaker utterances when diarize=True.
        """
        body: dict[str, Any] = {"url": url}
        if language is not None: body["language"] = language
        if diarize is not None: body["diarize"] = diarize
        return self._c.request("POST", "/api/transcribe/audio", endpoint="transcribe.audio", body=body)


class _Nonprofit(_Group):
    def screen(
        self,
        *,
        q: Optional[str] = None,
        ein: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> CallResult:
        """Nonprofit lookup + per-org OFAC sanctions screen.

        Exactly one of q (name search) or ein (9 digits).
        """
        if (q is None) == (ein is None):
            raise ValueError("screen() requires exactly one of q or ein.")
        query: dict[str, Any] = {}
        if q is not None: query["q"] = q
        if ein is not None: query["ein"] = ein
        if limit is not None: query["limit"] = limit
        return self._c.request("GET", "/api/nonprofit/screen", endpoint="nonprofit.screen", query=query)

    def search(
        self,
        *,
        q: Optional[str] = None,
        ein: Optional[str] = None,
        state: Optional[str] = None,
        ntee_code: Optional[str] = None,
        subsection_code: Optional[int] = None,
        page: int = 0,
    ) -> CallResult:
        """US 501(c) nonprofit search via ProPublica Nonprofit Explorer."""
        query: dict[str, Any] = {"page": page}
        if q is not None: query["q"] = q
        if ein is not None: query["ein"] = ein
        if state is not None: query["state"] = state
        if ntee_code is not None: query["nteeCode"] = ntee_code
        if subsection_code is not None: query["subsectionCode"] = subsection_code
        return self._c.request("GET", "/api/nonprofit/search", endpoint="nonprofit.search", query=query)


class TwoS:
    """
    Main client for 2s.io. Construct once, reuse across calls.

    Args:
        private_key: Hex EVM private key (``0x...``) for the wallet that will
            sign x402 payments. We construct ``eth_account.Account.from_key``
            for you and pass it through as ``signer``. This is the canonical
            way to instantiate — matches our docs + SDK examples.
        signer: Pre-built ``eth_account.LocalAccount`` for x402 payment signing.
            Use this if you already have a signer (e.g. from a custodial KMS
            wrapper). Mutually exclusive with ``private_key``.
        solana_private_key: Base58-encoded Solana keypair secret (the 64-byte
            ``solana-keygen`` format, base58 string) for paying on the Solana
            USDC rail instead of (or in addition to) Base. Requires the svm
            extra: ``pip install '2sio[svm]'``. When both EVM and Solana keys
            are configured the client pays with whichever rail the endpoint's
            402 envelope lists first (Base today).
        api_key: Internal-only bearer API key. The public 2s.io surface is
            x402-only; we do NOT advertise bearer auth. Reserved for internal
            use until deposit detection is wired up.
        base_url: Override the default ``https://2s.io`` host.
        max_price_usd: Optional local ceiling on per-call payment. No default cap
            (some endpoints are intentionally premium); set this to opt in.
        on_payment_requested: Optional ``(info) -> bool`` hook fired before signing.
    """

    def __init__(
        self,
        *,
        private_key: Optional[str] = None,
        signer: Any = None,
        solana_private_key: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE,
        max_price_usd: float = DEFAULT_MAX_PRICE_USD,
        on_payment_requested: Optional[Callable[[dict], bool]] = None,
        timeout: float = 30.0,
        trial: bool = False,
    ):
        if private_key is not None and signer is not None:
            raise ValueError("TwoS accepts private_key= OR signer=, not both.")
        if private_key is not None:
            try:
                from eth_account import Account  # type: ignore
            except ImportError as e:
                raise ImportError(
                    "TwoS(private_key=...) requires `eth-account`. Reinstall: pip install '2sio[x402]'"
                ) from e
            # Normalize so callers can pass either '0x...' or bare hex.
            key = private_key if private_key.startswith("0x") else "0x" + private_key
            signer = Account.from_key(key)
        # trial=True is a keyless try-before-you-buy client — no signer needed.
        if signer is None and solana_private_key is None and not api_key and not trial:
            raise ValueError(
                "TwoS requires private_key='0x...' (Base), solana_private_key='...' (Solana), a "
                "pre-built signer=..., or trial=True for free try-before-you-buy calls."
            )
        self.trial = trial
        self.signer = signer
        self._solana_private_key = solana_private_key
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.max_price_usd = max_price_usd
        self.on_payment_requested = on_payment_requested
        self._http: Optional[httpx.Client] = None
        self._timeout = timeout
        self._x402_client = None  # lazy

        self.patents = _Patents(self)
        self.time = _Time(self)
        self.watchers = _Watchers(self)
        self.markets = _Markets(self)
        self.store = _Store(self)
        self.lock = _Lock(self)
        self.pubsub = _Pubsub(self)
        self.queue = _Queue(self)
        self.schedule = _Schedule(self)
        self.class_ = _Class(self)
        self.tcg = _Tcg(self)
        self.crypto = _Crypto(self)
        self.ai = _Ai(self)
        self.law = _Law(self)
        self.finance = _Finance(self)
        self.geocode = _Geocode(self)
        self.aircraft = _Aircraft(self)
        self.airport = _Airport(self)
        self.weather = _Weather(self)
        self.dns = _Dns(self)
        self.domain = _Domain(self)
        self.url = _Url(self)
        self.wikipedia = _Wikipedia(self)
        self.papers = _Papers(self)
        self.geo = _Geo(self)
        self.ipinfo = _Ipinfo(self)
        self.hash = _Hash(self)
        self.validate = _Validate(self)
        self.calendar = _Calendar(self)
        self.convert = _Convert(self)
        self.iso = _Iso(self)
        self.tax = _Tax(self)
        self.inflation = _Inflation(self)
        self.econ = _Econ(self)
        self.edi = _Edi(self)
        self.factcheck = _Factcheck(self)
        self.aviation = _Aviation(self)
        self.dev = _Dev(self)
        self.security = _Security(self)
        self.water = _Water(self)
        self.trade = _Trade(self)
        self.quakes = _Quakes(self)
        self.sunrise = _Sunrise(self)
        self.tides = _Tides(self)
        self.medical = _Medical(self)
        self.net = _Net(self)
        self.product = _Product(self)
        self.research = _Research(self)
        self.timezone = _Timezone(self)
        self.earth = _Earth(self)
        self.climate = _Climate(self)
        self.stocks = _Stocks(self)
        self.nutrition = _Nutrition(self)
        self.person = _Person(self)
        self.tld = _Tld(self)
        self.census = _Census(self)
        self.account = _Account(self)
        self.batch = _Batch(self)
        self.agriculture = _Agriculture(self)
        self.soil = _Soil(self)
        self.music = _Music(self)
        self.maritime = _Maritime(self)
        self.labor = _Labor(self)
        self.occupation = _Occupation(self)
        self.telecom = _Telecom(self)
        self.poi = _Poi(self)
        self.barcode = _Barcode(self)
        self.countdown = _Countdown(self)
        self.image = _Image(self)
        self.phone = _Phone(self)
        self.bio = _Bio(self)
        self.space = _Space(self)
        self.vehicle = _Vehicle(self)
        self.html = _Html(self)
        self.tls = _Tls(self)
        self.business = _Business(self)
        self.gov = _Gov(self)
        self.agent = _Agent(self)
        self.chem = _Chem(self)
        self.bank = _Bank(self)
        self.license = _License(self)
        self.health = _Health(self)
        self.nonprofit = _Nonprofit(self)
        self.worldbank = _WorldBank(self)
        self.book = _Book(self)
        self.clinical = _Clinical(self)
        self.code = _Code(self)
        self.wikidata = _Wikidata(self)
        self.paper = _Paper(self)
        self.registry = _Registry(self)
        self.fx = _Fx(self)
        self.bls = _Bls(self)
        self.country = _Country(self)
        self.news = _News(self)
        self.search = _Search(self)
        self.flight = _Flight(self)
        self.transcribe = _Transcribe(self)
        self.food = _Food(self)
        self.word = _Word(self)
        self.edu = _Edu(self)
        self.energy = _Energy(self)
        self.park = _Park(self)
        self.recreation = _Recreation(self)
        self.job = _Job(self)
        self.property = _Property(self)
        self.treasury = _Treasury(self)
        self.email = _Email(self)
        self.travel = _Travel(self)
        self.chinese = _Chinese(self)
        self.feedback = _Feedback(self)
        self.github = _Github(self)
        self.predict = _Predict(self)
        self.sports = _Sports(self)

    def _client(self) -> httpx.Client:
        if self._http is None:
            self._http = httpx.Client(timeout=self._timeout)
        return self._http

    def _get_x402_client(self):
        if self._x402_client is not None:
            return self._x402_client
        if self.signer is None and self._solana_private_key is None:
            raise RuntimeError("x402 call attempted but no signer was configured.")
        # Lazy imports — only paying users need the x402 dep loaded, and
        # EVM-only users never load the Solana stack (and vice versa).
        from x402 import x402Client  # type: ignore

        c = x402Client()
        if self.signer is not None:
            from x402.mechanisms.evm import EthAccountSigner  # type: ignore
            from x402.mechanisms.evm.exact.register import register_exact_evm_client  # type: ignore

            register_exact_evm_client(c, EthAccountSigner(self.signer))
        if self._solana_private_key is not None:
            try:
                from solders.keypair import Keypair  # type: ignore
                from x402.mechanisms.svm import KeypairSigner  # type: ignore
                from x402.mechanisms.svm.exact.register import register_exact_svm_client  # type: ignore
            except ImportError as e:
                raise ImportError(
                    "TwoS(solana_private_key=...) requires the Solana extras. Install: pip install '2sio[svm]'"
                ) from e
            keypair = Keypair.from_base58_string(self._solana_private_key)
            register_exact_svm_client(c, KeypairSigner(keypair))
        self._x402_client = c
        return c

    def request(
        self,
        method: str,
        path: str,
        *,
        endpoint: str,
        query: Optional[dict] = None,
        body: Optional[dict] = None,
    ) -> CallResult:
        """Low-level call. Endpoint methods use this internally."""
        url = self.base_url + path
        params = {k: v for k, v in (query or {}).items() if v is not None}
        headers: dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        # Try-before-you-buy: free trial call (1/endpoint/hour/client), no payment.
        if self.trial:
            headers["X-2s-Trial"] = "1"

        http = self._client()
        if body is not None:
            res = http.request(method, url, params=params, json=body, headers=headers)
        else:
            res = http.request(method, url, params=params, headers=headers)

        if res.status_code != 402:
            return self._parse(res, endpoint, url)

        # Trial mode never pays: a 402 means the free trial for this endpoint is
        # exhausted (or it's not trial-eligible). Raise a clear error rather than
        # trying to sign a payment we have no key for.
        if self.trial:
            try:
                msg = res.json().get("error", {}).get("message")
            except Exception:
                msg = None
            raise TwoSError(
                msg
                or "Free trial unavailable for this endpoint right now (1 call/endpoint/hour). "
                "Pass private_key=... or signer=... to pay per call for unlimited access.",
                402,
                "TRIAL_EXHAUSTED",
                url,
            )

        # 402 — sign and retry via x402 SDK.
        from x402.http import x402HTTPClient  # type: ignore

        body_json = res.json()
        # The x402 Python SDK exposes a helper to read PaymentRequired from a
        # combination of headers + body. We construct the lightweight shim here.
        def get_header(name: str) -> Optional[str]:
            return res.headers.get(name)

        client = self._get_x402_client()
        http_helper = x402HTTPClient(client)
        required = http_helper.get_payment_required_response(get_header, body_json)
        if not required.accepts:
            raise TwoSError("402 missing accepts[]", 402, "BAD_402", url)
        accepts = required.accepts[0]
        amount_usd = int(accepts.amount) / 1_000_000
        if amount_usd > self.max_price_usd:
            raise PaymentRefusedError(
                f"price ${amount_usd} > max_price_usd ${self.max_price_usd}",
                url, amount_usd,
            )
        if self.on_payment_requested is not None:
            info = {"url": url, "amount_usd": amount_usd, "network": accepts.network, "pay_to": accepts.pay_to}
            if not self.on_payment_requested(info):
                raise PaymentRefusedError("on_payment_requested denied", url, amount_usd)

        # x402Client.create_payment_payload is async-only. We need a sync
        # wrapper that works in BOTH plain-sync contexts AND inside an
        # already-running event loop (e.g., LangChain's async agent path).
        # asyncio.run() fails inside a running loop, so we always shunt to a
        # fresh thread + fresh loop. ~1ms overhead, robust everywhere.
        payload = _run_coro_sync(client.create_payment_payload(required))
        sig_headers = http_helper.encode_payment_signature_header(payload)
        merged = {**headers, **sig_headers}

        if body is not None:
            res2 = http.request(method, url, params=params, json=body, headers=merged)
        else:
            res2 = http.request(method, url, params=params, headers=merged)
        return self._parse(res2, endpoint, url)

    def _parse(self, res: httpx.Response, endpoint: str, url: str) -> CallResult:
        ct = res.headers.get("content-type", "")
        tx_hash = res.headers.get("x-payment-tx")
        settlement = None
        resp_hdr = res.headers.get("payment-response") or res.headers.get("x-payment-response")
        if resp_hdr:
            import base64
            import json
            try:
                decoded = json.loads(base64.b64decode(resp_hdr).decode("utf-8"))
                settlement = {
                    "tx_hash": decoded.get("transaction") or tx_hash,
                    "network": decoded.get("network"),
                    "success": bool(decoded.get("success")),
                }
            except Exception:
                if tx_hash:
                    settlement = {"tx_hash": tx_hash, "network": None, "success": True}

        if "application/json" in ct:
            j = res.json()
            if not res.is_success:
                err = j.get("error") or {}
                raise TwoSError(err.get("message") or f"HTTP {res.status_code}",
                                res.status_code, err.get("code"), url)
            return CallResult(
                data=j.get("data", j),
                endpoint=endpoint,
                cost_usd=(j.get("meta", {}).get("cost", {}) or {}).get("usd", 0.0),
                settlement=settlement,
                balance_usd=(j.get("meta", {}).get("balance", {}) or {}).get("usd"),
            )

        # Binary
        if not res.is_success:
            raise TwoSError(res.text[:200], res.status_code, None, url)
        return CallResult(data=res.content, endpoint=endpoint, settlement=settlement)

    def close(self) -> None:
        if self._http is not None:
            self._http.close()
            self._http = None

    def __enter__(self) -> "TwoS":
        return self

    def __exit__(self, *args) -> None:
        self.close()
