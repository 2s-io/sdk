/**
 * Endpoint bindings. Each method wraps `TwoS.request` with the right
 * path/method/typing for one route on https://2s.io.
 */

import type { TwoS, CallResult } from './index.js'
import type {
  PatentsSearchResponse,
  PatentsDetailResponse,
  PatentsDocumentsResponse,
  CryptoAddressValidateResponse,
  CryptoChain,
  CryptoGasOracleResponse,
  AiSummarizeResponse,
  AiTranslateResponse,
  AiExtractResponse,
  AiDescribeImageResponse,
  AiScreenshotResponse,
  LawCaseSearchResponse,
  LawCaseVerifyResponse,
  LawSanctionsCheckResponse,
  LawFederalRegisterResponse,
  LawOpinionResponse,
  AirportLookupResponse,
  AirportNearResponse,
  WeatherZipResponse,
  GeocodeAddressResponse,
  GeocodeReverseResponse,
  DnsLookupResponse,
  DomainWhoisResponse,
  UrlUnfurlResponse,
  UrlCleanResponse,
  WikipediaSummaryResponse,
  PapersSearchResponse,
  CensusZipcodeResponse,
  ClimateStationNearResponse,
  TidesNowResponse,
  SunriseComputeResponse,
  EarthNowResponse,
  QuakesRecentResponse,
  GeoIpResponse,
  IpinfoBulkResponse,
  HashComputeResponse,
  AccountBalanceResponse,
  FinanceSecFilingsResponse,
  FinanceCompanyFactsResponse,
  FinanceInsiderTradesResponse,
  FinanceThirteenFResponse,
  LawAttorneyLookupResponse,
  LawJudgeLookupResponse,
} from './types.js'

type R<T> = Promise<CallResult<T>>

