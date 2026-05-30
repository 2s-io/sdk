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
        text: { type: 'string', minLength: 1, maxLength: 6000 },
        targetLanguage: { type: 'string', description: 'BCP-47 language code, e.g. "es", "ja", "zh-Hans".' },
        sourceLanguage: { type: 'string', description: 'Optional BCP-47 source code; auto-detected by default.' },
      }, ['text', 'targetLanguage']),
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
      description: 'Describe an image (JPEG/PNG/GIF/WebP, ≤1MB) via Claude Haiku vision. Returns caption + structured details.',
      inputSchema: s('Describe image input', {
        imageUrl: { type: 'string', format: 'uri', description: 'HTTPS URL of the image.' },
        instruction: { type: 'string', description: 'Optional focus hint, e.g. "describe the chart axes".' },
      }, ['imageUrl']),
      invoke: (a) => c.ai.describeImage(a as never),
    },
    {
      name: 'ai.screenshot',
      description: 'Take a headless-browser screenshot of a URL. Returns base64 image + size metadata.',
      inputSchema: s('Screenshot input', {
        url: { type: 'string', format: 'uri' },
        width: { type: 'integer', minimum: 320, maximum: 3840, default: 1280, description: 'Viewport width (px).' },
        height: { type: 'integer', minimum: 320, maximum: 2160, default: 720, description: 'Viewport height (px).' },
        fullPage: { type: 'boolean', default: false },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'], default: 'png' },
        quality: { type: 'integer', minimum: 1, maximum: 100, description: 'For jpeg/webp only.' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], default: 'networkidle2' },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 15000, default: 8000 },
        deviceScaleFactor: { type: 'integer', minimum: 1, maximum: 3, default: 1 },
        blockAds: { type: 'boolean', default: true },
      }, ['url']),
      invoke: (a) => c.ai.screenshot(a as never),
    },

    // ── Law ──────────────────────────────────────────────────────────
    {
      name: 'law.case-search',
      description: 'Search US federal + state case law (CourtListener / Free Law Project).',
      inputSchema: s('Case search input', {
        q: { type: 'string', minLength: 2, maxLength: 500 },
        court: { type: 'string', description: 'Comma-separated CourtListener court slugs.' },
        filedAfter: { type: 'string', format: 'date' },
        filedBefore: { type: 'string', format: 'date' },
        order: { type: 'string', enum: ['relevance', 'dateFiled-desc', 'dateFiled-asc', 'citeCount-desc'] },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
      }, ['q']),
      invoke: (a) => c.law.caseSearch(a as never),
    },
    {
      name: 'law.case-verify',
      description:
        'Verify every US legal citation inside a passage of text against the real CourtListener corpus. Anti-hallucination check before quoting case law.',
      inputSchema: s('Case verify input', {
        text: {
          type: 'string',
          description:
            'A passage that may contain one or more case citations (e.g. "...as held in Marbury v. Madison, 5 U.S. 137 (1803)..."). The endpoint extracts and verifies each citation.',
          maxLength: 30000,
        },
      }, ['text']),
      invoke: (a) => c.law.caseVerify(a as never),
    },
    {
      name: 'law.sanctions-check',
      description:
        'Fuzzy-match a name (person, company, vessel, aircraft) against the US Treasury OFAC SDN list. Returns ranked matches with similarity scores and sanctions program metadata. List refreshed daily.',
      inputSchema: s('Sanctions check input', {
        query: { type: 'string', minLength: 2, maxLength: 500, description: 'Name to screen.' },
        threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.4, description: 'Similarity floor (0-1). Default 0.4; ≥0.85 flagged as high-confidence.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        sourceList: { type: 'string', description: 'Optional source list filter (e.g. SDN).' },
      }, ['query']),
      invoke: (a) => c.law.sanctionsCheck(a as never),
    },
    {
      name: 'law.federal-register',
      description: 'Search US Federal Register documents (proposed rules, final rules, notices).',
      inputSchema: s('Federal register search input', {
        q: { type: 'string', minLength: 1, maxLength: 500 },
        type: { type: 'string', enum: ['RULE', 'PRORULE', 'NOTICE', 'PRESDOCU'] },
        agency: { type: 'string', description: 'Federal Register agency slug.' },
        since: { type: 'string', format: 'date' },
        until: { type: 'string', format: 'date' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
      }, ['q']),
      invoke: (a) => c.law.federalRegister(a as never),
    },
    {
      name: 'law.opinion',
      description:
        'Fetch the full text of a US court opinion by CourtListener opinion ID OR by citation. Returns plain text + case metadata. Supply exactly one of opinionId or citation.',
      inputSchema: s('Opinion input', {
        opinionId: { type: 'integer', minimum: 1, description: 'CourtListener opinion id.' },
        citation: { type: 'string', minLength: 2, maxLength: 500, description: 'Reporter citation (e.g. "410 U.S. 113").' },
      }),
      invoke: (a) => c.law.opinion(a as never),
    },

    // ── Airports / weather / geo ─────────────────────────────────────
    {
      name: 'airport.lookup',
      description: 'Look up an airport by IATA (3-letter) or ICAO (4-letter) code. ~85k airports (CC0 — OurAirports).',
      inputSchema: s('Airport lookup', {
        code: { type: 'string', minLength: 3, maxLength: 5, description: 'IATA (3 letters, e.g. SFO) or ICAO (4 letters, e.g. KSFO).' },
      }, ['code']),
      invoke: (a) => c.airport.lookup(a as never),
    },
    {
      name: 'airport.near',
      description: 'Find airports near a coordinate, ordered by distance.',
      inputSchema: s('Airport near', {
        lat: { type: 'number' },
        lon: { type: 'number' },
        radius_km: { type: 'number', minimum: 1, maximum: 2000, default: 200 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        type: { type: 'string', enum: ['large_airport', 'medium_airport', 'small_airport', 'heliport', 'seaplane_base', 'balloonport', 'closed'] },
        country: { type: 'string', description: 'ISO 3166-1 alpha-2 country code (e.g. US).' },
        scheduled_service: { type: 'boolean', description: 'When true, only commercial-service airports.' },
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
        radius_km: { type: 'number', minimum: 1, maximum: 5000 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      }, ['lat', 'lon']),
      invoke: (a) => c.climate.stationNear(a as never),
    },
    {
      name: 'tides.now',
      description: 'NOAA tide predictions for the nearest tide station to a coordinate.',
      inputSchema: s('Tides near', {
        lat: { type: 'number' },
        lon: { type: 'number' },
        radius_km: { type: 'number', minimum: 1, maximum: 500, default: 100 },
        hours: { type: 'integer', minimum: 1, maximum: 72, default: 24 },
      }, ['lat', 'lon']),
      invoke: (a) => c.tides.now(a as never),
    },
    {
      name: 'sunrise.compute',
      description: 'Astronomically compute sunrise, sunset, solar noon, and civil/nautical/astronomical twilights for a coord + date.',
      inputSchema: s('Sunrise compute', {
        lat: { type: 'number' },
        lon: { type: 'number' },
        date: { type: 'string', format: 'date', description: 'YYYY-MM-DD (required).' },
      }, ['lat', 'lon', 'date']),
      invoke: (a) => c.sunrise.compute(a as never),
    },
    {
      name: 'earth.now',
      description: 'Composite situational awareness for a coordinate: timezone, local time, sunrise/sunset, nearby quakes, current weather.',
      inputSchema: s('Earth now', {
        lat: { type: 'number' },
        lon: { type: 'number' },
        radius_km: { type: 'number', minimum: 1, maximum: 1000, default: 500 },
        hours: { type: 'integer', minimum: 1, maximum: 168, default: 24 },
        min_magnitude: { type: 'number', minimum: 0, maximum: 10, default: 2.0 },
      }, ['lat', 'lon']),
      invoke: (a) => c.earth.now(a as never),
    },
    {
      name: 'quakes.recent',
      description: 'Recent earthquakes near a coordinate (USGS feed).',
      inputSchema: s('Quakes recent', {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
        radius_km: { type: 'number', minimum: 1, maximum: 1000, default: 500 },
        hours: { type: 'integer', minimum: 1, maximum: 720, default: 24 },
        min_magnitude: { type: 'number', minimum: 0, maximum: 10, default: 2.0 },
      }, ['lat', 'lon']),
      invoke: (a) => c.quakes.recent(a as never),
    },
    {
      name: 'geocode.address',
      description: 'Forward geocode a free-text address to a coordinate (LocationIQ, OSM/ODbL).',
      inputSchema: s('Geocode address', {
        q: { type: 'string', minLength: 2, description: 'Query string (address, place name, etc.).' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
        country: { type: 'string', description: '2-letter ISO-3166 country code to bias.' },
      }, ['q']),
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
      description: 'DNS records via public DNS-over-HTTPS resolvers.',
      inputSchema: s('DNS lookup', {
        host: { type: 'string', description: 'Fully-qualified domain name.' },
        types: {
          type: 'string',
          description: 'Comma-separated list from A,AAAA,MX,TXT,NS,CNAME,SOA. Default: A.',
        },
        resolver: { type: 'string', enum: ['cloudflare', 'google', 'quad9', 'opendns'] },
      }, ['host']),
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
        format: { type: 'string', enum: ['markdown', 'text', 'both'], default: 'markdown' },
      }, ['url']),
      invoke: (a) => c.url.clean(a as never),
    },
    {
      name: 'wikipedia.summary',
      description: 'Wikipedia article summary with thumbnail URL.',
      inputSchema: s('Wikipedia summary', {
        title: { type: 'string', description: 'Article title.' },
        lang: { type: 'string', description: 'BCP-47 language code. Default en.' },
      }, ['title']),
      invoke: (a) => c.wikipedia.summary(a as never),
    },
    {
      name: 'papers.search',
      description: 'Unified academic paper search across arXiv + PubMed + Semantic Scholar.',
      inputSchema: s('Papers search', {
        q: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
        since: { type: 'string', format: 'date', description: 'YYYY-MM-DD.' },
        sources: { type: 'string', description: 'Comma-separated subset of arxiv,pubmed,semanticscholar.' },
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
    {
      name: 'poi.near',
      description:
        'Find points of interest near a coordinate. Backed by OpenStreetMap (Overpass API). Returns name, OSM id, lat/lon, distance in meters, address, phone, website, hours, brand, cuisine. Nearest-first.',
      inputSchema: s('POI near', {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
        category: {
          type: 'string',
          description:
            'POI category — see /api/directory for the canonical list (e.g. cafe, restaurant, pharmacy, hospital, school, atm).',
        },
        radius_m: { type: 'integer', minimum: 1, maximum: 10000, default: 1000 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      }, ['lat', 'lon', 'category']),
      invoke: (a) => c.poi.near(a as never),
    },
    {
      name: 'barcode.generate',
      description:
        'Generate a barcode or QR code as an image. Format defaults to qr; supported: qr, code128, ean13. Returns raw image bytes (base64 in MCP transport).',
      inputSchema: s('Barcode generate', {
        data: {
          type: 'object',
          description: 'Encoded payload, e.g. { type: "url", url: "https://..." } or { type: "text", text: "..." }.',
          properties: {
            type: { type: 'string', enum: ['url', 'text'] },
            url: { type: 'string', format: 'uri' },
            text: { type: 'string' },
          },
          required: ['type'],
        },
        format: { type: 'string', enum: ['qr', 'code128', 'ean13'], default: 'qr' },
      }, ['data']),
      invoke: (a) => c.barcode.generate(a as never),
    },
    {
      name: 'countdown.gif',
      description:
        'Render an animated countdown GIF to a target ISO-8601 timestamp. Returns raw GIF bytes (base64 in MCP transport).',
      inputSchema: {
        type: 'object',
        properties: {
          endDate: { type: 'string', format: 'date-time', description: 'ISO-8601 UTC target time (REQUIRED).' },
          template: { type: 'string', enum: ['default', 'minimal', 'neon', 'retro', 'corporate'] },
          seconds: { type: 'integer', minimum: 1, maximum: 60, description: 'Animation length in seconds.' },
          fps: { type: 'integer', minimum: 1, maximum: 10 },
          width: { type: 'integer', minimum: 200, maximum: 1600 },
          height: { type: 'integer', minimum: 80, maximum: 800 },
        },
        required: ['endDate'],
        // Server accepts many more style controls (colors, fonts, labels);
        // see /api/openapi#countdown.gif for the full schema.
        additionalProperties: true,
      },
      invoke: (a) => c.countdown.gif(a as never),
    },
    {
      name: 'image.compress',
      description:
        'Compress an image (fetch by URL OR pass base64 inline). Returns compressed bytes (base64 in MCP transport). Provide exactly one of url | imageBase64.',
      inputSchema: s('Image compress', {
        url: { type: 'string', format: 'uri' },
        imageBase64: { type: 'string', description: 'Base64-encoded source image bytes (≤ 3.3MB binary).' },
        format: { type: 'string', enum: ['auto', 'png', 'jpeg', 'webp', 'avif'] },
        quality: { type: 'integer', minimum: 1, maximum: 100 },
        lossy: { type: 'boolean' },
        effort: { type: 'integer', minimum: 1, maximum: 10 },
      }),
      invoke: (a) => c.image.compress(a as never),
    },
  ]
  return t
}
