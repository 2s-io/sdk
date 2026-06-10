/**
 * @2sio/sdk — typed client for the 2s.io pay-per-call AI agent API.
 *
 * Pass an EVM private key (or a pre-built signer) and call any endpoint —
 * the SDK auto-handles HTTP 402, signs an EIP-3009 payment authorization,
 * retries with the signature header, and returns the typed response. No
 * accounts, no API keys, no signup — buyers pay per call in USDC on Base.
 *
 *   ```ts
 *   import { TwoS } from '@2sio/sdk'
 *
 *   const client = new TwoS({ privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}` })
 *   const result = await client.patents.search({ q: 'neural network', limit: 5 })
 *   console.log(result.data.hits)
 *   ```
 */

import { x402Client, x402HTTPClient } from '@x402/core/client'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import type { LocalAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { createEndpoints, type Endpoints } from './endpoints.js'
import { loadSvmRegistrar, normalizeSolanaSecret, type SolanaKeyInput } from './svm.js'

export type { SolanaKeyInput } from './svm.js'

export interface TwoSConfig {
  /**
   * Hex EVM private key (`0x...`). The SDK wraps it with viem's
   * `privateKeyToAccount` internally — recommended convenience for most
   * users. Mutually exclusive with `signer`.
   */
  privateKey?: `0x${string}`
  /**
   * Pre-built viem `LocalAccount`. Use if you already have a custodial /
   * KMS-backed signer. Mutually exclusive with `privateKey`.
   */
  signer?: LocalAccount
  /**
   * Solana secret key. Accepts a base58 string (Phantom export / solana-cli
   * paper key), a raw 64-byte `Uint8Array`, or the 64-number JSON-array
   * format that `solana-keygen` writes. When set, the SDK auto-prefers
   * Solana settlement for any endpoint advertising a Solana entry in
   * `accepts` — agents holding SPL-USDC pay on Solana, not Base.
   *
   * Both EVM + Solana keys can be provided; the SDK picks per call based
   * on what the server advertised and what schemes you've registered.
   */
  solanaPrivateKey?: SolanaKeyInput
  /**
   * Internal-only API key. The public surface is x402-only; the bearer
   * path is reserved for pre-funded internal accounts until deposit
   * detection ships.
   * @internal
   */
  apiKey?: string
  /**
   * Override the default base URL. Defaults to `https://2s.io`.
   */
  baseUrl?: string
  /**
   * Try-before-you-buy mode. When `true`, the client makes a FREE trial call
   * on every request (no key, no wallet, no payment) so you can verify any
   * endpoint works before wiring payment. Trials are rate-limited server-side
   * to 1 call per endpoint per hour per client; once that's used the call
   * throws `TwoSError` with code `TRIAL_EXHAUSTED`. Drop `trial` and pass a
   * `privateKey`/`signer` to pay per call for unlimited access.
   *
   * Example:
   *   const trial = new TwoS({ trial: true })
   *   await trial.validate.iban({ iban: 'GB82WEST12345698765432' }) // free
   */
  trial?: boolean
  /**
   * Maximum payment USD the SDK will silently authorize per call. Calls
   * advertising a higher price are refused locally without signing. Default
   * is `0.10`. Set to `Infinity` to disable the cap.
   */
  maxPriceUsd?: number
  /**
   * Optional hook fired before payment is signed. Return `false` to abort.
   */
  onPaymentRequested?: (info: {
    url: string
    amountUsd: number
    network: string
    payTo: string
  }) => boolean | Promise<boolean>
}

export interface CallResult<T> {
  /** Parsed response body. */
  data: T
  /** Settlement metadata when x402 was used. */
  settlement?: {
    txHash: string | null
    network: string | null
    success: boolean
  }
  /** Balance after debit when bearer was used. */
  balanceUsd?: number
  /** Endpoint id (e.g. `'patents.search'`). */
  endpoint: string
  /** Final amount paid in USD. */
  costUsd: number
}

export class PaymentRefusedError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly advertisedUsd: number,
  ) {
    super(message)
    this.name = 'PaymentRefusedError'
  }
}

