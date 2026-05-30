"""
Agent: archive screenshots of a list of URLs.

Common use case: visual change detection, regulatory compliance archiving,
research that needs visual provenance, or "save what this page looked like
on day X". /api/ai/screenshot is backed by a headless browser, so it
captures the page AS RENDERED (after JS, after CSS) rather than raw HTML.

Each PNG call costs $0.0075. Bytes come back as result.data; save them to
disk + manifest for downstream search.

Run:
    EVM_PRIVATE_KEY=0x... python screenshot-archive.py
"""

import json
import os
from pathlib import Path
from datetime import datetime, timezone

from twosio import TwoS

client = TwoS(private_key=os.environ['EVM_PRIVATE_KEY'])

urls = [
    'https://www.uspto.gov/patent/laws-and-regulations',
    'https://supreme.justia.com/cases/federal/us/2024/',
    'https://www.federalregister.gov/agencies/securities-and-exchange-commission',
]

out_dir = Path('archive') / datetime.now(timezone.utc).strftime('%Y-%m-%d')
out_dir.mkdir(parents=True, exist_ok=True)

manifest = []
total_cost = 0.0

for i, url in enumerate(urls):
    # Python SDK kwargs are snake_case; the SDK translates to the server's
    # camelCase JSON body. format defaults to png, timeout_ms defaults to 8000.
    result = client.ai.screenshot(url=url, full_page=True, format='png', timeout_ms=12000)
    fname = f'page-{i:02d}.png'
    img_bytes: bytes = result.data  # binary endpoints: raw bytes in .data
    (out_dir / fname).write_bytes(img_bytes)
    tx = (result.settlement or {}).get('tx_hash')
    total_cost += result.cost_usd or 0.0
    manifest.append({
        'url': url,
        'file': fname,
        'capturedAt': datetime.now(timezone.utc).isoformat(),
        'sizeBytes': len(img_bytes),
        'txHash': tx,
        'costUsd': result.cost_usd,
    })
    print(f'  ✓ {url} → {fname} ({len(img_bytes):,} bytes, tx {tx})')

(out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print(f'\nArchive written to {out_dir}/')
print(f'Total paid: ${total_cost:.4f} USDC')
