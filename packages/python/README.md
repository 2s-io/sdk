# 2sio (Python)

**Python client for [2s.io](https://2s.io) — the (most) everything API. Pay-per-call AI-agent data APIs on Base or Solana via x402.**

```bash
pip install 2sio
```

## 🎁 Try before you buy — free, no wallet

Verify any endpoint before funding a wallet. `trial=True` makes free calls (one per endpoint per hour, no key, no signup):

```python
from twosio import TwoS

trial = TwoS(trial=True)
print(trial.validate.iban(iban="GB82WEST12345698765432").data["items"][0]["valid"])
# real result; once/hour/endpoint, then raises TwoSError(code="TRIAL_EXHAUSTED")
```

Pass `private_key=...` (below) to pay per call for unlimited access.

## Quick start

```python
import os
from twosio import TwoS

# private_key is an EVM key (0x...) holding USDC on Base mainnet.
client = TwoS(private_key=os.environ["EVM_PRIVATE_KEY"])

r = client.patents.search(q="neural network", limit=5)
print(r.data["hits"][0]["title"])
print("paid:", r.cost_usd, "USDC, tx:", r.settlement["tx_hash"])
```

Settles on Base mainnet in ~2 seconds. Prices start at $0.001/call.

If you'd rather construct the signer yourself (e.g. for a custodial KMS-backed wallet), pass it directly:

```python
from eth_account import Account
signer = Account.from_key(os.environ["EVM_PRIVATE_KEY"])
client = TwoS(signer=signer)
```

## What's included

260+ endpoints across 85+ groups, namespaced on the client. A sample of the verticals:

- **Patents & trademarks** — USPTO patent search/detail/documents, trademark search.
- **Legal** — court opinions & dockets (CourtListener / Free Law Project), OFAC sanctions screening.
- **Government & economy** — Federal Register, Congress votes, FEC, BLS, US Census, World Bank, inflation/FX.
- **Finance & markets** — SEC EDGAR filings, stock fundamentals, crypto address validation, gas oracle.
- **Science & medicine** — arXiv / PubMed / Semantic Scholar papers, ICD-10 & clinical lookups, nutrition, chem/bio.
- **Vehicles & aviation** — NHTSA VIN decode & recalls, aircraft registry, airports, live flights.
- **Geo & weather** — geocoding (OpenStreetMap), NWS/NOAA forecasts, tides, earthquakes (USGS), timezone, sunrise.
- **Business & registries** — company lookups, nonprofits, GLEIF LEI entity match, licenses.
- **Security** — CVE lookup (NVD + CISA KEV + EPSS).
- **Web & data utilities** — URL→markdown, screenshots, hashing, DNS/TLS, barcode, format conversion.
- **Agent primitives** — knowledge-delta, memory, marketplace.

```python
client.patents.search(q="neural network")
client.law.sanctions_check(name="John Smith")
client.vehicle.vin_decode(vin="1HGCM82633A004352")
client.security.cve(cve="CVE-2021-44228")
client.finance.company_facts(ticker="AAPL")
client.geocode.address(query="350 5th Ave, New York, NY")
# ... and many more
```

Settles in USDC on **Base** or **Solana** via x402. Full catalog: <https://2s.io/api/directory>. OpenAPI: <https://2s.io/api/openapi>.

## Safety

- **No default price cap** — some endpoints are intentionally premium. Set `max_price_usd` to opt into a local ceiling; the client then refuses to sign any payment above it.
- Optional `on_payment_requested` hook for per-call approval.

```python
client = TwoS(
    private_key=os.environ["EVM_PRIVATE_KEY"],
    max_price_usd=0.05,
    on_payment_requested=lambda info: info["amount_usd"] < 0.02,
)
```

## Errors

- `TwoSError` — HTTP error from 2s.io.
- `PaymentRefusedError` — local refusal (price cap or hook).

## License

MIT.
