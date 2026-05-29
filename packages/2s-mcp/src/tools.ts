/**
 * Tool registry — each 2s.io endpoint becomes an MCP tool. Names use
 * dot notation matching the API directory (e.g. `patents.search`).
 *
 * Input schemas are JSON Schema (draft-2020-12), which is what MCP hosts
 * pass to LLMs for function-call schema. We keep them hand-written here
 * rather than auto-derived from Zod so the tool descriptions read well
 * to a language model.
 */

import type { TwoS, CallResult } from '@2sio/sdk'

export interface ToolDef {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
  invoke(args: Record<string, unknown>): Promise<CallResult<unknown>>
}

export function buildToolList(c: TwoS): ToolDef[] {
  const s = (description: string, properties: Record<string, unknown>, required?: string[]) =>
    ({ type: 'object' as const, description, properties, required, additionalProperties: false })

  const t: ToolDef[] = [
    // ── Patents ──────────────────────────────────────────────────────
    {
      name: 'patents.search',
      description:
        'Search US patent applications and grants (USPTO Open Data Portal). Returns titles, inventors, applicants, status, classification codes, and Patent Center URLs.',
      inputSchema: s('Search input', {
        q: { type: 'string', description: 'Free-text query (min 2 chars).' },
        yearFrom: { type: 'integer', description: 'Earliest filing year.' },
        yearTo: { type: 'integer', description: 'Latest filing year.' },
        applicationType: { type: 'string', enum: ['Utility', 'Design', 'Plant', 'Reissue'] },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }, ['q']),
      invoke: (a) => c.patents.search(a as never),
    },
    {
      name: 'patents.detail',
      description:
        'Full file-wrapper detail for a US patent application: bibliography, event timeline (filings, Office Actions, allowances), continuity chain (parents, divisionals), assignments, foreign priority.',
      inputSchema: s('Detail input', {
        applicationNumber: { type: 'string', description: '6-10 digit USPTO application number.' },
      }, ['applicationNumber']),
      invoke: (a) => c.patents.detail(a as never),
    },
    {
      name: 'patents.documents',
      description:
        'List every document in a US patent application file wrapper: Office Actions (CTNF, CTFR), IDS, claims, notices of allowance. Returns code, description, official date, and Patent Center download URL.',
      inputSchema: s('Documents input', {
        applicationNumber: { type: 'string', description: '6-10 digit USPTO application number.' },
      }, ['applicationNumber']),
      invoke: (a) => c.patents.documents(a as never),
    },

    // ── Crypto ───────────────────────────────────────────────────────
    {
      name: 'crypto.address-validate',
      description:
        'Validate a cryptocurrency address with full checksum verification (not just regex). Catches typos before sending funds. Chains: btc, eth, sol, ltc, trx, xrp, bch.',
      inputSchema: s('Address validation input', {
        chain: { type: 'string', enum: ['btc', 'eth', 'sol', 'ltc', 'trx', 'xrp', 'bch'] },
        address: { type: 'string' },
      }, ['chain', 'address']),
      invoke: (a) => c.crypto.addressValidate(a as never),
    },
    {
      name: 'crypto.gas-oracle',
      description:
        'Live EVM gas oracle. Returns slow/standard/fast tiers derived from priority-fee percentiles over the trailing 4 blocks plus a 21,000-gas transfer cost estimate. Chains: base, ethereum, polygon, arbitrum, optimism.',
      inputSchema: s('Gas oracle input', {
        chain: { type: 'string', default: 'base' },
      }),
      invoke: (a) => c.crypto.gasOracle(a as never),
    },

    // ── AI ───────────────────────────────────────────────────────────
    {
      name: 'ai.summarize',
      description:
        'Summarize a webpage. Returns a short summary, 3-7 key points, title, audience, and reading time. Backed by an upstream LLM.',
      inputSchema: s('Summarize input', {
        url: { type: 'string', format: 'uri' },
        instruction: { type: 'string', description: 'Optional steering hint.' },
      }, ['url']),
      invoke: (a) => c.ai.summarize(a as never),
    },
    {
      name: 'ai.translate',
      description: 'Translate text into a target language. Source language auto-detected if omitted.',
      inputSchema: s('Translate input', {
        text: { type: 'string' },
        target: { type: 'string', description: 'BCP-47 language code, e.g. "es", "ja".' },
        source: { type: 'string', description: 'Optional BCP-47 source code; auto-detected by default.' },
      }, ['text', 'target']),
      invoke: (a) => c.ai.translate(a as never),
    },
    {
      name: 'ai.extract',
      description:
        'Fetch a URL and extract typed data from its content per a user-supplied JSON Schema. Use when you need a structured payload conforming to your own shape.',
      inputSchema: s('Extract input', {
        url: { type: 'string', format: 'uri' },
        schema: { type: 'object', description: 'JSON Schema describing the desired output.' },
        instruction: { type: 'string', description: 'Optional extraction guidance.' },
      }, ['url', 'schema']),
      invoke: (a) => c.ai.extract(a as never),
    },
    {
      name: 'ai.describe-image',
      description: 'Describe an image — caption + tags + any detected text.',
      inputSchema: s('Describe image input', {
        url: { type: 'string', format: 'uri', description: 'Public image URL.' },
        base64: { type: 'string', description: 'Alternatively, base64-encoded image bytes.' },
      }),
      invoke: (a) => c.ai.describeImage(a as never),
    },
    {
      name: 'ai.screenshot',
      description: 'Take a screenshot of a URL. Returns base64 image + size metadata.',
      inputSchema: s('Screenshot input', {
        url: { type: 'string', format: 'uri' },
        viewportWidth: { type: 'integer', default: 1280 },
        viewportHeight: { type: 'integer', default: 800 },
        fullPage: { type: 'boolean', default: false },
      }, ['url']),
      invoke: (a) => c.ai.screenshot(a as never),
    },

    // ── Law ──────────────────────────────────────────────────────────
    {
      name: 'law.case-search',
      description: 'Search US federal + state case law (CourtListener / Free Law Project).',
      inputSchema: s('Case search input', {
        q: { type: 'string' },
        limit: { type: 'integer', default: 10 },
        offset: { type: 'integer', default: 0 },
      }, ['q']),
      invoke: (a) => c.law.caseSearch(a as never),
    },
    {
      name: 'law.case-verify',
      description:
        'Verify a legal citation exists and resolve it to a real case. Critical anti-hallucination check before quoting case law.',
      inputSchema: s('Case verify input', {
        citation: { type: 'string', description: 'e.g. "410 U.S. 113" or "Brown v. Board of Education, 347 U.S. 483".' },
      }, ['citation']),
      invoke: (a) => c.law.caseVerify(a as never),
    },
    {
      name: 'law.sanctions-check',
      description:
        'Screen a name against the US OFAC SDN list plus other consolidated screening lists. Fuzzy match with similarity score.',
      inputSchema: s('Sanctions check input', {
        name: { type: 'string' },
        minScore: { type: 'number', minimum: 0, maximum: 1, default: 0.7 },
        limit: { type: 'integer', default: 10 },
      }, ['name']),
      invoke: (a) => c.law.sanctionsCheck(a as never),
    },
    {
      name: 'law.federal-register',
      description: 'Search US Federal Register documents (proposed rules, final rules, notices).',
      inputSchema: s('Federal register search input', {
        q: { type: 'string' },
        limit: { type: 'integer', default: 10 },
        dateFrom: { type: 'string', format: 'date' },
        dateTo: { type: 'string', format: 'date' },
      }, ['q']),
      invoke: (a) => c.law.federalRegister(a as never),
    },
    {
      name: 'law.opinion',
      description: 'Fetch the full text of a court opinion by CourtListener id.',
      inputSchema: s('Opinion input', {
        id: { type: ['string', 'integer'] },
      }, ['id']),
      invoke: (a) => c.law.opinion(a as never),
    },

    // ── Airports / weather / geo ─────────────────────────────────────
    {
      name: 'airport.lookup',
      description: 'Look up an airport by IATA, ICAO, or local identifier. ~85k airports (CC0).',
      inputSchema: s('Airport lookup', {
        iata: { type: 'string', description: '3-letter IATA code (e.g. SFO).' },
        icao: { type: 'string', description: '4-letter ICAO code (e.g. KSFO).' },
        ident: { type: 'string', description: 'Raw OurAirports identifier.' },
      }),
      invoke: (a) => c.airport.lookup(a as never),
    },
    {
      name: 'airport.near',
      description: 'Find airports near a coordinate, ordered by distance.',
      inputSchema: s('Airport near', {
        lat: { type: 'number' },
        lon: { type: 'number' },
        limit: { type: 'integer', default: 5 },
      }, ['lat', 'lon']),
      invoke: (a) => c.airport.near(a as never),
    },
    {
      name: 'weather.zip',
      description: 'Current US weather for a ZIP code (NOAA NWS).',
      inputSchema: s('Weather by ZIP', {
        zip: { type: 'string', description: '5-digit US ZIP code.' },
      }, ['zip']),
      invoke: (a) => c.weather.zip(a as never),
    },
    {
      name: 'climate.station-near',
      description:
        'Find NOAA GHCN-Daily climate stations near a coordinate. Useful for long-term climate-history lookups.',
      inputSchema: s('Climate station near', {
        lat: { type: 'number' },
        lon: { type: 'number' },
        limit: { type: 'integer', default: 5 },
      }, ['lat', 'lon']),
      invoke: (a) => c.climate.stationNear(a as never),
    },
    {
      name: 'tides.now',
      description: 'NOAA tide predictions for the nearest tide station to a coordinate.',
      inputSchema: s('Tides near', {
        lat: { type: 'number' },
        lon: { type: 'number' },
      }, ['lat', 'lon']),
      invoke: (a) => c.tides.now(a as never),
    },
    {
      name: 'sunrise.compute',
      description: 'Astronomically compute sunrise, sunset, solar noon, and civil/nautical/astronomical twilights for a coord + date.',
      inputSchema: s('Sunrise compute', {
        lat: { type: 'number' },
        lon: { type: 'number' },
        date: { type: 'string', format: 'date', description: 'YYYY-MM-DD, defaults to today UTC.' },
      }, ['lat', 'lon']),
      invoke: (a) => c.sunrise.compute(a as never),
    },
    {
      name: 'earth.now',
      description: 'Composite situational awareness for a coordinate: timezone, local time, sunrise/sunset, nearby quakes, current weather.',
      inputSchema: s('Earth now', {
        lat: { type: 'number' },
        lon: { type: 'number' },
      }, ['lat', 'lon']),
      invoke: (a) => c.earth.now(a as never),
    },
    {
      name: 'quakes.recent',
      description: 'Recent global earthquakes (USGS feed).',
      inputSchema: s('Quakes recent', {
        minMagnitude: { type: 'number', default: 4 },
        limit: { type: 'integer', default: 20 },
        sinceHours: { type: 'integer', default: 24 },
      }),
      invoke: (a) => c.quakes.recent(a as never),
    },
    {
      name: 'geocode.address',
      description: 'Forward geocode a free-text address to a coordinate (LocationIQ, OSM/ODbL).',
      inputSchema: s('Geocode address', {
        query: { type: 'string' },
        countryCode: { type: 'string', description: 'Optional ISO-3166 alpha-2 to bias.' },
      }, ['query']),
      invoke: (a) => c.geocode.address(a as never),
    },
    {
      name: 'geocode.reverse',
      description: 'Reverse geocode a coordinate to a labeled address.',
      inputSchema: s('Geocode reverse', {
        lat: { type: 'number' },
        lon: { type: 'number' },
      }, ['lat', 'lon']),
      invoke: (a) => c.geocode.reverse(a as never),
    },
    {
      name: 'geo.ip',
      description: 'IP geolocation: country, region, city, lat/lon, timezone, ASN.',
      inputSchema: s('Geo IP', {
        ip: { type: 'string', description: 'IPv4 or IPv6 address.' },
      }, ['ip']),
      invoke: (a) => c.geo.ip(a as never),
    },
    {
      name: 'ipinfo.bulk',
      description: 'Bulk geolocate up to 100 IPs in one call.',
      inputSchema: s('IPinfo bulk', {
        ips: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 },
      }, ['ips']),
      invoke: (a) => c.ipinfo.bulk(a as never),
    },

    // ── Internet / utility ───────────────────────────────────────────
    {
      name: 'dns.lookup',
      description: 'DNS records via public resolvers. Types: A, AAAA, MX, TXT, NS, CNAME, SOA.',
      inputSchema: s('DNS lookup', {
        name: { type: 'string', description: 'Domain name.' },
        type: { type: 'string', enum: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA'], default: 'A' },
      }, ['name']),
      invoke: (a) => c.dns.lookup(a as never),
    },
    {
      name: 'domain.whois',
      description: 'RDAP / WHOIS for a domain. Returns registrar, creation/expiry, nameservers, status codes.',
      inputSchema: s('Domain WHOIS', {
        domain: { type: 'string' },
      }, ['domain']),
      invoke: (a) => c.domain.whois(a as never),
    },
    {
      name: 'url.unfurl',
      description: 'Open Graph / Twitter Card metadata for a URL — title, description, image, site name.',
      inputSchema: s('URL unfurl', {
        url: { type: 'string', format: 'uri' },
      }, ['url']),
      invoke: (a) => c.url.unfurl(a as never),
    },
    {
      name: 'url.clean',
      description: 'Fetch a page and return the main content as clean Markdown (no nav, ads, footer).',
      inputSchema: s('URL clean', {
        url: { type: 'string', format: 'uri' },
      }, ['url']),
      invoke: (a) => c.url.clean(a as never),
    },
    {
      name: 'wikipedia.summary',
      description: 'Wikipedia article summary with thumbnail URL.',
      inputSchema: s('Wikipedia summary', {
        title: { type: 'string', description: 'Article title.' },
      }, ['title']),
      invoke: (a) => c.wikipedia.summary(a as never),
    },
    {
      name: 'papers.search',
      description: 'Unified academic paper search across arXiv + PubMed + Semantic Scholar.',
      inputSchema: s('Papers search', {
        q: { type: 'string' },
        limit: { type: 'integer', default: 10 },
      }, ['q']),
      invoke: (a) => c.papers.search(a as never),
    },
    {
      name: 'census.zipcode',
      description: 'US Census ACS 5-year demographics for a ZIP/ZCTA — population, income, housing, education.',
      inputSchema: s('Census ZIP', {
        zip: { type: 'string' },
      }, ['zip']),
      invoke: (a) => c.census.zipcode(a as never),
    },
    {
      name: 'hash.compute',
      description: 'Compute one or more cryptographic hashes (sha256, sha512, md5, sha1, sha3, etc.) over an input.',
      inputSchema: s('Hash compute', {
        input: { type: 'string', description: 'The data to hash.' },
        inputEncoding: { type: 'string', enum: ['utf8', 'hex', 'base64'], default: 'utf8' },
        algorithms: { type: 'array', items: { type: 'string' } },
        algorithm: { type: 'string', description: 'Single algorithm shortcut.' },
        outputEncoding: { type: 'string', enum: ['hex', 'base64'], default: 'hex' },
      }, ['input']),
      invoke: (a) => c.hash.compute(a as never),
    },
  ]
  return t
}