export class TwoSError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
    public readonly url: string,
  ) {
    super(message)
    this.name = 'TwoSError'
  }
}

const DEFAULT_BASE = 'https://2s.io'
const DEFAULT_MAX_PRICE = 0.10

/**
 * Main client. Construct once, reuse across calls. Endpoint methods are
 * namespaced (`client.patents.search`, `client.ai.summarize`, etc.).
 */
export class TwoS {
  /** Resolved runtime config (signer is built from privateKey if needed). */
  public readonly config: TwoSConfig & { signer?: LocalAccount }
  /** All endpoint methods, namespaced by group. */
  public readonly endpoints: Endpoints

  // Per-group accessors mirroring `client.endpoints.<group>` for terser code.
  public readonly account: Endpoints['account']
  public readonly ai: Endpoints['ai']
  public readonly aircraft: Endpoints['aircraft']
  public readonly airport: Endpoints['airport']
  public readonly barcode: Endpoints['barcode']
  public readonly calendar: Endpoints['calendar']
  public readonly census: Endpoints['census']
  public readonly climate: Endpoints['climate']
  public readonly countdown: Endpoints['countdown']
  public readonly crypto: Endpoints['crypto']
  public readonly html: Endpoints['html']
  public readonly tls: Endpoints['tls']
  public readonly dns: Endpoints['dns']
  public readonly domain: Endpoints['domain']
  public readonly earth: Endpoints['earth']
  public readonly finance: Endpoints['finance']
  public readonly geo: Endpoints['geo']
  public readonly geocode: Endpoints['geocode']
  public readonly hash: Endpoints['hash']
  public readonly validate: Endpoints['validate']
  public readonly convert: Endpoints['convert']
  public readonly tax: Endpoints['tax']
  public readonly trade: Endpoints['trade']
  public readonly image: Endpoints['image']
  public readonly ipinfo: Endpoints['ipinfo']
  public readonly business: Endpoints['business']
  public readonly law: Endpoints['law']
  public readonly search: Endpoints['search']
  public readonly flight: Endpoints['flight']
  public readonly stocks: Endpoints['stocks']
  public readonly transcribe: Endpoints['transcribe']
  public readonly nutrition: Endpoints['nutrition']
  public readonly person: Endpoints['person']
  public readonly tld: Endpoints['tld']
  public readonly papers: Endpoints['papers']
  public readonly patents: Endpoints['patents']
  public readonly quakes: Endpoints['quakes']
  public readonly sunrise: Endpoints['sunrise']
  public readonly tides: Endpoints['tides']
  public readonly medical: Endpoints['medical']
  public readonly timezone: Endpoints['timezone']
  public readonly url: Endpoints['url']
  public readonly weather: Endpoints['weather']
  public readonly wikipedia: Endpoints['wikipedia']
  public readonly poi: Endpoints['poi']
  public readonly phone: Endpoints['phone']
  public readonly space: Endpoints['space']
  public readonly bio: Endpoints['bio']
  public readonly vehicle: Endpoints['vehicle']
  public readonly gov: Endpoints['gov']
  public readonly agent: Endpoints['agent']
  public readonly chem: Endpoints['chem']
  public readonly bank: Endpoints['bank']
  public readonly license: Endpoints['license']
  public readonly health: Endpoints['health']
  public readonly nonprofit: Endpoints['nonprofit']
  public readonly worldbank: Endpoints['worldbank']
  public readonly book: Endpoints['book']
  public readonly clinical: Endpoints['clinical']
  public readonly code: Endpoints['code']
  public readonly wikidata: Endpoints['wikidata']
  public readonly paper: Endpoints['paper']
  public readonly registry: Endpoints['registry']
  public readonly fx: Endpoints['fx']
  public readonly bls: Endpoints['bls']
  public readonly country: Endpoints['country']
  public readonly news: Endpoints['news']
  public readonly food: Endpoints['food']
  public readonly word: Endpoints['word']
  public readonly edu: Endpoints['edu']
  public readonly energy: Endpoints['energy']
  public readonly park: Endpoints['park']
  public readonly recreation: Endpoints['recreation']
  public readonly job: Endpoints['job']
  public readonly property: Endpoints['property']
  public readonly treasury: Endpoints['treasury']

