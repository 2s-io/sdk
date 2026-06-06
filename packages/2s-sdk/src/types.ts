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

export interface PatentDocument {
  applicationNumber: string
  documentId: string
  code: string | null
  description: string | null
  officialDate: string | null
  direction: string | null
  formats: Array<{ mimeType: string; pageCount: number | null }>
}

// ── Crypto ──────────────────────────────────────────────────────────────

export type CryptoChain = 'btc' | 'eth' | 'sol' | 'ltc' | 'trx' | 'xrp' | 'bch'


// ── AI ──────────────────────────────────────────────────────────────────

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












// ── Finance ─────────────────────────────────────────────────────────────

export interface FinanceSecFilingsResponse {
  query: { ticker: string; formType: string | null; limit: number }
  company: {
    cik: string
    ticker: string
    name: string
    sicDescription: string | null
    exchanges: string[]
    fiscalYearEnd: string | null
  }
  returned: number
  filings: Array<{
    accessionNumber: string
    form: string
    filingDate: string
    reportDate: string | null
    primaryDocument: string
    documentUrl: string
    isXBRL: boolean
    size: number
  }>
  source: { provider: string; url: string; license: string }
}

export interface FinanceCompanyFactsResponse {
  query: {
    ticker: string
    metrics: string | null
    annualLimit: number
    quarterlyLimit: number
  }
  cik: string
  ticker: string
  entityName: string
  returned: number
  metrics: Array<{
    key: string
    concept: string
    label: string
    namespace: string
    unit: string
    annual: Array<{
      end: string
      start: string | null
      val: number
      fiscalYear: number
      fiscalPeriod: string
      form: string
      filed: string
    }>
    quarterly: Array<{
      end: string
      start: string | null
      val: number
      fiscalYear: number
      fiscalPeriod: string
      form: string
      filed: string
    }>
  }>
  source: { provider: string; url: string; license: string }
}

export interface FinanceInsiderTradesResponse {
  query: { ticker: string; limit: number }
  cik: string
  ticker: string
  issuerName: string
  returned: number
  filings: Array<{
    accessionNumber: string
    filingDate: string
    periodOfReport: string | null
    formXmlUrl: string
    documentUrl: string
    reportingOwner: {
      cik: string | null
      name: string
      isDirector: boolean
      isOfficer: boolean
      officerTitle: string | null
      isTenPercentOwner: boolean
      isOther: boolean
    }
    transactions: Array<{
      securityTitle: string
      transactionDate: string | null
      code: string | null
      acquiredOrDisposed: 'A' | 'D' | null
      shares: number | null
      pricePerShare: number | null
      totalValueUsd: number | null
      sharesOwnedFollowing: number | null
      ownership: 'D' | 'I' | null
      isDerivative: boolean
    }>
  }>
  source: { provider: string; url: string; license: string }
}

export interface FinanceThirteenFResponse {
  query: { managerCik: string; formType: string; limit: number }
  cik: string
  managerName: string
  filing: {
    accessionNumber: string
    form: string
    filingDate: string
    periodOfReport: string | null
    infoTableUrl: string
    documentUrl: string
  }
  totalValueUsd: number
  totalPositions: number
  returned: number
  holdings: Array<{
    nameOfIssuer: string
    titleOfClass: string | null
    cusip: string
    valueUsd: number
    sharesOrPrinAmt: number | null
    sharesOrPrinAmtType: 'SH' | 'PRN' | null
    investmentDiscretion: string | null
    putCall: 'PUT' | 'CALL' | null
    votingAuthority: {
      sole: number | null
      shared: number | null
      none: number | null
    }
  }>
  source: { provider: string; url: string; license: string }
}

// ── Law (extended) ──────────────────────────────────────────────────────

export interface LawAttorneyLookupResponse {
  query: { name?: string; firmName?: string; limit: number }
  returned: number
  attorneys: Array<{
    id: number
    name: string
    firmName: string | null
    contactRaw: string | null
    dateCreated: string | null
    dateModified: string | null
    resourceUri: string
  }>
  source: { provider: string; url: string }
}

export interface LawJudgeLookupResponse {
  query: { name: string; limit: number }
  returned: number
  judges: Array<{
    id: number
    name: string
    dateOfBirth: string | null
    dateOfDeath: string | null
    fjcId: number | null
    resourceUri: string
  }>
  source: { provider: string; url: string }
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
