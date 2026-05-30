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
