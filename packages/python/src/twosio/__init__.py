"""
2sio — Python client for 2s.io's pay-per-call AI agent API.

Two auth modes:
  - x402 (default): pass an eth_account ``LocalAccount``. The client auto-
    handles 402 responses, signs an EIP-3009 USDC authorization via the
    official ``x402`` SDK, retries, and returns the typed dict.
  - Bearer: pass ``api_key=`` to debit a pre-funded account on 2s.io.

Example::

    import os
    from eth_account import Account
    from twosio import TwoS

    account = Account.from_key(os.environ["EVM_PRIVATE_KEY"])
    client = TwoS(signer=account)

    result = client.patents.search(q="neural network", limit=5)
    print(result["data"]["hits"][0]["title"])
"""

from __future__ import annotations

from .client import TwoS, TwoSError, PaymentRefusedError

__all__ = ["TwoS", "TwoSError", "PaymentRefusedError"]
__version__ = "1.80.3"
