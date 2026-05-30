"""
Agent: archive screenshots of a list of URLs.

Common use case: visual change detection, regulatory compliance archiving,
research that needs visual provenance, or "save what this page looked like
on day X". /api/ai/screenshot is backed by a headless browser, so it
captures the page AS RENDERED (after JS, after CSS) rather than raw HTML.

Each call costs $0.0075. Bytes come back inline; save them to disk +
metadata file for downstream search.

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

for i, url in enumerate(urls):
    result = client.ai.screenshot(url=url, fullPage=True, format='png', timeoutMs=12000)
    fname = f'page-{i:02d}.png'
    (out_dir / fname).write_bytes(result.bytes)
    manifest.append({
        'url': url,
        'file': fname,
        'capturedAt': datetime.now(timezone.utc).isoformat(),
        'renderMs': result.render_ms,
        'sizeBytes': len(result.bytes),
        'txHash': result.meta.settlement.txHash,
    })
    print(f"  ✓ {url} → {fname} ({len(result.bytes):,} bytes, {result.render_ms}ms)")

(out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print(f"\nArchive written to {out_dir}/")
print(f"Total paid: ${sum(0.0075 for _ in urls):.4f} USDC")
