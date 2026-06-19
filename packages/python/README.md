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

An ever-expanding catalog of endpoints, namespaced by group:

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
