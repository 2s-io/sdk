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
  tcg: {
    games(input?: Record<string, never>): R<Normalized>
    sets(input: { game: string; q?: string; limit?: number }): R<Normalized>
    setPrices(input: { game: string; set: string; limit?: number }): R<Normalized>
    card(input: { game: string; set: string; productId: string }): R<Normalized>
  }
  class: {
    industryResolve(input: { system: string; code: string }): R<Normalized>
  }
  schedule: {
    cancel(input: { scheduleId: string }): R<Normalized>
    create(input: { callbackUrl: string; at?: string; everySeconds?: number; payload?: unknown; maxFires?: number; expiresInSeconds?: number; label?: string }): R<Normalized>
    status(input: { scheduleId: string }): R<Normalized>
  }
  queue: {
    ack(input: { queue: string; id: string; leaseToken: string }): R<Normalized>
    enqueue(input: { queue: string; body?: string; maxAttempts?: number }): R<Normalized>
    lease(input: { queue: string; count?: number; visibilitySeconds?: number }): R<Normalized>
    stats(input: { queue: string }): R<Normalized>
  }
  pubsub: {
    createTopic(input: { name: string }): R<Normalized>
    publish(input: { topicId: string; message?: string }): R<Normalized>
    subscribe(input: { topicId: string; callbackUrl: string; label?: string }): R<Normalized>
    unsubscribe(input: { subscriptionId: string }): R<Normalized>
  }
  lock: {
    acquire(input: { key: string; ttlSeconds: number }): R<Normalized>
    release(input: { key: string; token: string }): R<Normalized>
    renew(input: { key: string; token: string; ttlSeconds: number }): R<Normalized>
  }
  store: {
    blobDelete(input: { ns: string; key: string }): R<Normalized>
    blobGet(input: { ns: string; key: string }): R<Normalized>
    blobList(input: { ns: string; prefix?: string; limit?: number; after?: string }): R<Normalized>
    blobPut(input: { ns: string; key: string; data: string; contentType?: string }): R<Normalized>
    docDelete(input: { ns: string; id: string }): R<Normalized>
    docGet(input: { ns: string; id: string }): R<Normalized>
    docPut(input: { ns: string; id: string; body: string; meta?: string }): R<Normalized>
    docSearch(input: { ns: string; query: string; limit?: number }): R<Normalized>
    kvDelete(input: { ns: string; key: string }): R<Normalized>
    kvGet(input: { ns: string; key: string }): R<Normalized>
    kvPut(input: { ns: string; key: string; value?: string }): R<Normalized>
    kvScan(input: { ns: string; prefix?: string; limit?: number; after?: string; values?: boolean }): R<Normalized>
    usage(): R<Normalized>
    vectorDelete(input: { ns: string; id: string }): R<Normalized>
    vectorQuery(input: { ns: string; embedding: unknown; topK?: number }): R<Normalized>
    vectorUpsert(input: { ns: string; id: string; embedding: unknown; body?: string; meta?: string }): R<Normalized>
  }
  markets: {
    status(input?: { exchange?: string }): R<Normalized>
    holiday(input?: { exchange?: string }): R<Normalized>
  }
  watchers: {
    packageRelease(input: { registry: string; name: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    iocReputation(input: { ioc: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    httpHeaders(input: { url: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    dns(input: { host: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    whois(input: { domain: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    fearGreed(input: { conditionType: string; threshold: number; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    fredSeries(input: { seriesId: string; conditionType: string; threshold: number; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    patent(input: { query: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    paper(input: { query: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    productRecall(input: { keyword?: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    fxRate(input: { base: string; quote: string; conditionType: string; threshold: number; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    fundingRate(input: { coin: string; conditionType: string; threshold: number; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    predictionMarket(input: { conditionId: string; outcomeIndex?: number; conditionType: string; threshold: number; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    secFiling(input: { ticker: string; form?: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    companyNews(input: { ticker: string; keyword?: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    ipo(input: { keyword?: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    federalRegister(input: { type?: string; agency?: string; keyword?: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    weatherAlert(input: { area: string; severity?: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    earthquake(input: { lat: number; lon: number; radiusKm?: number; minMagnitude?: number; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    flightStatus(input: { ident: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    tokenPrice(input: { tokenId: string; conditionType: string; threshold: number; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    gasPrice(input: { chain: string; conditionType: string; threshold: number; tier?: string; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    businessEarnings(input: { ticker: string; trigger?: string; daysBefore?: number; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    stockPrice(input: { ticker: string; conditionType: string; threshold: number; callbackUrl: string; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    cancel(input: { watcherId: string }): R<Normalized>
    cryptoAddressActivity(input: { chain: string; address: string; callbackUrl: string; direction?: string; assetTypes?: unknown; minValueUsd?: number; payload?: unknown; expiresInSeconds?: number; maxFires?: number; label?: string }): R<Normalized>
    status(input: { watcherId: string }): R<Normalized>
  }
  /** Time & date utilities. */
  time: {
    parse(input: { input: string; tz?: string }): R<Normalized>
  }
  account: {
    balance(): R<AccountBalanceResponse>
  }
  /** USDA agricultural statistics, drought, and trade. */
  agriculture: {
    /** US Drought Monitor severity for a county (5-digit FIPS) or state (2-letter), weekly. */
    drought(input: { area: string; weeks?: number }): R<Normalized>
    /** USDA NASS QuickStats — crop/livestock yields, acreage, production, prices. Requires commodity_desc + a bound. */
    stats(input: {
      commodity_desc: string
      year?: string
      year__GE?: string
      year__LE?: string
      state_alpha?: string
      county_name?: string
      statisticcat_desc?: string
      agg_level_desc?: string
      short_desc?: string
      freq_desc?: string
    }): R<Normalized>
  }
  /** USDA-NRCS soil + USDA plant hardiness. */
  soil: {
    /** SSURGO soil profile (map unit + ranked components) for a lat/lng. */
    profile(input: { lat: number; lon: number }): R<Normalized>
    /** USDA plant hardiness zone for a US ZIP code. */
    hardinessZone(input: { zip: string }): R<Normalized>
  }
  /** FCC public data — docket filings + spectrum market areas. */
  telecom: {
    /** Search FCC ECFS filings for a proceeding/docket. */
    fccFilings(input: { proceeding: string; filer?: string; limit?: number }): R<Normalized>
    /** Map a lat/lon to its FCC spectrum market areas (CMA/BTA/MTA/PEA…) + census block. */
    marketArea(input: { lat: number; lon: number }): R<Normalized>
  }
  /** O*NET occupations (US DOL) — profile, search, related. */
  occupation: {
    /** Full occupation dossier (skills/knowledge/abilities/tasks/tech) by SOC/O*NET-SOC code. */
    profile(input: { code: string }): R<Normalized>
    /** Find occupations by keyword (job title, skill, activity). */
    search(input: { keyword: string; limit?: number }): R<Normalized>
    /** Related/career-adjacent occupations for a code. */
    related(input: { code: string; limit?: number }): R<Normalized>
  }
  /** US Bureau of Labor Statistics — wages, openings, unemployment. */
  labor: {
    /** OEWS occupational wages by SOC code, nationally or by state. */
    wages(input: { soc: string; state?: string }): R<Normalized>
    /** JOLTS labor-market turnover (openings/hires/quits/layoffs/separations), national monthly. */
    openings(input?: { measure?: 'openings' | 'hires' | 'quits' | 'layoffs' | 'separations'; months?: number }): R<Normalized>
    /** Unemployment (rate/counts) for "US" or a 2-letter state, monthly. */
    unemployment(input: { area: string; measure?: 'rate' | 'unemployed' | 'employed' | 'laborforce'; months?: number }): R<Normalized>
  }
  /** USCG PSIX vessel registry + port-state-control. */
  maritime: {
    /** Search the USCG PSIX vessel registry by name/callsign/official number/HIN/flag/etc. */
    vessel(input: { name?: string; callSign?: string; officialNumber?: string; hullNumber?: string; flag?: string; service?: string; buildYear?: string; vesselId?: string }): R<Normalized>
    /** USCG activity / port-state-control case history for a vessel id. */
    cases(input: { vesselId: string }): R<Normalized>
    /** NGA World Port Index lookup by port name and/or country: location, harbor type, depths, max vessel size, UN/LOCODE. */
    port(input: { portName?: string; country?: string; limit?: number }): R<Normalized>
  }
  /** MusicBrainz music metadata (CC0). */
  music: {
    /** Resolve a recording/song by artist+title or free-text query. */
    recording(input: { artist?: string; title?: string; query?: string; limit?: number }): R<Normalized>
    /** Resolve an artist by name or query. */
    artist(input: { name?: string; query?: string; limit?: number }): R<Normalized>
    /** Resolve a release/album by barcode, artist+album, or query. */
    release(input: { barcode?: string; artist?: string; album?: string; query?: string; limit?: number }): R<Normalized>
  }
  /** Run many endpoint calls behind one x402 payment. */
  batch: {
    /**
     * Execute up to 50 catalog calls in one request, settled once. Price = sum
     * of sub-call prices (no discount). Atomic: every sub-call must succeed or
     * nothing is charged. Excludes bearer-only, deprecated, variable-priced,
     * and metered-upstream endpoints.
     */
    run(input: { calls: Array<{ endpoint: string; params?: Record<string, unknown> }> }): R<Normalized>
  }
  ai: {
    council(input: { prompt: string; mode?: string; models?: unknown; maxTokens?: number }): R<Normalized>
    ocr(input: { imageUrl: string; instruction?: string }): R<Normalized>
    research(input: { query: string; urls?: unknown }): R<Normalized>
    webAnswer(input: { query: string; topic?: string; maxResults?: number }): R<Normalized>
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
    /** Zero-shot text classification — assign text to your labels (or several when multiLabel) with confidence + rationale. POST { text, labels[], multiLabel? }. */
    classify(input: { text: string; labels: string[]; multiLabel?: boolean }): R<Normalized>
    /** Named-entity recognition — extract people/orgs/locations/dates/money/etc with type + mention count. POST { text }. */
    entities(input: { text: string }): R<Normalized>
    /** Content moderation — per-category boolean + 0..1 severity score + overall flagged verdict. POST { text }. */
    moderate(input: { text: string }): R<Normalized>
    /** PII detection — finds names/emails/phones/SSNs/cards/etc with type + exact substring for redaction. POST { text }. */
    pii(input: { text: string }): R<Normalized>
    /** Sentiment analysis — polarity (positive/negative/neutral/mixed), -1..1 score, confidence + rationale. POST { text }. */
    sentiment(input: { text: string }): R<Normalized>
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
    earnings(input?: { from?: string; to?: string; ticker?: string }): R<Normalized>
    ipo(input?: { from?: string; to?: string }): R<Normalized>
    /** List official holidays for a country/region + year, exact observed dates incl. substitute days. */
    holidays(input: { country: string; year: number | string; region?: string; types?: string; lang?: string }): R<Normalized>
    /** Holiday-aware business-day math: start+addDays (shift), start+end (count), or start alone (check). */
    businessDays(input: { country: string; start: string; addDays?: number; end?: string; region?: string; weekend?: string; types?: string }): R<Normalized>
  }
  census: {
    zipcode(input: { zip: string }): R<Normalized>
    /** US Census ACS 5-year demographics for a state or county (population, income, poverty, housing). */
    demographics(input: { state: string; county?: string; year?: number }): R<Normalized>
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
    kimchiPremium(input?: { symbol?: string }): R<Normalized>
    balances(input: { address: string; chain?: string; tokens?: string }): R<Normalized>
    btcAddress(input: { address: string }): R<Normalized>
    btcMempool(input?: { minBtc?: number }): R<Normalized>
    btcTx(input: { txid: string }): R<Normalized>
    btcUtxos(input: { address: string; limit?: number }): R<Normalized>
    cexKlines(input: { pair: string; interval?: string; limit?: number }): R<Normalized>
    cexTicker(input: { pair: string }): R<Normalized>
    decodeCalldata(input: { data: string }): R<Normalized>
    nft(input: { address: string; tokenId: string; chain?: string; metadata?: string }): R<Normalized>
    nftSecurity(input: { address: string; chainId?: number }): R<Normalized>
    tokenMetadata(input: { address: string; chain?: string }): R<Normalized>
    vrf(input: { seed: string }): R<Normalized>
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
    /** Current Bitcoin fee rates (sat/vByte) + mempool backlog from mempool.space. */
    btcFees(): R<Normalized>
    /** ENS forward + reverse resolution on Ethereum mainnet (live RPC). */
    ensResolve(input: { query: string }): R<unknown>
    /** Spot price + market data by CoinGecko asset ids (comma-separated, lowercase). */
    tokenPrice(input: { ids: string; vs?: string }): R<unknown>
    /** Live EVM transaction status + receipt by hash. Chains: base, ethereum, polygon, arbitrum, optimism. */
    tx(input: { chain: 'base' | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism'; hash: string }): R<Normalized>
    /** EVM address transaction history (Etherscan-family). chainId defaults to 1 (Ethereum). */
    addressHistory(input: { address: string; chainId?: number; page?: number; offset?: number; sort?: 'asc' | 'desc'; startBlock?: number; endBlock?: number }): R<Normalized>
    /** Address safety report — risk signals/labels for an EVM address by chainId. */
    addressSafety(input: { chainId: string; address: string }): R<Normalized>
    /** OFAC sanctions screen for a wallet address (any chain, case-insensitive). */
    addressScreen(input: { address: string }): R<Normalized>
    /** Daily TVL history for a chain (DefiLlama). Pass chain (+ limit for most-recent N points). */
    chainTvlHistory(input: { chain: string; limit?: number }): R<Normalized>
    /** Full coin profile by CoinGecko id (price, market data, links, description). */
    coin(input: { id: string }): R<Normalized>
    /** Historical price/marketcap/volume series for a coin by CoinGecko id. */
    coinHistory(input: { id: string; days?: number; vs?: string }): R<Normalized>
    /** DeFi chains ranked by TVL (DefiLlama). */
    defiChains(input?: { limit?: number }): R<Normalized>
    /** DeFi protocol fees/revenue ranked (DefiLlama). kind fees|dexs, sort by window. */
    defiFees(input?: { kind?: 'fees' | 'dexs'; sort?: 'total24h' | 'total7d' | 'total30d'; limit?: number }): R<Normalized>
    /** Daily TVL history for a DefiLlama protocol slug (+ limit for most-recent N points). */
    defiProtocolHistory(input: { slug: string; limit?: number }): R<Normalized>
    /** DeFi yield pools (DefiLlama) — filter by chain/project/symbol/minApy/minTvl, sort by apy|tvl. */
    defiYields(input?: { chain?: string; project?: string; symbol?: string; minApy?: number; minTvlUsd?: number; sort?: 'apy' | 'tvl'; limit?: number }): R<Normalized>
    /** Supported DEX networks (GeckoTerminal). */
    dexNetworks(input?: { limit?: number }): R<Normalized>
    /** OHLCV candles for a DEX pool (GeckoTerminal). network + pool address + timeframe. */
    dexOhlcv(input: { network: string; address: string; timeframe?: 'day' | 'hour' | 'minute'; aggregate?: number; limit?: number }): R<Normalized>
    /** Trending/new DEX pools for a network (GeckoTerminal). */
    dexPools(input: { network: string; kind?: 'trending' | 'new'; limit?: number }): R<Normalized>
    /** Search DEX pools by token name/symbol/contract (GeckoTerminal), optional network scope. */
    dexSearch(input: { query: string; network?: string; limit?: number }): R<Normalized>
    /** Pools trading a given token on a network (GeckoTerminal). */
    dexTokenPools(input: { network: string; address: string; limit?: number }): R<Normalized>
    /** Hyperliquid perps — open interest, volume, funding (sort by oi|volume|funding). */
    hyperliquidFunding(input?: { coin?: string; sort?: 'oi' | 'volume' | 'funding'; limit?: number }): R<Normalized>
    /** Hyperliquid predicted next-hour funding rates per coin across venues. */
    hyperliquidPredictedFunding(input?: { coin?: string; limit?: number }): R<Normalized>
    /** Stablecoins by circulating USD (DefiLlama). */
    stablecoins(input?: { limit?: number }): R<Normalized>
    /** Token info by network + contract address (GeckoTerminal). */
    tokenInfo(input: { network: string; address: string }): R<Normalized>
    /** Token safety report by EVM chainId + contract address. */
    tokenSafety(input: { chainId: string; address: string }): R<Normalized>
    /** ERC-20 token transfers for an EVM address (Etherscan-family). chainId defaults to 1. */
    tokenTransfers(input: { address: string; chainId?: number; contractAddress?: string; page?: number; offset?: number; sort?: 'asc' | 'desc' }): R<Normalized>
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
    /** Currency conversion at a live or historical ECB rate. from + to (ISO 4217) + amount + optional date. */
    currency(input: { from: string; to: string; amount?: number; date?: string }): R<unknown>
  }
  /** ISO standards lookup — currency (4217), language (639), subdivision (3166-2). */
  iso: {
    /** ISO 4217 currency by code (alpha/numeric) or country: name, numeric, minor units. */
    currency(input: { code?: string; country?: string }): R<unknown>
    /** ISO 639 language by code (639-1/2B/2T) or name: canonical codes + English name. */
    language(input: { code?: string; name?: string }): R<unknown>
    /** ISO 3166-2 subdivision by code (US-CA) or country (US → list). */
    subdivision(input: { code?: string; country?: string }): R<unknown>
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
    cot(input: { market: string; limit?: number }): R<Normalized>
    /** Any FRED series by id (→ metadata + observations) or full-text catalog search. */
    fred(input: { seriesId?: string; query?: string; limit?: number; start?: string; end?: string }): R<Normalized>
    /** FRED economic-data release calendar — upcoming report dates (filter by name/releaseId). */
    fredReleases(input?: { from?: string; name?: string; releaseId?: number; limit?: number }): R<Normalized>
    /** FRED ALFRED point-in-time / vintage data — values as known on a past date + revision dates. */
    fredVintage(input: { seriesId: string; asOf?: string; start?: string; end?: string; limit?: number }): R<Normalized>
    /** Browse the FRED category tree to discover series (category + children + popular series). */
    fredCategories(input?: { categoryId?: number; seriesLimit?: number }): R<Normalized>
    /** FRED regional data — one series across all U.S. states/counties/metros for a period (income, unemployment, regional GDP). */
    fredRegional(input: { seriesId: string; date?: string }): R<Normalized>
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
    /** Parse a raw UN/EDIFACT document (international B2B EDI) into structured, named JSON + a semantic summary. POST { edi }. */
    edifact(input: { edi: string }): R<Normalized>
    /** Generate an outbound UN/EDIFACT ORDERS or INVOIC from JSON → meta.edi. POST { type, senderId, recipientId, documentNumber, items, … }. */
    edifactGenerate(input: { type: 'ORDERS' | 'INVOIC'; senderId: string; recipientId: string; senderQualifier?: string; recipientQualifier?: string; documentNumber: string; date?: string; parties?: Array<{ role: string; name: string }>; items: Array<{ quantity: number | string; productId?: string; price?: number | string; idType?: string }>; total?: number; controlRef?: string }): R<Normalized>
    /** Generate the X12 997 Functional Acknowledgment for a received interchange (meta.ack = ready-to-send 997). POST { edi, status?, controlNumber? }. */
    ack(input: { edi: string; status?: 'A' | 'E' | 'P' | 'R' | 'M' | 'W' | 'X'; controlNumber?: string }): R<Normalized>
    /** Generate an outbound X12 850 (PO) or 810 (Invoice) from JSON → meta.edi. POST { type, senderId, receiverId, documentNumber, items, … }. */
    generate(input: { type: '850' | '810' | '856'; senderId: string; receiverId: string; documentNumber: string; items: Array<{ quantity: number | string; uom?: string; price?: number | string; productId?: string }>; poNumber?: string; date?: string; parties?: Array<{ role: string; name: string }>; total?: number }): R<Normalized>
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
    /** Active in-flight hazard advisories (SIGMETs/AIRMETs) from NOAA: convective/turbulence/icing/IFR, with valid times, altitudes, movement. */
    sigmet(input?: { hazard?: string; hours?: number; limit?: number }): R<Normalized>
    /** NTSB civil aviation accident/incident history. Filter by registration/state/make/model/city/date range. */
    accidents(input: { registration?: string; state?: string; make?: string; model?: string; city?: string; dateFrom?: string; dateTo?: string; limit?: number }): R<unknown>
  }
  /** Developer/standards reference. */
  dev: {
    cratesSearch(input: { q: string; limit?: number }): R<Normalized>
    csvToJson(input: { csv: string; delimiter?: string; header?: boolean }): R<Normalized>
    diffJson(input?: { a?: string; b?: string }): R<Normalized>
    flattenJson(input?: { data?: string; delimiter?: string }): R<Normalized>
    gitlabSearch(input: { q: string; limit?: number }): R<Normalized>
    jsonToCsv(input: { data: unknown; delimiter?: string }): R<Normalized>
    jsonToTypescript(input?: { sample?: string; rootName?: string }): R<Normalized>
    jsonToZod(input?: { sample?: string; name?: string }): R<Normalized>
    jwtDecode(input: { token: string }): R<Normalized>
    npmSearch(input: { q: string; limit?: number }): R<Normalized>
    regexTest(input: { pattern: string; flags?: string; input: string }): R<Normalized>
    stackoverflowSearch(input: { q: string; sort?: string; limit?: number }): R<Normalized>
    uuid(input?: { version?: string; count?: number }): R<Normalized>
    /** IETF RFC lookup by number → status, title, authors, date, obsoletes/updates chain (bundled index). */
    rfc(input: { number: string }): R<unknown>
    /** Preflight gate: is a shell command runnable? Static verdict + optional live HEAD probe (probe=true). */
    preflight(input: { command: string; probe?: boolean }): R<Normalized>
  }
  /** US surface-water data (USGS). */
  water: {
    /** Real-time streamflow + gage height at a USGS site. Pass `site` (site number). */
    gauge(input: { site: string }): R<Normalized>
  }
  /** Trade / customs reference data. */
  trade: {
    commodityResolve(input: { system: string; code: string }): R<Normalized>
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
    /** Domain recon dossier — DNS + WHOIS/RDAP + TLS certificate in one call. */
    intel(input: { domain: string }): R<Normalized>
    /** Email-auth / DNS-security posture grade (SPF/DKIM/DMARC/MTA-STS/DNSSEC/CAA/BIMI) from live DNS. */
    emailSecurity(input: { domain: string; dkimSelector?: string }): R<Normalized>
    /** Certificate Transparency recon — subdomains + issued certs for a domain. */
    ctLogs(input: { domain: string; limit?: number }): R<Normalized>
  }
  email: {
    /** Email signals: RFC syntax, disposable/role/free flags, and MX-record presence (NOT deliverability). */
    validate(input: { email: string; checkMx?: boolean }): R<Normalized>
  }
  travel: {
    /** US State Dept travel advisories (live RSS). Omit country for all. */
    advisory(input?: { country?: string }): R<Normalized>
    /** Visa requirement for a passport × destination (ISO alpha-3/alpha-2/name). */
    visa(input: { passport: string; destination: string }): R<Normalized>
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
    mortgagePulse(input?: Record<string, never>): R<Normalized>
    centralBankRates(input?: { bank?: string }): R<Normalized>
    securityResolve(input?: { ticker?: string; isin?: string; lei?: string }): R<Normalized>
    cikTicker(input?: { ticker?: string; cik?: string }): R<Normalized>
    bankIdResolve(input?: { bic?: string; lei?: string; fdic_cert?: string }): R<Normalized>
    form144(input?: { q?: string; startDate?: string; endDate?: string; limit?: number }): R<Normalized>
    /** Loan/mortgage amortization schedule (deterministic). */
    amortize(input: { principal: number; annualRatePct: number; termMonths?: number; termYears?: number; extraMonthly?: number }): R<Normalized>
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
    /** SEC XBRL Frames — one concept (e.g. Revenues) across ALL filers for a period, for cross-company screening. */
    xbrlFrames(input: { tag: string; period: string; unit?: string; taxonomy?: string; sort?: 'desc' | 'asc'; limit?: number }): R<Normalized>
    /** Indian bank branch by IFSC code: bank, branch, address, MICR, payment rails. */
    ifscIndia(input: { ifsc: string }): R<Normalized>
    /** Card BIN/IIN lookup: brand, card type, issuing bank, country (longest-prefix match). */
    bin(input: { bin: string }): R<Normalized>
    /** OpenFIGI mapping: identifier (ISIN/CUSIP/SEDOL/TICKER/FIGI…) → FIGI(s) + security metadata across listings. */
    figi(input: { idType: string; idValue: string; exchCode?: string; currency?: string; limit?: number }): R<Normalized>
    /** OpenFIGI free-text security search (+ exchange/type/sector filters + cursor). */
    figiSearch(input: { query: string; exchCode?: string; securityType?: string; marketSector?: string; start?: string; limit?: number }): R<Normalized>
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
    zipResolve(input: { zip: string }): R<Normalized>
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
    idResolve(input?: { name?: string; lei?: string; cik?: string; ticker?: string }): R<Normalized>
    fiCompanies(input: { name: string; limit?: number }): R<Normalized>
    frCompanies(input: { q: string; limit?: number }): R<Normalized>
    leiHierarchy(input: { lei: string; childLimit?: number }): R<Normalized>
    leiIsins(input?: { lei?: string; isin?: string; limit?: number }): R<Normalized>
    noCompanies(input: { name: string; limit?: number }): R<Normalized>
    plKrs(input: { krs: string; register?: string }): R<Normalized>
    /** State Secretary-of-State business registry search, normalized (NY, CO). */
    sosSearch(input: { state: 'NY' | 'CO' | 'CT'; name?: string; entityId?: string; limit?: number; offset?: number }): R<unknown>
    /** Brazilian company registry by CNPJ: legal/trade name, status, activity, address, partners. */
    brCnpj(input: { cnpj: string }): R<Normalized>
    /** UK Companies House: name search OR companyNumber → full profile + officers. */
    ukCompanies(input: { query?: string; companyNumber?: string; limit?: number }): R<Normalized>
    /** Full entity dossier — master record + officers + registered agent + filings (v1: CT). By entityId, accountNumber, or name. */
    entityProfile(input: { state: 'CT'; entityId?: string; accountNumber?: string; name?: string; filingsLimit?: number }): R<Normalized>
    /** Registry lookup + OFAC sanctions screen of the entity + its agent in one call. */
    entityScreen(input: { state: 'NY' | 'CO' | 'CT'; name?: string; entityId?: string; threshold?: number; limit?: number }): R<unknown>
    /** NAICS 2022 industry-code lookup (exact code + children) or free-text industry search (US Census). */
    naics(input: { code?: string; query?: string; level?: number; limit?: number }): R<Normalized>
    /** GLEIF Legal Entity Identifier registry: exact `lei` lookup or `query` name search (ISO 17442, ~2.6M entities). */
    lei(input: { lei?: string; query?: string; country?: string; status?: 'active' | 'all'; limit?: number; offset?: number }): R<Normalized>
    /** Fuzzy resolve a messy company name to its canonical GLEIF LEI with a similarity score + confidence (KYB / record linkage). */
    entityMatch(input: { name: string; country?: string; limit?: number }): R<Normalized>
    /** Full company KYB dossier: SAM/exclusions/OFAC/GLEIF/USAspending/FARA/trademarks (+ SEC if ticker). */
    kyb360(input: { name: string; state?: string; ticker?: string; threshold?: number; limit?: number }): R<Normalized>
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
    financials(input?: { code?: string }): R<Normalized>
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
    /** Full-text Hacker News search (Algolia) — stories/comments by keyword, tags, author, sort. */
    hnSearch(input?: { query?: string; tags?: 'story' | 'comment' | 'ask_hn' | 'show_hn' | 'poll'; sort?: 'relevance' | 'date'; author?: string; limit?: number }): R<Normalized>
    /** Hacker News user profile by username — karma, about, created, submitted count. */
    hnUser(input: { username: string }): R<Normalized>
  }
  /** Chinese-language deterministic primitives (OpenCC + pinyin, keyless). */
  chinese: {
    /** Convert Chinese between Simplified/Traditional variants. from/to: cn|tw|twp|hk|t|jp. */
    convert(input: { text: string; from: string; to: string }): R<Normalized>
    /** Detect Chinese in text — Han presence, count, and script classification (simplified/traditional/mixed/han-common). */
    detect(input: { text: string }): R<Normalized>
    /** Convert Hanzi to pinyin — tone marks, numbered tones, or none; auto-segments words. */
    pinyin(input: { text: string; tone?: 'symbol' | 'num' | 'none'; segmented?: boolean }): R<Normalized>
  }
  /** Contact the 2s team. */
  feedback: {
    /** Send a message to the 2s team (feedback/bug/endpoint request). Flat $0.10. POST { message, subject?, name?, from? }. */
    send(input: { message: string; subject?: string; name?: string; from?: string }): R<Normalized>
  }
  /** GitHub read API (no caller key needed). */
  github: {
    /** Repository metadata: stars, forks, language, topics, license, timestamps. */
    repo(input: { owner: string; repo: string }): R<Normalized>
    /** List a user/org's repositories. Sort updated|created|pushed|full_name; type owner|member|all. */
    repos(input: { owner: string; sort?: 'updated' | 'created' | 'pushed' | 'full_name'; type?: 'owner' | 'member' | 'all'; perPage?: number; page?: number }): R<Normalized>
    /** GitHub code search (code-search syntax) — total count + file name/path/repo/url per hit. */
    searchCode(input: { q: string; perPage?: number; page?: number }): R<Normalized>
    /** GitHub repository search (full query syntax). Sort stars|forks|help-wanted-issues|updated. */
    searchRepos(input: { q: string; sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated'; order?: 'asc' | 'desc'; perPage?: number; page?: number }): R<Normalized>
    /** GitHub user/org profile: name, company, bio, followers, repo counts, created date. */
    user(input: { username: string }): R<Normalized>
    /** Commit history for a repo. Filter by branch/tag (sha), file path, or author; paginate. */
    commits(input: { owner: string; repo: string; sha?: string; path?: string; author?: string; perPage?: number; page?: number }): R<Normalized>
    /** Issues for a repo (PRs excluded). Filter state open|closed|all + labels; paginate. */
    issues(input: { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; labels?: string; perPage?: number; page?: number }): R<Normalized>
    /** Pull requests for a repo. Filter state open|closed|all; paginate. */
    pulls(input: { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; perPage?: number; page?: number }): R<Normalized>
    /** Branches of a repo: name, head sha, protection flag. */
    branches(input: { owner: string; repo: string; perPage?: number; page?: number }): R<Normalized>
    /** Git tags of a repo (name + commit sha), most recent first. */
    tags(input: { owner: string; repo: string; perPage?: number; page?: number }): R<Normalized>
    /** A repo's releases: tag, name, draft/prerelease, author, published time, notes. */
    releases(input: { owner: string; repo: string; perPage?: number; page?: number }): R<Normalized>
    /** Top contributors to a repo, ranked by commit count. */
    contributors(input: { owner: string; repo: string; perPage?: number; page?: number }): R<Normalized>
    /** Programming-language breakdown of a repo (bytes + percent), by size. */
    languages(input: { owner: string; repo: string }): R<Normalized>
    /** A repo's README decoded to UTF-8 text. Optional ref (branch/tag/sha). */
    readme(input: { owner: string; repo: string; ref?: string }): R<Normalized>
  }
  /** Prediction markets — Kalshi + Polymarket (read-only). */
  predict: {
    holders(input: { market: string; limit?: number }): R<Normalized>
    limitlessMarkets(input?: { limit?: number }): R<Normalized>
    /** Browse Kalshi events. Filter status/seriesTicker; page with limit + cursor. */
    kalshiEvents(input?: { limit?: number; cursor?: string; status?: 'unopened' | 'open' | 'closed' | 'settled'; seriesTicker?: string }): R<Normalized>
    /** A single Kalshi market by ticker — yes/no bid+ask, last price, volume, OI, result. */
    kalshiMarket(input: { ticker: string }): R<Normalized>
    /** Browse Kalshi markets. Filter status/eventTicker/seriesTicker/tickers; page with limit + cursor. */
    kalshiMarkets(input?: { limit?: number; cursor?: string; eventTicker?: string; seriesTicker?: string; status?: 'unopened' | 'open' | 'closed' | 'settled'; tickers?: string }): R<Normalized>
    /** Order book for a Kalshi market by ticker — resting yes/no bids (price + size). */
    kalshiOrderbook(input: { ticker: string; depth?: number }): R<Normalized>
    /** Recent Kalshi trades, optionally filtered to one ticker. Page with limit + cursor. */
    kalshiTrades(input?: { ticker?: string; limit?: number; cursor?: string }): R<Normalized>
    /** A single Polymarket market by conditionId, slug, or id — outcomes + live prices, CLOB token ids. */
    market(input?: { conditionId?: string; slug?: string; id?: string }): R<Normalized>
    /** Browse Polymarket markets. Filter active/closed, order, page with limit/offset. */
    markets(input?: { limit?: number; offset?: number; active?: boolean; closed?: boolean; order?: 'volume' | 'liquidity' | 'endDate' | 'startDate'; ascending?: boolean; tagId?: number }): R<Normalized>
    /** Full CLOB order book (bids + asks) for a Polymarket outcome token (clobTokenId). */
    orderbook(input: { tokenId: string }): R<Normalized>
    /** Live best bid/ask/midpoint for a Polymarket outcome token (midpoint = implied probability). */
    price(input: { tokenId: string }): R<Normalized>
    /** Time-series price (implied-probability) history for a Polymarket outcome token. */
    priceHistory(input: { tokenId: string; interval?: '1h' | '6h' | '1d' | '1w' | '1m' | 'max'; fidelity?: number }): R<Normalized>
    /** Recent Polymarket trades. Filter by market (conditionId) and/or user (wallet); page with limit. */
    trades(input?: { market?: string; user?: string; limit?: number }): R<Normalized>
    /** A Polymarket trader's portfolio by wallet address — value + open positions + unrealized PnL. */
    wallet(input: { address: string }): R<Normalized>
    /** Polymarket whale radar — largest recent trades by USD notional, ranked. */
    whales(input?: { limit?: number; minUsd?: number }): R<Normalized>
  }
  /** Sports schedules, scores, standings (official league APIs, keyless). */
  sports: {
    /** MLB games for a date (+ optional team) — status, teams, score, venue. Defaults to today. */
    mlbSchedule(input?: { date?: string; teamId?: number }): R<Normalized>
    /** MLB regular-season standings for a season (wins/losses/pct/GB/rank/streak). */
    mlbStandings(input?: { season?: number }): R<Normalized>
    /** NHL game schedule for the week anchored on a date (+ optional 3-letter team). Defaults to this week. */
    nhlSchedule(input?: { date?: string; team?: string }): R<Normalized>
    /** NHL scores/games for a date — state, start time, teams + score. Defaults to today. */
    nhlScores(input?: { date?: string }): R<Normalized>
    /** Current NHL standings — conference/division, GP, W/L/OTL, points, diff, streak. */
    nhlStandings(): R<Normalized>
  }
  /** Live web search + catalog discovery. */
  search: {
    ai(input: { q: string; maxResults?: number; topic?: string }): R<Normalized>
    crawl(input: { url: string; limit?: number; maxDepth?: number; instructions?: string }): R<Normalized>
    extract(input: { urls: unknown; depth?: string }): R<Normalized>
    /** Find 2s endpoints matching a natural-language query (e.g. "screen a company for sanctions"). */
    endpoints(input: { q: string; limit?: number }): R<Normalized>
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
    /** CVE change feed — CVEs modified within a window (NVD lastMod), each flagged if now CISA known-exploited. The pollable delta primitive. */
    cveChanges(input: { since: string; until?: string; keyword?: string; cpe?: string; limit?: number }): R<Normalized>
    /** Grade a URL's HTTP security headers (CSP/HSTS/X-Frame/…) from the live response. */
    httpHeaders(input: { url: string }): R<Normalized>
    /** Check a password against breach corpora via HIBP k-anonymity (only a 5-char SHA-1 prefix is sent). POST { password } or { sha1 }. */
    passwordExposure(input: { password?: string; sha1?: string }): R<Normalized>
    /** Threat-intel reputation for an IP/domain/URL/hash (abuse.ch + Feodo + Tor + Spamhaus DROP). */
    iocReputation(input: { ioc: string }): R<Normalized>
    /** Multi-source IP reputation + combined authority score (AbuseIPDB + abuse.ch + blocklist.de + StopForumSpam). */
    ipReputation(input: { ip: string }): R<Normalized>
    /** AbuseIPDB single-IP abuse check — confidence score, reports, usage type, ISP (verbose adds report records). */
    ipAbuse(input: { ip: string; maxAgeInDays?: number; verbose?: boolean }): R<Normalized>
    /** AbuseIPDB bulk blacklist — worst-offender IPs above a confidence threshold (the fail2ban firewall feed). */
    ipBlacklist(input: { confidenceMinimum?: number; limit?: number; ipVersion?: 4 | 6; onlyCountries?: string; exceptCountries?: string }): R<Normalized>
    /** AbuseIPDB subnet (CIDR) check — which IPs inside a network block have been reported. */
    ipBlock(input: { network: string; maxAgeInDays?: number; limit?: number }): R<Normalized>
    /** MITRE CWE weakness lookup by id (CWE-79) or keyword search (bundled, anti-hallucination). */
    cwe(input: { id?: string; query?: string; limit?: number }): R<Normalized>
    /** MITRE ATT&CK Enterprise technique lookup by id (T1059) or keyword search (bundled). */
    attack(input: { id?: string; query?: string; limit?: number }): R<Normalized>
    /** MITRE CAPEC attack-pattern lookup by id (CAPEC-66) or keyword search (bundled). */
    capec(input: { id?: string; query?: string; limit?: number }): R<Normalized>
    /** Does public exploit code exist for a CVE (Exploit-DB)? The weaponized-triage signal beyond KEV/EPSS. */
    exploitAvailability(input: { cve: string }): R<Normalized>
    /** Package security + provenance: OSV vulns + deps.dev license/deprecation + OpenSSF Scorecard health, in one call. GET { ecosystem, name, version? }. */
    package(input: { ecosystem: string; name: string; version?: string }): R<Normalized>
    /** Find CVEs affecting a product (NVD search by keyword or CPE). GET { product? | cpe?, limit? }. */
    cveSearch(input: { product?: string; cpe?: string; limit?: number }): R<Normalized>
  }
  /** Stock market data (Massive / formerly Polygon.io). */
  stocks: {
    metrics(input: { ticker: string }): R<Normalized>
    peers(input: { ticker: string; grouping?: string }): R<Normalized>
    earningsSurprises(input: { ticker: string; limit?: number }): R<Normalized>
    recommendations(input: { ticker: string }): R<Normalized>
    companyNews(input: { ticker: string; from?: string; to?: string; limit?: number }): R<Normalized>
    insiderSentiment(input: { ticker: string; from?: string; to?: string }): R<Normalized>
    financialsReported(input: { ticker: string; freq?: string; limit?: number }): R<Normalized>
    symbols(input?: { q?: string; exchange?: string; limit?: number }): R<Normalized>
    lobbying(input: { ticker: string; from?: string; to?: string; limit?: number }): R<Normalized>
    govSpending(input: { ticker: string; from?: string; to?: string; limit?: number }): R<Normalized>
    h1bVisas(input: { ticker: string; from?: string; to?: string; limit?: number }): R<Normalized>
    patents(input: { ticker: string; from?: string; to?: string; limit?: number }): R<Normalized>
    /** Latest daily quote for a US ticker (EOD/delayed): OHLCV, VWAP, change vs prior session, company metadata. */
    quote(input: { ticker: string }): R<unknown>
  }
  /** Live flight tracking. */
  flight: {
    airportBoard(input: { airport: string; type?: string; limit?: number }): R<Normalized>
    routeSchedule(input: { origin: string; destination: string; startDate: string; endDate: string; limit?: number }): R<Normalized>
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
    /** UK Food Standards Agency hygiene ratings by business name/postcode. */
    hygieneUk(input?: { name?: string; postcode?: string; limit?: number }): R<Normalized>
  }
  edu: {
    /** US college + university search (Department of Education College Scorecard). */
    collegeScorecard(input?: Record<string, unknown>): R<unknown>
    /** Every US public K-12 school (~102k, NCES CCD). */
    schoolLookup(input: { name?: string; district?: string; state?: string; city?: string; zip?: string; ncessch?: string; limit?: number; offset?: number }): R<unknown>
  }
  energy: {
    solarForecast(input: { latitude: number; longitude: number; days?: number }): R<Normalized>
    /** Alternative-fuel station locator (NREL Alternative Fuels Data Center). */
    fuelStations(input?: Record<string, unknown>): R<unknown>
    /** Solar resource averages (NREL NSRDB) for a lat/lon. */
    solarResource(input: { lat: number; lon: number }): R<unknown>
    /** US energy benchmark prices (EIA): omit series for a snapshot of all, or pass one (wti_crude/brent_crude/henry_hub_gas/gasoline_regular/diesel/electricity_retail). */
    prices(input?: { series?: string; limit?: number }): R<Normalized>
    /** Electricity generation mix by fuel type for a US state or "US" (EIA, latest month + shares). */
    generationMix(input: { location: string }): R<Normalized>
    /** Retail electricity price + sales for a US state by sector, monthly (EIA). */
    electricityRates(input: { state: string; sector?: 'residential' | 'commercial' | 'industrial' | 'transportation' | 'all'; months?: number }): R<Normalized>
    /** Great Britain grid carbon intensity (gCO2/kWh) + live generation mix. */
    carbonIntensityUk(): R<Normalized>
    /** Serving utility + rate-plan summaries for a lat/lon (OpenEI URDB, CC0). */
    utilityRates(input: { lat: number; lon: number; limit?: number }): R<Normalized>
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
    epoBiblio(input: { number: string; format?: string }): R<Normalized>
    epoFamily(input: { number: string; format?: string }): R<Normalized>
    epoLegal(input: { number: string; format?: string }): R<Normalized>
    epoSearch(input: { q: string; limit?: number }): R<Normalized>
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
    taxonomySpecialty(input: { code: string }): R<Normalized>
    providerIdResolve(input: { npi: string }): R<Normalized>
    /** Verify an ICD-10-CM diagnosis code or keyword-search the official US code set. */
    icd10(input: { code?: string; q?: string; billable_only?: boolean; limit?: number }): R<unknown>
    /** Normalize/verify drug names against RxNorm: term=… for candidates, rxcui=… for canonical concept + ingredients/brands/dose forms. */
    rxnorm(input: { term?: string; rxcui?: string; limit?: number }): R<unknown>
    /** Drug situational awareness: FDA shortage + recall status + NDC metadata for a drug name / rxcui / ndc (composed on RxNorm). */
    drugStatus(input: { drug?: string; rxcui?: string; ndc?: string; limit?: number }): R<unknown>
    /** Authoritative FDA drug label (SPL): indications, dosage, warnings, interactions, boxed warning + identity metadata for a drug name / ndc / rxcui / setId. */
    drugLabel(input: { drug?: string; ndc?: string; rxcui?: string; setId?: string; limit?: number }): R<unknown>
    /** CMS NADAC drug acquisition cost by NDC or name (live; current-year dataset auto-resolved). */
    drugPrice(input: { ndc?: string; name?: string; limit?: number }): R<Normalized>
    /** Drugs@FDA approval history: applications, products (ingredients/strength/form/marketing status) + submissions by drug/applicationNumber/sponsor. */
    drugApproval(input: { drug?: string; applicationNumber?: string; sponsor?: string; limit?: number }): R<unknown>
    /** FDA 510(k) premarket clearances by device name / applicant / product code: K-number, decision, clearance type. */
    device510k(input: { device?: string; applicant?: string; productCode?: string; limit?: number }): R<unknown>
    /** FDA device classification by device name / product code: class (I/II/III), regulation number, specialty, controls. */
    deviceClassification(input: { device?: string; productCode?: string; limit?: number }): R<unknown>
    /** FDA GUDID device lookup by UDI / brand / company: description, Rx/OTC, MRI safety, identifiers, product codes, GMDN. */
    deviceUdi(input: { device?: string; company?: string; udi?: string; limit?: number }): R<unknown>
    /** FDA medical-device recalls by device / firm / classification / status / state: reason, status, quantity, dates. */
    deviceRecall(input?: { device?: string; firm?: string; classification?: 'I' | 'II' | 'III'; status?: 'Ongoing' | 'Completed' | 'Terminated' | 'Pending'; state?: string; limit?: number }): R<unknown>
    /** CMS NPPES provider lookup by NPI, name, or organization (+state/taxonomy): identity, taxonomies, addresses. */
    npi(input: { npi?: string; firstName?: string; lastName?: string; organization?: string; state?: string; taxonomy?: string; limit?: number }): R<Normalized>
    /** MedlinePlus Genetics reference for a condition or gene: summary, sections, inheritance, related genes, cross-refs. */
    genetics(input: { term: string }): R<Normalized>
  }
  net: {
    ipResolve(input: { ip: string }): R<Normalized>
    /** Autonomous System (BGP) intelligence by AS number: holder, allocation block, announced prefixes, routing visibility (RIPEstat). */
    asn(input: { asn: string }): R<unknown>
    /** Resolve a MAC address or OUI prefix to its IEEE-registered vendor + decoded address bits (multicast/local/randomized). Bundled IEEE registries. */
    macVendor(input: { mac: string }): R<unknown>
    /** RPKI route-origin validation for an (ASN, prefix) pair — valid/invalid/unknown BGP-hijack signal (RIPEstat). */
    rpkiValidity(input: { asn: string; prefix: string }): R<Normalized>
  }
  product: {
    /** Decode/validate a product barcode (UPC/EAN/GTIN/ISBN): check digit, symbology, GS1 prefix → issuing org/country, + fresh best-effort identity (open ODbL federation). */
    gtin(input: { gtin: string; identity?: boolean }): R<Normalized>
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
    /** EPA/DOE fuel economy, fuel cost, and emissions by year/make/model (one entry per powertrain config). */
    fuelEconomy(input: { year: number; make: string; model: string }): R<Normalized>
    /** NHTSA vPIC Canadian Vehicle Specifications — dimensions/weights by year/make(/model). */
    canadianSpecs(input: { year: number; make: string; model?: string }): R<Normalized>
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
    /** NHTSA NCAP 5-Star crash-test ratings by make/model/year. */
    safetyRatings(input: { make: string; model: string; modelYear: number }): R<unknown>
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
    /** Full ClinicalTrials.gov study record by NCT id: eligibility, locations, outcomes, design, sponsors, results flag. */
    studyDetail(input: { nctId: string }): R<Normalized>
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
    fairMarketRent(input?: { fips?: string; state?: string; year?: string }): R<Normalized>
    incomeLimits(input?: { fips?: string; state?: string; year?: string }): R<Normalized>
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
    /** FEMA federal disaster & emergency declarations (every declaration since 1953): filter by state/disasterNumber/declarationType/incidentType/county/year/date range. */
    disasterDeclarations(input?: { state?: string; disasterNumber?: number; declarationType?: string; incidentType?: string; county?: string; fyDeclared?: number; fromDate?: string; toDate?: string; limit?: number }): R<unknown>
    /** FEMA disaster assistance dollars by disaster/place: program=individuals (IHP approved $ per ZIP) or public (Public Assistance obligated $ per applicant). */
    disasterAssistance(input?: { program?: 'individuals' | 'public'; tenancy?: 'owner' | 'renter'; disasterNumber?: number; state?: string; zipCode?: string; limit?: number }): R<unknown>
    /** FEMA Hazard Mitigation Assistance (HMA) funded projects (HMGP/BRIC/FMA): filter by state/disasterNumber/programFy/programArea → federal share, benefit-cost ratio, project type. */
    hazardMitigation(input?: { state?: string; disasterNumber?: number; programFy?: number; programArea?: string; limit?: number }): R<unknown>
    /** FEMA Public Assistance (PA) funded project details — post-disaster infrastructure-recovery grants: filter by state and/or disasterNumber → federal share, damage category, applicant. */
    publicAssistance(input?: { state?: string; disasterNumber?: number; incidentType?: string; limit?: number }): R<unknown>
    /** FEC campaign finance: name → candidate search; candidateId → financial totals (receipts/disbursements/cash-on-hand/contributions). */
    fec(input?: { name?: string; candidateId?: string; limit?: number }): R<unknown>
    /** Open US federal job postings (USAJOBS): filter by keyword/location/organization → title, agency, salary, grade, close date, apply link. */
    usajobs(input?: { keyword?: string; location?: string; organization?: string; limit?: number }): R<unknown>
    /** UK street-level crime by lat/lng (+month): total, by-category breakdown, recent records. */
    ukCrime(input: { lat: number; lng: number; month?: string; limit?: number }): R<Normalized>
    /** Quarterly real GDP by US state (BEA Regional): state (2-letter) + optional year → real GDP (millions chained USD) per quarter. */
    beaGdp(input: { state: string; year?: number; limit?: number }): R<unknown>
    /** Search EU public-procurement notices (TED) by country/cpv/keyword or a raw expert query. */
    euTenders(input: { country?: string; cpv?: string; keyword?: string; query?: string; limit?: number; page?: number }): R<Normalized>
    /** FMCSA motor-carrier safety profile by USDOT number (or name search): authority/status, safety rating, crash + inspection history, CSA BASICs. */
    carrierSafety(input: { dot?: number; name?: string; limit?: number }): R<unknown>
    /** US Congress members for a location: address (or state[+district]) → House rep + 2 senators with party, IDs, phone, office, contact form. */
    representatives(input: { address?: string; state?: string; district?: string | number }): R<unknown>
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
    tcg: {
      games: () => get('tcg.games', '/api/tcg/games'),
      sets: (i) => get('tcg.sets', '/api/tcg/sets', i),
      setPrices: (i) => get('tcg.set-prices', '/api/tcg/set-prices', i),
      card: (i) => get('tcg.card', '/api/tcg/card', i),
    },
    class: {
      industryResolve: (i) => get('class.industry-resolve', '/api/class/industry-resolve', i),
    },
    schedule: {
      cancel: (i) => post('schedule.cancel', '/api/schedule/cancel', i),
      create: (i) => post('schedule.create', '/api/schedule/create', i),
      status: (i) => post('schedule.status', '/api/schedule/status', i),
    },
    queue: {
      ack: (i) => post('queue.ack', '/api/queue/ack', i),
      enqueue: (i) => post('queue.enqueue', '/api/queue/enqueue', i),
      lease: (i) => post('queue.lease', '/api/queue/lease', i),
      stats: (i) => post('queue.stats', '/api/queue/stats', i),
    },
    pubsub: {
      createTopic: (i) => post('pubsub.create-topic', '/api/pubsub/create-topic', i),
      publish: (i) => post('pubsub.publish', '/api/pubsub/publish', i),
      subscribe: (i) => post('pubsub.subscribe', '/api/pubsub/subscribe', i),
      unsubscribe: (i) => post('pubsub.unsubscribe', '/api/pubsub/unsubscribe', i),
    },
    lock: {
      acquire: (i) => post('lock.acquire', '/api/lock/acquire', i),
      release: (i) => post('lock.release', '/api/lock/release', i),
      renew: (i) => post('lock.renew', '/api/lock/renew', i),
    },
    store: {
      blobDelete: (i) => post('store.blob-delete', '/api/store/blob-delete', i),
      blobGet: (i) => post('store.blob-get', '/api/store/blob-get', i),
      blobList: (i) => post('store.blob-list', '/api/store/blob-list', i),
      blobPut: (i) => post('store.blob-put', '/api/store/blob-put', i),
      docDelete: (i) => post('store.doc-delete', '/api/store/doc-delete', i),
      docGet: (i) => post('store.doc-get', '/api/store/doc-get', i),
      docPut: (i) => post('store.doc-put', '/api/store/doc-put', i),
      docSearch: (i) => post('store.doc-search', '/api/store/doc-search', i),
      kvDelete: (i) => post('store.kv-delete', '/api/store/kv-delete', i),
      kvGet: (i) => post('store.kv-get', '/api/store/kv-get', i),
      kvPut: (i) => post('store.kv-put', '/api/store/kv-put', i),
      kvScan: (i) => post('store.kv-scan', '/api/store/kv-scan', i),
      usage: () => post('store.usage', '/api/store/usage', {}),
      vectorDelete: (i) => post('store.vector-delete', '/api/store/vector-delete', i),
      vectorQuery: (i) => post('store.vector-query', '/api/store/vector-query', i),
      vectorUpsert: (i) => post('store.vector-upsert', '/api/store/vector-upsert', i),
    },
    markets: {
      status: (i) => get('markets.status', '/api/markets/status', i ?? {}),
      holiday: (i) => get('markets.holiday', '/api/markets/holiday', i ?? {}),
    },
    watchers: {
      packageRelease: (i) => post('watchers.package-release', '/api/watchers/package-release', i),
      iocReputation: (i) => post('watchers.ioc-reputation', '/api/watchers/ioc-reputation', i),
      httpHeaders: (i) => post('watchers.http-headers', '/api/watchers/http-headers', i),
      dns: (i) => post('watchers.dns', '/api/watchers/dns', i),
      whois: (i) => post('watchers.whois', '/api/watchers/whois', i),
      fearGreed: (i) => post('watchers.fear-greed', '/api/watchers/fear-greed', i),
      fredSeries: (i) => post('watchers.fred-series', '/api/watchers/fred-series', i),
      patent: (i) => post('watchers.patent', '/api/watchers/patent', i),
      paper: (i) => post('watchers.paper', '/api/watchers/paper', i),
      productRecall: (i) => post('watchers.product-recall', '/api/watchers/product-recall', i),
      fxRate: (i) => post('watchers.fx-rate', '/api/watchers/fx-rate', i),
      fundingRate: (i) => post('watchers.funding-rate', '/api/watchers/funding-rate', i),
      predictionMarket: (i) => post('watchers.prediction-market', '/api/watchers/prediction-market', i),
      secFiling: (i) => post('watchers.sec-filing', '/api/watchers/sec-filing', i),
      companyNews: (i) => post('watchers.company-news', '/api/watchers/company-news', i),
      ipo: (i) => post('watchers.ipo', '/api/watchers/ipo', i),
      federalRegister: (i) => post('watchers.federal-register', '/api/watchers/federal-register', i),
      weatherAlert: (i) => post('watchers.weather-alert', '/api/watchers/weather-alert', i),
      earthquake: (i) => post('watchers.earthquake', '/api/watchers/earthquake', i),
      flightStatus: (i) => post('watchers.flight-status', '/api/watchers/flight-status', i),
      tokenPrice: (i) => post('watchers.token-price', '/api/watchers/token-price', i),
      gasPrice: (i) => post('watchers.gas-price', '/api/watchers/gas-price', i),
      businessEarnings: (i) => post('watchers.business-earnings', '/api/watchers/business-earnings', i),
      stockPrice: (i) => post('watchers.stock-price', '/api/watchers/stock-price', i),
      cancel: (i) => post('watchers.cancel', '/api/watchers/cancel', i),
      cryptoAddressActivity: (i) => post('watchers.crypto-address-activity', '/api/watchers/crypto-address-activity', i),
      status: (i) => get('watchers.status', '/api/watchers/status', i),
    },
    time: {
      parse: (i) => get('time.parse', '/api/time/parse', i),
    },
    account: {
      balance: () => get('account.balance', '/api/account/balance'),
    },
    batch: {
      run: (i) => post('batch.run', '/api/batch/run', i),
    },
    agriculture: {
      drought: (i) => get('agriculture.drought', '/api/agriculture/drought', i),
      stats: (i) => get('agriculture.stats', '/api/agriculture/stats', i),
    },
    soil: {
      profile: (i) => get('soil.profile', '/api/soil/profile', i),
      hardinessZone: (i) => get('soil.hardiness-zone', '/api/soil/hardiness-zone', i),
    },
    music: {
      recording: (i) => get('music.recording', '/api/music/recording', i),
      artist: (i) => get('music.artist', '/api/music/artist', i),
      release: (i) => get('music.release', '/api/music/release', i),
    },
    maritime: {
      vessel: (i) => get('maritime.vessel', '/api/maritime/vessel', i),
      cases: (i) => get('maritime.cases', '/api/maritime/cases', i),
      port: (i) => get('maritime.port', '/api/maritime/port', i ?? {}),
    },
    telecom: {
      fccFilings: (i) => get('telecom.fcc-filings', '/api/telecom/fcc-filings', i),
      marketArea: (i) => get('telecom.market-area', '/api/telecom/market-area', i),
    },
    occupation: {
      profile: (i) => get('occupation.profile', '/api/occupation/profile', i),
      search: (i) => get('occupation.search', '/api/occupation/search', i),
      related: (i) => get('occupation.related', '/api/occupation/related', i),
    },
    labor: {
      wages: (i) => get('labor.wages', '/api/labor/wages', i),
      openings: (i) => get('labor.openings', '/api/labor/openings', i ?? {}),
      unemployment: (i) => get('labor.unemployment', '/api/labor/unemployment', i),
    },
    ai: {
      council: (i) => post('ai.council', '/api/ai/council', i),
      ocr: (i) => post('ai.ocr', '/api/ai/ocr', i),
      research: (i) => post('ai.research', '/api/ai/research', i),
      webAnswer: (i) => post('ai.web-answer', '/api/ai/web-answer', i),
      summarize: (i) => post('ai.summarize', '/api/ai/summarize', i),
      translate: (i) => post('ai.translate', '/api/ai/translate', i),
      extract: (i) => post('ai.extract', '/api/ai/extract', i),
      describeImage: (i) => post('ai.describe-image', '/api/ai/describe-image', i),
      screenshot: (i) => post('ai.screenshot', '/api/ai/screenshot', i),
      classify: (i) => post('ai.classify', '/api/ai/classify', i),
      entities: (i) => post('ai.entities', '/api/ai/entities', i),
      moderate: (i) => post('ai.moderate', '/api/ai/moderate', i),
      pii: (i) => post('ai.pii', '/api/ai/pii', i),
      sentiment: (i) => post('ai.sentiment', '/api/ai/sentiment', i),
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
      earnings: (i) => get('calendar.earnings', '/api/calendar/earnings', i ?? {}),
      ipo: (i) => get('calendar.ipo', '/api/calendar/ipo', i ?? {}),
      holidays: (i) => get('calendar.holidays', '/api/calendar/holidays', i),
      businessDays: (i) => get('calendar.business-days', '/api/calendar/business-days', i),
    },
    census: {
      zipcode: (i) => get('census.zipcode', '/api/census/zipcode', i),
      demographics: (i) => get('census.demographics', '/api/census/demographics', i),
    },
    climate: {
      stationNear: (i) => get('climate.station-near', '/api/climate/station-near', i),
      stationHistory: (i) => get('climate.station-history', '/api/climate/station-history', i),
    },
    countdown: {
      gif: (i) => get('countdown.gif', '/api/countdown/gif', i),
    },
    crypto: {
      kimchiPremium: (i) => get('crypto.kimchi-premium', '/api/crypto/kimchi-premium', i ?? {}),
      balances: (i) => get('crypto.balances', '/api/crypto/balances', i),
      btcAddress: (i) => get('crypto.btc-address', '/api/crypto/btc-address', i),
      btcMempool: (i) => get('crypto.btc-mempool', '/api/crypto/btc-mempool', i ?? {}),
      btcTx: (i) => get('crypto.btc-tx', '/api/crypto/btc-tx', i),
      btcUtxos: (i) => get('crypto.btc-utxos', '/api/crypto/btc-utxos', i),
      cexKlines: (i) => get('crypto.cex-klines', '/api/crypto/cex-klines', i),
      cexTicker: (i) => get('crypto.cex-ticker', '/api/crypto/cex-ticker', i),
      decodeCalldata: (i) => post('crypto.decode-calldata', '/api/crypto/decode-calldata', i),
      nft: (i) => get('crypto.nft', '/api/crypto/nft', i),
      nftSecurity: (i) => get('crypto.nft-security', '/api/crypto/nft-security', i),
      tokenMetadata: (i) => get('crypto.token-metadata', '/api/crypto/token-metadata', i),
      vrf: (i) => get('crypto.vrf', '/api/crypto/vrf', i),
      addressValidate: (i) => get('crypto.address-validate', '/api/crypto/address-validate', i),
      defi: (i) => get('crypto.defi', '/api/crypto/defi', i ?? {}),
      contract: (i) => get('crypto.contract', '/api/crypto/contract', i),
      fearGreed: (i) => get('crypto.fear-greed', '/api/crypto/fear-greed', i ?? {}),
      markets: (i) => get('crypto.markets', '/api/crypto/markets', i ?? {}),
      global: (i) => get('crypto.global', '/api/crypto/global', i ?? {}),
      trending: (i) => get('crypto.trending', '/api/crypto/trending', i ?? {}),
      gasOracle: (i) => get('crypto.gas-oracle', '/api/crypto/gas-oracle', i),
      btcFees: () => get('crypto.btc-fees', '/api/crypto/btc-fees', {}),
      ensResolve: (i) => get('crypto.ens-resolve', '/api/crypto/ens-resolve', i),
      tokenPrice: (i) => get('crypto.token-price', '/api/crypto/token-price', i),
      tx: (i) => get('crypto.tx', '/api/crypto/tx', i),
      addressHistory: (i) => get('crypto.address-history', '/api/crypto/address-history', i),
      addressSafety: (i) => get('crypto.address-safety', '/api/crypto/address-safety', i),
      addressScreen: (i) => get('crypto.address-screen', '/api/crypto/address-screen', i),
      chainTvlHistory: (i) => get('crypto.chain-tvl-history', '/api/crypto/chain-tvl-history', i),
      coin: (i) => get('crypto.coin', '/api/crypto/coin', i),
      coinHistory: (i) => get('crypto.coin-history', '/api/crypto/coin-history', i),
      defiChains: (i) => get('crypto.defi-chains', '/api/crypto/defi-chains', i ?? {}),
      defiFees: (i) => get('crypto.defi-fees', '/api/crypto/defi-fees', i ?? {}),
      defiProtocolHistory: (i) => get('crypto.defi-protocol-history', '/api/crypto/defi-protocol-history', i),
      defiYields: (i) => get('crypto.defi-yields', '/api/crypto/defi-yields', i ?? {}),
      dexNetworks: (i) => get('crypto.dex-networks', '/api/crypto/dex-networks', i ?? {}),
      dexOhlcv: (i) => get('crypto.dex-ohlcv', '/api/crypto/dex-ohlcv', i),
      dexPools: (i) => get('crypto.dex-pools', '/api/crypto/dex-pools', i),
      dexSearch: (i) => get('crypto.dex-search', '/api/crypto/dex-search', i),
      dexTokenPools: (i) => get('crypto.dex-token-pools', '/api/crypto/dex-token-pools', i),
      hyperliquidFunding: (i) => get('crypto.hyperliquid-funding', '/api/crypto/hyperliquid-funding', i ?? {}),
      hyperliquidPredictedFunding: (i) => get('crypto.hyperliquid-predicted-funding', '/api/crypto/hyperliquid-predicted-funding', i ?? {}),
      stablecoins: (i) => get('crypto.stablecoins', '/api/crypto/stablecoins', i ?? {}),
      tokenInfo: (i) => get('crypto.token-info', '/api/crypto/token-info', i),
      tokenSafety: (i) => get('crypto.token-safety', '/api/crypto/token-safety', i),
      tokenTransfers: (i) => get('crypto.token-transfers', '/api/crypto/token-transfers', i),
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
      cot: (i) => get('econ.cot', '/api/econ/cot', i),
      fred: (i) => get('econ.fred', '/api/econ/fred', i),
      fredReleases: (i) => get('econ.fred-releases', '/api/econ/fred-releases', i ?? {}),
      fredVintage: (i) => get('econ.fred-vintage', '/api/econ/fred-vintage', i),
      fredCategories: (i) => get('econ.fred-categories', '/api/econ/fred-categories', i ?? {}),
      fredRegional: (i) => get('econ.fred-regional', '/api/econ/fred-regional', i),
      indicator: (i) => get('econ.indicator', '/api/econ/indicator', i ?? {}),
      yieldCurve: (i) => get('econ.yield-curve', '/api/econ/yield-curve', i ?? {}),
      commodity: (i) => get('econ.commodity', '/api/econ/commodity', i ?? {}),
      recession: (i) => get('econ.recession', '/api/econ/recession', i ?? {}),
    },
    edi: {
      parse: (i) => post('edi.parse', '/api/edi/parse', i),
      edifact: (i) => post('edi.edifact', '/api/edi/edifact', i),
      edifactGenerate: (i) => post('edi.edifact-generate', '/api/edi/edifact-generate', i),
      ack: (i) => post('edi.ack', '/api/edi/ack', i),
      generate: (i) => post('edi.generate', '/api/edi/generate', i),
    },
    factcheck: {
      search: (i) => get('factcheck.search', '/api/factcheck/search', i),
    },
    dev: {
      cratesSearch: (i) => get('dev.crates-search', '/api/dev/crates-search', i),
      csvToJson: (i) => post('dev.csv-to-json', '/api/dev/csv-to-json', i),
      diffJson: (i) => post('dev.diff-json', '/api/dev/diff-json', i),
      flattenJson: (i) => post('dev.flatten-json', '/api/dev/flatten-json', i),
      gitlabSearch: (i) => get('dev.gitlab-search', '/api/dev/gitlab-search', i),
      jsonToCsv: (i) => post('dev.json-to-csv', '/api/dev/json-to-csv', i),
      jsonToTypescript: (i) => post('dev.json-to-typescript', '/api/dev/json-to-typescript', i),
      jsonToZod: (i) => post('dev.json-to-zod', '/api/dev/json-to-zod', i),
      jwtDecode: (i) => post('dev.jwt-decode', '/api/dev/jwt-decode', i),
      npmSearch: (i) => get('dev.npm-search', '/api/dev/npm-search', i),
      regexTest: (i) => post('dev.regex-test', '/api/dev/regex-test', i),
      stackoverflowSearch: (i) => get('dev.stackoverflow-search', '/api/dev/stackoverflow-search', i),
      uuid: (i) => get('dev.uuid', '/api/dev/uuid', i ?? {}),
      rfc: (i) => get('dev.rfc', '/api/dev/rfc', i),
      preflight: (i) => post('dev.preflight', '/api/dev/preflight', i),
    },
    aviation: {
      metar: (i) => get('aviation.metar', '/api/aviation/metar', i),
      taf: (i) => get('aviation.taf', '/api/aviation/taf', i),
      sigmet: (i) => get('aviation.sigmet', '/api/aviation/sigmet', i ?? {}),
      accidents: (i) => get('aviation.accidents', '/api/aviation/accidents', i),
    },
    water: {
      gauge: (i) => get('water.gauge', '/api/water/gauge', i),
    },
    convert: {
      unit: (i) => get('convert.unit', '/api/convert/unit', i),
      currency: (i) => get('convert.currency', '/api/convert/currency', i),
    },
    iso: {
      currency: (i) => get('iso.currency', '/api/iso/currency', i),
      language: (i) => get('iso.language', '/api/iso/language', i),
      subdivision: (i) => get('iso.subdivision', '/api/iso/subdivision', i),
    },
    trade: {
      commodityResolve: (i) => get('trade.commodity-resolve', '/api/trade/commodity-resolve', i),
      tariff: (i) => get('trade.tariff', '/api/trade/tariff', i),
      locode: (i) => get('trade.locode', '/api/trade/locode', i),
      flows: (i) => get('trade.flows', '/api/trade/flows', i),
    },
    dns: {
      lookup: (i) => get('dns.lookup', '/api/dns/lookup', i),
    },
    domain: {
      whois: (i) => get('domain.whois', '/api/domain/whois', i),
      intel: (i) => get('domain.intel', '/api/domain/intel', i),
      emailSecurity: (i) => get('domain.email-security', '/api/domain/email-security', i),
      ctLogs: (i) => get('domain.ct-logs', '/api/domain/ct-logs', i),
    },
    email: {
      validate: (i) => get('email.validate', '/api/email/validate', i),
    },
    travel: {
      advisory: (i) => get('travel.advisory', '/api/travel/advisory', i ?? {}),
      visa: (i) => get('travel.visa', '/api/travel/visa', i),
    },
    earth: {
      now: (i) => get('earth.now', '/api/earth/now', i),
      events: (i) => get('earth.events', '/api/earth/events', i ?? {}),
    },
    finance: {
      mortgagePulse: () => get('finance.mortgage-pulse', '/api/finance/mortgage-pulse'),
      centralBankRates: (i) => get('finance.central-bank-rates', '/api/finance/central-bank-rates', i ?? {}),
      securityResolve: (i) => get('finance.security-resolve', '/api/finance/security-resolve', i ?? {}),
      cikTicker: (i) => get('finance.cik-ticker', '/api/finance/cik-ticker', i ?? {}),
      bankIdResolve: (i) => get('finance.bank-id-resolve', '/api/finance/bank-id-resolve', i ?? {}),
      form144: (i) => get('finance.form-144', '/api/finance/form-144', i ?? {}),
      amortize: (i) => get('finance.amortize', '/api/finance/amortize', i),
      secFilings: (i) => get('finance.sec-filings', '/api/finance/sec-filings', i),
      companyFacts: (i) => get('finance.company-facts', '/api/finance/company-facts', i),
      xbrlFrames: (i) => get('finance.xbrl-frames', '/api/finance/xbrl-frames', i),
      insiderTrades: (i) => get('finance.insider-trades', '/api/finance/insider-trades', i),
      ifscIndia: (i) => get('finance.ifsc-india', '/api/finance/ifsc-india', i),
      bin: (i) => get('finance.bin', '/api/finance/bin', i),
      figi: (i) => get('finance.figi', '/api/finance/figi', i),
      figiSearch: (i) => get('finance.figi-search', '/api/finance/figi-search', i),
      thirteenF: (i) => get('finance.thirteen-f', '/api/finance/thirteen-f', i),
      companyProfile: (i) => get('finance.company-profile', '/api/finance/company-profile', i),
    },
    geo: {
      zipResolve: (i) => get('geo.zip-resolve', '/api/geo/zip-resolve', i),
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
      idResolve: (i) => get('business.id-resolve', '/api/business/id-resolve', i ?? {}),
      fiCompanies: (i) => get('business.fi-companies', '/api/business/fi-companies', i),
      frCompanies: (i) => get('business.fr-companies', '/api/business/fr-companies', i),
      leiHierarchy: (i) => get('business.lei-hierarchy', '/api/business/lei-hierarchy', i),
      leiIsins: (i) => get('business.lei-isins', '/api/business/lei-isins', i ?? {}),
      noCompanies: (i) => get('business.no-companies', '/api/business/no-companies', i),
      plKrs: (i) => get('business.pl-krs', '/api/business/pl-krs', i),
      sosSearch: (i) => get('business.sos-search', '/api/business/sos-search', i),
      brCnpj: (i) => get('business.br-cnpj', '/api/business/br-cnpj', i),
      ukCompanies: (i) => get('business.uk-companies', '/api/business/uk-companies', i),
      entityProfile: (i) => get('business.entity-profile', '/api/business/entity-profile', i),
      entityScreen: (i) => get('business.entity-screen', '/api/business/entity-screen', i),
      naics: (i) => get('business.naics', '/api/business/naics', i),
      lei: (i) => get('business.lei', '/api/business/lei', i),
      entityMatch: (i) => get('business.entity-match', '/api/business/entity-match', i),
      kyb360: (i) => get('business.kyb-360', '/api/business/kyb-360', i),
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
      epoBiblio: (i) => get('patents.epo-biblio', '/api/patents/epo-biblio', i),
      epoFamily: (i) => get('patents.epo-family', '/api/patents/epo-family', i),
      epoLegal: (i) => get('patents.epo-legal', '/api/patents/epo-legal', i),
      epoSearch: (i) => get('patents.epo-search', '/api/patents/epo-search', i),
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
      taxonomySpecialty: (i) => get('medical.taxonomy-specialty', '/api/medical/taxonomy-specialty', i),
      providerIdResolve: (i) => get('medical.provider-id-resolve', '/api/medical/provider-id-resolve', i),
      icd10: (i) => get('medical.icd10', '/api/medical/icd10', i),
      rxnorm: (i) => get('medical.rxnorm', '/api/medical/rxnorm', i),
      drugStatus: (i) => get('medical.drug-status', '/api/medical/drug-status', i),
      drugLabel: (i) => get('medical.drug-label', '/api/medical/drug-label', i),
      drugPrice: (i) => get('medical.drug-price', '/api/medical/drug-price', i),
      drugApproval: (i) => get('medical.drug-approval', '/api/medical/drug-approval', i),
      device510k: (i) => get('medical.device-510k', '/api/medical/device-510k', i),
      deviceClassification: (i) => get('medical.device-classification', '/api/medical/device-classification', i),
      deviceUdi: (i) => get('medical.device-udi', '/api/medical/device-udi', i),
      deviceRecall: (i) => get('medical.device-recall', '/api/medical/device-recall', i ?? {}),
      npi: (i) => get('medical.npi', '/api/medical/npi', i),
      genetics: (i) => get('medical.genetics', '/api/medical/genetics', i),
    },
    net: {
      ipResolve: (i) => get('net.ip-resolve', '/api/net/ip-resolve', i),
      asn: (i) => get('net.asn', '/api/net/asn', i),
      macVendor: (i) => get('net.mac-vendor', '/api/net/mac-vendor', i),
      rpkiValidity: (i) => get('net.rpki-validity', '/api/net/rpki-validity', i),
    },
    product: {
      gtin: (i) => get('product.gtin', '/api/product/gtin', i),
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
      fuelEconomy: (i) => get('vehicle.fuel-economy', '/api/vehicle/fuel-economy', i),
      canadianSpecs: (i) => get('vehicle.canadian-specs', '/api/vehicle/canadian-specs', i),
      recalls: (i) => get('vehicle.recalls', '/api/vehicle/recalls', i),
      complaints: (i) => get('vehicle.complaints', '/api/vehicle/complaints', i),
      investigations: (i) => get('vehicle.investigations', '/api/vehicle/investigations', i),
      safetyRatings: (i) => get('vehicle.safety-ratings', '/api/vehicle/safety-ratings', i),
      models: (i) => get('vehicle.models', '/api/vehicle/models', i),
      decodeWmi: (i) => get('vehicle.decode-wmi', '/api/vehicle/decode-wmi', i),
      manufacturers: (i) => get('vehicle.manufacturers', '/api/vehicle/manufacturers', i),
    },
    agent: {
      knowledgeDelta: (i) => post('agent.knowledge-delta', '/api/agent/knowledge-delta', i),
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
      studyDetail: (i) => get('clinical.study-detail', '/api/clinical/study-detail', i),
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
      financials: (i) => get('country.financials', '/api/country/financials', i ?? {}),
      lookup: (i) => get('country.lookup', '/api/country/lookup', i),
    },
    news: {
      hnTop: (i) => get('news.hn-top', '/api/news/hn-top', i),
      hnItem: (i) => get('news.hn-item', '/api/news/hn-item', i),
      search: (i) => get('news.search', '/api/news/search', i),
      hnSearch: (i) => get('news.hn-search', '/api/news/hn-search', i ?? {}),
      hnUser: (i) => get('news.hn-user', '/api/news/hn-user', i),
    },
    chinese: {
      convert: (i) => get('chinese.convert', '/api/chinese/convert', i),
      detect: (i) => get('chinese.detect', '/api/chinese/detect', i),
      pinyin: (i) => get('chinese.pinyin', '/api/chinese/pinyin', i),
    },
    feedback: {
      send: (i) => post('feedback.send', '/api/feedback/send', i),
    },
    github: {
      repo: (i) => get('github.repo', '/api/github/repo', i),
      repos: (i) => get('github.repos', '/api/github/repos', i),
      searchCode: (i) => get('github.search-code', '/api/github/search-code', i),
      searchRepos: (i) => get('github.search-repos', '/api/github/search-repos', i),
      user: (i) => get('github.user', '/api/github/user', i),
      commits: (i) => get('github.commits', '/api/github/commits', i),
      issues: (i) => get('github.issues', '/api/github/issues', i),
      pulls: (i) => get('github.pulls', '/api/github/pulls', i),
      branches: (i) => get('github.branches', '/api/github/branches', i),
      tags: (i) => get('github.tags', '/api/github/tags', i),
      releases: (i) => get('github.releases', '/api/github/releases', i),
      contributors: (i) => get('github.contributors', '/api/github/contributors', i),
      languages: (i) => get('github.languages', '/api/github/languages', i),
      readme: (i) => get('github.readme', '/api/github/readme', i),
    },
    predict: {
      holders: (i) => get('predict.holders', '/api/predict/holders', i),
      limitlessMarkets: (i) => get('predict.limitless-markets', '/api/predict/limitless-markets', i ?? {}),
      kalshiEvents: (i) => get('predict.kalshi-events', '/api/predict/kalshi-events', i ?? {}),
      kalshiMarket: (i) => get('predict.kalshi-market', '/api/predict/kalshi-market', i),
      kalshiMarkets: (i) => get('predict.kalshi-markets', '/api/predict/kalshi-markets', i ?? {}),
      kalshiOrderbook: (i) => get('predict.kalshi-orderbook', '/api/predict/kalshi-orderbook', i),
      kalshiTrades: (i) => get('predict.kalshi-trades', '/api/predict/kalshi-trades', i ?? {}),
      market: (i) => get('predict.market', '/api/predict/market', i ?? {}),
      markets: (i) => get('predict.markets', '/api/predict/markets', i ?? {}),
      orderbook: (i) => get('predict.orderbook', '/api/predict/orderbook', i),
      price: (i) => get('predict.price', '/api/predict/price', i),
      priceHistory: (i) => get('predict.price-history', '/api/predict/price-history', i),
      trades: (i) => get('predict.trades', '/api/predict/trades', i ?? {}),
      wallet: (i) => get('predict.wallet', '/api/predict/wallet', i),
      whales: (i) => get('predict.whales', '/api/predict/whales', i ?? {}),
    },
    sports: {
      mlbSchedule: (i) => get('sports.mlb-schedule', '/api/sports/mlb-schedule', i ?? {}),
      mlbStandings: (i) => get('sports.mlb-standings', '/api/sports/mlb-standings', i ?? {}),
      nhlSchedule: (i) => get('sports.nhl-schedule', '/api/sports/nhl-schedule', i ?? {}),
      nhlScores: (i) => get('sports.nhl-scores', '/api/sports/nhl-scores', i ?? {}),
      nhlStandings: () => get('sports.nhl-standings', '/api/sports/nhl-standings', {}),
    },
    search: {
      ai: (i) => get('search.ai', '/api/search/ai', i),
      crawl: (i) => post('search.crawl', '/api/search/crawl', i),
      extract: (i) => post('search.extract', '/api/search/extract', i),
      endpoints: (i) => get('search.endpoints', '/api/search/endpoints', i),
      web: (i) => get('search.web', '/api/search/web', i),
    },
    security: {
      cve: (i) => get('security.cve', '/api/security/cve', i),
      cveChanges: (i) => get('security.cve-changes', '/api/security/cve-changes', i),
      httpHeaders: (i) => get('security.http-headers', '/api/security/http-headers', i),
      passwordExposure: (i) => post('security.password-exposure', '/api/security/password-exposure', i),
      iocReputation: (i) => get('security.ioc-reputation', '/api/security/ioc-reputation', i),
      ipReputation: (i) => get('security.ip-reputation', '/api/security/ip-reputation', i),
      ipAbuse: (i) => get('security.ip-abuse', '/api/security/ip-abuse', i),
      ipBlacklist: (i) => get('security.ip-blacklist', '/api/security/ip-blacklist', i ?? {}),
      ipBlock: (i) => get('security.ip-block', '/api/security/ip-block', i),
      cwe: (i) => get('security.cwe', '/api/security/cwe', i ?? {}),
      attack: (i) => get('security.attack', '/api/security/attack', i ?? {}),
      capec: (i) => get('security.capec', '/api/security/capec', i ?? {}),
      exploitAvailability: (i) => get('security.exploit-availability', '/api/security/exploit-availability', i),
      package: (i) => get('security.package', '/api/security/package', i),
      cveSearch: (i) => get('security.cve-search', '/api/security/cve-search', i),
    },
    flight: {
      airportBoard: (i) => get('flight.airport-board', '/api/flight/airport-board', i),
      routeSchedule: (i) => get('flight.route-schedule', '/api/flight/route-schedule', i),
      status: (i) => get('flight.status', '/api/flight/status', i),
    },
    stocks: {
      metrics: (i) => get('stocks.metrics', '/api/stocks/metrics', i),
      peers: (i) => get('stocks.peers', '/api/stocks/peers', i),
      earningsSurprises: (i) => get('stocks.earnings-surprises', '/api/stocks/earnings-surprises', i),
      recommendations: (i) => get('stocks.recommendations', '/api/stocks/recommendations', i),
      companyNews: (i) => get('stocks.company-news', '/api/stocks/company-news', i),
      insiderSentiment: (i) => get('stocks.insider-sentiment', '/api/stocks/insider-sentiment', i),
      financialsReported: (i) => get('stocks.financials-reported', '/api/stocks/financials-reported', i),
      symbols: (i) => get('stocks.symbols', '/api/stocks/symbols', i ?? {}),
      lobbying: (i) => get('stocks.lobbying', '/api/stocks/lobbying', i),
      govSpending: (i) => get('stocks.gov-spending', '/api/stocks/gov-spending', i),
      h1bVisas: (i) => get('stocks.h1b-visas', '/api/stocks/h1b-visas', i),
      patents: (i) => get('stocks.patents', '/api/stocks/patents', i),
      quote: (i) => get('stocks.quote', '/api/stocks/quote', i),
    },
    transcribe: {
      audio: (i) => post('transcribe.audio', '/api/transcribe/audio', i),
    },
    food: {
      barcodeLookup: (i) => get('food.barcode-lookup', '/api/food/barcode-lookup', i),
      hygieneUk: (i) => get('food.hygiene-uk', '/api/food/hygiene-uk', i),
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
      fairMarketRent: (i) => get('gov.fair-market-rent', '/api/gov/fair-market-rent', i ?? {}),
      incomeLimits: (i) => get('gov.income-limits', '/api/gov/income-limits', i ?? {}),
      contractOpportunities: (i) => get('gov.contract-opportunities', '/api/gov/contract-opportunities', i),
      entity: (i) => get('gov.entity', '/api/gov/entity', i),
      exclusions: (i) => get('gov.exclusions', '/api/gov/exclusions', i),
      counterparty: (i) => get('gov.counterparty', '/api/gov/counterparty', i),
      foreignAgents: (i) => get('gov.foreign-agents', '/api/gov/foreign-agents', i),
      riskIndex: (i) => get('gov.risk-index', '/api/gov/risk-index', i),
      fccId: (i) => get('gov.fcc-id', '/api/gov/fcc-id', i),
      nfipClaims: (i) => get('gov.nfip-claims', '/api/gov/nfip-claims', i),
      disasterDeclarations: (i) => get('gov.disaster-declarations', '/api/gov/disaster-declarations', i ?? {}),
      disasterAssistance: (i) => get('gov.disaster-assistance', '/api/gov/disaster-assistance', i ?? {}),
      hazardMitigation: (i) => get('gov.hazard-mitigation', '/api/gov/hazard-mitigation', i ?? {}),
      publicAssistance: (i) => get('gov.public-assistance', '/api/gov/public-assistance', i ?? {}),
      fec: (i) => get('gov.fec', '/api/gov/fec', i ?? {}),
      usajobs: (i) => get('gov.usajobs', '/api/gov/usajobs', i ?? {}),
      ukCrime: (i) => get('gov.uk-crime', '/api/gov/uk-crime', i),
      beaGdp: (i) => get('gov.bea-gdp', '/api/gov/bea-gdp', i),
      euTenders: (i) => get('gov.eu-tenders', '/api/gov/eu-tenders', i),
      carrierSafety: (i) => get('gov.carrier-safety', '/api/gov/carrier-safety', i),
      representatives: (i) => get('gov.representatives', '/api/gov/representatives', i),
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
      solarForecast: (i) => get('energy.solar-forecast', '/api/energy/solar-forecast', i),
      fuelStations: (i) => get('energy.fuel-stations', '/api/energy/fuel-stations', i ?? {}),
      solarResource: (i) => get('energy.solar-resource', '/api/energy/solar-resource', i),
      prices: (i) => get('energy.prices', '/api/energy/prices', i ?? {}),
      generationMix: (i) => get('energy.generation-mix', '/api/energy/generation-mix', i),
      electricityRates: (i) => get('energy.electricity-rates', '/api/energy/electricity-rates', i),
      carbonIntensityUk: () => get('energy.carbon-intensity-uk', '/api/energy/carbon-intensity-uk', {}),
      utilityRates: (i) => get('energy.utility-rates', '/api/energy/utility-rates', i),
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
