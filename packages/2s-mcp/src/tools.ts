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
    {
      name: 'law.attorney-lookup',
      description:
        'CourtListener attorney search by name and/or firm. Returns parsed attorney records with firm name, contact info, and CL IDs. Supply at least one of name or firmName. Case-insensitive matching via Title-Case + startswith.',
      inputSchema: s('Attorney lookup', {
        name: { type: 'string', minLength: 2, maxLength: 100, description: 'Full or partial attorney name (case-insensitive).' },
        firmName: { type: 'string', minLength: 2, maxLength: 200, description: 'Full or partial firm name (case-insensitive).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }),
      invoke: (a) => c.law.attorneyLookup(a as never),
    },
    {
      name: 'law.judge-lookup',
      description:
        'CourtListener federal judge lookup by name. Returns parsed judge records with biographical data (DOB, DOD, FJC ID). Useful for venue research, judicial profile lookup, and bio enrichment.',
      inputSchema: s('Judge lookup', {
        name: { type: 'string', minLength: 2, maxLength: 100, description: 'Judge name (case-insensitive).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, ['name']),
      invoke: (a) => c.law.judgeLookup(a as never),
    },

    // ── Finance (SEC EDGAR) ──────────────────────────────────────────
    {
      name: 'finance.sec-filings',
      description:
        'Recent SEC filings (10-K, 10-Q, 8-K, etc.) for a US public company by stock ticker. Returns parsed company info + a list of filings with accession numbers, forms, dates, primary document URLs. Backed by SEC EDGAR public submissions API.',
      inputSchema: s('SEC filings', {
        ticker: { type: 'string', minLength: 1, maxLength: 10, description: 'US stock ticker (case-insensitive). Examples: AAPL, GOOGL, BRK.B.' },
        formType: { type: 'string', maxLength: 20, description: 'Optional form filter (e.g. 10-K, 10-Q, 8-K, 4).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, ['ticker']),
      invoke: (a) => c.finance.secFilings(a as never),
    },
    {
      name: 'finance.company-facts',
      description:
        "Curated XBRL financial metrics for a US public company by stock ticker. Returns ~15 top-line metrics (revenue, gross profit, operating income, net income, EPS, R&D, total assets, liabilities, equity, cash, debt, operating cash flow, capex, shares outstanding) with their most recent annual + quarterly values. Each metric returns the originating form (10-K/10-Q), period dates, fiscal year/period, and filed date.",
      inputSchema: s('Company facts', {
        ticker: { type: 'string', minLength: 1, maxLength: 10, description: 'US stock ticker (case-insensitive).' },
        metrics: {
          type: 'string',
          description: 'Optional comma-separated subset of metric keys. Available: revenue, grossProfit, operatingIncome, netIncome, eps, epsDiluted, rdExpense, totalAssets, totalLiabilities, stockholdersEquity, cash, longTermDebt, operatingCashFlow, capex, sharesOutstanding. Omit to get all ~15.',
        },
        annualLimit: { type: 'integer', minimum: 1, maximum: 20, default: 4, description: 'Max annual (FY) values per metric, most recent first.' },
        quarterlyLimit: { type: 'integer', minimum: 0, maximum: 20, default: 4, description: 'Max quarterly values per metric, most recent first. 0 to skip quarterly.' },
      }, ['ticker']),
      invoke: (a) => c.finance.companyFacts(a as never),
    },
    {
      name: 'finance.insider-trades',
      description:
        'Recent SEC Form 4 insider transactions for a US public company by ticker. Returns parsed transactions: insider name + relationship (director, officer/title, 10%+ owner), date, SEC transaction code (P=purchase, S=sale, A=grant, D=disposition, M=exercise, F=tax-withholding, G=gift), security title, shares, price/share, total USD value, post-transaction balance, direct vs indirect ownership, derivative flag.',
      inputSchema: s('Insider trades', {
        ticker: { type: 'string', minLength: 1, maxLength: 10, description: 'US stock ticker (case-insensitive).' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Max Form 4 filings to fetch + parse. Each is its own upstream call, bounded tight.' },
      }, ['ticker']),
      invoke: (a) => c.finance.insiderTrades(a as never),
    },
    {
      name: 'finance.thirteen-f',
      description:
        "Parsed institutional holdings (Form 13F-HR) for an investment manager by CIK. Returns each holding's nameOfIssuer, cusip, market value (USD; converted from SEC's $000s convention), shares or principal amount + type, putCall flag for options, and voting authority (sole/shared/none). Sorted by value descending. Common manager CIKs: Berkshire Hathaway=1067983, Renaissance=1037389, Bridgewater=1350694, Vanguard=102909, BlackRock=1364742.",
      inputSchema: s('13F holdings', {
        managerCik: { type: 'string', pattern: '^\\d+$', maxLength: 10, description: 'Investment manager CIK (numeric).' },
        formType: { type: 'string', description: '13F variant. Default 13F-HR; use 13F-HR/A for amendments, 13F-NT for notice of non-filings.', default: '13F-HR' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 25, description: 'Max holdings, sorted by value descending.' },
      }, ['managerCik']),
      invoke: (a) => c.finance.thirteenF(a as never),
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

    // ── Phone / space ────────────────────────────────────────────────
    {
      name: 'phone.normalize',
      description:
        'E.164-normalize and classify a phone number using libphonenumber. Returns format variants (E.164, international, national, RFC3966) plus type (mobile, fixed_line, voip, premium_rate, toll_free, etc.) and region.',
      inputSchema: s('Phone normalize', {
        phone: { type: 'string', description: 'Phone number in any format (national, international, etc.).' },
        defaultRegion: { type: 'string', description: 'Optional 2-letter ISO region for parsing local numbers (default: US).' },
      }, ['phone']),
      invoke: (a) => c.phone.normalize(a as never),
    },
    {
      name: 'space.weather',
      description:
        'Current NOAA space-weather snapshot: planetary Kp index, solar flux, geomagnetic storm scale, aurora viewing forecast.',
      inputSchema: s('No input', {}),
      invoke: () => c.space.weather(),
    },

    // ── Vehicle (NHTSA) ──────────────────────────────────────────────
    {
      name: 'vehicle.vin-decode',
      description:
        'Decode a 17-character VIN via NHTSA vPIC. Returns make, model, model year, body class, engine, transmission, fuel type, manufacturer, plant info.',
      inputSchema: s('VIN decode', {
        vin: { type: 'string', description: '17-character VIN.' },
        modelYear: { type: 'integer', description: 'Optional model-year hint (1981+).' },
      }, ['vin']),
      invoke: (a) => c.vehicle.vinDecode(a as never),
    },
    {
      name: 'vehicle.recalls',
      description:
        'NHTSA vehicle recall lookup. Search by VIN (precise), or make/model/year, or NHTSA campaign ID. Returns recall ID, component, summary, consequence, remedy, dates.',
      inputSchema: s('Recall lookup', {
        vin: { type: 'string', description: '17-char VIN (most precise option).' },
        make: { type: 'string', description: 'Manufacturer, e.g., "Toyota".' },
        model: { type: 'string', description: 'Model name, e.g., "Camry".' },
        modelYear: { type: 'integer' },
        nhtsaId: { type: 'string', description: 'NHTSA campaign ID, e.g., "21V123000".' },
      }),
      invoke: (a) => c.vehicle.recalls(a as never),
    },
    {
      name: 'vehicle.complaints',
      description:
        'NHTSA consumer complaints by make/model/year. Returns incident date, component, summary, crash/injury/fatality flags.',
      inputSchema: s('Complaints', {
        make: { type: 'string' },
        model: { type: 'string' },
        modelYear: { type: 'integer' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.vehicle.complaints(a as never),
    },
    {
      name: 'vehicle.investigations',
      description:
        'NHTSA open vehicle investigations, newest first. Chronological feed — filters (make/model/year) are not supported by upstream.',
      inputSchema: s('Investigations', {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.vehicle.investigations(a as never),
    },
    {
      name: 'vehicle.models',
      description: 'List all models offered by a make in a given model year (vPIC).',
      inputSchema: s('Models', {
        make: { type: 'string' },
        modelYear: { type: 'integer' },
      }, ['make', 'modelYear']),
      invoke: (a) => c.vehicle.models(a as never),
    },
    {
      name: 'vehicle.decode-wmi',
      description: 'Decode a 3-character World Manufacturer Identifier (WMI), the first 3 chars of a VIN, to manufacturer.',
      inputSchema: s('Decode WMI', {
        wmi: { type: 'string', description: '3-character WMI code.' },
      }, ['wmi']),
      invoke: (a) => c.vehicle.decodeWmi(a as never),
    },
    {
      name: 'vehicle.manufacturers',
      description: 'Paginated list of all NHTSA-registered vehicle manufacturers (vPIC).',
      inputSchema: s('Manufacturers', {
        page: { type: 'integer', minimum: 1, default: 1 },
      }),
      invoke: (a) => c.vehicle.manufacturers(a as never),
    },

    // ── Agent (knowledge / memory / marketplace) ─────────────────────
    {
      name: 'agent.knowledge-delta',
      description:
        "What's happened in <topic> since <date>? Multi-source delta (regulations, court opinions, papers, House+Senate votes) deduplicated and ranked. Designed so an agent can spend one call to catch up since its LLM training cutoff.",
      inputSchema: s('Knowledge delta', {
        topic: { type: 'string', description: 'Free-text domain of interest.' },
        since: { type: 'string', format: 'date', description: 'Earliest date (YYYY-MM-DD).' },
        until: { type: 'string', format: 'date', description: 'Latest date (YYYY-MM-DD). Default today.' },
        maxEvents: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      }, ['topic', 'since']),
      invoke: (a) => c.agent.knowledgeDelta(a as never),
    },
    {
      name: 'agent.memory.put',
      description:
        "Write/replace a memory entry in the calling agent's private KV store. Namespace = your x402 signing pubkey. Value is arbitrary JSON ≤64 KiB. Optional TTL.",
      inputSchema: s('Memory put', {
        key: { type: 'string', description: '1-200 chars from [A-Za-z0-9._/-].' },
        value: { type: 'object', description: 'Arbitrary JSON.' },
        ttlSeconds: { type: 'integer', minimum: 1, maximum: 31_536_000 },
      }, ['key', 'value']),
      invoke: (a) => c.agent.memory.put(a as never),
    },
    {
      name: 'agent.memory.get',
      description: 'Read a memory entry by key. Returns the value, etag, sizeBytes, timestamps. 404 if missing/expired.',
      inputSchema: s('Memory get', {
        key: { type: 'string' },
      }, ['key']),
      invoke: (a) => c.agent.memory.get(a as never),
    },
    {
      name: 'agent.memory.list',
      description: "List keys in the calling agent's memory namespace, newest-first by updatedAt. Cursor-paginated. Optional prefix filter. Returns metadata only — fetch values via agent.memory.get.",
      inputSchema: s('Memory list', {
        prefix: { type: 'string', description: 'Optional key-prefix filter.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        cursor: { type: 'string', description: 'Opaque cursor from previous call.' },
      }),
      invoke: (a) => c.agent.memory.list(a as never),
    },
    {
      name: 'agent.memory.delete',
      description: 'Delete a memory entry. Idempotent — non-existent keys return { deleted: false }.',
      inputSchema: s('Memory delete', {
        key: { type: 'string' },
      }, ['key']),
      invoke: (a) => c.agent.memory.delete(a as never),
    },
    {
      name: 'agent.marketplace.register',
      description: 'Register/update the calling agent in the agent-to-agent marketplace. One listing per pubkey, idempotent.',
      inputSchema: s('Marketplace register', {
        name: { type: 'string' },
        description: { type: 'string' },
        capabilities: { type: 'array', items: { type: 'string' } },
        endpointUrl: { type: 'string', format: 'uri' },
        priceUsd: { type: 'number' },
        network: { type: 'string', enum: ['base', 'solana', 'base+solana'] },
        payTo: { type: 'string' },
        status: { type: 'string', enum: ['active', 'paused', 'removed'] },
        metadata: { type: 'object' },
      }, ['name', 'description', 'capabilities']),
      invoke: (a) => c.agent.marketplace.register(a as never),
    },
    {
      name: 'agent.marketplace.discover',
      description: 'Discover agents in the marketplace. Filter by free-text q, comma-separated required capabilities, and network. Each result includes the listing + aggregated reputation stats.',
      inputSchema: s('Marketplace discover', {
        q: { type: 'string' },
        capabilities: { type: 'string', description: 'Comma-separated capability tags; ALL must match.' },
        network: { type: 'string', enum: ['base', 'solana'] },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 25 },
        offset: { type: 'integer', minimum: 0 },
      }),
      invoke: (a) => c.agent.marketplace.discover(a as never),
    },
    {
      name: 'agent.marketplace.profile',
      description: "Fetch one agent's full marketplace profile (listing + stats + up to 25 recent reviews).",
      inputSchema: s('Marketplace profile', {
        namespace: { type: 'string', description: 'Target agent pubkey.' },
      }, ['namespace']),
      invoke: (a) => c.agent.marketplace.profile(a as never),
    },
    {
      name: 'agent.marketplace.review',
      description: 'Post an insert-only review of another agent. Outcome = success|failure|partial; optional rating 1-5, comment, txHash, network.',
      inputSchema: s('Marketplace review', {
        reviewed: { type: 'string', description: 'Target agent namespace.' },
        outcome: { type: 'string', enum: ['success', 'failure', 'partial'] },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
        comment: { type: 'string' },
        txHash: { type: 'string' },
        network: { type: 'string', enum: ['base', 'solana'] },
      }, ['reviewed', 'outcome']),
      invoke: (a) => c.agent.marketplace.review(a as never),
    },

    // ── Chem ─────────────────────────────────────────────────────────
    {
      name: 'chem.compound',
      description: 'Look up a chemical compound by cid, name, smiles, or inchikey. Returns canonical structural identifiers + physical properties from NIH PubChem.',
      inputSchema: s('Chem compound', {
        cid: { type: 'integer', description: 'PubChem Compound ID.' },
        name: { type: 'string', description: 'Common or IUPAC name.' },
        smiles: { type: 'string', description: 'SMILES string.' },
        inchikey: { type: 'string', description: 'InChIKey.' },
      }),
      invoke: (a) => c.chem.compound(a as never),
    },

    // ── Gov ──────────────────────────────────────────────────────────
    {
      name: 'gov.fda-drug-events',
      description:
        'FDA adverse drug event reports (FAERS). Search by drug name, optionally filter by MedDRA reaction term. Returns seriousness flags, patient demographics, reactions, drugs.',
      inputSchema: s('FDA drug events', {
        drug: { type: 'string', description: 'Drug name (brand/generic/substance, OR-matched).' },
        reaction: { type: 'string', description: 'Optional MedDRA reaction filter (e.g., "headache").' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
      }, ['drug']),
      invoke: (a) => c.gov.fdaDrugEvents(a as never),
    },
    {
      name: 'gov.fda-recalls',
      description:
        'FDA drug recall enforcement reports, newest first. Filter by drug name, classification (I/II/III), and status.',
      inputSchema: s('FDA drug recalls', {
        drug: { type: 'string' },
        classification: { type: 'string', enum: ['I', 'II', 'III'] },
        status: { type: 'string', enum: ['Ongoing', 'Completed', 'Terminated', 'Pending'] },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      }),
      invoke: (a) => c.gov.fdaRecalls(a as never),
    },
    {
      name: 'gov.fda-food-recalls',
      description: 'FDA food recall enforcement reports, newest first. Filter by product name, classification, status, recalling-firm state.',
      inputSchema: s('FDA food recalls', {
        product: { type: 'string' },
        classification: { type: 'string', enum: ['I', 'II', 'III'] },
        status: { type: 'string', enum: ['Ongoing', 'Completed', 'Terminated', 'Pending'] },
        state: { type: 'string', description: '2-letter US state of the recalling firm.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      }),
      invoke: (a) => c.gov.fdaFoodRecalls(a as never),
    },
    {
      name: 'gov.fda-device-events',
      description: 'FDA medical device adverse event reports (MAUDE), newest first. Filter by device, manufacturer, or product code.',
      inputSchema: s('FDA device events', {
        device: { type: 'string', description: 'Device name (brand/generic).' },
        manufacturer: { type: 'string' },
        problem: { type: 'string', description: 'FDA device product code substring.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      }),
      invoke: (a) => c.gov.fdaDeviceEvents(a as never),
    },
    {
      name: 'gov.fda-animalvet-events',
      description: 'FDA animal/veterinary adverse event reports. Filter by drug, species, or reaction.',
      inputSchema: s('FDA animal/vet events', {
        drug: { type: 'string' },
        species: { type: 'string', description: 'e.g., "Dog", "Cat", "Horse", "Cattle".' },
        reaction: { type: 'string', description: 'VeDDRA preferred term.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      }),
      invoke: (a) => c.gov.fdaAnimalvetEvents(a as never),
    },
    {
      name: 'gov.house-votes',
      description:
        'US House of Representatives roll-call votes, newest first. Locally aggregated daily from clerk.house.gov. Filter by year, congress, result, bill (legis_num substring), date range.',
      inputSchema: s('House votes', {
        year: { type: 'integer', minimum: 1990, maximum: 2099 },
        congress: { type: 'integer', minimum: 100, maximum: 200 },
        result: { type: 'string', description: 'Vote-result substring, e.g., "Passed".' },
        bill: { type: 'string', description: 'Bill reference substring on legis_num, e.g., "H R 498".' },
        since: { type: 'string', format: 'date' },
        until: { type: 'string', format: 'date' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.houseVotes(a as never),
    },
    {
      name: 'gov.senate-votes',
      description:
        'US Senate roll-call votes, newest first. Locally aggregated daily from senate.gov. Filter by congress, session (1|2), result, document (e.g., "S. 5"), date range.',
      inputSchema: s('Senate votes', {
        congress: { type: 'integer', minimum: 100, maximum: 200 },
        session: { type: 'integer', enum: [1, 2] },
        result: { type: 'string' },
        document: { type: 'string', description: 'Substring on document_name, e.g., "S. 5".' },
        since: { type: 'string', format: 'date' },
        until: { type: 'string', format: 'date' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.senateVotes(a as never),
    },
    {
      name: 'gov.usaspending-awards',
      description:
        'Search federal awards (contracts, grants, loans, direct payments) via USAspending.gov. Largest-amount first within the date window.',
      inputSchema: s('USA spending awards', {
        recipient: { type: 'string', description: 'Recipient (vendor/grantee) name substring.' },
        agency: { type: 'string', description: 'Awarding top-tier agency name.' },
        recipientState: { type: 'string', description: '2-letter US state.' },
        awardType: {
          type: 'string',
          enum: ['contracts', 'grants', 'loans', 'direct_payments', 'other'],
          default: 'contracts',
        },
        since: { type: 'string', format: 'date', description: 'Default = 5 years ago.' },
        until: { type: 'string', format: 'date', description: 'Default = today.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        page: { type: 'integer', minimum: 1, default: 1 },
      }),
      invoke: (a) => c.gov.usaspendingAwards(a as never),
    },
    {
      name: 'gov.usgs-water',
      description:
        'Real-time USGS NWIS stream/river/groundwater readings within a bbox around lat/lon. Default variables: streamflow (00060), gage height (00065), water temp (00010).',
      inputSchema: s('USGS water', {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
        radius: { type: 'number', minimum: 0.05, maximum: 2.0, default: 0.5, description: 'Half-side of bbox in decimal degrees.' },
        variables: { type: 'string', description: 'Comma-separated 5-digit USGS parameter codes.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      }, ['lat', 'lon']),
      invoke: (a) => c.gov.usgsWater(a as never),
    },
    {
      name: 'gov.epa-facilities',
      description:
        'EPA Facility Registry Service (FRS): regulated facilities by state, optional name prefix, optional program acronym (RCRA, NPDES, TRI, etc.).',
      inputSchema: s('EPA facilities', {
        state: { type: 'string', description: '2-letter US state.' },
        name: { type: 'string', description: 'Facility-name prefix.' },
        program: { type: 'string', description: 'Program acronym, e.g., RCRA, NPDES, TRI.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }, ['state']),
      invoke: (a) => c.gov.epaFacilities(a as never),
    },
    {
      name: 'gov.federal-register-recent',
      description:
        'Chronological feed of newest Federal Register documents (RULE / PRORULE / NOTICE / PRESDOCU) — use for compliance change-detection.',
      inputSchema: s('Federal Register recent', {
        type: { type: 'string', enum: ['RULE', 'PRORULE', 'NOTICE', 'PRESDOCU'], default: 'RULE' },
        agency: { type: 'string', description: 'Agency slug or name.' },
        since: { type: 'string', format: 'date', description: 'Default = 7 days ago.' },
        until: { type: 'string', format: 'date', description: 'Default = today.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        page: { type: 'integer', minimum: 1, default: 1 },
      }),
      invoke: (a) => c.gov.federalRegisterRecent(a as never),
    },
  ]
  return t
}
