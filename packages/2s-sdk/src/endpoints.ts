/**
 * Endpoint bindings. Each method wraps `TwoS.request` with the right
 * path/method/typing for one route on https://2s.io.
 */

import type { TwoS, CallResult } from './index.js'
import type {
  CryptoChain,
  AiScreenshotResponse,
  UrlUnfurlResponse,
  UrlCleanResponse,
  AccountBalanceResponse,
} from './types.js'

type R<T> = Promise<CallResult<T>>

/**
 * Catalog-wide normalized response envelope (migration in progress —
 * endpoints advertising `responseShape: 'normalized'` in /api/directory
 * return this shape; legacy endpoints keep their per-endpoint shapes).
 */
export interface Normalized<T = Record<string, unknown>, M = Record<string, unknown>> {
  ok: true
  items: T[]
  total: number | null
  page?: { number: number; size: number; pages: number | null }
  source: { provider: string; url: string; license: string }
  meta?: M
}

export interface Endpoints {
  account: {
    balance(): R<AccountBalanceResponse>
  }
  ai: {
    summarize(input: { url: string; instruction?: string }): R<Normalized>
    /** POST — server param names: text, targetLanguage, sourceLanguage. */
    translate(input: {
      text: string
      targetLanguage: string
      sourceLanguage?: string
    }): R<Normalized>
    extract<T = unknown>(input: {
      url: string
      schema: Record<string, unknown>
      instruction?: string
    }): R<Normalized<T>>
    /** POST — server param name: imageUrl (HTTPS URL of a JPEG/PNG/GIF/WebP image ≤1MB). */
    describeImage(input: {
      imageUrl: string
      instruction?: string
    }): R<Normalized>
    screenshot(input: {
      url: string
      width?: number
      height?: number
      fullPage?: boolean
      format?: 'png' | 'jpeg' | 'webp'
      quality?: number
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
      timeoutMs?: number
      deviceScaleFactor?: number
      blockAds?: boolean
    }): R<AiScreenshotResponse>
  }
  aircraft: {
    /** US aircraft by tail (N-number) or icao24 Mode-S hex. Pass exactly one. */
    lookup(input: { tail?: string; icao24?: string }): R<unknown>
    /** Aircraft identity + OFAC sanctions screen of owner/operator in one call. */
    profile(input: { tail?: string; icao24?: string; threshold?: number }): R<unknown>
  }
  airport: {
    /** Look up by IATA (3-letter) or ICAO (4-letter) code. */
    lookup(input: { code: string }): R<Normalized>
    near(input: {
      lat: number
      lon: number
      radius_km?: number
      limit?: number
      type?: 'large_airport' | 'medium_airport' | 'small_airport' | 'heliport' | 'seaplane_base' | 'balloonport' | 'closed'
      country?: string
      scheduled_service?: boolean
    }): R<Normalized>
  }
  barcode: {
    /** Returns raw image bytes — `result.data` is a `Uint8Array`. */
    generate(input: {
      data: { type: 'text' | 'url'; text?: string; url?: string }
      format?: 'qr' | 'code128' | 'ean13'
    }): R<Uint8Array>
  }
  /** Official-holiday lookup + holiday-aware business-day math (200+ countries, computed locally). */
  calendar: {
    /** List official holidays for a country/region + year, exact observed dates incl. substitute days. */
    holidays(input: { country: string; year: number | string; region?: string; types?: string; lang?: string }): R<Normalized>
    /** Holiday-aware business-day math: start+addDays (shift), start+end (count), or start alone (check). */
    businessDays(input: { country: string; start: string; addDays?: number; end?: string; region?: string; weekend?: string; types?: string }): R<Normalized>
  }
  census: {
    zipcode(input: { zip: string }): R<Normalized>
  }
  climate: {
    stationNear(input: {
      lat: number
      lon: number
      radius_km?: number
      limit?: number
    }): R<Normalized>
    /** Daily observed weather (GHCN-Daily) for one station over a date range (≤366 days). */
    stationHistory(input: {
      station: string
      startDate: string
      endDate: string
      dataTypes?: string
    }): R<unknown>
  }
  countdown: {
    /** Returns animated GIF bytes — `result.data` is a `Uint8Array`. Server param: endDate (ISO-8601 UTC). */
    gif(input: {
      endDate: string
      template?: 'default' | 'minimal' | 'neon' | 'retro' | 'corporate'
      seconds?: number
      fps?: number
      width?: number
      height?: number
      [k: string]: unknown
    }): R<Uint8Array>
  }
  crypto: {
    /** DeFi TVL via DefiLlama: protocol=<slug> or chain=<name> for one, or omit for the top protocols + total TVL. */
    defi(input?: { protocol?: string; chain?: string; limit?: number }): R<Normalized>
    /** EVM contract decode: Sourcify verified ABI + function/event signatures + proxy, with optional 4-byte selector decode. GET { chain, address, selector? }. */
    contract(input: { chain: string; address: string; selector?: string }): R<Normalized>
    /** Crypto Fear & Greed Index (0–100 sentiment). Pass `limit` for history or omit for current. */
    fearGreed(input?: { limit?: number }): R<Normalized>
    /** Top cryptocurrencies by market cap (price, mcap, 24h/7d change). Pass `limit` (1–100). */
    markets(input?: { limit?: number }): R<Normalized>
    /** Whole-crypto-market overview: total mcap, volume, BTC/ETH dominance. */
    global(input?: Record<string, never>): R<Normalized>
    /** Trending (most-searched) cryptocurrencies right now. */
    trending(input?: Record<string, never>): R<Normalized>
    addressValidate(input: {
      chain: CryptoChain
      address: string
    }): R<Normalized>
    gasOracle(input?: { chain?: string }): R<Normalized>
    /** ENS forward + reverse resolution on Ethereum mainnet (live RPC). */
    ensResolve(input: { query: string }): R<unknown>
    /** Spot price + market data by CoinGecko asset ids (comma-separated, lowercase). */
    tokenPrice(input: { ids: string; vs?: string }): R<unknown>
    /** Live EVM transaction status + receipt by hash. Chains: base, ethereum, polygon, arbitrum, optimism. */
    tx(input: { chain: 'base' | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism'; hash: string }): R<Normalized>
  }
  /** Deterministic validation/normalization primitives (no upstream). */
  validate: {
    /** IBAN structural + ISO 7064 mod-97 checksum validation + canonical form (~85 countries). */
    iban(input: { iban: string }): R<Normalized>
    /** GTIN/UPC/EAN/ISBN check-digit validation; normalizes to canonical GTIN-14. */
    gtin(input: { gtin: string }): R<Normalized>
    /** US ABA routing-number Federal Reserve weighted mod-10 checksum. */
    aba(input: { routingNumber: string }): R<Normalized>
    /** Legal Entity Identifier (LEI, ISO 17442) mod-97-10 check-digit validation. */
    lei(input: { lei: string }): R<Normalized>
    /** SWIFT/BIC (ISO 9362) structure validation incl. ISO country position. */
    bic(input: { bic: string }): R<Normalized>
    /** GS1 Global Location Number (13-digit mod-10) validation. */
    gln(input: { gln: string }): R<Normalized>
    /** GS1 Serial Shipping Container Code (18-digit mod-10) validation. */
    sscc(input: { sscc: string }): R<Normalized>
    /** ISIN (ISO 6166) securities identifier — country + NSIN + Luhn check (+ embedded CUSIP for US/CA). */
    isin(input: { isin: string }): R<Normalized>
    /** CUSIP (US/Canada securities identifier) mod-10 check-digit validation. */
    cusip(input: { cusip: string }): R<Normalized>
    /** Batch-validate up to 100 mixed identifiers ({type,value}) in one deterministic call. */
    batch(input: { items: Array<{ type: string; value: string }> }): R<Normalized>
  }
  /** Deterministic conversion primitives (no upstream). */
  convert: {
    /** Unit-of-measure conversion: mass, length, volume, area, temperature. */
    unit(input: { value: number; from: string; to: string }): R<Normalized>
  }
  /** Tax-identifier validation. */
  tax: {
    /** Validate an EU VAT number against the live VIES register. Pass `vat` (full id) OR `country`+`number`. */
    vat(input: { vat?: string; country?: string; number?: string }): R<Normalized>
    /** EU VAT rates by member state (standard + reduced/etc). Pass `country` (ISO 2-letter, Greece=EL) or omit for all 27. */
    vatRates(input?: { country?: string }): R<Normalized>
  }
  /** US inflation data (FRED-backed). */
  inflation: {
    /** Adjust a $ amount for inflation between two dates via CPI-U. Pass amount + from (+ optional to). */
    calculator(input: { amount: number; from: string; to?: string }): R<Normalized>
    /** Current inflation by measure (CPI, core CPI, PCE, core PCE, PPI, by category...) with YoY/MoM. Pass `measure` or omit for all. */
    rates(input?: { measure?: string }): R<Normalized>
    /** Market + survey inflation expectations (TIPS breakevens, 5y5y forward, U-Mich). */
    expectations(input?: Record<string, never>): R<Normalized>
    /** EU harmonized inflation (HICP annual rate) by country/aggregate. Pass `country` (Eurostat geo, e.g. DE, EA20) or omit for all. */
    hicp(input?: { country?: string }): R<Normalized>
  }
  /** US macroeconomic indicators (FRED-backed). */
  econ: {
    /** Curated macro indicator latest reading + YoY (unemployment, fed funds, GDP, yields, payrolls...). Pass `indicator` or omit for all. */
    indicator(input?: { indicator?: string }): R<Normalized>
    /** Current US Treasury yield curve across maturities + 2s10s/3m10y spreads + inversion flag. */
    yieldCurve(input?: Record<string, never>): R<Normalized>
    /** Benchmark commodity prices (oil, gas, metals, ags). Pass `commodity` (wti, brent, copper, wheat...) or omit for all. */
    commodity(input?: { commodity?: string }): R<Normalized>
    /** Composite US recession-signal dashboard (NY Fed probability + Sahm rule + 10y2y inversion). */
    recession(input?: Record<string, never>): R<Normalized>
  }
  /** EDI (electronic data interchange). */
  edi: {
    /** Parse a raw ANSI X12 EDI document into structured, named JSON + a semantic summary. POST { edi }. */
    parse(input: { edi: string }): R<Normalized>
    /** Generate the X12 997 Functional Acknowledgment for a received interchange (meta.ack = ready-to-send 997). POST { edi, status?, controlNumber? }. */
    ack(input: { edi: string; status?: 'A' | 'E' | 'P' | 'R' | 'M' | 'W' | 'X'; controlNumber?: string }): R<Normalized>
    /** Generate an outbound X12 850 (PO) or 810 (Invoice) from JSON → meta.edi. POST { type, senderId, receiverId, documentNumber, items, … }. */
    generate(input: { type: '850' | '810'; senderId: string; receiverId: string; documentNumber: string; items: Array<{ quantity: number | string; uom?: string; price?: number | string; productId?: string }>; poNumber?: string; date?: string; parties?: Array<{ role: string; name: string }>; total?: number }): R<Normalized>
  }
  /** Fact-check / claim verification (Google Fact Check Tools / ClaimReview). */
  factcheck: {
    /** Search published fact-checks by claim text → claims with publishers, verdicts, and review URLs. GET { query, language?, maxAgeDays?, publisher?, limit? }. */
    search(input: { query: string; language?: string; maxAgeDays?: number; publisher?: string; limit?: number }): R<Normalized>
  }
  /** Aviation weather (NOAA). */
  aviation: {
    /** Current METAR observation(s) for ICAO station id(s). Pass `ids` (comma-separated). */
    metar(input: { ids: string }): R<Normalized>
    /** Terminal Aerodrome Forecast (TAF) for ICAO station id(s). Pass `ids`. */
    taf(input: { ids: string }): R<Normalized>
    /** NTSB civil aviation accident/incident history. Filter by registration/state/make/model/city/date range. */
    accidents(input: { registration?: string; state?: string; make?: string; model?: string; city?: string; dateFrom?: string; dateTo?: string; limit?: number }): R<unknown>
  }
  /** Developer/standards reference. */
  dev: {
    /** IETF RFC lookup by number → status, title, authors, date, obsoletes/updates chain (bundled index). */
    rfc(input: { number: string }): R<unknown>
  }
  /** US surface-water data (USGS). */
  water: {
    /** Real-time streamflow + gage height at a USGS site. Pass `site` (site number). */
    gauge(input: { site: string }): R<Normalized>
  }
  /** Trade / customs reference data. */
  trade: {
    /** US Harmonized Tariff Schedule: exact `code` lookup or free-text `query` → candidate HS codes + duty rates. */
    tariff(input: { code?: string; query?: string; limit?: number }): R<Normalized>
    /** UN/LOCODE: exact `locode` lookup (e.g. USNYC) or name `query` with optional country / function filters. */
    locode(input: {
      locode?: string
      query?: string
      country?: string
      function?: 'port' | 'rail' | 'road' | 'airport' | 'postal' | 'multimodal' | 'fixed' | 'border'
      limit?: number
    }): R<Normalized>
    /** Annual international merchandise-trade flows (UN Comtrade, HS). reporter ISO/M49, optional partner, year, flow, commodity (TOTAL/HS code/AG2|AG4|AG6). */
    flows(input: { reporter: string; partner?: string; year: string; flow?: 'export' | 'import'; commodity?: string; limit?: number }): R<Normalized>
  }
  dns: {
    /** Server params: host (FQDN), types (CSV like "A,MX,TXT"), resolver. */
    lookup(input: {
      host: string
      types?: string
      resolver?: 'cloudflare' | 'google' | 'quad9' | 'opendns'
    }): R<Normalized>
  }
  domain: {
    whois(input: { domain: string }): R<Normalized>
  }
  earth: {
    now(input: {
      lat: number
      lon: number
      radius_km?: number
      hours?: number
      min_magnitude?: number
    }): R<Normalized>
    /** Global natural-events feed (wildfires, storms, volcanoes, floods) via NASA EONET v3. */
    events(input?: {
      status?: 'open' | 'closed' | 'all'
      limit?: number
      days?: number
      category?: string
      bbox?: string
    }): R<unknown>
  }
  finance: {
    /** Recent SEC filings for a US public company by ticker. */
    secFilings(input: {
      ticker: string
      formType?: string
      limit?: number
    }): R<Normalized>
    /** Curated XBRL financial metrics (revenue, net income, EPS, etc.) by ticker. */
    companyFacts(input: {
      ticker: string
      metrics?: string
      annualLimit?: number
      quarterlyLimit?: number
    }): R<Normalized>
    /** Recent SEC Form 4 insider transactions by ticker. */
    insiderTrades(input: {
      ticker: string
      limit?: number
    }): R<Normalized>
    /** Parsed institutional holdings (13F-HR) for an investment manager by CIK. */
    thirteenF(input: {
      managerCik: string
      formType?: string
      limit?: number
    }): R<Normalized>
    /** Company 360 by ticker — SEC filings + XBRL fundamentals + insider trades merged in one call. */
    companyProfile(input: { ticker: string; formType?: string; limit?: number }): R<unknown>
  }
  geo: {
    ip(input: { ip: string }): R<Normalized>
    /** Ground elevation (m + ft) for a coordinate, global. Pass lat + lon. */
    elevation(input: { lat: number; lon: number }): R<Normalized>
    /** Airports + schools + climate stations + recent quakes around a coordinate. */
    nearby(input: { lat: number; lon: number; radiusKm?: number; limit?: number }): R<unknown>
    /** Postal/ZIP code → place + admin divisions + coordinates (international). */
    postal(input: { postalCode: string; country?: string }): R<Normalized>
    /** FEMA flood zone for a coordinate: zone code, SFHA flag, risk level, base flood elevation (free, keyless). */
    floodZone(input: { lat: number; lon: number }): R<unknown>
    /** Static risk/context dossier for a point: Census place + FEMA flood + USGS seismic + nearest NOAA station (+ ACS when zip given). Pass lat+lon or address. */
    locationDossier(input: { lat?: number; lon?: number; address?: string; zip?: string; riskCategory?: string; siteClass?: string }): R<unknown>
  }
  geocode: {
    /** Server params: q (query string), limit (1-10), country (ISO-3166 alpha-2). */
    address(input: { q: string; limit?: number; country?: string }): R<Normalized>
    reverse(input: { lat: number; lon: number }): R<Normalized>
  }
  hash: {
    compute(input: {
      input: string
      inputEncoding?: 'utf8' | 'hex' | 'base64'
      algorithms?: string[]
      algorithm?: string
      outputEncoding?: 'hex' | 'base64'
    }): R<Normalized>
  }
  image: {
    /** Returns compressed image bytes — `result.data` is a `Uint8Array`. Provide exactly one of url | imageBase64. */
    compress(input: {
      url?: string
      imageBase64?: string
      format?: 'auto' | 'png' | 'jpeg' | 'webp' | 'avif'
      quality?: number
      lossy?: boolean
      effort?: number
    }): R<Uint8Array>
  }
  ipinfo: {
    bulk(input: { ips: string[] }): R<Normalized>
  }
  html: {
    /** Convert caller-supplied HTML to clean reading markdown (POST, no fetch). */
    toMarkdown(input: { html: string }): R<unknown>
  }
  tls: {
    /** Live TLS handshake → server certificate detail (issuer, validity, SANs, fingerprint). */
    certInfo(input: { host: string; port?: number }): R<unknown>
  }
  business: {
    /** State Secretary-of-State business registry search, normalized (NY, CO). */
    sosSearch(input: { state: 'NY' | 'CO' | 'CT'; name?: string; entityId?: string; limit?: number; offset?: number }): R<unknown>
    /** Registry lookup + OFAC sanctions screen of the entity + its agent in one call. */
    entityScreen(input: { state: 'NY' | 'CO' | 'CT'; name?: string; entityId?: string; threshold?: number; limit?: number }): R<unknown>
    /** NAICS 2022 industry-code lookup (exact code + children) or free-text industry search (US Census). */
    naics(input: { code?: string; query?: string; level?: number; limit?: number }): R<Normalized>
    /** GLEIF Legal Entity Identifier registry: exact `lei` lookup or `query` name search (ISO 17442, ~2.6M entities). */
    lei(input: { lei?: string; query?: string; country?: string; status?: 'active' | 'all'; limit?: number; offset?: number }): R<Normalized>
    /** Fuzzy resolve a messy company name to its canonical GLEIF LEI with a similarity score + confidence (KYB / record linkage). */
    entityMatch(input: { name: string; country?: string; limit?: number }): R<Normalized>
  }
  law: {
    /** Federal court dockets (civil + criminal) via RECAP — q full-text or exact docketNumber. */
    docketSearch(input: { q?: string; court?: string; docketNumber?: string; filedAfter?: string; filedBefore?: string; page?: number }): R<unknown>
    caseSearch(input: {
      q: string
      court?: string
      filedAfter?: string
      filedBefore?: string
      order?: 'relevance' | 'dateFiled-desc' | 'dateFiled-asc' | 'citeCount-desc'
      limit?: number
    }): R<Normalized>
    /** POST { text } — finds + verifies citations inside a passage. */
    caseVerify(input: { text: string }): R<Normalized>
    /** POST { text?, quotes? } — verify existence of cases/USC/CFR refs + (deterministically) whether attributed quotes appear in the cited opinion. */
    citationCheck(input: { text?: string; quotes?: Array<{ citation: string; quote: string }> }): R<Normalized>
    /** POST { query, threshold?, limit?, sourceList? } — OFAC SDN fuzzy match. */
    sanctionsCheck(input: {
      query: string
      threshold?: number
      limit?: number
      sourceList?: string
    }): R<Normalized>
    /** Server params: q, type (RULE|PRORULE|NOTICE|PRESDOCU), agency (slug), since/until (yyyy-mm-dd), limit. */
    federalRegister(input: {
      q: string
      type?: 'RULE' | 'PRORULE' | 'NOTICE' | 'PRESDOCU'
      agency?: string
      since?: string
      until?: string
      limit?: number
    }): R<Normalized>
    /** Full text of a CFR section by title (1-50) + section ("1026.43"); optional point-in-time date (yyyy-mm-dd, back to 2017). */
    cfrSection(input: { title: number; section: string; date?: string }): R<unknown>
    /** POST — supply exactly one of `opinionId` or `citation`. */
    opinion(input: { opinionId: number } | { citation: string }): R<Normalized>
    /** CourtListener attorney search by name and/or firm. */
    attorneyLookup(input: {
      name?: string
      firmName?: string
      limit?: number
    }): R<Normalized>
    /** CourtListener federal judge lookup by name. */
    judgeLookup(input: {
      name: string
      limit?: number
    }): R<Normalized>
    /** Full current text of a US Code section by title (1-54) + section ("107", "1395w-4"). */
    uscSection(input: { title: number; section: string; includeNotes?: boolean }): R<unknown>
    /** US trademark status by 8-digit serial number OR registration number (exactly one). */
    trademarkStatus(input: { serialNumber: string } | { registrationNumber: string }): R<unknown>
    /** Full-text search of US trademarks by wordmark / owner / goods (or exact serial / registration number). */
    trademarkSearch(input: {
      query?: string
      serial?: string
      registrationNumber?: string
      field?: 'mark' | 'owner' | 'all'
      status?: 'live' | 'all'
      intlClass?: string
      limit?: number
      offset?: number
    }): R<unknown>
  }
  /** USDA FoodData Central nutrition data. */
  nutrition: {
    /** Search foods (query=…) or fetch one food's full nutrient profile (fdcId=…). */
    food(input: {
      query?: string
      fdcId?: number
      dataType?: 'Foundation' | 'SR Legacy' | 'Survey (FNDDS)' | 'Branded'
      limit?: number
      page?: number
    }): R<unknown>
  }
  /** Person-name sweeps across public registries. */
  person: {
    /** Name-matched candidates (NOT identity-resolved) across FINRA, attorneys, inmates, TX trades + real-estate. */
    crossRegistry(input: { name: string; limit?: number }): R<unknown>
  }
  /** TLD registry + Public Suffix List intelligence. */
  tld: {
    /** Pass tld=… for IANA metadata, or domain=… for PSL public-suffix/registrable-domain analysis. */
    info(input: { tld?: string; domain?: string }): R<unknown>
  }
  papers: {
    search(input: {
      q: string
      limit?: number
      since?: string
      sources?: string
    }): R<Normalized>
  }
  paper: {
    /** Crossref DOI bibliographic metadata lookup. */
    doiLookup(input: { doi: string }): R<unknown>
  }
  registry: {
    /** npm package metadata. */
    npmLookup(input: { name: string }): R<unknown>
    /** PyPI package metadata. */
    pypiLookup(input: { name: string }): R<unknown>
  }
  fx: {
    /** ECB daily reference exchange rates via Frankfurter. */
    rates(input?: { base?: string; symbols?: string; date?: string; amount?: number }): R<unknown>
    /** ECB historical daily rate series + summary stats over a date range. */
    timeseries(input: { start: string; base?: string; symbols?: string; end?: string; amount?: number }): R<unknown>
  }
  bls: {
    /** US Bureau of Labor Statistics time series. */
    series(input: { seriesIds: string; startYear?: number; endYear?: number }): R<unknown>
  }
  country: {
    /** Country metadata lookup (REST Countries). */
    lookup(input: { alpha2?: string; alpha3?: string; name?: string; fullText?: boolean }): R<unknown>
  }
  news: {
    /** Hacker News feed (top/new/best/ask/show/job). */
    hnTop(input?: { kind?: 'top' | 'new' | 'best' | 'ask' | 'show' | 'job'; limit?: number }): R<unknown>
    /** Hacker News item lookup by ID. */
    hnItem(input: { id: number }): R<unknown>
    /** Live news search: headlines with source, age, breaking flag. freshness: pd|pw|pm|py. */
    search(input: { q: string; count?: number; offset?: number; country?: string; freshness?: 'pd' | 'pw' | 'pm' | 'py' }): R<unknown>
  }
  /** Live web search. */
  search: {
    /** Ranked web results with title, url, snippet, site, age. freshness: pd|pw|pm|py or YYYY-MM-DDtoYYYY-MM-DD. */
    web(input: {
      q: string
      count?: number
      offset?: number
      country?: string
      freshness?: string
      safesearch?: 'off' | 'moderate' | 'strict'
    }): R<unknown>
  }
  /** Vulnerability intelligence. */
  security: {
    /** Resolve a CVE across NVD (record + CVSS + CWE), CISA KEV (actively-exploited + ransomware flag), and EPSS (exploit probability) in one call. */
    cve(input: { cve: string }): R<unknown>
    /** Package security + provenance: OSV vulns + deps.dev license/deprecation + OpenSSF Scorecard health, in one call. GET { ecosystem, name, version? }. */
    package(input: { ecosystem: string; name: string; version?: string }): R<Normalized>
    /** Find CVEs affecting a product (NVD search by keyword or CPE). GET { product? | cpe?, limit? }. */
    cveSearch(input: { product?: string; cpe?: string; limit?: number }): R<Normalized>
  }
  /** Stock market data (Massive / formerly Polygon.io). */
  stocks: {
    /** Latest daily quote for a US ticker (EOD/delayed): OHLCV, VWAP, change vs prior session, company metadata. */
    quote(input: { ticker: string }): R<unknown>
  }
  /** Live flight tracking. */
  flight: {
    /** Recent + upcoming instances of a flight with live times, delays, progress. */
    status(input: { ident: string; identType?: 'designator' | 'registration' | 'fa_flight_id'; limit?: number }): R<unknown>
  }
  /** Speech-to-text. */
  transcribe: {
    /** POST — transcribe an audio URL (≤15 MB, ≤15 min). diarize=true adds speaker turns. */
    audio(input: { url: string; language?: string; diarize?: boolean }): R<unknown>
  }
  food: {
    /** Food product lookup by UPC/EAN barcode (Open Food Facts, CC0). */
    barcodeLookup(input: { barcode: string }): R<unknown>
  }
  edu: {
    /** US college + university search (Department of Education College Scorecard). */
    collegeScorecard(input?: Record<string, unknown>): R<unknown>
    /** Every US public K-12 school (~102k, NCES CCD). */
    schoolLookup(input: { name?: string; district?: string; state?: string; city?: string; zip?: string; ncessch?: string; limit?: number; offset?: number }): R<unknown>
  }
  energy: {
    /** Alternative-fuel station locator (NREL Alternative Fuels Data Center). */
    fuelStations(input?: Record<string, unknown>): R<unknown>
    /** Solar resource averages (NREL NSRDB) for a lat/lon. */
    solarResource(input: { lat: number; lon: number }): R<unknown>
    /** US energy benchmark prices (EIA): omit series for a snapshot of all, or pass one (wti_crude/brent_crude/henry_hub_gas/gasoline_regular/diesel/electricity_retail). */
    prices(input?: { series?: string; limit?: number }): R<Normalized>
  }
  park: {
    /** Unified US National Park Service read API (NPS). */
    lookup(input: { resource: string; parkCode?: string; state?: string; q?: string; limit?: number; start?: number }): R<unknown>
  }
  recreation: {
    /** Recreation Information Database (RIDB / Recreation.gov) search. */
    search(input: { resource: string; query?: string; state?: string; activity?: number; latitude?: number; longitude?: number; radius?: number; lastUpdated?: string; limit?: number; offset?: number }): R<unknown>
  }
  job: {
    /** Search current US federal job postings via USAJobs. */
    federalSearch(input?: Record<string, unknown>): R<unknown>
    /** USAJobs reference codelist contents. */
    federalCodes(input: { name: string }): R<unknown>
  }
  property: {
    /** NYC tax-lot lookup via PLUTO — by BBL or address. */
    nycParcelLookup(input?: { bbl?: string; address?: string; borough?: string }): R<unknown>
    /** NYC ACRIS deed + mortgage history for a BBL. */
    nycDeedHistory(input: { bbl: string; limit?: number; offset?: number }): R<unknown>
    /** NYC DOB construction permits by BBL or address. */
    nycPermits(input?: Record<string, unknown>): R<unknown>
    /** NYC HPD violations by BBL or address. */
    nycViolations(input?: Record<string, unknown>): R<unknown>
  }
  treasury: {
    /** US National Debt — daily Debt to the Penny. */
    debt(input?: Record<string, unknown>): R<unknown>
    /** Daily Treasury Statement (DTS) operating cash balance. */
    cash(input?: Record<string, unknown>): R<unknown>
    /** Official Treasury exchange rates (quarterly). */
    exchangeRates(input?: Record<string, unknown>): R<unknown>
    /** Monthly Treasury Statement (MTS) — Table 4 federal receipts by source. */
    monthlyStatement(input?: Record<string, unknown>): R<unknown>
  }
  word: {
    /** English dictionary entry (dictionaryapi.dev / Wiktionary, CC BY-SA). */
    define(input: { word: string }): R<unknown>
    /** Related words: rhymes, synonyms, antonyms, semantic neighbours (Datamuse). */
    related(input: { word: string; relation: string; limit?: number }): R<unknown>
  }
  patents: {
    search(input: {
      q: string
      yearFrom?: number
      yearTo?: number
      applicationType?: 'Utility' | 'Design' | 'Plant' | 'Reissue'
      limit?: number
      offset?: number
    }): R<Normalized>
    detail(input: { applicationNumber: string }): R<Normalized>
    documents(input: { applicationNumber: string }): R<Normalized>
  }
  quakes: {
    /** Server requires lat + lon. Optional: radius_km, hours, min_magnitude. */
    recent(input: {
      lat: number
      lon: number
      radius_km?: number
      hours?: number
      min_magnitude?: number
    }): R<Normalized>
  }
  sunrise: {
    /** Server requires lat + lon + date (yyyy-mm-dd). */
    compute(input: { lat: number; lon: number; date: string }): R<Normalized>
  }
  tides: {
    now(input: { lat: number; lon: number; radius_km?: number; hours?: number }): R<Normalized>
  }
  medical: {
    /** Verify an ICD-10-CM diagnosis code or keyword-search the official US code set. */
    icd10(input: { code?: string; q?: string; billable_only?: boolean; limit?: number }): R<unknown>
    /** Normalize/verify drug names against RxNorm: term=… for candidates, rxcui=… for canonical concept + ingredients/brands/dose forms. */
    rxnorm(input: { term?: string; rxcui?: string; limit?: number }): R<unknown>
    /** Drug situational awareness: FDA shortage + recall status + NDC metadata for a drug name / rxcui / ndc (composed on RxNorm). */
    drugStatus(input: { drug?: string; rxcui?: string; ndc?: string; limit?: number }): R<unknown>
  }
  net: {
    /** Autonomous System (BGP) intelligence by AS number: holder, allocation block, announced prefixes, routing visibility (RIPEstat). */
    asn(input: { asn: string }): R<unknown>
    /** Resolve a MAC address or OUI prefix to its IEEE-registered vendor + decoded address bits (multicast/local/randomized). Bundled IEEE registries. */
    macVendor(input: { mac: string }): R<unknown>
  }
  research: {
    /** Resolve a research organization via ROR (id or name): location, external ids, relationships. */
    org(input: { id?: string; name?: string; limit?: number }): R<unknown>
    /** ORCID researcher profile by iD: name, affiliations, works. */
    author(input: { orcid: string; worksLimit?: number }): R<unknown>
    /** NIH RePORTER federal grant search by term/org/pi/fiscalYear. */
    funding(input: { term?: string; org?: string; pi?: string; fiscalYear?: number; limit?: number; offset?: number }): R<unknown>
  }
  timezone: {
    /** Resolve a coordinate to its IANA timezone + current local wall time. */
    lookup(input: { lat: number; lon: number; at?: string }): R<unknown>
  }
  url: {
    unfurl(input: { url: string }): R<UrlUnfurlResponse>
    /**
     * Clean a URL into article content. `format` markdown|text|both returns a
     * JSON envelope (`result.data` is {@link UrlCleanResponse}); `html` and
     * `pdf` return raw bytes (`result.data` is a `Uint8Array` — a
     * self-contained reader page / typeset PDF respectively).
     */
    clean(input: { url: string; format?: 'markdown' | 'text' | 'both' | 'html' | 'pdf' }): R<UrlCleanResponse | Uint8Array>
    /**
     * Like {@link clean} but renders the page in a real headless browser (JS
     * executed) — for client-rendered / SPA pages where `clean`'s raw fetch
     * sees an empty shell. Tier 2 (~10× the price of clean). Same formats &
     * return shape (JSON envelope, or `Uint8Array` for html/pdf).
     */
    render(input: {
      url: string
      format?: 'markdown' | 'text' | 'both' | 'html' | 'pdf'
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
      timeoutMs?: number
    }): R<UrlCleanResponse | Uint8Array>
    /**
     * Discover the URLs a page or sitemap points at in a single fetch — <loc>
     * entries from an XML sitemap/sitemap-index, or <a href> links from an
     * HTML page (auto-detected). Resolved-absolute, deduped, http(s)-only.
     * Stateless, no JS, NOT a crawler — re-call on a child sitemap/page to go
     * deeper. `limit` 1-2000 (default 200); `sameHostOnly` keeps same-host links.
     */
    map(input: { url: string; limit?: number; sameHostOnly?: boolean }): R<{
      url: string
      finalUrl: string
      source: 'sitemap' | 'links'
      count: number
      capped: boolean
      urls: string[]
    }>
  }
  weather: {
    zip(input: { zip: string }): R<Normalized>
    /** Live US National Weather Service active alerts by point ("lat,lon") or area (2-letter state/marine code). */
    alerts(input: {
      point?: string
      area?: string
      severity?: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown'
      urgency?: 'Immediate' | 'Expected' | 'Future' | 'Past' | 'Unknown'
      limit?: number
    }): R<Normalized>
    /** NWS multi-day (or hourly) forecast for a US coordinate. Pass lat + lon (+ optional hourly, limit). */
    forecast(input: { lat: number; lon: number; hourly?: boolean; limit?: number }): R<Normalized>
    /** Current air quality (US/EU AQI + pollutants) for a coordinate, global. */
    airQuality(input: { lat: number; lon: number }): R<Normalized>
    /** Current marine/sea-state (waves + swell) for an ocean/coastal coordinate. */
    marine(input: { lat: number; lon: number }): R<Normalized>
    /** Historical daily weather (ERA5) for a coordinate + date range. */
    history(input: { lat: number; lon: number; start: string; end: string }): R<Normalized>
  }
  wikipedia: {
    summary(input: { title: string; lang?: string }): R<Normalized>
  }
  poi: {
    /** Find POIs near a coord — OpenStreetMap-backed via Overpass. */
    near(input: {
      lat: number
      lon: number
      category: string
      radius_m?: number
      limit?: number
    }): R<unknown>
  }
  phone: {
    /** E.164-normalize + classify (mobile/fixed/voip/etc.) using libphonenumber. */
    normalize(input: { phone: string; defaultRegion?: string }): R<unknown>
  }
  space: {
    /** Current NOAA space-weather Kp/solar-flux/aurora snapshot. */
    weather(input?: Record<string, never>): R<unknown>
    /** Asteroid/comet physical + orbital params from JPL Small-Body Database. */
    body(input: { q: string }): R<unknown>
    /** Near-Earth-object close approaches in a date + distance window (JPL CAD). */
    closeApproaches(input?: { dateMin?: string; dateMax?: string; distMaxAu?: number; limit?: number }): R<unknown>
    /** Current position of any cataloged satellite (Celestrak + SGP4). */
    satellite(input: { noradId: number; lat?: number; lon?: number; altKm?: number; at?: string }): R<unknown>
    /** Search the satellite catalog (SATCAT, ~69k objects) by name/owner/type/launch-year/on-orbit; total = full count matching. */
    satellites(input?: { q?: string; owner?: string; type?: string; noradId?: number; intlDesignator?: string; launchYearFrom?: number; launchYearTo?: number; onOrbit?: 'true' | 'false'; limit?: number; offset?: number }): R<Normalized>
    /** Upcoming/recent orbital rocket launches (Launch Library 2). */
    launches(input?: { when?: 'upcoming' | 'previous'; search?: string; limit?: number; offset?: number }): R<unknown>
    /** Observer-local sky almanac — sun/moon rise-set, moon phase, planet positions (computed). */
    skyTonight(input: { lat: number; lon: number; altitudeM?: number; at?: string }): R<unknown>
    /** Confirmed exoplanets from the NASA Exoplanet Archive. */
    exoplanet(input?: { name?: string; hostStar?: string; discoveryYear?: number; method?: string; limit?: number }): R<unknown>
    /** Synthesis: what's notable in your sky now — almanac + close approaches + ISS. */
    skywatch(input: { lat: number; lon: number; altitudeM?: number }): R<unknown>
    /** Synthesis: a host star's planetary system + computed habitable zone. */
    system(input: { hostStar: string }): R<unknown>
    /** Where is an asteroid/comet in the sky + can you see it tonight (computed ephemeris). */
    observe(input: { body: string; lat?: number; lon?: number; altKm?: number; at?: string }): R<unknown>
  }
  bio: {
    /** Resolve a species to the GBIF taxonomic backbone (lineage, vernacular, occurrences). */
    species(input: { name: string }): R<unknown>
    /** Gene identity (NCBI) joined with its reviewed protein (UniProt). */
    gene(input: { symbol: string; taxid?: number }): R<unknown>
    /** Full UniProtKB protein entry by accession (function, GO, PDB, subcellular). */
    protein(input: { accession: string }): R<unknown>
  }
  vehicle: {
    /** Vehicle 360 by VIN — decode + this vehicle's recalls + complaints merged in one call. */
    profile(input: { vin: string; modelYear?: number }): R<unknown>
    /** Decode a VIN via NHTSA vPIC. */
    vinDecode(input: { vin: string; modelYear?: number }): R<unknown>
    /** NHTSA recall lookup by VIN, by make/model/year, or by campaign ID. */
    recalls(input: {
      vin?: string
      make?: string
      model?: string
      modelYear?: number
      nhtsaId?: string
    }): R<unknown>
    /** NHTSA consumer complaints by make/model/year. */
    complaints(input: {
      make?: string
      model?: string
      modelYear?: number
      limit?: number
      offset?: number
    }): R<unknown>
    /** NHTSA open investigations (newest-first, chronological). */
    investigations(input: { limit?: number; offset?: number }): R<unknown>
    /** Models for a given make + year (vPIC). */
    models(input: { make: string; modelYear: number }): R<unknown>
    /** Decode a 3-character World Manufacturer Identifier (WMI). */
    decodeWmi(input: { wmi: string }): R<unknown>
    /** Paginated NHTSA manufacturer list (vPIC). */
    manufacturers(input: { page?: number }): R<unknown>
  }
  agent: {
    /** Multi-source delta of recent events on a topic. Tier 2. */
    knowledgeDelta(input: {
      topic: string
      since: string
      until?: string
      maxEvents?: number
    }): R<unknown>
    memory: {
      put(input: { key: string; value: unknown; ttlSeconds?: number }): R<unknown>
      get(input: { key: string }): R<unknown>
      list(input?: { prefix?: string; limit?: number; cursor?: string }): R<unknown>
      delete(input: { key: string }): R<unknown>
    }
    marketplace: {
      register(input: {
        name: string
        description: string
        capabilities: string[]
        endpointUrl?: string
        priceUsd?: number
        network?: 'base' | 'solana' | 'base+solana'
        payTo?: string
        status?: 'active' | 'paused' | 'removed'
        metadata?: Record<string, unknown>
      }): R<unknown>
      discover(input?: {
        q?: string
        capabilities?: string
        network?: 'base' | 'solana'
        limit?: number
        offset?: number
      }): R<unknown>
      profile(input: { namespace: string }): R<unknown>
      review(input: {
        reviewed: string
        outcome: 'success' | 'failure' | 'partial'
        rating?: number
        comment?: string
        txHash?: string
        network?: 'base' | 'solana'
      }): R<unknown>
    }
  }
  chem: {
    /** Look up a chemical compound by cid, name, smiles, or inchikey. NIH PubChem. */
    compound(input: {
      cid?: number
      name?: string
      smiles?: string
      inchikey?: string
    }): R<unknown>
  }
  bank: {
    /** FDIC-insured US bank directory. Lookup by name, cert, RSSD, or state. */
    lookup(input: {
      name?: string
      cert?: string
      rssdId?: string
      state?: string
      status?: 'active' | 'inactive' | 'any'
      limit?: number
      offset?: number
    }): R<unknown>
  }
  license: {
    /** US healthcare provider lookup (NPPES NPI Registry). */
    medical(input: {
      npi?: string
      firstName?: string
      lastName?: string
      name?: string
      state?: string
      enumerationType?: '1' | '2'
      limit?: number
      skip?: number
    }): R<unknown>
    /** FINRA BrokerCheck — registered US brokers / investment advisors. */
    broker(input: {
      query?: string
      crd?: string
      limit?: number
      offset?: number
    }): R<unknown>
    /** US trade / occupational license verification (TX TDLR). */
    trades(input: { state: 'TX'; name?: string; licenseNumber?: string; licenseType?: string; county?: string; limit?: number; offset?: number }): R<unknown>
    /** US real-estate license verification (TX TREC). */
    realEstate(input: { state: 'TX'; name?: string; licenseNumber?: string; licenseType?: string; status?: string; limit?: number; offset?: number }): R<unknown>
  }
  health: {
    /** Current US disease surveillance (CDC NNDSS weekly notifiable-disease counts). Filter by condition/location/year. */
    diseaseSurveillance(input: { condition?: string; location?: string; year?: number; weeks?: number; limit?: number }): R<Normalized>
    /** CMS Open Payments — pharma/device → US physician payment disclosures. */
    openPayments(input: {
      npi?: string
      firstName?: string
      lastName?: string
      payerName?: string
      state?: string
      minAmount?: number
      limit?: number
      offset?: number
    }): R<unknown>
    /** CMS Care Compare hospital lookup. */
    hospitalLookup(input: {
      facilityId?: string
      name?: string
      city?: string
      state?: string
      hospitalType?: string
      minRating?: number
      limit?: number
      offset?: number
    }): R<unknown>
    /** CMS Care Compare hospital quality (overall star rating + measure domains). */
    hospitalQuality(input: { facilityId?: string; state?: string; city?: string; name?: string; limit?: number; offset?: number }): R<unknown>
    /** Medicare utilization + payments by provider NPI (CMS annual dataset). */
    medicareProvider(input: { npi?: string; lastName?: string; state?: string; limit?: number; offset?: number }): R<unknown>
    /** US mortality statistics (CDC NCHS: leading causes 1999-2017, weekly counts 2020-2023). */
    mortalityStats(input?: { dataset?: 'leading-causes' | 'weekly-counts'; state?: string; year?: number; cause?: string; limit?: number; offset?: number }): R<unknown>
    /** Provider 360 by NPI — NPPES identity + Open Payments + Medicare billing merged in one call. */
    providerProfile(input: { npi: string }): R<unknown>
  }
  worldbank: {
    /** World Bank Open Data indicator time series. */
    indicator(input: {
      country: string
      indicator: string
      yearFrom?: number
      yearTo?: number
      limit?: number
      page?: number
    }): R<unknown>
  }
  book: {
    /** Open Library book metadata search. */
    search(input: {
      q?: string
      title?: string
      author?: string
      isbn?: string
      limit?: number
      page?: number
    }): R<unknown>
  }
  clinical: {
    /** ClinicalTrials.gov study search. */
    trialSearch(input: {
      query?: string
      nctId?: string
      status?: 'RECRUITING' | 'ACTIVE_NOT_RECRUITING' | 'COMPLETED' | 'TERMINATED' | 'WITHDRAWN' | 'NOT_YET_RECRUITING' | 'SUSPENDED'
      sponsor?: string
      phase?: string
      country?: string
      pageSize?: number
      pageToken?: string
    }): R<unknown>
  }
  code: {
    /** GitHub repository lookup by "owner/name". */
    repoLookup(input: { repo: string }): R<unknown>
  }
  wikidata: {
    /** Wikidata entity (Q/P/L/M/S id) lookup. */
    entity(input: {
      id: string
      languages?: string
      includeClaims?: boolean
      maxClaimsPerProperty?: number
    }): R<unknown>
  }
  nonprofit: {
    /** US 501(c) nonprofit search via ProPublica Nonprofit Explorer. */
    search(input: {
      q?: string
      ein?: string
      state?: string
      nteeCode?: string
      subsectionCode?: number
      page?: number
    }): R<unknown>
    /** Nonprofit lookup + OFAC sanctions screen per organization in one call. */
    screen(input: { q?: string; ein?: string; limit?: number }): R<unknown>
  }
  gov: {
    /** Active US federal contract opportunities (SAM.gov). Requires postedFrom + postedTo (MM/DD/YYYY); filter by title/naics/state/setAside/ptype. */
    contractOpportunities(input: { postedFrom: string; postedTo: string; title?: string; naics?: string; state?: string; setAside?: string; ptype?: string; limit?: number; offset?: number }): R<Normalized>
    /** SAM.gov registered-entity lookup by UEI / CAGE / legal business name. */
    entity(input: { legalBusinessName?: string; ueiSAM?: string; cageCode?: string; limit?: number }): R<Normalized>
    /** SAM.gov federal exclusions (debarment/suspension) check by name / UEI / CAGE. */
    exclusions(input: { name?: string; ueiSAM?: string; cageCode?: string; classificationType?: string; limit?: number }): R<Normalized>
    /** Federal counterparty due-diligence dossier on a name: SAM registration + exclusions + OFAC + GLEIF LEI + USAspending awards + FARA foreign-agent in one call. */
    counterparty(input: { name: string; state?: string; threshold?: number; limit?: number }): R<unknown>
    /** FARA foreign-agent registration search by name: is this entity a registered foreign agent, with a KYB-safe bestMatch. */
    foreignAgents(input: { name: string; limit?: number }): R<unknown>
    /** FEMA National Risk Index for a US county (by FIPS, state+county, or lat/lon): composite risk + per-hazard ratings. */
    riskIndex(input: { countyFips?: string; state?: string; county?: string; lat?: number; lon?: number }): R<unknown>
    /** Resolve an FCC ID to its grantee/manufacturer (company, location, registration date) via the FCC EAS open dataset. */
    fccId(input: { fccId: string }): R<unknown>
    /** FEMA NFIP flood-insurance claims history for an area (by state + optional county FIPS/zip/year): net payouts + flood zone + cause + water depth. */
    nfipClaims(input: { state: string; county?: string; zip?: string; yearFrom?: number; yearTo?: number; limit?: number }): R<unknown>
    /** FMCSA motor-carrier safety profile by USDOT number (or name search): authority/status, safety rating, crash + inspection history, CSA BASICs. */
    carrierSafety(input: { dot?: number; name?: string; limit?: number }): R<unknown>
    /** US address → congressional district (119th), state, and county via the Census geocoder. GET { address }. */
    district(input: { address: string }): R<Normalized>
    /** Federal Bureau of Prisons inmate locator (1982-present, current + released). */
    inmateLocator(input: { lastName?: string; firstName?: string; middleName?: string; inmateNumber?: string; age?: number; sex?: 'Male' | 'Female'; race?: string }): R<unknown>
    /** US Senate lobbying disclosures (LDA filings) — registrant/client/lobbyist/year. */
    lobbyingFilings(input: { registrant?: string; client?: string; lobbyist?: string; year?: number; period?: string; type?: string; page?: number; pageSize?: number }): R<unknown>
    /** US House financial-disclosure filings incl. PTR stock-trade reports (STOCK Act). Filter by member/state/type/year/date; total = count. */
    congressFilings(input?: { q?: string; state?: string; type?: string; chamber?: 'house' | 'senate'; year?: number; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }): R<Normalized>
    /** US Congress member stock trades parsed from STOCK Act PTRs. Filter by member/ticker/type/state/date; amounts are disclosed ranges; total = count. */
    congressTrades(input?: { q?: string; ticker?: string; type?: 'purchase' | 'sale' | 'exchange'; chamber?: 'house' | 'senate'; state?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }): R<Normalized>
    /** US Congress bills — lookup by congress+type+number, or list/filter. */
    congressBill(input?: Record<string, unknown>): R<unknown>
    /** Members of US Congress — lookup by bioguide ID or filter. */
    congressMember(input?: Record<string, unknown>): R<unknown>
    /** Federal political candidates (OpenFEC). */
    fecCandidate(input?: Record<string, unknown>): R<unknown>
    /** Federal political committees (OpenFEC). */
    fecCommittee(input?: Record<string, unknown>): R<unknown>
    /** FEC Schedule A — itemized contributions to political committees. */
    fecContributions(input?: Record<string, unknown>): R<unknown>
    /** FEC Schedule B — itemized political committee disbursements. */
    fecExpenditures(input?: Record<string, unknown>): R<unknown>
    /** FEC aggregate financial totals (candidates or committees). */
    fecTotals(input: { scope: 'candidates' | 'committees'; [k: string]: unknown }): R<unknown>
    /** US Congressional committees — list or look up by systemCode. */
    congressCommittee(input?: Record<string, unknown>): R<unknown>
    /** US Congressional amendments — list or look up by congress+type+number. */
    congressAmendment(input?: Record<string, unknown>): R<unknown>
    /** US presidential nominations sent to the Senate. */
    congressNomination(input?: Record<string, unknown>): R<unknown>
    /** US Congressional hearings (Congress.gov). */
    congressHearing(input?: Record<string, unknown>): R<unknown>
    /** International treaties transmitted to the US Senate (Congress.gov). */
    congressTreaty(input?: Record<string, unknown>): R<unknown>
    /** Daily Congressional Record issues (Congress.gov). */
    congressRecord(input?: Record<string, unknown>): R<unknown>
    /** Latest US Congressional bill summaries (Congress.gov). */
    billSummaries(input?: Record<string, unknown>): R<unknown>
    /** OSHA inspection records via DOL Open Data Portal. */
    oshaInspections(input?: Record<string, unknown>): R<unknown>
    /** OSHA citation / violation records via DOL Open Data Portal. */
    oshaViolations(input?: Record<string, unknown>): R<unknown>
    /** OSHA-investigated workplace accident reports via DOL Open Data Portal. */
    oshaAccidents(input?: Record<string, unknown>): R<unknown>
    /** MSHA mine safety accident records via DOL Open Data Portal. */
    mshaAccidents(input?: Record<string, unknown>): R<unknown>
    /** OpenFDA drug adverse event reports (FAERS). */
    fdaDrugEvents(input: { drug: string; reaction?: string; limit?: number }): R<unknown>
    /** OpenFDA drug recall enforcement reports. */
    fdaRecalls(input: {
      drug?: string
      classification?: 'I' | 'II' | 'III'
      status?: 'Ongoing' | 'Completed' | 'Terminated' | 'Pending'
      limit?: number
    }): R<unknown>
    /** CPSC consumer-product recalls (SaferProducts.gov), newest first. All filters optional. */
    productRecalls(input?: {
      title?: string
      productName?: string
      recallNumber?: string
      dateStart?: string
      dateEnd?: string
      limit?: number
    }): R<Normalized>
    /** OpenFDA food recall enforcement reports. */
    fdaFoodRecalls(input: {
      product?: string
      classification?: 'I' | 'II' | 'III'
      status?: 'Ongoing' | 'Completed' | 'Terminated' | 'Pending'
      state?: string
      limit?: number
    }): R<unknown>
    /** OpenFDA medical device adverse event reports (MAUDE). */
    fdaDeviceEvents(input: {
      device?: string
      manufacturer?: string
      problem?: string
      limit?: number
    }): R<unknown>
    /** OpenFDA animal/veterinary adverse event reports. */
    fdaAnimalvetEvents(input: {
      drug?: string
      species?: string
      reaction?: string
      limit?: number
    }): R<unknown>
    /** US House of Representatives roll-call votes (locally aggregated, daily). */
    houseVotes(input?: {
      year?: number
      congress?: number
      result?: string
      bill?: string
      since?: string
      until?: string
      limit?: number
      offset?: number
    }): R<unknown>
    /** US Senate roll-call votes (locally aggregated, daily). */
    senateVotes(input?: {
      congress?: number
      session?: 1 | 2
      result?: string
      document?: string
      since?: string
      until?: string
      limit?: number
      offset?: number
    }): R<unknown>
    /** Federal-award (contracts/grants/loans/payments) search via USAspending.gov. */
    usaspendingAwards(input?: {
      recipient?: string
      agency?: string
      recipientState?: string
      awardType?: 'contracts' | 'grants' | 'loans' | 'direct_payments' | 'other'
      since?: string
      until?: string
      limit?: number
      page?: number
    }): R<unknown>
    /** Real-time USGS NWIS water gauge readings within a bbox around lat/lon. */
    usgsWater(input: {
      lat: number
      lon: number
      radius?: number
      variables?: string
      limit?: number
    }): R<unknown>
    /** EPA Facility Registry Service (FRS) by state + name + program. */
    epaFacilities(input: {
      state: string
      name?: string
      program?: string
      limit?: number
      offset?: number
    }): R<unknown>
    /** Newest Federal Register documents by publication date (chronological feed). */
    federalRegisterRecent(input?: {
      type?: 'RULE' | 'PRORULE' | 'NOTICE' | 'PRESDOCU'
      agency?: string
      since?: string
      until?: string
      limit?: number
      page?: number
    }): R<unknown>
  }
}

export function createEndpoints(client: TwoS): Endpoints {
  const get = <T>(endpoint: string, path: string, q?: Record<string, unknown>) =>
    client.request<T>({ method: 'GET', path, query: q as never, endpoint })
  const post = <T>(endpoint: string, path: string, body: unknown) =>
    client.request<T>({ method: 'POST', path, body, endpoint })

  return {
    account: {
      balance: () => get('account.balance', '/api/account/balance'),
    },
    ai: {
      summarize: (i) => post('ai.summarize', '/api/ai/summarize', i),
      translate: (i) => post('ai.translate', '/api/ai/translate', i),
      extract: (i) => post('ai.extract', '/api/ai/extract', i),
      describeImage: (i) => post('ai.describe-image', '/api/ai/describe-image', i),
      screenshot: (i) => post('ai.screenshot', '/api/ai/screenshot', i),
    },
    aircraft: {
      lookup: (i) => get('aircraft.lookup', '/api/aircraft/lookup', i),
      profile: (i) => get('aircraft.profile', '/api/aircraft/profile', i),
    },
    airport: {
      lookup: (i) => get('airport.lookup', '/api/airport/lookup', i),
      near: (i) => get('airport.near', '/api/airport/near', i),
    },
    barcode: {
      generate: (i) => post('barcode.generate', '/api/barcode/generate', i),
    },
    calendar: {
      holidays: (i) => get('calendar.holidays', '/api/calendar/holidays', i),
      businessDays: (i) => get('calendar.business-days', '/api/calendar/business-days', i),
    },
    census: {
      zipcode: (i) => get('census.zipcode', '/api/census/zipcode', i),
    },
    climate: {
      stationNear: (i) => get('climate.station-near', '/api/climate/station-near', i),
      stationHistory: (i) => get('climate.station-history', '/api/climate/station-history', i),
    },
    countdown: {
      gif: (i) => get('countdown.gif', '/api/countdown/gif', i),
    },
    crypto: {
      addressValidate: (i) => get('crypto.address-validate', '/api/crypto/address-validate', i),
      defi: (i) => get('crypto.defi', '/api/crypto/defi', i ?? {}),
      contract: (i) => get('crypto.contract', '/api/crypto/contract', i),
      fearGreed: (i) => get('crypto.fear-greed', '/api/crypto/fear-greed', i ?? {}),
      markets: (i) => get('crypto.markets', '/api/crypto/markets', i ?? {}),
      global: (i) => get('crypto.global', '/api/crypto/global', i ?? {}),
      trending: (i) => get('crypto.trending', '/api/crypto/trending', i ?? {}),
      gasOracle: (i) => get('crypto.gas-oracle', '/api/crypto/gas-oracle', i),
      ensResolve: (i) => get('crypto.ens-resolve', '/api/crypto/ens-resolve', i),
      tokenPrice: (i) => get('crypto.token-price', '/api/crypto/token-price', i),
      tx: (i) => get('crypto.tx', '/api/crypto/tx', i),
    },
    validate: {
      iban: (i) => get('validate.iban', '/api/validate/iban', i),
      gtin: (i) => get('validate.gtin', '/api/validate/gtin', i),
      aba: (i) => get('validate.aba', '/api/validate/aba', i),
      lei: (i) => get('validate.lei', '/api/validate/lei', i),
      bic: (i) => get('validate.bic', '/api/validate/bic', i),
      gln: (i) => get('validate.gln', '/api/validate/gln', i),
      sscc: (i) => get('validate.sscc', '/api/validate/sscc', i),
      isin: (i) => get('validate.isin', '/api/validate/isin', i),
      cusip: (i) => get('validate.cusip', '/api/validate/cusip', i),
      batch: (i) => post('validate.batch', '/api/validate/batch', i),
    },
    tax: {
      vat: (i) => get('tax.vat', '/api/tax/vat', i),
      vatRates: (i) => get('tax.vat-rates', '/api/tax/vat-rates', i ?? {}),
    },
    inflation: {
      calculator: (i) => get('inflation.calculator', '/api/inflation/calculator', i),
      rates: (i) => get('inflation.rates', '/api/inflation/rates', i ?? {}),
      expectations: (i) => get('inflation.expectations', '/api/inflation/expectations', i ?? {}),
      hicp: (i) => get('inflation.hicp', '/api/inflation/hicp', i ?? {}),
    },
    econ: {
      indicator: (i) => get('econ.indicator', '/api/econ/indicator', i ?? {}),
      yieldCurve: (i) => get('econ.yield-curve', '/api/econ/yield-curve', i ?? {}),
      commodity: (i) => get('econ.commodity', '/api/econ/commodity', i ?? {}),
      recession: (i) => get('econ.recession', '/api/econ/recession', i ?? {}),
    },
    edi: {
      parse: (i) => post('edi.parse', '/api/edi/parse', i),
      ack: (i) => post('edi.ack', '/api/edi/ack', i),
      generate: (i) => post('edi.generate', '/api/edi/generate', i),
    },
    factcheck: {
      search: (i) => get('factcheck.search', '/api/factcheck/search', i),
    },
    dev: {
      rfc: (i) => get('dev.rfc', '/api/dev/rfc', i),
    },
    aviation: {
      metar: (i) => get('aviation.metar', '/api/aviation/metar', i),
      taf: (i) => get('aviation.taf', '/api/aviation/taf', i),
      accidents: (i) => get('aviation.accidents', '/api/aviation/accidents', i),
    },
    water: {
      gauge: (i) => get('water.gauge', '/api/water/gauge', i),
    },
    convert: {
      unit: (i) => get('convert.unit', '/api/convert/unit', i),
    },
    trade: {
      tariff: (i) => get('trade.tariff', '/api/trade/tariff', i),
      locode: (i) => get('trade.locode', '/api/trade/locode', i),
      flows: (i) => get('trade.flows', '/api/trade/flows', i),
    },
    dns: {
      lookup: (i) => get('dns.lookup', '/api/dns/lookup', i),
    },
    domain: {
      whois: (i) => get('domain.whois', '/api/domain/whois', i),
    },
    earth: {
      now: (i) => get('earth.now', '/api/earth/now', i),
      events: (i) => get('earth.events', '/api/earth/events', i ?? {}),
    },
    finance: {
      secFilings: (i) => get('finance.sec-filings', '/api/finance/sec-filings', i),
      companyFacts: (i) => get('finance.company-facts', '/api/finance/company-facts', i),
      insiderTrades: (i) => get('finance.insider-trades', '/api/finance/insider-trades', i),
      thirteenF: (i) => get('finance.thirteen-f', '/api/finance/thirteen-f', i),
      companyProfile: (i) => get('finance.company-profile', '/api/finance/company-profile', i),
    },
    geo: {
      ip: (i) => get('geo.ip', '/api/geo/ip', i),
      elevation: (i) => get('geo.elevation', '/api/geo/elevation', i),
      nearby: (i) => get('geo.nearby', '/api/geo/nearby', i),
      postal: (i) => get('geo.postal', '/api/geo/postal', i),
      floodZone: (i) => get('geo.flood-zone', '/api/geo/flood-zone', i),
      locationDossier: (i) => get('geo.location-dossier', '/api/geo/location-dossier', i),
    },
    person: {
      crossRegistry: (i) => get('person.cross-registry', '/api/person/cross-registry', i),
    },
    geocode: {
      address: (i) => get('geocode.address', '/api/geocode/address', i),
      reverse: (i) => get('geocode.reverse', '/api/geocode/reverse', i),
    },
    hash: {
      compute: (i) => post('hash.compute', '/api/hash/compute', i),
    },
    image: {
      compress: (i) => post('image.compress', '/api/image/compress', i),
    },
    ipinfo: {
      bulk: (i) => post('ipinfo.bulk', '/api/ipinfo/bulk', i),
    },
    business: {
      sosSearch: (i) => get('business.sos-search', '/api/business/sos-search', i),
      entityScreen: (i) => get('business.entity-screen', '/api/business/entity-screen', i),
      naics: (i) => get('business.naics', '/api/business/naics', i),
      lei: (i) => get('business.lei', '/api/business/lei', i),
      entityMatch: (i) => get('business.entity-match', '/api/business/entity-match', i),
    },
    html: {
      toMarkdown: (i) => post('html.to-markdown', '/api/html/to-markdown', i),
    },
    tls: {
      certInfo: (i) => get('tls.cert-info', '/api/tls/cert-info', i),
    },
    law: {
      docketSearch: (i) => get('law.docket-search', '/api/law/docket-search', i),
      caseSearch: (i) => get('law.case-search', '/api/law/case-search', i),
      caseVerify: (i) => post('law.case-verify', '/api/law/case-verify', i),
      citationCheck: (i) => post('law.citation-check', '/api/law/citation-check', i),
      sanctionsCheck: (i) => post('law.sanctions-check', '/api/law/sanctions-check', i),
      federalRegister: (i) => get('law.federal-register', '/api/law/federal-register', i),
      cfrSection: (i) => get('law.cfr-section', '/api/law/cfr-section', i),
      opinion: (i) => post('law.opinion', '/api/law/opinion', i),
      attorneyLookup: (i) => get('law.attorney-lookup', '/api/law/attorney-lookup', i),
      judgeLookup: (i) => get('law.judge-lookup', '/api/law/judge-lookup', i),
      uscSection: (i) => get('law.usc-section', '/api/law/usc-section', i),
      trademarkStatus: (i) => get('law.trademark-status', '/api/law/trademark-status', i),
      trademarkSearch: (i) => get('law.trademark-search', '/api/law/trademark-search', i),
    },
    nutrition: {
      food: (i) => get('nutrition.food', '/api/nutrition/food', i),
    },
    tld: {
      info: (i) => get('tld.info', '/api/tld/info', i),
    },
    papers: {
      search: (i) => get('papers.search', '/api/papers/search', i),
    },
    patents: {
      search: (i) => get('patents.search', '/api/patents/search', i),
      detail: (i) => get('patents.detail', '/api/patents/detail', i),
      documents: (i) => get('patents.documents', '/api/patents/documents', i),
    },
    quakes: {
      recent: (i) => get('quakes.recent', '/api/quakes/recent', i),
    },
    sunrise: {
      compute: (i) => get('sunrise.compute', '/api/sunrise/compute', i),
    },
    tides: {
      now: (i) => get('tides.now', '/api/tides/now', i),
    },
    medical: {
      icd10: (i) => get('medical.icd10', '/api/medical/icd10', i),
      rxnorm: (i) => get('medical.rxnorm', '/api/medical/rxnorm', i),
      drugStatus: (i) => get('medical.drug-status', '/api/medical/drug-status', i),
    },
    net: {
      asn: (i) => get('net.asn', '/api/net/asn', i),
      macVendor: (i) => get('net.mac-vendor', '/api/net/mac-vendor', i),
    },
    research: {
      org: (i) => get('research.org', '/api/research/org', i),
      author: (i) => get('research.author', '/api/research/author', i),
      funding: (i) => get('research.funding', '/api/research/funding', i),
    },
    timezone: {
      lookup: (i) => get('timezone.lookup', '/api/timezone/lookup', i),
    },
    url: {
      unfurl: (i) => get('url.unfurl', '/api/url/unfurl', i),
      clean: (i) => get('url.clean', '/api/url/clean', i),
      render: (i) => get('url.render', '/api/url/render', i),
      map: (i) => get('url.map', '/api/url/map', i),
    },
    weather: {
      zip: (i) => get('weather.zip', '/api/weather/zip', i),
      alerts: (i) => get('weather.alerts', '/api/weather/alerts', i),
      forecast: (i) => get('weather.forecast', '/api/weather/forecast', i),
      airQuality: (i) => get('weather.air-quality', '/api/weather/air-quality', i),
      marine: (i) => get('weather.marine', '/api/weather/marine', i),
      history: (i) => get('weather.history', '/api/weather/history', i),
    },
    wikipedia: {
      summary: (i) => get('wikipedia.summary', '/api/wikipedia/summary', i),
    },
    poi: {
      near: (i) => get('poi.near', '/api/poi/near', i),
    },
    phone: {
      normalize: (i) => get('phone.normalize', '/api/phone/normalize', i),
    },
    space: {
      weather: (i) => get('space.weather', '/api/space/weather', i),
      body: (i) => get('space.body', '/api/space/body', i),
      closeApproaches: (i) => get('space.close-approaches', '/api/space/close-approaches', i ?? {}),
      satellite: (i) => get('space.satellite', '/api/space/satellite', i),
      satellites: (i) => get('space.satellites', '/api/space/satellites', i ?? {}),
      launches: (i) => get('space.launches', '/api/space/launches', i ?? {}),
      skyTonight: (i) => get('space.sky-tonight', '/api/space/sky-tonight', i),
      exoplanet: (i) => get('space.exoplanet', '/api/space/exoplanet', i ?? {}),
      skywatch: (i) => get('space.skywatch', '/api/space/skywatch', i),
      system: (i) => get('space.system', '/api/space/system', i),
      observe: (i) => get('space.observe', '/api/space/observe', i),
    },
    bio: {
      species: (i) => get('bio.species', '/api/bio/species', i),
      gene: (i) => get('bio.gene', '/api/bio/gene', i),
      protein: (i) => get('bio.protein', '/api/bio/protein', i),
    },
    vehicle: {
      vinDecode: (i) => get('vehicle.vin-decode', '/api/vehicle/vin-decode', i),
      profile: (i) => get('vehicle.profile', '/api/vehicle/profile', i),
      recalls: (i) => get('vehicle.recalls', '/api/vehicle/recalls', i),
      complaints: (i) => get('vehicle.complaints', '/api/vehicle/complaints', i),
      investigations: (i) => get('vehicle.investigations', '/api/vehicle/investigations', i),
      models: (i) => get('vehicle.models', '/api/vehicle/models', i),
      decodeWmi: (i) => get('vehicle.decode-wmi', '/api/vehicle/decode-wmi', i),
      manufacturers: (i) => get('vehicle.manufacturers', '/api/vehicle/manufacturers', i),
    },
    agent: {
      knowledgeDelta: (i) => post('agent.knowledge-delta', '/api/agent/knowledge-delta', i),
      memory: {
        put: (i) => post('agent.memory.put', '/api/agent/memory/put', i),
        get: (i) => get('agent.memory.get', '/api/agent/memory/get', i),
        list: (i) => get('agent.memory.list', '/api/agent/memory/list', i),
        delete: (i) => post('agent.memory.delete', '/api/agent/memory/delete', i),
      },
      marketplace: {
        register: (i) => post('agent.marketplace.register', '/api/agent/marketplace/register', i),
        discover: (i) => get('agent.marketplace.discover', '/api/agent/marketplace/discover', i),
        profile: (i) => get('agent.marketplace.profile', '/api/agent/marketplace/profile', i),
        review: (i) => post('agent.marketplace.review', '/api/agent/marketplace/review', i),
      },
    },
    chem: {
      compound: (i) => get('chem.compound', '/api/chem/compound', i),
    },
    bank: {
      lookup: (i) => get('bank.lookup', '/api/bank/lookup', i),
    },
    license: {
      medical: (i) => get('license.medical', '/api/license/medical', i),
      trades: (i) => get('license.trades', '/api/license/trades', i),
      realEstate: (i) => get('license.real-estate', '/api/license/real-estate', i),
      broker: (i) => get('license.broker', '/api/license/broker', i),
    },
    health: {
      diseaseSurveillance: (i) => get('health.disease-surveillance', '/api/health/disease-surveillance', i ?? {}),
      openPayments: (i) => get('health.open-payments', '/api/health/open-payments', i),
      hospitalLookup: (i) => get('health.hospital-lookup', '/api/health/hospital-lookup', i),
      hospitalQuality: (i) => get('health.hospital-quality', '/api/health/hospital-quality', i),
      medicareProvider: (i) => get('health.medicare-provider', '/api/health/medicare-provider', i),
      mortalityStats: (i) => get('health.mortality-stats', '/api/health/mortality-stats', i ?? {}),
      providerProfile: (i) => get('health.provider-profile', '/api/health/provider-profile', i),
    },
    worldbank: {
      indicator: (i) => get('worldbank.indicator', '/api/worldbank/indicator', i),
    },
    book: {
      search: (i) => get('book.search', '/api/book/search', i),
    },
    clinical: {
      trialSearch: (i) => get('clinical.trial-search', '/api/clinical/trial-search', i),
    },
    code: {
      repoLookup: (i) => get('code.repo-lookup', '/api/code/repo-lookup', i),
    },
    wikidata: {
      entity: (i) => get('wikidata.entity', '/api/wikidata/entity', i),
    },
    paper: {
      doiLookup: (i) => get('paper.doi-lookup', '/api/paper/doi-lookup', i),
    },
    registry: {
      npmLookup: (i) => get('registry.npm-lookup', '/api/registry/npm-lookup', i),
      pypiLookup: (i) => get('registry.pypi-lookup', '/api/registry/pypi-lookup', i),
    },
    fx: {
      rates: (i) => get('fx.rates', '/api/fx/rates', i),
      timeseries: (i) => get('fx.timeseries', '/api/fx/timeseries', i),
    },
    bls: {
      series: (i) => get('bls.series', '/api/bls/series', i),
    },
    country: {
      lookup: (i) => get('country.lookup', '/api/country/lookup', i),
    },
    news: {
      hnTop: (i) => get('news.hn-top', '/api/news/hn-top', i),
      hnItem: (i) => get('news.hn-item', '/api/news/hn-item', i),
      search: (i) => get('news.search', '/api/news/search', i),
    },
    search: {
      web: (i) => get('search.web', '/api/search/web', i),
    },
    security: {
      cve: (i) => get('security.cve', '/api/security/cve', i),
      package: (i) => get('security.package', '/api/security/package', i),
      cveSearch: (i) => get('security.cve-search', '/api/security/cve-search', i),
    },
    flight: {
      status: (i) => get('flight.status', '/api/flight/status', i),
    },
    stocks: {
      quote: (i) => get('stocks.quote', '/api/stocks/quote', i),
    },
    transcribe: {
      audio: (i) => post('transcribe.audio', '/api/transcribe/audio', i),
    },
    food: {
      barcodeLookup: (i) => get('food.barcode-lookup', '/api/food/barcode-lookup', i),
    },
    word: {
      define: (i) => get('word.define', '/api/word/define', i),
      related: (i) => get('word.related', '/api/word/related', i),
    },
    nonprofit: {
      search: (i) => get('nonprofit.search', '/api/nonprofit/search', i),
      screen: (i) => get('nonprofit.screen', '/api/nonprofit/screen', i),
    },
    gov: {
      contractOpportunities: (i) => get('gov.contract-opportunities', '/api/gov/contract-opportunities', i),
      entity: (i) => get('gov.entity', '/api/gov/entity', i),
      exclusions: (i) => get('gov.exclusions', '/api/gov/exclusions', i),
      counterparty: (i) => get('gov.counterparty', '/api/gov/counterparty', i),
      foreignAgents: (i) => get('gov.foreign-agents', '/api/gov/foreign-agents', i),
      riskIndex: (i) => get('gov.risk-index', '/api/gov/risk-index', i),
      fccId: (i) => get('gov.fcc-id', '/api/gov/fcc-id', i),
      nfipClaims: (i) => get('gov.nfip-claims', '/api/gov/nfip-claims', i),
      carrierSafety: (i) => get('gov.carrier-safety', '/api/gov/carrier-safety', i),
      congressFilings: (i) => get('gov.congress-filings', '/api/gov/congress-filings', i ?? {}),
      district: (i) => get('gov.district', '/api/gov/district', i),
      congressTrades: (i) => get('gov.congress-trades', '/api/gov/congress-trades', i ?? {}),
      congressBill: (i) => get('gov.congress-bill', '/api/gov/congress-bill', i ?? {}),
      congressMember: (i) => get('gov.congress-member', '/api/gov/congress-member', i ?? {}),
      fecCandidate: (i) => get('gov.fec-candidate', '/api/gov/fec-candidate', i ?? {}),
      fecCommittee: (i) => get('gov.fec-committee', '/api/gov/fec-committee', i ?? {}),
      fecContributions: (i) => get('gov.fec-contributions', '/api/gov/fec-contributions', i ?? {}),
      fecExpenditures: (i) => get('gov.fec-expenditures', '/api/gov/fec-expenditures', i ?? {}),
      fecTotals: (i) => get('gov.fec-totals', '/api/gov/fec-totals', i),
      congressCommittee: (i) => get('gov.congress-committee', '/api/gov/congress-committee', i ?? {}),
      congressAmendment: (i) => get('gov.congress-amendment', '/api/gov/congress-amendment', i ?? {}),
      congressNomination: (i) => get('gov.congress-nomination', '/api/gov/congress-nomination', i ?? {}),
      congressHearing: (i) => get('gov.congress-hearing', '/api/gov/congress-hearing', i ?? {}),
      congressTreaty: (i) => get('gov.congress-treaty', '/api/gov/congress-treaty', i ?? {}),
      congressRecord: (i) => get('gov.congress-record', '/api/gov/congress-record', i ?? {}),
      billSummaries: (i) => get('gov.bill-summaries', '/api/gov/bill-summaries', i ?? {}),
      oshaInspections: (i) => get('gov.osha-inspections', '/api/gov/osha-inspections', i ?? {}),
      oshaViolations: (i) => get('gov.osha-violations', '/api/gov/osha-violations', i ?? {}),
      oshaAccidents: (i) => get('gov.osha-accidents', '/api/gov/osha-accidents', i ?? {}),
      mshaAccidents: (i) => get('gov.msha-accidents', '/api/gov/msha-accidents', i ?? {}),
      fdaDrugEvents: (i) => get('gov.fda-drug-events', '/api/gov/fda-drug-events', i),
      fdaRecalls: (i) => get('gov.fda-recalls', '/api/gov/fda-recalls', i),
      productRecalls: (i) => get('gov.product-recalls', '/api/gov/product-recalls', i ?? {}),
      fdaFoodRecalls: (i) => get('gov.fda-food-recalls', '/api/gov/fda-food-recalls', i),
      fdaDeviceEvents: (i) => get('gov.fda-device-events', '/api/gov/fda-device-events', i),
      fdaAnimalvetEvents: (i) => get('gov.fda-animalvet-events', '/api/gov/fda-animalvet-events', i),
      houseVotes: (i) => get('gov.house-votes', '/api/gov/house-votes', i),
      inmateLocator: (i) => get('gov.inmate-locator', '/api/gov/inmate-locator', i),
      lobbyingFilings: (i) => get('gov.lobbying-filings', '/api/gov/lobbying-filings', i),
      senateVotes: (i) => get('gov.senate-votes', '/api/gov/senate-votes', i),
      usaspendingAwards: (i) => get('gov.usaspending-awards', '/api/gov/usaspending-awards', i),
      usgsWater: (i) => get('gov.usgs-water', '/api/gov/usgs-water', i),
      epaFacilities: (i) => get('gov.epa-facilities', '/api/gov/epa-facilities', i),
      federalRegisterRecent: (i) => get('gov.federal-register-recent', '/api/gov/federal-register-recent', i),
    },
    edu: {
      collegeScorecard: (i) => get('edu.college-scorecard', '/api/edu/college-scorecard', i ?? {}),
      schoolLookup: (i) => get('edu.school-lookup', '/api/edu/school-lookup', i),
    },
    energy: {
      fuelStations: (i) => get('energy.fuel-stations', '/api/energy/fuel-stations', i ?? {}),
      solarResource: (i) => get('energy.solar-resource', '/api/energy/solar-resource', i),
      prices: (i) => get('energy.prices', '/api/energy/prices', i ?? {}),
    },
    park: {
      lookup: (i) => get('park.lookup', '/api/park/lookup', i),
    },
    recreation: {
      search: (i) => get('recreation.search', '/api/recreation/search', i),
    },
    job: {
      federalSearch: (i) => get('job.federal-search', '/api/job/federal-search', i ?? {}),
      federalCodes: (i) => get('job.federal-codes', '/api/job/federal-codes', i),
    },
    property: {
      nycParcelLookup: (i) => get('property.nyc-parcel-lookup', '/api/property/nyc-parcel-lookup', i ?? {}),
      nycDeedHistory: (i) => get('property.nyc-deed-history', '/api/property/nyc-deed-history', i),
      nycPermits: (i) => get('property.nyc-permits', '/api/property/nyc-permits', i ?? {}),
      nycViolations: (i) => get('property.nyc-violations', '/api/property/nyc-violations', i ?? {}),
    },
    treasury: {
      debt: (i) => get('treasury.debt', '/api/treasury/debt', i ?? {}),
      cash: (i) => get('treasury.cash', '/api/treasury/cash', i ?? {}),
      exchangeRates: (i) => get('treasury.exchange-rates', '/api/treasury/exchange-rates', i ?? {}),
      monthlyStatement: (i) => get('treasury.monthly-statement', '/api/treasury/monthly-statement', i ?? {}),
    },
  }
}
