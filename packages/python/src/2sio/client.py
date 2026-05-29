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

    def translate(self, *, text: str, target: str, source: Optional[str] = None) -> CallResult:
        body: dict[str, Any] = {"text": text, "target": target}
        if source is not None:
            body["source"] = source
        return self._c.request("POST", "/api/ai/translate", endpoint="ai.translate", body=body)

    def extract(self, *, url: str, schema: dict, instruction: Optional[str] = None) -> CallResult:
        body: dict[str, Any] = {"url": url, "schema": schema}
        if instruction is not None:
            body["instruction"] = instruction
        return self._c.request("POST", "/api/ai/extract", endpoint="ai.extract", body=body)

    def describe_image(self, *, url: Optional[str] = None, base64: Optional[str] = None) -> CallResult:
        body: dict[str, Any] = {}
        if url is not None:
            body["url"] = url
        if base64 is not None:
            body["base64"] = base64
        return self._c.request("POST", "/api/ai/describe-image", endpoint="ai.describe-image", body=body)

    def screenshot(self, *, url: str, viewport_width: int = 1280, viewport_height: int = 800,
                   full_page: bool = False) -> CallResult:
        return self._c.request(
            "POST", "/api/ai/screenshot", endpoint="ai.screenshot",
            body={
                "url": url,
                "viewportWidth": viewport_width,
                "viewportHeight": viewport_height,
                "fullPage": full_page,
            },
        )


class _Law(_Group):
    def case_search(self, **kwargs) -> CallResult:
        return self._c.request("GET", "/api/law/case-search", endpoint="law.case-search", query=kwargs)

    def case_verify(self, *, citation: str) -> CallResult:
        return self._c.request("GET", "/api/law/case-verify", endpoint="law.case-verify", query={"citation": citation})

    def sanctions_check(self, *, name: str, min_score: float = 0.7, limit: int = 10) -> CallResult:
        return self._c.request(
            "GET", "/api/law/sanctions-check", endpoint="law.sanctions-check",
            query={"name": name, "minScore": min_score, "limit": limit},
        )

    def federal_register(self, **kwargs) -> CallResult:
        return self._c.request("GET", "/api/law/federal-register", endpoint="law.federal-register", query=kwargs)

    def opinion(self, *, id: Union[str, int]) -> CallResult:
        return self._c.request("GET", "/api/law/opinion", endpoint="law.opinion", query={"id": id})


class _Geocode(_Group):
    def address(self, *, query: str, country_code: Optional[str] = None) -> CallResult:
        q: dict[str, Any] = {"query": query}
        if country_code is not None:
            q["countryCode"] = country_code
        return self._c.request("GET", "/api/geocode/address", endpoint="geocode.address", query=q)

    def reverse(self, *, lat: float, lon: float) -> CallResult:
        return self._c.request("GET", "/api/geocode/reverse", endpoint="geocode.reverse", query={"lat": lat, "lon": lon})


class _Airport(_Group):
    def lookup(self, **kwargs) -> CallResult:
        return self._c.request("GET", "/api/airport/lookup", endpoint="airport.lookup", query=kwargs)

    def near(self, *, lat: float, lon: float, limit: int = 5) -> CallResult:
        return self._c.request("GET", "/api/airport/near", endpoint="airport.near",
                               query={"lat": lat, "lon": lon, "limit": limit})


class _Weather(_Group):
    def zip(self, *, zip: str) -> CallResult:
        return self._c.request("GET", "/api/weather/zip", endpoint="weather.zip", query={"zip": zip})


class _Dns(_Group):
    def lookup(self, *, name: str, type: str = "A") -> CallResult:
        return self._c.request("GET", "/api/dns/lookup", endpoint="dns.lookup", query={"name": name, "type": type})


class _Domain(_Group):
    def whois(self, *, domain: str) -> CallResult:
        return self._c.request("GET", "/api/domain/whois", endpoint="domain.whois", query={"domain": domain})


class _Url(_Group):
    def unfurl(self, *, url: str) -> CallResult:
        return self._c.request("GET", "/api/url/unfurl", endpoint="url.unfurl", query={"url": url})

    def clean(self, *, url: str) -> CallResult:
        return self._c.request("GET", "/api/url/clean", endpoint="url.clean", query={"url": url})


class _Wikipedia(_Group):
    def summary(self, *, title: str) -> CallResult:
        return self._c.request("GET", "/api/wikipedia/summary", endpoint="wikipedia.summary", query={"title": title})


class _Papers(_Group):
    def search(self, **kwargs) -> CallResult:
        return self._c.request("GET", "/api/papers/search", endpoint="papers.search", query=kwargs)


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
    def recent(self, **kwargs) -> CallResult:
        return self._c.request("GET", "/api/quakes/recent", endpoint="quakes.recent", query=kwargs)


class _Sunrise(_Group):
    def compute(self, *, lat: float, lon: float, date: Optional[str] = None) -> CallResult:
        q: dict[str, Any] = {"lat": lat, "lon": lon}
        if date is not None:
            q["date"] = date
        return self._c.request("GET", "/api/sunrise/compute", endpoint="sunrise.compute", query=q)


class _Tides(_Group):
    def now(self, *, lat: float, lon: float) -> CallResult:
        return self._c.request("GET", "/api/tides/now", endpoint="tides.now", query={"lat": lat, "lon": lon})


class _Earth(_Group):
    def now(self, *, lat: float, lon: float) -> CallResult:
        return self._c.request("GET", "/api/earth/now", endpoint="earth.now", query={"lat": lat, "lon": lon})


class _Climate(_Group):
    def station_near(self, *, lat: float, lon: float, limit: int = 5) -> CallResult:
        return self._c.request("GET", "/api/climate/station-near", endpoint="climate.station-near",
                               query={"lat": lat, "lon": lon, "limit": limit})


class _Census(_Group):
    def zipcode(self, *, zip: str) -> CallResult:
        return self._c.request("GET", "/api/census/zipcode", endpoint="census.zipcode", query={"zip": zip})


class _Account(_Group):
    def balance(self) -> CallResult:
        return self._c.request("GET", "/api/account/balance", endpoint="account.balance")


class TwoS:
    """
    Main client for 2s.io. Construct once, reuse across calls.

    Args:
        signer: ``eth_account.LocalAccount`` for x402 payment signing.
        api_key: Pre-funded 2s.io API key for bearer billing.
        base_url: Override the default ``https://2s.io`` host.
        max_price_usd: Local ceiling on per-call payment. Defaults to ``$0.10``.
        on_payment_requested: Optional ``(info) -> bool`` hook fired before signing.
    """

    def __init__(
        self,
        *,
        signer: Any = None,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE,
        max_price_usd: float = DEFAULT_MAX_PRICE_USD,
        on_payment_requested: Optional[Callable[[dict], bool]] = None,
        timeout: float = 30.0,
    ):
        if signer is None and not api_key:
            raise ValueError("TwoS requires either signer=... (x402) or api_key=... (bearer)")
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

        payload = client.create_payment_payload(required)
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
