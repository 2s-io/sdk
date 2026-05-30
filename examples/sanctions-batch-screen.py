"""
Agent: batch sanctions screening for an onboarding flow.

Given a list of names, hit /api/law/sanctions-check on each and flag
anything that matches the OFAC SDN list. The endpoint is authoritative —
backed by the OFAC dataset that 2s.io re-ingests daily.

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
    {'name': 'Jane Smith'},
    {'name': 'Maduro Moros, Nicolas'},  # OFAC SDN match expected
    {'name': 'Erik Johansson'},
]

flagged = []
clear = []
total_cost = 0.0

for applicant in applicants:
    # /api/law/sanctions-check expects `query` (not `name`). threshold
    # defaults to 0.4 on the server; pass it explicitly if you want
    # tighter or looser fuzzy matching. Scores >= 0.85 are flagged as
    # high-confidence by the endpoint.
    result = client.law.sanctions_check(query=applicant['name'], limit=5)
    total_cost += result.cost_usd or 0.0
    matches = result.data.get('matches') if isinstance(result.data, dict) else None
    if matches:
        flagged.append({**applicant, 'matches': matches})
    else:
        clear.append(applicant)

print(f'CLEAR ({len(clear)}):')
for a in clear:
    print(f"  {a['name']}")

print(f"\nFLAGGED — DO NOT ONBOARD ({len(flagged)}):")
for a in flagged:
    print(f"  {a['name']}")
    for m in a['matches']:
        # Fields on each match: name, score, programs (list), entityType,
        # source, aliases, etc. The exact key names may evolve; see
        # /api/openapi for the live shape.
        score = m.get('score') or m.get('similarity')
        programs = m.get('programs') or m.get('sanctions_programs') or []
        print(f"    → score={score}  programs={programs}")

print(f"\nTotal paid: ${total_cost:.4f} USDC")
