/**
 * Response shapes for each 2s.io endpoint. Hand-curated rather than
 * auto-generated so the public types stay readable. Fields are aligned
 * with what `https://2s.io/api/openapi` advertises; mismatches mean the
 * SDK is stale — track those via the `examples/` smoke tests.
 */

// ── Patents ──────────────────────────────────────────────────────────────

export interface PatentHit {
  applicationNumber: string
  title: string | null
  applicationType: string | null
  firstInventor: string | null
  inventors: string[]
  applicants: string[]
  filingDate: string | null
  effectiveFilingDate: string | null
  status: { code: number | null; description: string | null; updatedAt: string | null }
  cpcSymbols: string[]
  uspcSymbol: string | null
  url: string
}

export interface PatentsSearchResponse {
  query: {
    q: string
    yearFrom: number | null
    yearTo: number | null
    applicationType: string | null
    offset: number
    limit: number
  }
  total: number
  returned: number
  hits: PatentHit[]
  source: { provider: string; license: string }
}

export interface PatentEvent {
  code: string | null
  description: string | null
  date: string | null
}
export interface PatentContinuity {
  parentApplicationNumber: string | null
  parentFilingDate: string | null
  parentStatusDescription: string | null
  relationship: string | null
}
export interface PatentAssignment {
  reelFrame: string | null
  conveyanceText: string | null
  recordedAt: string | null
  assignors: string[]
  assignees: string[]
}
export interface PatentForeignPriority {
  country: string | null
  applicationNumber: string | null
  filingDate: string | null
}
export interface PatentsDetailResponse extends PatentHit {
  examiner: string | null
  artUnit: string | null
  confirmationNumber: string | null
  docketNumber: string | null
  events: PatentEvent[]
  parents: PatentContinuity[]
  assignments: PatentAssignment[]
  foreignPriority: PatentForeignPriority[]
  source: { provider: string; license: string }
}

export interface PatentDocument {
  applicationNumber: string
  documentId: string
  code: string | null
  description: string | null
  officialDate: string | null
  direction: string | null
  formats: Array<{ mimeType: string; pageCount: number | null }>
}
export interface PatentsDocumentsResponse {
  applicationNumber: string
  total: number
  patentCenterUrl: string
  documents: PatentDocument[]
  source: { provider: string; license: string }
}

// ── Crypto ──────────────────────────────────────────────────────────────

export type CryptoChain = 'btc' | 'eth' | 'sol' | 'ltc' | 'trx' | 'xrp' | 'bch'
export interface CryptoAddressValidateResponse {
  chain: CryptoChain
  address: string
  valid: boolean
  canonical: string | null
  format: string | null
  reason: string | null
}

export interface CryptoGasOracleResponse {
  chain: string
  baseFeePerGasGwei: number
  tiers: {
    slow: { priorityFeeGwei: number; totalGwei: number; transferCostUsd: number | null }
    standard: { priorityFeeGwei: number; totalGwei: number; transferCostUsd: number | null }
    fast: { priorityFeeGwei: number; totalGwei: number; transferCostUsd: number | null }
  }
  blockNumber: number
  fetchedAt: string
}

// ── AI ──────────────────────────────────────────────────────────────────

export interface AiSummarizeResponse {
  url: string
  finalUrl: string
  summary: string
  keyPoints: string[]
  title: string | null
  audience: string | null
  estimatedReadingMinutes: number | null
  meta: { truncated: boolean }
}
export interface AiTranslateResponse {
  source: string
  target: string
  translated: string
  detectedSourceLanguage: string | null
}
export interface AiExtractResponse<T = unknown> {
  url: string
  finalUrl: string
  data: T
  meta: { truncated: boolean }
}
export interface AiDescribeImageResponse {
  description: string
  tags: string[]
  textDetected: string | null
  meta: { width: number; height: number; bytes: number }
}
export interface AiScreenshotResponse {
  url: string
  finalUrl: string
  image: { mimeType: string; width: number; height: number; bytes: number; base64: string }
  capturedAt: string
}

// ── Law ─────────────────────────────────────────────────────────────────

export interface LawCase {
  id: string | number
  caseName: string | null
  court: string | null
  dateFiled: string | null
  citation: string | null
  url: string
}
export interface LawCaseSearchResponse {
  query: string
  total: number
  results: LawCase[]
  source: { provider: string; license: string }
}
export interface LawCaseVerifyResponse {
  citation: string
  found: boolean
  case: LawCase | null
  similar: LawCase[]
  source: { provider: string; license: string }
}
export interface LawSanctionsCheckResponse {
  query: string
  matches: Array<{
    sourceList: string
    name: string
    altNames: string[]
    entityType: string | null
    programs: string[]
    score: number
  }>
  source: { provider: string; license: string }
}
export interface LawFederalRegisterResponse {
  query: string
  total: number
  results: Array<{
    documentNumber: string
    title: string
    abstract: string | null
    publicationDate: string
    htmlUrl: string
    agencyNames: string[]
  }>
}
export interface LawOpinionResponse {
  id: string | number
  caseName: string
  court: string
  dateFiled: string
  fullText: string
  citation: string | null
  url: string
}

