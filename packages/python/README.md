# 2sio (Python)

**Python client for [2s.io](https://2s.io) — pay-per-call AI agent APIs on Base via x402.**

```bash
pip install "2sio[x402]"
```

## Quick start (x402, no signup)

```python
import os
from eth_account import Account
from twosio import TwoS

account = Account.from_key(os.environ["EVM_PRIVATE_KEY"])
client = TwoS(signer=account)

r = client.patents.search(q="neural network", limit=5)
print(r.data["hits"][0]["title"])
print("paid:", r.cost_usd, "USDC, tx:", r.settlement["tx_hash"])
```

Settles on Base mainnet in ~2 seconds. Prices start at $0.001/call.

## Quick start (bearer)

```python
client = TwoS(api_key=os.environ["TWOSIO_API_KEY"])
r = client.patents.search(q="neural network")
```

## What's included

39 endpoints, namespaced by group:

```python
client.patents.search(q="...")
client.patents.detail(applicationNumber="18566276")
client.crypto.address_validate(chain="eth", address="0xd8dA...")
client.ai.summarize(url="https://example.com")
client.law.sanctions_check(name="John Smith")
client.geocode.address(query="350 5th Ave, New York, NY")
client.weather.zip(zip="94103")
# ... and more
```

Full catalog: <https://2s.io/api/directory>. OpenAPI: <https://2s.io/api/openapi>.

## Safety

- The client refuses to sign payments above `max_price_usd` (default `$0.10`).
- Optional `on_payment_requested` hook for per-call approval.

```python
client = TwoS(
    signer=account,
    max_price_usd=0.05,
    on_payment_requested=lambda info: info["amount_usd"] < 0.02,
)
```

## Errors

- `TwoSError` — HTTP error from 2s.io.
- `PaymentRefusedError` — local refusal (price cap or hook).

## License

MIT.
