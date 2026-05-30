"""
Agent: assemble a one-shot "everything about this ZIP code" bundle.

Useful for any agent that needs to know who-is-where: real-estate research,
local-marketing prep, sales territory planning, "moving to X — what's it
like?" workflows.

Calls three endpoints in parallel:
  - /api/census/zipcode    → ACS demographics (population, income, ages)
  - /api/weather/zip       → NWS current weather conditions
  - /api/geocode/reverse   → canonical lat/lon for the ZIP

Total cost: $0.003 / ZIP (3 × $0.001).

Run:
    WALLET_KEY=0x... python zip-context-bundle.py 94043
"""

import asyncio
import os
import sys
from twosio import TwoS

zip_code = sys.argv[1] if len(sys.argv) > 1 else '94043'

client = TwoS(private_key=os.environ['WALLET_KEY'])


async def bundle():
    # Run all three in parallel — each is a separate paid call.
    census_task = asyncio.create_task(client.census.zipcode(zip=zip_code))
    weather_task = asyncio.create_task(client.weather.zip(zip=zip_code))
    # Reverse-geocode requires lat/lon — derive from census centroid once it returns.
    census = await census_task
    weather = await weather_task

    geo_task = asyncio.create_task(
        client.geocode.reverse(lat=census.data.centroid.latitude, lon=census.data.centroid.longitude)
    )
    geo = await geo_task

    print(f'ZIP {zip_code}')
    print(f'  Location:   {geo.data.formatted}')
    print(f'  Population: {census.data.totalPopulation:,}')
    print(f'  Median age: {census.data.medianAge}')
    print(f'  Median household income: ${census.data.medianHouseholdIncome:,}')
    print(f'  Current weather: {weather.data.summary}, {weather.data.temperatureF}°F')


asyncio.run(bundle())