// ── Airports / geo / weather / etc. ─────────────────────────────────────

export interface Airport {
  id: number
  ident: string
  type: string | null
  name: string | null
  latitude: number
  longitude: number
  elevationFt: number | null
  isoCountry: string | null
  municipality: string | null
  icaoCode: string | null
  iataCode: string | null
}
export interface AirportLookupResponse {
  airport: Airport
  source: { provider: string; license: string }
}
export interface AirportNearResponse {
  total: number
  airports: Array<Airport & { distanceKm: number }>
  source: { provider: string; license: string }
}

export interface WeatherZipResponse {
  location: { zip: string; city: string; state: string; lat: number; lon: number }
  current: {
    temperatureF: number
    conditions: string
    humidityPct: number | null
    windMph: number | null
    windDirection: string | null
    precipitationChancePct: number | null
  }
  observedAt: string
  source: { provider: string; license: string }
}

export interface GeocodeAddressResponse {
  query: string
  results: Array<{
    label: string
    lat: number
    lon: number
    countryCode: string | null
    confidence: number | null
  }>
  source: { provider: string; license: string }
}
export interface GeocodeReverseResponse {
  lat: number
  lon: number
  result: {
    label: string
    countryCode: string | null
    locality: string | null
    region: string | null
    postcode: string | null
  } | null
  source: { provider: string; license: string }
}

export interface DnsLookupResponse {
  name: string
  type: string
  ttlSec: number | null
  durationMs: number
  records: Array<{ data: string; type: string }>
  source: { provider: string }
}

export interface DomainWhoisResponse {
  domain: string
  registrar: string | null
  createdAt: string | null
  expiresAt: string | null
  nameservers: string[]
  status: string[]
  source: { provider: string }
}

export interface UrlUnfurlResponse {
  url: string
  finalUrl: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  meta: Record<string, string>
}
export interface UrlCleanResponse {
  url: string
  finalUrl: string
  title: string | null
  markdown: string
  meta: { wordCount: number; truncated: boolean }
}

export interface WikipediaSummaryResponse {
  title: string
  extract: string
  thumbnail: string | null
  pageUrl: string
}

export interface PapersSearchResponse {
  query: string
  total: number
  results: Array<{
    source: 'arxiv' | 'pubmed' | 'semanticscholar'
    id: string
    title: string
    authors: string[]
    abstract: string | null
    publishedAt: string | null
    doi: string | null
    url: string
  }>
}

export interface CensusZipcodeResponse {
  zip: string
  acsYear: number
  population: number | null
  medianHouseholdIncome: number | null
  medianAge: number | null
  households: { total: number | null; singlePerson: number | null }
  housing: {
    units: number | null
    ownerOccupied: number | null
    renterOccupied: number | null
    medianHomeValue: number | null
    medianGrossRent: number | null
  }
  education: {
    highSchool: number | null
    bachelors: number | null
    graduate: number | null
  }
  source: { provider: string; license: string }
}

export interface ClimateStationNearResponse {
  total: number
  stations: Array<{
    id: string
    name: string
    latitude: number
    longitude: number
    elevationM: number | null
    state: string | null
    distanceKm: number
  }>
}

export interface TidesNowResponse {
  station: { id: string; name: string; lat: number; lon: number; distanceKm: number }
  observations: Array<{ time: string; type: 'H' | 'L'; heightFeet: number }>
  source: { provider: string; license: string }
}

export interface SunriseComputeResponse {
  date: string
  lat: number
  lon: number
  sunrise: string
  sunset: string
  solarNoon: string
  dayLengthMinutes: number
  twilights: {
    civilDawn: string
    civilDusk: string
    nauticalDawn: string
    nauticalDusk: string
    astronomicalDawn: string
    astronomicalDusk: string
  }
}

export interface EarthNowResponse {
  lat: number
  lon: number
  current: {
    timezone: string | null
    localTime: string | null
    sunrise: string | null
    sunset: string | null
    nearbyQuakes: Array<{ magnitude: number; place: string; distanceKm: number; time: string }>
    weather: { temperatureF: number | null; conditions: string | null } | null
  }
}

export interface QuakesRecentResponse {
  total: number
  quakes: Array<{
    id: string
    magnitude: number
    place: string
    time: string
    coordinates: [number, number, number]
    url: string
  }>
  source: { provider: string }
}

export interface GeoIpResponse {
  ip: string
  country: { code: string | null; name: string | null } | null
  region: { code: string | null; name: string | null } | null
  city: string | null
  lat: number | null
  lon: number | null
  timezone: string | null
  asn: { number: number | null; name: string | null } | null
}

export interface IpinfoBulkResponse {
  total: number
  results: GeoIpResponse[]
}

export interface HashComputeResponse {
  input: { encoding: string; bytes: number }
  outputEncoding: string
  digests: Record<string, string>
}

// ── Account ─────────────────────────────────────────────────────────────

export interface AccountBalanceResponse {
  accountId: string
  balanceUsd: number
  depositAddress: string | null
  createdAt: string
}
export interface AccountCreateResponse {
  apiKey: string
  accountId: string
  depositAddress: string
}
