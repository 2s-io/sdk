"""
Agent: assemble a one-shot "everything about this ZIP code" bundle.

Useful for any agent that needs to know who-is-where: real-estate research,
local-marketing prep, sales territory planning, "moving to X — what's it
like?" workflows.

Calls three endpoints concurrently:
  - /api/census/zipcode    → ACS demographics (population, income, ages)
  - /api/weather/zip       → NWS current weather conditions
  - /api/geocode/address   → canonical lat/lon for the ZIP

Total cost: ~$0.003 / ZIP (3 × $0.001).

Run:
    EVM_PRIVATE_KEY=0x... python zip-context-bundle.py 94043
"""

import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from twosio import TwoS

zip_code = sys.argv[1] if len(sys.argv) > 1 else '94043'

# The Python SDK is fully synchronous. To run independent calls in
# parallel, dispatch them across a thread pool — each call holds a real
# HTTPS connection during the 402 → sign → retry round-trip.
client = TwoS(private_key=os.environ['EVM_PRIVATE_KEY'])


def run() -> None:
    calls = {
        'census': lambda: client.census.zipcode(zip=zip_code),
        'weather': lambda: client.weather.zip(zip=zip_code),
        'geo': lambda: client.geocode.address(query=zip_code),
    }
    results: dict = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fn): name for name, fn in calls.items()}
        for fut in as_completed(futures):
            results[futures[fut]] = fut.result()

    census = results['census'].data
    weather = results['weather'].data
    geo = results['geo'].data

    print(f'ZIP {zip_code}')
    formatted = (geo.get('hits') or [{}])[0].get('formatted') if isinstance(geo, dict) else None
    print(f'  Location:                  {formatted or "(unknown)"}')
    print(f'  Population:                {census.get("population"):,}')
    print(f'  Median age:                {census.get("medianAge")}')
    print(f'  Median household income:   ${census.get("income", {}).get("medianHouseholdUSD"):,}')
    print(f'  Bachelors-or-higher %:     {census.get("education", {}).get("pctBachelorsOrHigher")}')

    # /api/weather/zip's data shape is documented at /api/openapi. Common
    # fields include `temperatureF`, `condition`, `windMph`. We probe-print
    # rather than hard-assume a specific schema so this example survives
    # future field renames upstream.
    if isinstance(weather, dict):
        temp = weather.get('temperatureF') or weather.get('temperature_f') or weather.get('temperature')
        cond = weather.get('condition') or weather.get('summary') or weather.get('shortForecast')
        print(f'  Current weather:           {cond}, {temp}°F')

    total_cost = sum(r.cost_usd or 0.0 for r in results.values())
    print(f'\nTotal paid: ${total_cost:.4f} USDC')


if __name__ == '__main__':
    run()
