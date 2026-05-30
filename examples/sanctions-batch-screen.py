"""
Agent: batch sanctions screening for an onboarding flow.

Given a CSV/list of (name, country) tuples, hit /api/law/sanctions-check
on each and flag anything that matches the OFAC SDN list. The endpoint is
authoritative — backed by the live OFAC dataset that 2s.io re-ingests daily.

Use this pattern in any KYC/AML onboarding workflow where you'd otherwise
roll your own OFAC parser. Each call costs $0.0048.

Run:
    EVM_PRIVATE_KEY=0x... python sanctions-batch-screen.py
"""

import os
from twosio import TwoS

client = TwoS(private_key=os.environ['EVM_PRIVATE_KEY'])

# In real code this would be a CSV / database query / API response.
# Mix of clearly-safe names + a deliberate OFAC hit so the example shows
# both code paths.
applicants = [
    {'name': 'Jane Smith', 'country': 'US'},
    {'name': 'Maduro Moros, Nicolas',  'country': 'VE'},  # OFAC SDN match expected
    {'name': 'Erik Johansson', 'country': 'SE'},
]

flagged = []
clear = []

for applicant in applicants:
    result = client.law.sanctions_check(name=applicant['name'], country=applicant['country'])
    if result.data.matches:
        flagged.append({**applicant, 'matches': result.data.matches})
    else:
        clear.append(applicant)

print(f'CLEAR ({len(clear)}):')
for a in clear:
    print(f"  {a['name']} ({a['country']})")

print(f"\nFLAGGED — DO NOT ONBOARD ({len(flagged)}):")
for a in flagged:
    print(f"  {a['name']} ({a['country']})")
    for m in a['matches']:
        print(f"    → {m['program']} | {m['source_url']}")