export interface Endpoints {
  account: {
    balance(): R<AccountBalanceResponse>
  }
  ai: {
    summarize(input: { url: string; instruction?: string }): R<AiSummarizeResponse>
    /** POST — server param names: text, targetLanguage, sourceLanguage. */
    translate(input: {
      text: string
      targetLanguage: string
      sourceLanguage?: string
    }): R<AiTranslateResponse>
    extract<T = unknown>(input: {
      url: string
      schema: Record<string, unknown>
      instruction?: string
    }): R<AiExtractResponse<T>>
    /** POST — server param name: imageUrl (HTTPS URL of a JPEG/PNG/GIF/WebP image ≤1MB). */
    describeImage(input: {
      imageUrl: string
      instruction?: string
    }): R<AiDescribeImageResponse>
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
  airport: {
    /** Look up by IATA (3-letter) or ICAO (4-letter) code. */
    lookup(input: { code: string }): R<AirportLookupResponse>
    near(input: {
      lat: number
      lon: number
      radius_km?: number
      limit?: number
      type?: 'large_airport' | 'medium_airport' | 'small_airport' | 'heliport' | 'seaplane_base' | 'balloonport' | 'closed'
      country?: string
      scheduled_service?: boolean
    }): R<AirportNearResponse>
  }
  barcode: {
    /** Returns raw image bytes — `result.data` is a `Uint8Array`. */
    generate(input: {
      data: { type: 'text' | 'url'; text?: string; url?: string }
      format?: 'qr' | 'code128' | 'ean13'
    }): R<Uint8Array>
  }
  census: {
    zipcode(input: { zip: string }): R<CensusZipcodeResponse>
  }
  climate: {
    stationNear(input: {
      lat: number
      lon: number
      radius_km?: number
      limit?: number
    }): R<ClimateStationNearResponse>
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
    addressValidate(input: {
      chain: CryptoChain
      address: string
    }): R<CryptoAddressValidateResponse>
    gasOracle(input?: { chain?: string }): R<CryptoGasOracleResponse>
  }
  dns: {
    /** Server params: host (FQDN), types (CSV like "A,MX,TXT"), resolver. */
    lookup(input: {
      host: string
      types?: string
      resolver?: 'cloudflare' | 'google' | 'quad9' | 'opendns'
    }): R<DnsLookupResponse>
  }
  domain: {
    whois(input: { domain: string }): R<DomainWhoisResponse>
  }
  earth: {
    now(input: {
      lat: number
      lon: number
      radius_km?: number
      hours?: number
      min_magnitude?: number
    }): R<EarthNowResponse>
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
    }): R<FinanceSecFilingsResponse>
    /** Curated XBRL financial metrics (revenue, net income, EPS, etc.) by ticker. */
    companyFacts(input: {
      ticker: string
      metrics?: string
      annualLimit?: number
      quarterlyLimit?: number
    }): R<FinanceCompanyFactsResponse>
    /** Recent SEC Form 4 insider transactions by ticker. */
    insiderTrades(input: {
      ticker: string
      limit?: number
    }): R<FinanceInsiderTradesResponse>
    /** Parsed institutional holdings (13F-HR) for an investment manager by CIK. */
    thirteenF(input: {
      managerCik: string
      formType?: string
      limit?: number
    }): R<FinanceThirteenFResponse>
  }
  geo: {
    ip(input: { ip: string }): R<GeoIpResponse>
  }
  geocode: {
    /** Server params: q (query string), limit (1-10), country (ISO-3166 alpha-2). */
    address(input: { q: string; limit?: number; country?: string }): R<GeocodeAddressResponse>
    reverse(input: { lat: number; lon: number }): R<GeocodeReverseResponse>
  }
  hash: {
    compute(input: {
      input: string
      inputEncoding?: 'utf8' | 'hex' | 'base64'
      algorithms?: string[]
      algorithm?: string
      outputEncoding?: 'hex' | 'base64'
    }): R<HashComputeResponse>
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
    bulk(input: { ips: string[] }): R<IpinfoBulkResponse>
  }
  law: {
    caseSearch(input: {
      q: string
      court?: string
      filedAfter?: string
      filedBefore?: string
      order?: 'relevance' | 'dateFiled-desc' | 'dateFiled-asc' | 'citeCount-desc'
      limit?: number
    }): R<LawCaseSearchResponse>
    /** POST { text } — finds + verifies citations inside a passage. */
    caseVerify(input: { text: string }): R<LawCaseVerifyResponse>
    /** POST { query, threshold?, limit?, sourceList? } — OFAC SDN fuzzy match. */
    sanctionsCheck(input: {
      query: string
      threshold?: number
      limit?: number
      sourceList?: string
    }): R<LawSanctionsCheckResponse>
    /** Server params: q, type (RULE|PRORULE|NOTICE|PRESDOCU), agency (slug), since/until (yyyy-mm-dd), limit. */
    federalRegister(input: {
      q: string
      type?: 'RULE' | 'PRORULE' | 'NOTICE' | 'PRESDOCU'
      agency?: string
      since?: string
      until?: string
      limit?: number
    }): R<LawFederalRegisterResponse>
    /** POST — supply exactly one of `opinionId` or `citation`. */
    opinion(input: { opinionId: number } | { citation: string }): R<LawOpinionResponse>
    /** CourtListener attorney search by name and/or firm. */
    attorneyLookup(input: {
      name?: string
      firmName?: string
      limit?: number
    }): R<LawAttorneyLookupResponse>
    /** CourtListener federal judge lookup by name. */
    judgeLookup(input: {
      name: string
      limit?: number
    }): R<LawJudgeLookupResponse>
  }
  papers: {
    search(input: {
      q: string
      limit?: number
      since?: string
      sources?: string
    }): R<PapersSearchResponse>
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
  }
  food: {
    /** Food product lookup by UPC/EAN barcode (Open Food Facts, CC0). */
    barcodeLookup(input: { barcode: string }): R<unknown>
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
    }): R<PatentsSearchResponse>
    detail(input: { applicationNumber: string }): R<PatentsDetailResponse>
    documents(input: { applicationNumber: string }): R<PatentsDocumentsResponse>
  }
  quakes: {
    /** Server requires lat + lon. Optional: radius_km, hours, min_magnitude. */
    recent(input: {
      lat: number
      lon: number
      radius_km?: number
      hours?: number
      min_magnitude?: number
    }): R<QuakesRecentResponse>
  }
  sunrise: {
    /** Server requires lat + lon + date (yyyy-mm-dd). */
    compute(input: { lat: number; lon: number; date: string }): R<SunriseComputeResponse>
  }
  tides: {
    now(input: { lat: number; lon: number; radius_km?: number; hours?: number }): R<TidesNowResponse>
  }
  url: {
    unfurl(input: { url: string }): R<UrlUnfurlResponse>
    clean(input: { url: string; format?: 'markdown' | 'text' | 'both' }): R<UrlCleanResponse>
  }
  weather: {
    zip(input: { zip: string }): R<WeatherZipResponse>
  }
  wikipedia: {
    summary(input: { title: string; lang?: string }): R<WikipediaSummaryResponse>
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
  }
  vehicle: {
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
  }
  health: {
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
  }
  gov: {
    /** OpenFDA drug adverse event reports (FAERS). */
    fdaDrugEvents(input: { drug: string; reaction?: string; limit?: number }): R<unknown>
    /** OpenFDA drug recall enforcement reports. */
    fdaRecalls(input: {
      drug?: string
      classification?: 'I' | 'II' | 'III'
      status?: 'Ongoing' | 'Completed' | 'Terminated' | 'Pending'
      limit?: number
    }): R<unknown>
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
    airport: {
      lookup: (i) => get('airport.lookup', '/api/airport/lookup', i),
      near: (i) => get('airport.near', '/api/airport/near', i),
    },
    barcode: {
      generate: (i) => post('barcode.generate', '/api/barcode/generate', i),
    },
    census: {
      zipcode: (i) => get('census.zipcode', '/api/census/zipcode', i),
    },
    climate: {
      stationNear: (i) => get('climate.station-near', '/api/climate/station-near', i),
    },
    countdown: {
      gif: (i) => get('countdown.gif', '/api/countdown/gif', i),
    },
    crypto: {
      addressValidate: (i) => get('crypto.address-validate', '/api/crypto/address-validate', i),
      gasOracle: (i) => get('crypto.gas-oracle', '/api/crypto/gas-oracle', i),
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
    },
    geo: {
      ip: (i) => get('geo.ip', '/api/geo/ip', i),
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
    law: {
      caseSearch: (i) => get('law.case-search', '/api/law/case-search', i),
      caseVerify: (i) => post('law.case-verify', '/api/law/case-verify', i),
      sanctionsCheck: (i) => post('law.sanctions-check', '/api/law/sanctions-check', i),
      federalRegister: (i) => get('law.federal-register', '/api/law/federal-register', i),
      opinion: (i) => post('law.opinion', '/api/law/opinion', i),
      attorneyLookup: (i) => get('law.attorney-lookup', '/api/law/attorney-lookup', i),
      judgeLookup: (i) => get('law.judge-lookup', '/api/law/judge-lookup', i),
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
    url: {
      unfurl: (i) => get('url.unfurl', '/api/url/unfurl', i),
      clean: (i) => get('url.clean', '/api/url/clean', i),
    },
    weather: {
      zip: (i) => get('weather.zip', '/api/weather/zip', i),
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
    },
    vehicle: {
      vinDecode: (i) => get('vehicle.vin-decode', '/api/vehicle/vin-decode', i),
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
      broker: (i) => get('license.broker', '/api/license/broker', i),
    },
    health: {
      openPayments: (i) => get('health.open-payments', '/api/health/open-payments', i),
      hospitalLookup: (i) => get('health.hospital-lookup', '/api/health/hospital-lookup', i),
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
    },
    gov: {
      fdaDrugEvents: (i) => get('gov.fda-drug-events', '/api/gov/fda-drug-events', i),
      fdaRecalls: (i) => get('gov.fda-recalls', '/api/gov/fda-recalls', i),
      fdaFoodRecalls: (i) => get('gov.fda-food-recalls', '/api/gov/fda-food-recalls', i),
      fdaDeviceEvents: (i) => get('gov.fda-device-events', '/api/gov/fda-device-events', i),
      fdaAnimalvetEvents: (i) => get('gov.fda-animalvet-events', '/api/gov/fda-animalvet-events', i),
      houseVotes: (i) => get('gov.house-votes', '/api/gov/house-votes', i),
      senateVotes: (i) => get('gov.senate-votes', '/api/gov/senate-votes', i),
      usaspendingAwards: (i) => get('gov.usaspending-awards', '/api/gov/usaspending-awards', i),
      usgsWater: (i) => get('gov.usgs-water', '/api/gov/usgs-water', i),
      epaFacilities: (i) => get('gov.epa-facilities', '/api/gov/epa-facilities', i),
      federalRegisterRecent: (i) => get('gov.federal-register-recent', '/api/gov/federal-register-recent', i),
    },
  }
}
