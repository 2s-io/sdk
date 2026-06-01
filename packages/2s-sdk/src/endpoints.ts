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
  }
}