  constructor(config: TwoSConfig = {}) {
    if (config.privateKey && config.signer) {
      throw new Error(
        '@2sio/sdk: pass either `privateKey` OR `signer`, not both.',
      )
    }
    let signer = config.signer
    if (!signer && config.privateKey) {
      // Normalize so callers can pass either '0x...' or a bare hex string.
      const k = config.privateKey.startsWith('0x') ? config.privateKey : (`0x${config.privateKey}` as `0x${string}`)
      signer = privateKeyToAccount(k)
    }
    // Solana secret is normalized to 64-byte form here (sync); the actual
    // @solana/kit signer object is built lazily in `getX402Client()` so
    // EVM-only callers never pay the Solana SDK import cost.
    let solanaSecretBytes: Uint8Array | undefined
    if (config.solanaPrivateKey !== undefined) {
      solanaSecretBytes = normalizeSolanaSecret(config.solanaPrivateKey)
    }
    this.config = { ...config, signer }
    this._solanaSecretBytes = solanaSecretBytes
    if (!signer && !solanaSecretBytes && !config.apiKey && !config.trial) {
      throw new Error(
        "@2sio/sdk: TwoS requires `privateKey: '0x...'` (recommended), `solanaPrivateKey`, a pre-built `signer`, or `trial: true` for free try-before-you-buy calls.",
      )
    }
    this.endpoints = createEndpoints(this)
    this.account = this.endpoints.account
    this.ai = this.endpoints.ai
    this.aircraft = this.endpoints.aircraft
    this.airport = this.endpoints.airport
    this.barcode = this.endpoints.barcode
    this.calendar = this.endpoints.calendar
    this.census = this.endpoints.census
    this.climate = this.endpoints.climate
    this.countdown = this.endpoints.countdown
    this.crypto = this.endpoints.crypto
    this.html = this.endpoints.html
    this.tls = this.endpoints.tls
    this.dns = this.endpoints.dns
    this.domain = this.endpoints.domain
    this.earth = this.endpoints.earth
    this.finance = this.endpoints.finance
    this.geo = this.endpoints.geo
    this.geocode = this.endpoints.geocode
    this.hash = this.endpoints.hash
    this.validate = this.endpoints.validate
    this.convert = this.endpoints.convert
    this.tax = this.endpoints.tax
    this.trade = this.endpoints.trade
    this.image = this.endpoints.image
    this.ipinfo = this.endpoints.ipinfo
    this.business = this.endpoints.business
    this.law = this.endpoints.law
    this.search = this.endpoints.search
    this.flight = this.endpoints.flight
    this.stocks = this.endpoints.stocks
    this.transcribe = this.endpoints.transcribe
    this.nutrition = this.endpoints.nutrition
    this.person = this.endpoints.person
    this.tld = this.endpoints.tld
    this.papers = this.endpoints.papers
    this.patents = this.endpoints.patents
    this.quakes = this.endpoints.quakes
    this.sunrise = this.endpoints.sunrise
    this.tides = this.endpoints.tides
    this.medical = this.endpoints.medical
    this.timezone = this.endpoints.timezone
    this.url = this.endpoints.url
    this.weather = this.endpoints.weather
    this.wikipedia = this.endpoints.wikipedia
    this.poi = this.endpoints.poi
    this.phone = this.endpoints.phone
    this.space = this.endpoints.space
    this.bio = this.endpoints.bio
    this.vehicle = this.endpoints.vehicle
    this.gov = this.endpoints.gov
    this.agent = this.endpoints.agent
    this.chem = this.endpoints.chem
    this.bank = this.endpoints.bank
    this.license = this.endpoints.license
    this.health = this.endpoints.health
    this.nonprofit = this.endpoints.nonprofit
    this.worldbank = this.endpoints.worldbank
    this.book = this.endpoints.book
    this.clinical = this.endpoints.clinical
    this.code = this.endpoints.code
    this.wikidata = this.endpoints.wikidata
    this.paper = this.endpoints.paper
    this.registry = this.endpoints.registry
    this.fx = this.endpoints.fx
    this.bls = this.endpoints.bls
    this.country = this.endpoints.country
    this.news = this.endpoints.news
    this.food = this.endpoints.food
    this.word = this.endpoints.word
    this.edu = this.endpoints.edu
    this.energy = this.endpoints.energy
    this.park = this.endpoints.park
    this.recreation = this.endpoints.recreation
    this.job = this.endpoints.job
    this.property = this.endpoints.property
    this.treasury = this.endpoints.treasury
  }

