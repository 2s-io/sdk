# 2sio (Python)

**Python client for [2s.io](https://2s.io) — 575+ pay-per-call tools for AI agents: more ground-truth data than any other x402 API, a full AI gateway (chat, image, multi-model consensus), and agent infrastructure (wallet-scoped storage, locks, queues, schedules, watchers). USDC on Base or Solana via x402.**

**upto billing (new on 2s):** AI endpoints also accept the x402 `upto` scheme — authorize the quoted max, get settled for your **actual usage** (a real on-chain example settled at 1/42nd of the quote). Exact-scheme calls work unchanged.


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

## 🔔 Watchers — get woken up, don't poll

Most endpoints are reads. **Watchers** flip that: arm one once and we POST you a **signed callback the instant something happens** — a wallet moves, a stock crosses your price, a company reports earnings. No polling loop. Flat **$0.05** to arm; callbacks are EIP-191-signed (verify offline) and retried with exponential backoff, with a pull backstop via `watchers.status`.

```python
res = client.watchers.stock_price(
    ticker="AAPL", conditionType="above", threshold=250,
    callbackUrl="https://your-agent.app/hooks/aapl",
)
print(res.data["items"][0]["watcherId"])  # we POST your payload here the moment AAPL crosses $250
# also: client.watchers.crypto_address_activity(...), client.watchers.earnings(...)
```

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

An ever-expanding catalog of 570+ endpoints across 112+ groups (live count in the [directory](https://2s.io/api/directory)), namespaced by group — spanning AI (incl. multi-model consensus), agent primitives, control plane (distributed locks, durable queues, scheduled callbacks, pub/sub), storage (key-value / documents / vectors / private blobs), watchers (signed push callbacks), security (CVE / KEV / EPSS, IOC, exploits), identity resolution (ID crosswalks), patents & trademarks, law & sanctions, government & public records, finance & treasury, vehicles & aviation, health & medical, business & GLEIF/KYB, energy & agriculture, maritime & telecom, geo / weather / earth, space, science & papers, property & licenses, internet, crypto, music & news, and data validators / utilities:

```python
client.patents.search(q="...")
client.security.cve(id="CVE-2024-3094")
client.crypto.address_validate(chain="eth", address="0xd8dA...")
client.ai.summarize(url="https://example.com")
client.law.sanctions_check(name="John Smith")
client.business.entity_match(name="Acme Corp")
client.geocode.address(query="350 5th Ave, New York, NY")
client.weather.zip(zip="94103")
# ... and 530+ more
```

Full catalog: <https://2s.io/api/directory>. OpenAPI: <https://2s.io/api/openapi>.

## Safety

- The client refuses to sign payments above `max_price_usd`. **There is no default cap** (`max_price_usd` defaults to `inf`) — set it to opt into a ceiling.
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
