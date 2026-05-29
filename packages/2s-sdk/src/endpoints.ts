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
} from './types.js'

type R<T> = Promise<CallResult<T>>

export interface Endpoints {
  account: {
    balance(): R<AccountBalanceResponse>
  }
  ai: {
    summarize(input: { url: string; instruction?: string }): R<AiSummarizeResponse>
    translate(input: { text: string; target: string; source?: string }): R<AiTranslateResponse>
    extract<T = unknown>(input: {
      url: string
      schema: Record<string, unknown>
      instruction?: string
    }): R<AiExtractResponse<T>>
    describeImage(input: { url?: string; base64?: string }): R<AiDescribeImageResponse>
    screenshot(input: {
      url: string
      viewportWidth?: number
      viewportHeight?: number
      fullPage?: boolean
    }): R<AiScreenshotResponse>
  }
  airport: {
    lookup(input: { iata?: string; icao?: string; ident?: string }): R<AirportLookupResponse>
    near(input: { lat: number; lon: number; limit?: number }): R<AirportNearResponse>
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
      limit?: number
    }): R<ClimateStationNearResponse>
  }
  countdown: {
    /** Returns animated GIF bytes — `result.data` is a `Uint8Array`. */
    gif(input: { to: string; seconds?: number }): R<Uint8Array>
  }
  crypto: {
    addressValidate(input: {
      chain: CryptoChain
      address: string
    }): R<CryptoAddressValidateResponse>
    gasOracle(input?: { chain?: string }): R<CryptoGasOracleResponse>
  }
  dns: {
    lookup(input: {
      name: string
      type?: 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME' | 'SOA'
    }): R<DnsLookupResponse>
  }
  domain: {
    whois(input: { domain: string }): R<DomainWhoisResponse>
  }
  earth: {
    now(input: { lat: number; lon: number }): R<EarthNowResponse>
  }
  geo: {
    ip(input: { ip: string }): R<GeoIpResponse>
  }
  geocode: {
    address(input: { query: string; countryCode?: string }): R<GeocodeAddressResponse>
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
    /** Returns compressed image bytes — `result.data` is a `Uint8Array`. */
    compress(input: { url: string; quality?: number; format?: 'jpeg' | 'webp' | 'png' }): R<Uint8Array>
  }
  ipinfo: {
    bulk(input: { ips: string[] }): R<IpinfoBulkResponse>
  }
  law: {
    caseSearch(input: { q: string; limit?: number; offset?: number }): R<LawCaseSearchResponse>
    caseVerify(input: { citation: string }): R<LawCaseVerifyResponse>
    sanctionsCheck(input: { name: string; minScore?: number; limit?: number }): R<LawSanctionsCheckResponse>
    federalRegister(input: {
      q: string
      limit?: number
      dateFrom?: string
      dateTo?: string
    }): R<LawFederalRegisterResponse>
    opinion(input: { id: string | number }): R<LawOpinionResponse>
  }
  papers: {
    search(input: { q: string; limit?: number }): R<PapersSearchResponse>
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
    recent(input?: {
      minMagnitude?: number
      limit?: number
      sinceHours?: number
    }): R<QuakesRecentResponse>
  }
  sunrise: {
    compute(input: { lat: number; lon: number; date?: string }): R<SunriseComputeResponse>
  }
  tides: {
    now(input: { lat: number; lon: number }): R<TidesNowResponse>
  }
  url: {
    unfurl(input: { url: string }): R<UrlUnfurlResponse>
    clean(input: { url: string }): R<UrlCleanResponse>
  }
  weather: {
    zip(input: { zip: string }): R<WeatherZipResponse>
  }
  wikipedia: {
    summary(input: { title: string }): R<WikipediaSummaryResponse>
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
      caseVerify: (i) => get('law.case-verify', '/api/law/case-verify', i),
      sanctionsCheck: (i) => get('law.sanctions-check', '/api/law/sanctions-check', i),
      federalRegister: (i) => get('law.federal-register', '/api/law/federal-register', i),
      opinion: (i) => get('law.opinion', '/api/law/opinion', i),
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
  }
}