  /** Base URL with no trailing slash. */
  get baseUrl(): string {
    return (this.config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  /** Cached x402 HTTP client (lazy — only built when first x402 call lands). */
  private _x402: x402HTTPClient | null = null
  /** Solana secret bytes (normalized 64 bytes) — set in constructor, used to lazy-build the signer. */
  private _solanaSecretBytes: Uint8Array | undefined

  private async getX402Client(): Promise<x402HTTPClient> {
    if (this._x402) return this._x402
    if (!this.config.signer && !this._solanaSecretBytes) {
      throw new Error(
        '@2sio/sdk: x402 call attempted but no signer was configured (EVM `signer`/`privateKey` or `solanaPrivateKey`).',
      )
    }
    const c = new x402Client()
    // Register EVM scheme when we have a viem account. The HTTPClient
    // walks `accepts[]` from the server and picks the first entry it
    // can satisfy — so registering both schemes is safe.
    if (this.config.signer) {
      registerExactEvmScheme(c, { signer: this.config.signer })
    }
    if (this._solanaSecretBytes) {
      // Lazy-load the Solana SDK (~600KB of @solana/kit) ONLY when a
      // caller actually configured a Solana key. EVM-only consumers
      // never pay this cost.
      const registrar = await loadSvmRegistrar()
      const svmSigner = await registrar.buildSigner(this._solanaSecretBytes)
      registrar.registerScheme(c, svmSigner)
    }
    this._x402 = new x402HTTPClient(c)
    return this._x402
  }

  /**
   * Low-level request. Endpoint methods use this internally. Public so
   * advanced callers can hit endpoints that aren't typed yet.
   */
  async request<T = unknown>(input: {
    method: 'GET' | 'POST'
    path: string
    query?: Record<string, string | number | boolean | undefined | null>
    body?: unknown
    endpoint: string
  }): Promise<CallResult<T>> {
    const url = this.buildUrl(input.path, input.query)
    const init: RequestInit = { method: input.method }
    const headers: Record<string, string> = {}
    if (input.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(input.body)
    }
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`
    }
    // Try-before-you-buy: ask the server for a free trial call. The server
    // runs the real handler (rate-limited to 1/endpoint/hour/client) and never
    // settles a payment.
    if (this.config.trial) {
      headers['X-2s-Trial'] = '1'
    }
    init.headers = headers

    // Probe — bearer mode succeeds directly; x402 mode gets a 402.
    let res = await fetch(url, init)
    if (res.status !== 402) return this.parseResponse<T>(res, input.endpoint, url)

    // Trial mode never pays: a 402 means the free trial for this endpoint is
    // exhausted (or it's not trial-eligible). Surface a clear, actionable error
    // instead of trying to sign a payment we have no key for.
    if (this.config.trial) {
      const b = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new TwoSError(
        b.error?.message ??
          'Free trial unavailable for this endpoint right now (1 call/endpoint/hour). Pass a privateKey or signer to pay per call for unlimited access.',
        402,
        'TRIAL_EXHAUSTED',
        url,
      )
    }

    // 402 path: parse PaymentRequired, check ceiling, sign, retry.
    const http = await this.getX402Client()
    const body = await res.json().catch(() => ({}))
    const required = http.getPaymentRequiredResponse(
      (n) => res.headers.get(n),
      body,
    )
    if (!required.accepts?.length) {
      throw new TwoSError('402 missing accepts[]', 402, 'BAD_402', url)
    }
    const requirement = required.accepts[0]
    if (!requirement) {
      throw new TwoSError('402 accepts[0] missing', 402, 'BAD_402', url)
    }
    const amountUsd = Number(requirement.amount) / 1_000_000
    const maxPrice = this.config.maxPriceUsd ?? DEFAULT_MAX_PRICE
    if (Number.isFinite(maxPrice) && amountUsd > maxPrice) {
      throw new PaymentRefusedError(
        `@2sio/sdk: endpoint advertised $${amountUsd} > maxPriceUsd $${maxPrice}`,
        url,
        amountUsd,
      )
    }
    if (this.config.onPaymentRequested) {
      const ok = await this.config.onPaymentRequested({
        url,
        amountUsd,
        network: requirement.network,
        payTo: requirement.payTo,
      })
      if (!ok) {
        throw new PaymentRefusedError(
          '@2sio/sdk: payment refused by onPaymentRequested hook',
          url,
          amountUsd,
        )
      }
    }

    const payload = await http.createPaymentPayload(required)
    const sigHeaders = http.encodePaymentSignatureHeader(payload)
    res = await fetch(url, {
      method: input.method,
      headers: { ...headers, ...sigHeaders },
      body: init.body,
    })
    return this.parseResponse<T>(res, input.endpoint, url)
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): string {
    const u = new URL(path.startsWith('/') ? path : `/${path}`, this.baseUrl)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue
        u.searchParams.set(k, String(v))
      }
    }
    return u.toString()
  }

  private async parseResponse<T>(
    res: Response,
    endpoint: string,
    url: string,
  ): Promise<CallResult<T>> {
    const ct = res.headers.get('content-type') ?? ''
    const txHash = res.headers.get('x-payment-tx')
    let settlement: CallResult<T>['settlement']
    const respHdr =
      res.headers.get('payment-response') ?? res.headers.get('x-payment-response')
    if (respHdr) {
      try {
        const decoded = JSON.parse(Buffer.from(respHdr, 'base64').toString('utf-8'))
        settlement = {
          txHash: decoded.transaction ?? txHash ?? null,
          network: decoded.network ?? null,
          success: !!decoded.success,
        }
      } catch {
        if (txHash) settlement = { txHash, network: null, success: true }
      }
    }

    if (ct.includes('application/json')) {
      const json = (await res.json()) as {
        data?: unknown
        meta?: { cost?: { usd?: number }; balance?: { usd?: number } }
        error?: { code?: string; message?: string }
      }
      if (!res.ok) {
        throw new TwoSError(
          json.error?.message ?? `HTTP ${res.status}`,
          res.status,
          json.error?.code ?? null,
          url,
        )
      }
      return {
        data: (json.data as T) ?? (json as T),
        settlement,
        balanceUsd: json.meta?.balance?.usd,
        endpoint,
        costUsd: json.meta?.cost?.usd ?? 0,
      }
    }

    // Binary endpoints (barcode, image, countdown.gif) — surface bytes.
    if (!res.ok) {
      const txt = await res.text()
      throw new TwoSError(`HTTP ${res.status}: ${txt.slice(0, 200)}`, res.status, null, url)
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return {
      data: bytes as unknown as T,
      settlement,
      endpoint,
      costUsd: 0,
    }
  }
}

export type { Endpoints, Normalized } from './endpoints.js'
export * from './types.js'
