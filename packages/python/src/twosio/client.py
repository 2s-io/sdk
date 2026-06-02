"""
TwoS client implementation. Synchronous + async variants share a request
core that handles 402-aware retries.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional, Union

import httpx

DEFAULT_BASE = "https://2s.io"
DEFAULT_MAX_PRICE_USD = 0.10


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


class _Crypto(_Group):
    def address_validate(self, *, chain: str, address: str) -> CallResult:
        return self._c.request(
            "GET", "/api/crypto/address-validate",
            endpoint="crypto.address-validate",
            query={"chain": chain, "address": address},
        )

    def gas_oracle(self, *, chain: str = "base") -> CallResult:
        return self._c.request(
            "GET", "/api/crypto/gas-oracle",
            endpoint="crypto.gas-oracle",
            query={"chain": chain},
        )


class _Ai(_Group):
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


class _Law(_Group):
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


class _Url(_Group):
    def unfurl(self, *, url: str) -> CallResult:
        return self._c.request("GET", "/api/url/unfurl", endpoint="url.unfurl", query={"url": url})

    def clean(
        self,
        *,
        url: str,
        format: Optional[str] = None,
    ) -> CallResult:
        """Fetch URL → clean readable markdown.

        Server params: url, format (one of markdown|text|both; default markdown).
        """
        q: dict[str, Any] = {"url": url}
        if format is not None:
            q["format"] = format
        return self._c.request("GET", "/api/url/clean", endpoint="url.clean", query=q)


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
    def ip(self, *, ip: str) -> CallResult:
        return self._c.request("GET", "/api/geo/ip", endpoint="geo.ip", query={"ip": ip})


class _Ipinfo(_Group):
    def bulk(self, *, ips: list[str]) -> CallResult:
        return self._c.request("POST", "/api/ipinfo/bulk", endpoint="ipinfo.bulk", body={"ips": ips})


class _Hash(_Group):
    def compute(self, **kwargs) -> CallResult:
        return self._c.request("POST", "/api/hash/compute", endpoint="hash.compute", body=kwargs)


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


class _Census(_Group):
    def zipcode(self, *, zip: str) -> CallResult:
        return self._c.request("GET", "/api/census/zipcode", endpoint="census.zipcode", query={"zip": zip})


class _Account(_Group):
    def balance(self) -> CallResult:
        return self._c.request("GET", "/api/account/balance", endpoint="account.balance")


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


class _Space(_Group):
    def weather(self) -> CallResult:
        """Current NOAA space-weather snapshot (Kp index, solar flux, aurora)."""
        return self._c.request("GET", "/api/space/weather", endpoint="space.weather")


class _Vehicle(_Group):
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


class _Gov(_Group):
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


class _AgentMemory(_Group):
    def put(
        self,
        *,
        key: str,
        value: Any,
        ttl_seconds: Optional[int] = None,
    ) -> CallResult:
        """Write/replace a memory entry. Namespace = your x402 pubkey."""
        body: dict[str, Any] = {"key": key, "value": value}
        if ttl_seconds is not None:
            body["ttlSeconds"] = ttl_seconds
        return self._c.request("POST", "/api/agent/memory/put", endpoint="agent.memory.put", body=body)

    def get(self, *, key: str) -> CallResult:
        return self._c.request("GET", "/api/agent/memory/get", endpoint="agent.memory.get", query={"key": key})

    def list(
        self,
        *,
        prefix: Optional[str] = None,
        limit: int = 25,
        cursor: Optional[str] = None,
    ) -> CallResult:
        q: dict[str, Any] = {"limit": limit}
        if prefix is not None: q["prefix"] = prefix
        if cursor is not None: q["cursor"] = cursor
        return self._c.request("GET", "/api/agent/memory/list", endpoint="agent.memory.list", query=q)

    def delete(self, *, key: str) -> CallResult:
        return self._c.request("POST", "/api/agent/memory/delete", endpoint="agent.memory.delete", body={"key": key})


class _AgentMarketplace(_Group):
    def register(
        self,
        *,
        name: str,
        description: str,
        capabilities: list,
        endpoint_url: Optional[str] = None,
        price_usd: Optional[float] = None,
        network: Optional[str] = None,
        pay_to: Optional[str] = None,
        status: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> CallResult:
        body: dict[str, Any] = {
            "name": name,
            "description": description,
            "capabilities": capabilities,
        }
        if endpoint_url is not None: body["endpointUrl"] = endpoint_url
        if price_usd is not None: body["priceUsd"] = price_usd
        if network is not None: body["network"] = network
        if pay_to is not None: body["payTo"] = pay_to
        if status is not None: body["status"] = status
        if metadata is not None: body["metadata"] = metadata
        return self._c.request("POST", "/api/agent/marketplace/register", endpoint="agent.marketplace.register", body=body)

    def discover(
        self,
        *,
        q: Optional[str] = None,
        capabilities: Optional[str] = None,
        network: Optional[str] = None,
        limit: int = 25,
        offset: int = 0,
    ) -> CallResult:
        query: dict[str, Any] = {"limit": limit, "offset": offset}
        if q is not None: query["q"] = q
        if capabilities is not None: query["capabilities"] = capabilities
        if network is not None: query["network"] = network
        return self._c.request("GET", "/api/agent/marketplace/discover", endpoint="agent.marketplace.discover", query=query)

    def profile(self, *, namespace: str) -> CallResult:
        return self._c.request("GET", "/api/agent/marketplace/profile", endpoint="agent.marketplace.profile", query={"namespace": namespace})

    def review(
        self,
        *,
        reviewed: str,
        outcome: str,
        rating: Optional[int] = None,
        comment: Optional[str] = None,
        tx_hash: Optional[str] = None,
        network: Optional[str] = None,
    ) -> CallResult:
        body: dict[str, Any] = {"reviewed": reviewed, "outcome": outcome}
        if rating is not None: body["rating"] = rating
        if comment is not None: body["comment"] = comment
        if tx_hash is not None: body["txHash"] = tx_hash
        if network is not None: body["network"] = network
        return self._c.request("POST", "/api/agent/marketplace/review", endpoint="agent.marketplace.review", body=body)


class _Agent(_Group):
    """Agent-native primitives: knowledge-delta, memory, marketplace."""
    def __init__(self, c):
        super().__init__(c)
        self.memory = _AgentMemory(c)
        self.marketplace = _AgentMarketplace(c)

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


class _Nonprofit(_Group):
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
        api_key: Internal-only bearer API key. The public 2s.io surface is
            x402-only; we do NOT advertise bearer auth. Reserved for internal
            use until deposit detection is wired up.
        base_url: Override the default ``https://2s.io`` host.
        max_price_usd: Local ceiling on per-call payment. Defaults to ``$0.10``.
        on_payment_requested: Optional ``(info) -> bool`` hook fired before signing.
    """

    def __init__(
        self,
        *,
        private_key: Optional[str] = None,
        signer: Any = None,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE,
        max_price_usd: float = DEFAULT_MAX_PRICE_USD,
        on_payment_requested: Optional[Callable[[dict], bool]] = None,
        timeout: float = 30.0,
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
        if signer is None and not api_key:
            raise ValueError(
                "TwoS requires either private_key='0x...' (recommended) or a pre-built signer=... ."
            )
        self.signer = signer
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.max_price_usd = max_price_usd
        self.on_payment_requested = on_payment_requested
        self._http: Optional[httpx.Client] = None
        self._timeout = timeout
        self._x402_client = None  # lazy

        self.patents = _Patents(self)
        self.crypto = _Crypto(self)
        self.ai = _Ai(self)
        self.law = _Law(self)
        self.finance = _Finance(self)
        self.geocode = _Geocode(self)
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
        self.quakes = _Quakes(self)
        self.sunrise = _Sunrise(self)
        self.tides = _Tides(self)
        self.earth = _Earth(self)
        self.climate = _Climate(self)
        self.census = _Census(self)
        self.account = _Account(self)
        self.poi = _Poi(self)
        self.barcode = _Barcode(self)
        self.countdown = _Countdown(self)
        self.image = _Image(self)
        self.phone = _Phone(self)
        self.space = _Space(self)
        self.vehicle = _Vehicle(self)
        self.gov = _Gov(self)
        self.agent = _Agent(self)
        self.chem = _Chem(self)
        self.bank = _Bank(self)
        self.license = _License(self)
        self.health = _Health(self)
        self.nonprofit = _Nonprofit(self)

    def _client(self) -> httpx.Client:
        if self._http is None:
            self._http = httpx.Client(timeout=self._timeout)
        return self._http

    def _get_x402_client(self):
        if self._x402_client is not None:
            return self._x402_client
        if self.signer is None:
            raise RuntimeError("x402 call attempted but no signer was configured.")
        # Lazy import — only paying users need the x402 dep loaded.
        from x402 import x402Client  # type: ignore
        from x402.mechanisms.evm import EthAccountSigner  # type: ignore
        from x402.mechanisms.evm.exact.register import register_exact_evm_client  # type: ignore

        c = x402Client()
        register_exact_evm_client(c, EthAccountSigner(self.signer))
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

        http = self._client()
        if body is not None:
            res = http.request(method, url, params=params, json=body, headers=headers)
        else:
            res = http.request(method, url, params=params, headers=headers)

        if res.status_code != 402:
            return self._parse(res, endpoint, url)

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
