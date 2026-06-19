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
    // ── Discovery + batch ────────────────────────────────────────────
    {
      name: 'search.endpoints',
      description:
        'Find the right 2s endpoint(s) for a task using a natural-language query (e.g. "screen a company for sanctions", "decode a VIN", "check a domain\'s email security"). Returns ranked matches with id, path, method, price, and description. Use this to discover capabilities before calling.',
      inputSchema: s('Endpoint search', {
        q: { type: 'string', description: 'Natural-language description of what you want to do (min 2 chars).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, ['q']),
      invoke: (a) => c.search.endpoints(a as never),
    },
    {
      name: 'batch.run',
      description:
        'Run up to 50 endpoint calls behind ONE x402 payment. Price = exact sum of the sub-call prices (no discount). Atomic: every sub-call must succeed or nothing is charged (failures are returned so you can retry for free). Sub-calls must be ordinary catalog endpoints (no bearer-only, deprecated, variable-priced, or metered-upstream endpoints; no nested batch). Each item carries that endpoint\'s own response in `data`.',
      inputSchema: s('Batch run', {
        calls: {
          type: 'array',
          description: '1–50 sub-calls, each { endpoint: dotted-id, params: object }.',
          items: { type: 'object' },
        },
      }, ['calls']),
      invoke: (a) => c.batch.run(a as never),
    },

    // ── Agriculture & soil ───────────────────────────────────────────
    {
      name: 'soil.profile',
      description:
        'Ground-truth soil profile for any US lat/lng from USDA-NRCS SSURGO. Returns the soil map unit + component soil types ranked by composition %, each with taxonomic order/class, drainage class, hydrologic group, and slope. Keyless, public-domain. For agronomy, land/septic/foundation suitability, hydrology, crop-fit. Water/unsurveyed points return an empty component list.',
      inputSchema: s('Soil profile input', {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
      }, ['lat', 'lon']),
      invoke: (a) => c.soil.profile(a as never),
    },
    {
      name: 'soil.hardiness-zone',
      description:
        'USDA Plant Hardiness Zone for a US ZIP code — planting zone (e.g. "9b") + average annual minimum-temperature range (°F) + ZIP centroid. Keyless, public-domain. The "what grows where" primitive for gardening/landscaping/nursery/agronomy.',
      inputSchema: s('Hardiness zone input', {
        zip: { type: 'string', description: '5-digit US ZIP code.' },
      }, ['zip']),
      invoke: (a) => c.soil.hardinessZone(a as never),
    },
    {
      name: 'agriculture.drought',
      description:
        'US Drought Monitor severity for a county (5-digit FIPS) or state (2-letter). Weekly % of area in each category (None, D0 Abnormally Dry → D4 Exceptional), newest first, with the worst category per week. Keyless, public-domain (NDMC/USDA/NOAA). The official metric behind USDA disaster eligibility.',
      inputSchema: s('Drought input', {
        area: { type: 'string', description: '5-digit county FIPS or 2-letter state code.' },
        weeks: { type: 'integer', minimum: 1, maximum: 260 },
      }, ['area']),
      invoke: (a) => c.agriculture.drought(a as never),
    },
    {
      name: 'agriculture.stats',
      description:
        'USDA NASS QuickStats — authoritative US ag statistics: crop yields, acreage, production, livestock inventory, prices received. Filter by commodity (CORN/SOYBEANS/CATTLE…), year (or year__GE/__LE range), state (2-letter), county, statistic category (YIELD/PRODUCTION/AREA HARVESTED/PRICE RECEIVED), aggregation level. 50k-row cap — narrow broad queries. Public-domain.',
      inputSchema: s('NASS stats input', {
        commodity_desc: { type: 'string', description: 'Commodity, upper-case (CORN, SOYBEANS, CATTLE).' },
        year: { type: 'string' },
        year__GE: { type: 'string', description: 'Year >= (range start).' },
        year__LE: { type: 'string', description: 'Year <= (range end).' },
        state_alpha: { type: 'string', description: '2-letter state code.' },
        county_name: { type: 'string' },
        statisticcat_desc: { type: 'string', description: 'YIELD, PRODUCTION, AREA HARVESTED, PRICE RECEIVED.' },
        agg_level_desc: { type: 'string', description: 'NATIONAL, STATE, COUNTY.' },
        short_desc: { type: 'string', description: 'Exact NASS data-item string.' },
        freq_desc: { type: 'string', description: 'ANNUAL, MONTHLY, WEEKLY.' },
      }, ['commodity_desc']),
      invoke: (a) => c.agriculture.stats(a as never),
    },

    // ── Telecom (FCC) ────────────────────────────────────────────────
    {
      name: 'telecom.fcc-filings',
      description:
        'Search FCC ECFS filings for a proceeding/docket (e.g. 17-108 net neutrality, 11-42 Lifeline), optionally by filer. Returns newest filings with submission id, filer, type, lead bureau, received/disseminated dates, doc count. Track FCC regulatory dockets, comments, ex-parte filings. Public-domain.',
      inputSchema: s('FCC ECFS filings', {
        proceeding: { type: 'string', description: 'FCC docket number, e.g. 17-108.' },
        filer: { type: 'string', description: 'Optional filer name filter.' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      }, ['proceeding']),
      invoke: (a) => c.telecom.fccFilings(a as never),
    },
    {
      name: 'telecom.market-area',
      description:
        'Map a US lat/lon to its FCC spectrum-licensing geographies — Cellular Market Area (CMA), Basic/Major Trading Area (BTA/MTA), Partial Economic Area (PEA), and BEA/EAG/MEA/REAG economic areas — plus 2020 Census block FIPS, county, and block population. These define spectrum-license boundaries; distinct from ordinary geocoding. Keyless, public-domain.',
      inputSchema: s('FCC market area', {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
      }, ['lat', 'lon']),
      invoke: (a) => c.telecom.marketArea(a as never),
    },

    // ── Occupation (O*NET) ───────────────────────────────────────────
    {
      name: 'occupation.profile',
      description:
        'Full occupation dossier from O*NET (US DOL) by SOC/O*NET-SOC code (e.g. 15-1252). Returns title, description, bright-outlook flag, sample job titles, and top skills, knowledge, abilities, work tasks, and technology tools. CC-BY. The canonical occupation reference for résumé/JD reasoning + career mapping; pair the code with labor.wages.',
      inputSchema: s('Occupation profile', {
        code: { type: 'string', description: 'SOC or O*NET-SOC code (e.g. 15-1252 or 15-1252.00).' },
      }, ['code']),
      invoke: (a) => c.occupation.profile(a as never),
    },
    {
      name: 'occupation.search',
      description:
        'Find O*NET occupations by keyword (job title, skill, or activity). Returns ranked occupations with SOC/O*NET-SOC code + title. The "occupation code for this job/skill" primitive — every occupation.* / labor.wages call composes on the code. CC-BY.',
      inputSchema: s('Occupation search', {
        keyword: { type: 'string', description: 'Job title, skill, or activity (min 2 chars).' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      }, ['keyword']),
      invoke: (a) => c.occupation.search(a as never),
    },
    {
      name: 'occupation.related',
      description:
        'Occupations related/career-adjacent to a given O*NET occupation, by SOC/O*NET-SOC code. Returns ranked related occupations (code + title). For career-pathing and transferable-skills reasoning. CC-BY.',
      inputSchema: s('Related occupations', {
        code: { type: 'string', description: 'SOC or O*NET-SOC code (e.g. 15-1252).' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      }, ['code']),
      invoke: (a) => c.occupation.related(a as never),
    },

    // ── Labor (BLS) ──────────────────────────────────────────────────
    {
      name: 'labor.wages',
      description:
        'Occupational employment + wages from BLS OEWS by SOC code, nationally or by US state. Pass soc (e.g. 15-1252 Software Developers) + optional 2-letter state. Returns employment, hourly mean, and annual mean + 10th/25th/median/75th/90th-percentile wages (latest survey year). Authoritative ground-truth wages for comp benchmarking. Public-domain.',
      inputSchema: s('Occupational wages', {
        soc: { type: 'string', description: '6-digit SOC code (e.g. 15-1252 or 151252).' },
        state: { type: 'string', description: 'Optional 2-letter US state code; omit for national.' },
      }, ['soc']),
      invoke: (a) => c.labor.wages(a as never),
    },
    {
      name: 'labor.openings',
      description:
        'US labor-market turnover from BLS JOLTS (total nonfarm, national), monthly newest-first. measure = openings (default) / hires / quits / layoffs / separations. Returns level in thousands per month. The standard labor-tightness (openings) + worker-confidence (quits) signal. Public-domain.',
      inputSchema: s('JOLTS turnover', {
        measure: { type: 'string', enum: ['openings', 'hires', 'quits', 'layoffs', 'separations'] },
        months: { type: 'integer', minimum: 1, maximum: 60 },
      }),
      invoke: (a) => c.labor.openings(a as never),
    },
    {
      name: 'labor.unemployment',
      description:
        'US unemployment from BLS, monthly newest-first — national (CPS, area="US") or by state (LAUS). measure = rate (default) / unemployed / employed / laborforce. Seasonally adjusted; rate in percent, counts in thousands. Public-domain.',
      inputSchema: s('Unemployment', {
        area: { type: 'string', description: '"US" or a 2-letter US state code.' },
        measure: { type: 'string', enum: ['rate', 'unemployed', 'employed', 'laborforce'] },
        months: { type: 'integer', minimum: 1, maximum: 60 },
      }, ['area']),
      invoke: (a) => c.labor.unemployment(a as never),
    },

    // ── Maritime (USCG PSIX) ─────────────────────────────────────────
    {
      name: 'maritime.vessel',
      description:
        'Search the US Coast Guard PSIX vessel registry by name (partial), call sign, official number, hull number (HIN), flag, service type, or build year. Returns vessels with USCG vessel id, name, call sign, service type, build year, status, official number, HIN, flag. Keyless, public-domain. US-flagged vessels + foreign vessels with US PSC activity. Pair vesselId with maritime.cases.',
      inputSchema: s('Vessel search', {
        name: { type: 'string', description: 'Vessel name (partial match).' },
        callSign: { type: 'string' },
        officialNumber: { type: 'string', description: 'USCG official number (VIN).' },
        hullNumber: { type: 'string', description: 'Manufacturer hull number (HIN).' },
        flag: { type: 'string' },
        service: { type: 'string' },
        buildYear: { type: 'string' },
        vesselId: { type: 'string', description: 'USCG vessel id (exact).' },
      }),
      invoke: (a) => c.maritime.vessel(a as never),
    },
    {
      name: 'maritime.cases',
      description:
        'US Coast Guard activity / port-state-control case history for a vessel, by USCG vessel id (from maritime.vessel). Returns cases newest-first with activity id, start date, type (Boarding, Inspection, Investigation…), and process status. Keyless, public-domain. The compliance/inspection record behind a vessel.',
      inputSchema: s('Vessel cases', {
        vesselId: { type: 'string', description: 'USCG vessel id (from maritime.vessel).' },
      }, ['vesselId']),
      invoke: (a) => c.maritime.cases(a as never),
    },

    // ── Music (MusicBrainz, CC0) ─────────────────────────────────────
    {
      name: 'music.recording',
      description:
        'Resolve a song/recording from MusicBrainz (open, CC0 music encyclopedia). Pass artist + title, or a free-text/Lucene query. Returns ranked recordings with MBID, title, primary artist, length (ms), first-release date, disambiguation. Keyless, public-domain. Canonicalize a track to its MBID.',
      inputSchema: s('Recording lookup', {
        artist: { type: 'string' },
        title: { type: 'string' },
        query: { type: 'string', description: 'Free-text / Lucene (overrides artist+title).' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      }),
      invoke: (a) => c.music.recording(a as never),
    },
    {
      name: 'music.artist',
      description:
        'Resolve a music artist from MusicBrainz (CC0). Pass a name or query. Returns ranked artists with MBID, name, sort name, type (Person/Group), country, gender, life span, disambiguation. Keyless, public-domain.',
      inputSchema: s('Artist lookup', {
        name: { type: 'string' },
        query: { type: 'string', description: 'Free-text / Lucene (overrides name).' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      }),
      invoke: (a) => c.music.artist(a as never),
    },
    {
      name: 'music.release',
      description:
        'Resolve an album/release from MusicBrainz (CC0). Pass a barcode (UPC/EAN), artist + album, or a free-text query. Returns ranked releases with MBID, title, artist, date, country, barcode, status, track count, label, catalog number. Barcode → album is the differentiated lookup. Keyless, public-domain.',
      inputSchema: s('Release lookup', {
        barcode: { type: 'string', description: 'UPC/EAN barcode.' },
        artist: { type: 'string' },
        album: { type: 'string' },
        query: { type: 'string', description: 'Free-text / Lucene (overrides the others).' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      }),
      invoke: (a) => c.music.release(a as never),
    },

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
      name: 'crypto.tx',
      description:
        'Live EVM transaction status + receipt by hash: mined/reverted/pending, block, confirmations, timestamp, from/to, value, gas used, effective gas price, total fee, contract created, log count. Chains: base, ethereum, polygon, arbitrum, optimism. Confirm a payment settled or a tx reverted before acting. 404 if unknown.',
      inputSchema: s('Transaction lookup input', {
        chain: { type: 'string', enum: ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism'] },
        hash: { type: 'string', description: '0x-prefixed 32-byte transaction hash.' },
      }, ['chain', 'hash']),
      invoke: (a) => c.crypto.tx(a as never),
    },
    {
      name: 'validate.iban',
      description:
        'Validate an IBAN (International Bank Account Number) with full ISO 13616 checks: country-specific length + ISO 7064 mod-97 checksum, not just regex. Returns valid flag, normalized + 4-char-grouped form, country, check digits, and BBAN. Deterministic, ~85 countries — validate AND canonicalize bank details in one call instead of doing checksum math in an LLM.',
      inputSchema: s('IBAN validation input', {
        iban: { type: 'string', description: 'IBAN to validate (spaces/hyphens allowed, case-insensitive).' },
      }, ['iban']),
      invoke: (a) => c.validate.iban(a as never),
    },
    {
      name: 'validate.gtin',
      description:
        'Validate a product barcode (GTIN-8/12/13/14, UPC-A, EAN-13, ISBN-10/13) with the GS1 mod-10 / ISBN mod-11 check digit. Returns valid, type, and the canonical GTIN-14 key for product-master dedup. Deterministic — no checksum math in the LLM.',
      inputSchema: s('GTIN validation input', {
        gtin: { type: 'string', description: 'Barcode/identifier (spaces/hyphens allowed).' },
      }, ['gtin']),
      invoke: (a) => c.validate.gtin(a as never),
    },
    {
      name: 'validate.aba',
      description:
        'Validate a US bank ABA routing number with the Federal Reserve weighted mod-10 (3-7-1) checksum, not just a regex. Returns valid, routingNumber, and routing-symbol district. Catches transposed digits in ACH/wire setup.',
      inputSchema: s('ABA validation input', {
        routingNumber: { type: 'string', description: '9-digit ABA routing number.' },
      }, ['routingNumber']),
      invoke: (a) => c.validate.aba(a as never),
    },
    {
      name: 'validate.lei',
      description:
        'Validate a Legal Entity Identifier (LEI, ISO 17442) with the ISO 7064 mod-97-10 check digits. Returns valid, normalized LEI, and the issuing LOU prefix. Confirms a counterparty/vendor LEI is well-formed before GLEIF lookup.',
      inputSchema: s('LEI validation input', {
        lei: { type: 'string', description: '20-character LEI (case-insensitive).' },
      }, ['lei']),
      invoke: (a) => c.validate.lei(a as never),
    },
    {
      name: 'validate.bic',
      description:
        'Validate a SWIFT/BIC code (ISO 9362): 8 or 11 chars = institution + ISO country + location + optional branch, with the country checked against ISO 3166. Returns parsed parts. Structure only, not a directory lookup.',
      inputSchema: s('BIC validation input', { bic: { type: 'string', description: '8 or 11-char BIC/SWIFT.' } }, ['bic']),
      invoke: (a) => c.validate.bic(a as never),
    },
    {
      name: 'validate.gln',
      description:
        'Validate a GS1 GLN (Global Location Number), 13 digits with the GS1 mod-10 check digit. GLNs identify trading parties + physical locations in CPG supply chains / EDI. Deterministic.',
      inputSchema: s('GLN validation input', { gln: { type: 'string', description: '13-digit GLN.' } }, ['gln']),
      invoke: (a) => c.validate.gln(a as never),
    },
    {
      name: 'validate.sscc',
      description:
        'Validate a GS1 SSCC (Serial Shipping Container Code), 18 digits with the GS1 mod-10 check digit. SSCCs identify logistic units (pallets/cases) — the key field in shipping/ASN (EDI 856). Deterministic.',
      inputSchema: s('SSCC validation input', { sscc: { type: 'string', description: '18-digit SSCC.' } }, ['sscc']),
      invoke: (a) => c.validate.sscc(a as never),
    },
    {
      name: 'validate.isin',
      description:
        'Validate an ISIN (ISO 6166 securities identifier): 2-letter country + 9-char NSIN + Luhn check digit. Returns valid, country, nsin, and the embedded CUSIP for US/CA issues. Catches transposed chars in security master data.',
      inputSchema: s('ISIN validation input', { isin: { type: 'string', description: '12-character ISIN.' } }, ['isin']),
      invoke: (a) => c.validate.isin(a as never),
    },
    {
      name: 'validate.cusip',
      description:
        'Validate a CUSIP (9-character US/Canada securities identifier) with its mod-10 weighted check digit. Returns valid + check digit. Deterministic security-master validation.',
      inputSchema: s('CUSIP validation input', { cusip: { type: 'string', description: '9-character CUSIP.' } }, ['cusip']),
      invoke: (a) => c.validate.cusip(a as never),
    },
    {
      name: 'validate.batch',
      description:
        'Validate up to 100 mixed identifiers in one deterministic call. Pass items=[{type,value}] with type one of iban, gtin, aba, lei, bic, gln, sscc, isin, cusip. Each result (in input order, with index + type) carries valid/reason plus the same type-specific fields the single endpoints return. One bad value or unsupported type degrades to that item only. Collapses a whole record of checksum checks into one round-trip.',
      inputSchema: s('Batch validation input', {
        items: {
          type: 'array',
          description: 'Identifiers to validate; each {type, value}.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'iban | gtin | aba | lei | bic | gln | sscc | isin | cusip' },
              value: { type: 'string', description: 'Raw identifier (spaces/hyphens allowed).' },
            },
            required: ['type', 'value'],
          },
          minItems: 1,
          maxItems: 100,
        },
      }, ['items']),
      invoke: (a) => c.validate.batch(a as never),
    },
    {
      name: 'convert.unit',
      description:
        'Deterministic unit-of-measure conversion: mass (g/kg/lb/oz/t…), length (m/km/in/ft/mi…), volume (l/ml/gal/qt/cup…), area (m2/ft2/acre/ha), temperature (C/F/K). Case-insensitive with aliases (kg/kilogram). Returns the exact result + dimension. Cross-dimension (kg→m) is rejected. Ground-truth factors instead of an LLM approximation.',
      inputSchema: s('Unit conversion input', {
        value: { type: 'number', description: 'Value to convert.' },
        from: { type: 'string', description: 'Source unit (alias-tolerant).' },
        to: { type: 'string', description: 'Target unit (same dimension).' },
      }, ['value', 'from', 'to']),
      invoke: (a) => c.convert.unit(a as never),
    },
    {
      name: 'convert.currency',
      description:
        'Convert an amount between currencies at a live or historical exchange rate. Pass from + to (3-letter ISO 4217) + optional amount (default 1) + date (YYYY-MM-DD for historical; omit for latest). Returns the converted result, per-unit rate, and effective rate date. Live ECB reference rates (via Frankfurter), fetched per request — never stale; weekends/holidays use the last business day. ECB major currencies.',
      inputSchema: s('Currency conversion', {
        from: { type: 'string', description: 'Source currency (ISO 4217, e.g. USD).' },
        to: { type: 'string', description: 'Target currency (ISO 4217, e.g. EUR).' },
        amount: { type: 'number', description: 'Amount of source currency (default 1).' },
        date: { type: 'string', description: 'YYYY-MM-DD for a historical rate (optional).' },
      }, ['from', 'to']),
      invoke: (a) => c.convert.currency(a as never),
    },
    {
      name: 'iso.currency',
      description:
        'ISO 4217 currency lookup. Pass code (alphabetic USD or 3-digit numeric 840) or country. Returns alphabetic + numeric code, English name, minor unit (decimal places — JPY 0, USD 2, BHD 3), and countries using it. Bundled authoritative ISO 4217 data.',
      inputSchema: s('ISO 4217 currency', {
        code: { type: 'string', description: 'ISO 4217 code — alphabetic (USD) or numeric (840).' },
        country: { type: 'string', description: 'Country name to find its currency.' },
      }, []),
      invoke: (a) => c.iso.currency(a as never),
    },
    {
      name: 'iso.language',
      description:
        'ISO 639 language lookup. Pass code in any form — 639-1 (en), 639-2/B (ger), 639-2/T (deu) — or name. Returns the English name + all sibling codes (alpha-2, alpha3-B, alpha3-T), resolving the bibliographic/terminological split (German = de/deu/ger). Bundled authoritative ISO 639 data.',
      inputSchema: s('ISO 639 language', {
        code: { type: 'string', description: 'ISO 639 code (en, ger, deu).' },
        name: { type: 'string', description: 'Language name (English), partial allowed.' },
      }, []),
      invoke: (a) => c.iso.language(a as never),
    },
    {
      name: 'iso.subdivision',
      description:
        'ISO 3166-2 subdivision lookup (states/provinces/regions). Pass code (US-CA) to resolve one → name + country, or country (2-letter, US) to list all its subdivisions with codes. Bundled authoritative ISO 3166-2 data (~3.8k subdivisions, 237 countries).',
      inputSchema: s('ISO 3166-2 subdivision', {
        code: { type: 'string', description: 'ISO 3166-2 subdivision code, e.g. US-CA.' },
        country: { type: 'string', description: '2-letter ISO 3166-1 country to list subdivisions, e.g. US.' },
      }, []),
      invoke: (a) => c.iso.subdivision(a as never),
    },
    {
      name: 'calendar.holidays',
      description:
        'List the official holidays for a country and year with exact observed dates, including substitute days (e.g. a Saturday July 4th observed Friday). 200+ countries, regional subdivisions (US states, German Länder, Canadian provinces…), movable feasts and lunar-calendar holidays computed from maintained rules. Filter by type (public, bank, school, optional, observance) and localize names via lang. Returns {date, name, type, substitute, rule} per holiday.',
      inputSchema: s('Holiday lookup input', {
        country: { type: 'string', description: 'ISO 3166-1 alpha-2 country code, e.g. US, DE, JP.' },
        year: { type: 'number', description: 'Calendar year, e.g. 2026.' },
        region: { type: 'string', description: 'Optional subdivision code, e.g. CA (US-California), BY (DE-Bavaria).' },
        types: { type: 'string', description: 'Optional comma-separated filter: public, bank, school, optional, observance.' },
        lang: { type: 'string', description: 'Optional ISO 639-1 language for holiday names.' },
      }, ['country', 'year']),
      invoke: (a) => c.calendar.holidays(a as never),
    },
    {
      name: 'calendar.business-days',
      description:
        'Holiday-aware business-day calculator for 200+ countries — the ground-truth answer for payment terms, SLA deadlines, and delivery dates instead of guessing holidays. Three modes: start+addDays shifts a date by N business days (signed); start+end counts business days between two dates (exclusive of start, inclusive of end); start alone checks one date (business day? which holiday? next/previous business day). Custom weekends supported (e.g. fri,sat for the Gulf). Skipped holidays are itemized.',
      inputSchema: s('Business-day math input', {
        country: { type: 'string', description: 'ISO 3166-1 alpha-2 country code.' },
        start: { type: 'string', description: 'Anchor date, YYYY-MM-DD.' },
        addDays: { type: 'number', description: 'Signed business days to add (XOR with end).' },
        end: { type: 'string', description: 'End date YYYY-MM-DD to count business days to (XOR with addDays).' },
        region: { type: 'string', description: 'Optional subdivision code, e.g. CA, BY.' },
        weekend: { type: 'string', description: 'Optional weekend days, comma-separated. Default sat,sun.' },
        types: { type: 'string', description: 'Optional holiday types treated as closures. Default public,bank.' },
      }, ['country', 'start']),
      invoke: (a) => c.calendar.businessDays(a as never),
    },
    {
      name: 'tax.vat',
      description:
        'Validate an EU VAT number against the official VIES register in real time. Confirms current registration for intra-EU trade and, when the member state discloses it, returns the registered business name + address. Covers the 27 EU states (Greece as EL) plus Northern Ireland (XI); Great Britain (GB) is not in VIES. Pass vat (full identifier like DE811569869) OR country + number. Returns {valid, countryCode, vatNumber, name, address, requestDate, reason}.',
      inputSchema: s('VAT validation input', {
        vat: { type: 'string', description: 'Full VAT identifier incl. country prefix, e.g. DE811569869.' },
        country: { type: 'string', description: '2-letter VAT country prefix (Greece=EL, Northern Ireland=XI). Use with number.' },
        number: { type: 'string', description: 'VAT number without the country prefix. Use with country.' },
      }),
      invoke: (a) => c.tax.vat(a as never),
    },
    {
      name: 'tax.vat-rates',
      description:
        'Current EU VAT rates by member state — standard rate plus reduced/super-reduced/parking/zero rates — from the European Commission TEDB, refreshed regularly. Pass country (ISO 2-letter; Greece is EL) for one state, or omit for all 27. Each result returns standardRate, reducedRates[], every rate category with its percentage, and the date in force. Pairs with tax.vat (number validation).',
      inputSchema: s('EU VAT rates lookup', {
        country: { type: 'string', description: 'EU member-state ISO 2-letter code (Greece=EL). Omit for all 27 states.' },
      }),
      invoke: (a) => c.tax.vatRates(a as never),
    },
    {
      name: 'inflation.calculator',
      description: "Adjust a US dollar amount for inflation between two dates ('what is $100 in 1990 worth today?') using CPI-U. Returns the adjusted amount, cumulative inflation %, annualized rate, and the CPI values used. Source: BLS CPI via FRED.",
      inputSchema: s('Inflation calculator', {
        amount: { type: 'number', description: 'Dollar amount to adjust.' },
        from: { type: 'string', description: 'Start date (YYYY, YYYY-MM, or YYYY-MM-DD).' },
        to: { type: 'string', description: 'End date; defaults to latest CPI.' },
      }, ['amount', 'from']),
      invoke: (a) => c.inflation.calculator(a as never),
    },
    {
      name: 'inflation.rates',
      description: 'Current US inflation by measure with index level + YoY/MoM %. Pass measure (cpi, core-cpi, pce, core-pce, ppi, cpi-shelter, cpi-energy, import-prices, ...) or omit for all. The YoY change is the headline inflation rate. Source: BLS/BEA via FRED.',
      inputSchema: s('Inflation rates', {
        measure: { type: 'string', description: 'One measure (e.g. core-pce), or omit for all.' },
      }),
      invoke: (a) => c.inflation.rates(a as never),
    },
    {
      name: 'inflation.expectations',
      description: 'US inflation expectations — 5y & 10y TIPS breakevens, 5y5y forward, and U-Michigan 1-year consumer expectation. Each a percent. Market breakevens update daily. Source: Fed/Treasury via FRED.',
      inputSchema: s('Inflation expectations', {}),
      invoke: (a) => c.inflation.expectations(a as never),
    },
    {
      name: 'inflation.hicp',
      description: 'EU harmonized inflation (HICP annual rate) — the official cross-country-comparable inflation rate for the EU, euro area, and each member state. Pass country (Eurostat geo: DE, FR, EL=Greece, EA20=euro area, EU27_2020=EU) or omit for all. Source: Eurostat (keyless). For US inflation use inflation.rates.',
      inputSchema: s('EU HICP inflation', {
        country: { type: 'string', description: 'Eurostat geo code (DE, FR, EL, EA20, EU27_2020). Omit for all.' },
      }),
      invoke: (a) => c.inflation.hicp(a as never),
    },
    {
      name: 'econ.indicator',
      description: 'Latest reading of a curated US macro indicator (+ prior, year-ago, YoY %). Pass indicator (unemployment-rate, fed-funds-rate, real-gdp, gdp-growth, nonfarm-payrolls, 10y-treasury, 30y-mortgage, consumer-sentiment, ...) or omit for all. Source: BLS/BEA/Fed via FRED.',
      inputSchema: s('Macro indicator', {
        indicator: { type: 'string', description: 'One indicator, or omit for all.' },
      }),
      invoke: (a) => c.econ.indicator(a as never),
    },
    {
      name: 'econ.yield-curve',
      description: 'Current US Treasury yield curve (1M–30Y constant-maturity yields) plus the 2s10s and 3m10y spreads and an inversion flag (recession signal). Daily data. Source: US Treasury via FRED.',
      inputSchema: s('Treasury yield curve', {}),
      invoke: (a) => c.econ.yieldCurve(a as never),
    },
    {
      name: 'econ.commodity',
      description: 'Latest benchmark commodity price + % change. Pass commodity (wti, brent, natural-gas, gasoline, diesel, heating-oil, propane, copper, aluminum, corn, wheat, sugar) or omit for all. Each names the FRED series + unit. Source: EIA/IMF via FRED.',
      inputSchema: s('Commodity price', {
        commodity: { type: 'string', description: 'One commodity, or omit for all.' },
      }),
      invoke: (a) => c.econ.commodity(a as never),
    },
    {
      name: 'econ.recession',
      description: 'Composite US recession-signal dashboard: NY Fed recession probability (12mo ahead), Sahm-rule real-time indicator (≥0.50 = recession begun), and 10y2y Treasury spread (negative = inverted). Each with value, date, triggered flag, and a count of signals flashing. A read of the standard gauges, not a forecast. Source: FRED.',
      inputSchema: s('Recession signals', {}),
      invoke: (a) => c.econ.recession(a as never),
    },
    {
      name: 'edi.parse',
      description: 'Parse a raw ANSI X12 EDI document (B2B purchase orders, invoices, ship notices, etc.) into clean structured JSON. POST edi with the raw interchange text. Auto-detects delimiters; returns interchange metadata, each functional group + transaction set with its type decoded (850 PO, 810 invoice, 856 ASN, 855 PO ack, 997 ack), every segment named, and a semantic summary (PO/invoice numbers, parties, line items, totals). Deterministic, no external calls.',
      inputSchema: s('X12 EDI parse', { edi: { type: 'string', description: 'Raw X12 interchange text (begins with ISA).' } }, ['edi']),
      invoke: (a) => c.edi.parse(a as never),
    },
    {
      name: 'edi.edifact',
      description: 'Parse a raw UN/EDIFACT document (the B2B EDI standard used across Europe, Asia, logistics and customs — international counterpart to ANSI X12) into clean structured JSON. POST edi with the raw interchange text. Reads the optional UNA service-string advice to auto-detect delimiters (or applies UN defaults); handles release-character escaping; returns the interchange envelope (UNB: sender/recipient with qualifiers, date/time, control reference, test indicator) and each message with its type decoded (ORDERS PO, INVOIC invoice, DESADV ASN, ORDRSP PO response, CONTRL ack), every segment named (BGM, DTM, NAD, LIN, QTY, MOA…), and a semantic summary (order/invoice numbers, dates, parties with role decoded, line items, totals). Deterministic, no external calls.',
      inputSchema: s('UN/EDIFACT parse', { edi: { type: 'string', description: 'Raw UN/EDIFACT interchange text (optional UNA, then UNB/UNH…).' } }, ['edi']),
      invoke: (a) => c.edi.edifact(a as never),
    },
    {
      name: 'edi.edifact-generate',
      description: "Generate an outbound UN/EDIFACT document from JSON (international counterpart to edi.generate/X12). POST type ('ORDERS' PO or 'INVOIC' invoice) + senderId, recipientId, documentNumber, optional date, parties (NAD role+name), items (quantity, productId, price), and for INVOIC optional total. Returns the full EDIFACT interchange in meta.edi (UNA/UNB/UNH…UNT/UNZ with BGM/DTM/NAD/LIN/QTY/PRI/MOA), proper delimiters + release-char escaping. Deterministic; round-trips through edi.edifact.",
      inputSchema: s('EDIFACT generate', { type: { type: 'string', enum: ['ORDERS', 'INVOIC'] }, senderId: { type: 'string' }, recipientId: { type: 'string' }, senderQualifier: { type: 'string', description: 'Default 14 (GLN/EAN).' }, recipientQualifier: { type: 'string' }, documentNumber: { type: 'string' }, date: { type: 'string', description: 'CCYYMMDD (default today).' }, parties: { type: 'array', items: { type: 'object' }, description: 'NAD loops (role+name).' }, items: { type: 'array', items: { type: 'object' }, description: 'Line items (quantity, productId, price, idType?).' }, total: { type: 'number', description: 'INVOIC total.' }, controlRef: { type: 'string' } }, ['type', 'senderId', 'recipientId', 'documentNumber', 'items']),
      invoke: (a) => c.edi.edifactGenerate(a as never),
    },
    {
      name: 'domain.email-security',
      description: "Grade a domain's email-authentication / DNS-security posture from live DNS in one call: SPF, DMARC (policy), DKIM (supplied/common selectors), MTA-STS, TLS-RPT, DNSSEC, CAA, BIMI. Pass domain (+ optional dkimSelector). Returns a letter grade, a summary (incl. spoofingProtected), and a per-mechanism block with the raw record, parsed tags, and specific issues. Live DNS via DoH (keyless) — an LLM can't know a domain's current records.",
      inputSchema: s('Email security posture', { domain: { type: 'string' }, dkimSelector: { type: 'string', description: 'Optional known DKIM selector.' } }, ['domain']),
      invoke: (a) => c.domain.emailSecurity(a as never),
    },
    {
      name: 'domain.ct-logs',
      description: 'Certificate Transparency recon for a domain — discover its subdomains and issued certificates from public CT logs (passive attack-surface mapping). Pass domain (+ optional limit). Returns deduplicated subdomains + certs (issuer, validity, SAN names), newest first. certSpotter primary, crt.sh fallback, keyless. CT shows names that ever appeared in a cert, not necessarily live hosts.',
      inputSchema: s('CT-log recon', { domain: { type: 'string' }, limit: { type: 'integer', description: 'Max certs (1-500).' } }, ['domain']),
      invoke: (a) => c.domain.ctLogs(a as never),
    },
    {
      name: 'security.http-headers',
      description: "Fetch a URL and grade its HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP/CORP). Pass url. Returns a letter grade + score, present/missing headers, and a per-header analysis with the live value and issues. Also flags Server/X-Powered-By info disclosure. SSRF-guarded live fetch (private targets refused) — an LLM can't see a site's current headers.",
      inputSchema: s('HTTP security headers', { url: { type: 'string', description: 'URL to analyze (scheme optional).' } }, ['url']),
      invoke: (a) => c.security.httpHeaders(a as never),
    },
    {
      name: 'security.password-exposure',
      description: "Check whether a password appears in known breaches via Have I Been Pwned's k-anonymity model — only the first 5 chars of the password's SHA-1 are sent upstream, never the password or full hash. POST { password } (hashed server-side) or { sha1 } (the 40-hex SHA-1, for zero-knowledge). Returns breached + count. 900M+ breach corpus; for signup/password-policy enforcement. Absence ≠ strength.",
      inputSchema: s('Password exposure', { password: { type: 'string', description: 'Password (hashed server-side; only a 5-char prefix leaves).' }, sha1: { type: 'string', description: '40-hex SHA-1 (client-side hashing = zero-knowledge).' } }, []),
      invoke: (a) => c.security.passwordExposure(a as never),
    },
    {
      name: 'security.ioc-reputation',
      description: 'Threat-intel reputation for an IOC — pass ioc as an IP, domain, URL, or file hash (auto-detected). Returns a malicious boolean + per-source breakdown: abuse.ch ThreatFox, URLhaus, MalwareBazaar, Feodo Tracker (botnet C2 IPs), Tor exit nodes, Spamhaus DROP. Live, hourly-rotating threat feeds an LLM cannot know — a ground-truth check for SOC alert triage. Absence ≠ safety.',
      inputSchema: s('IOC reputation', { ioc: { type: 'string', description: 'IP, domain, URL, or file hash.' } }, ['ioc']),
      invoke: (a) => c.security.iocReputation(a as never),
    },
    {
      name: 'security.cwe',
      description: 'Authoritative MITRE CWE (Common Weakness Enumeration) lookup. Pass id (CWE-79 or 79) for the canonical weakness — name, abstraction, description, ChildOf/ParentOf relationships, mapped CAPEC patterns (all with names) — or query for keyword search. Bundled (~970), zero external calls. Anti-hallucination: agents cite CWE IDs/names that must be exact. Pairs with security.cve + security.capec.',
      inputSchema: s('CWE lookup', { id: { type: 'string', description: 'CWE id (CWE-79 or 79).' }, query: { type: 'string' }, limit: { type: 'integer' } }, []),
      invoke: (a) => c.security.cwe(a as never),
    },
    {
      name: 'security.attack',
      description: 'Authoritative MITRE ATT&CK (Enterprise) technique lookup. Pass id (T1059 / T1059.001) for name, tactics, description, platforms, sub-technique parent, mitigations, detection — or query for keyword search. Bundled (~700 techniques), zero external calls. Agents cite T-numbers + tactics that must be exact. For threat modeling, detection engineering, report enrichment.',
      inputSchema: s('ATT&CK lookup', { id: { type: 'string', description: 'Technique id (T1059 / T1059.001).' }, query: { type: 'string' }, limit: { type: 'integer' } }, []),
      invoke: (a) => c.security.attack(a as never),
    },
    {
      name: 'security.capec',
      description: 'Authoritative MITRE CAPEC (Common Attack Pattern Enumeration) lookup. Pass id (CAPEC-66 or 66) for name, abstraction, description, likelihood, severity, mapped CWE weaknesses + related patterns (with names) — or query for keyword search. Bundled (~615), zero external calls. The attacker view; CAPEC↔CWE cross-links let an agent pivot between an attack and the weakness it exploits.',
      inputSchema: s('CAPEC lookup', { id: { type: 'string', description: 'CAPEC id (CAPEC-66 or 66).' }, query: { type: 'string' }, limit: { type: 'integer' } }, []),
      invoke: (a) => c.security.capec(a as never),
    },
    {
      name: 'security.exploit-availability',
      description: "Does public exploit code exist for a CVE, and where? Pass cve (CVE-2021-44228). Returns hasPublicExploit, count, hasMetasploitModule + hasVerifiedExploit flags, and Exploit-DB entries (description, type, platform, date, link). Bundled Exploit-DB index (~25k CVEs). The 'is it weaponized?' triage signal BEYOND security.cve's KEV (in-the-wild) + EPSS (probability). Absence != no exploit exists.",
      inputSchema: s('Exploit availability', { cve: { type: 'string', description: 'CVE id, e.g. CVE-2021-44228.' } }, ['cve']),
      invoke: (a) => c.security.exploitAvailability(a as never),
    },
    {
      name: 'net.rpki-validity',
      description: 'RPKI Route Origin Validation for a (BGP origin AS, prefix) pair — is this AS authorized to originate this prefix? Pass asn (AS15169) + prefix (8.8.8.0/24). Returns status (valid / invalid = possible hijack / unknown), a hijackSignal boolean, validating ROAs, and a description. Live RIR/RPKI data via RIPEstat (keyless). The core BGP-security check.',
      inputSchema: s('RPKI validity', { asn: { type: 'string', description: 'Origin AS (AS15169 or 15169).' }, prefix: { type: 'string', description: 'CIDR, e.g. 8.8.8.0/24.' } }, ['asn', 'prefix']),
      invoke: (a) => c.net.rpkiValidity(a as never),
    },
    {
      name: 'vehicle.fuel-economy',
      description: 'Official US EPA/DOE fuel-economy, fuel-cost, and emissions data for a vehicle by year + make + model. Returns one entry per powertrain configuration: MPG city/highway/combined (MPGe for EVs), CO2 grams/mile, annual fuel cost, annual petroleum barrels, EPA greenhouse-gas score, 5-year savings vs average, transmission, drivetrain, cylinders, displacement, fuel type, size class, EV range. Authoritative EPA figures; keyless, public-domain, 1984+.',
      inputSchema: s('Fuel economy', { year: { type: 'integer', description: '4-digit model year (1984+).' }, make: { type: 'string' }, model: { type: 'string' } }, ['year', 'make', 'model']),
      invoke: (a) => c.vehicle.fuelEconomy(a as never),
    },
    {
      name: 'vehicle.canadian-specs',
      description: 'Canadian-market vehicle dimensions/weights from NHTSA vPIC Canadian Vehicle Specifications. Pass year + make (required) + optional model. Returns labeled dimensions — overall length/width/height (cm), wheelbase, curb weight (kg), track width, interior room, weight distribution — plus the raw spec map. Keyless, public-domain, 1971+.',
      inputSchema: s('Canadian specs', { year: { type: 'integer', description: '4-digit year (1971+).' }, make: { type: 'string' }, model: { type: 'string', description: 'Optional model filter.' } }, ['year', 'make']),
      invoke: (a) => c.vehicle.canadianSpecs(a as never),
    },
    {
      name: 'security.cve-changes',
      description: "CVE change feed — the CVE records MODIFIED within a time window, so an agent can incrementally maintain a vulnerability view instead of re-scanning. Pass since (YYYY-MM-DD or ISO datetime); until defaults to now (window ≤120 days). Optional keyword/cpe filter. Each result: id, published + lastModified, vulnStatus, CVSS score/severity, description, and kevListed (now on the CISA Known-Exploited catalog). Newest first. Live NVD + CISA KEV, keyless. Pairs with security.cve for full detail.",
      inputSchema: s('CVE changes', { since: { type: 'string', description: 'Window start (YYYY-MM-DD or ISO).' }, until: { type: 'string', description: 'Window end (default now).' }, keyword: { type: 'string' }, cpe: { type: 'string' }, limit: { type: 'integer' } }, ['since']),
      invoke: (a) => c.security.cveChanges(a as never),
    },
    {
      name: 'finance.amortize',
      description: 'Compute a loan or mortgage amortization schedule. Pass principal, annualRatePct (e.g. 6.5), and term as termMonths or termYears; optional extraMonthly adds extra principal each month. Returns the fixed monthly payment, total interest, total paid, payoff month count, and the full month-by-month schedule (payment/principal/interest/balance). Deterministic, no external calls.',
      inputSchema: s('Loan amortization', { principal: { type: 'number', description: 'Loan principal (> 0).' }, annualRatePct: { type: 'number', description: 'Annual interest rate percent (0..100).' }, termMonths: { type: 'integer', description: 'Term in months (or use termYears).' }, termYears: { type: 'number', description: 'Term in years.' }, extraMonthly: { type: 'number', description: 'Optional extra monthly principal.' } }, ['principal', 'annualRatePct']),
      invoke: (a) => c.finance.amortize(a as never),
    },
    {
      name: 'email.validate',
      description: 'Validate an email address: RFC syntax validity, normalized address with local/domain, and flags for isDisposable (throwaway domain), isRoleAccount (info@/support@/…), isFreeProvider (gmail/outlook/…). With checkMx (default true) also reports hasMxRecords (domain MX presence, via DNS-over-HTTPS) + MX hosts. NOT a deliverability or mailbox-existence guarantee — signals only. For signup hygiene and lead scrubbing.',
      inputSchema: s('Email validate', { email: { type: 'string', description: 'Email address.' }, checkMx: { type: 'boolean', description: 'Look up MX presence (default true).' } }, ['email']),
      invoke: (a) => c.email.validate(a as never),
    },
    {
      name: 'travel.advisory',
      description: 'Current US State Department travel advisories. Omit country for the full list, or pass a country name (case-insensitive substring) for one. Returns the advisory level (1 Normal Precautions → 4 Do Not Travel) with label, a plain-text summary of reasons, the official link, and published date. Live from the official travel.state.gov RSS feed (public domain).',
      inputSchema: s('Travel advisory', { country: { type: 'string', description: 'Country name (substring). Omit for all.' } }, []),
      invoke: (a) => c.travel.advisory(a as never),
    },
    {
      name: 'travel.visa',
      description: "Visa requirement for a passport × destination. Pass passport and destination as ISO-3166 alpha-3, alpha-2, or country name. Returns the category — visa free (with visaFreeDays), visa on arrival, e-visa, eta, visa required, or no admission — plus a plain-language description. Community-maintained Passport Index dataset (MIT); informational, not official immigration advice.",
      inputSchema: s('Visa requirement', { passport: { type: 'string', description: 'Passport country (ISO alpha-3/alpha-2/name).' }, destination: { type: 'string', description: 'Destination country (ISO alpha-3/alpha-2/name).' } }, ['passport', 'destination']),
      invoke: (a) => c.travel.visa(a as never),
    },
    {
      name: 'medical.drug-price',
      description: "US drug pricing from CMS NADAC (National Average Drug Acquisition Cost), the benchmark per-unit acquisition cost CMS surveys weekly. Pass ndc (11-digit NDC) for an exact product or name (e.g. 'atorvastatin 10 mg') to search. Returns NDC, description, nadacPerUnit (USD), pricingUnit, effectiveDate, OTC flag, brand/generic classification — newest first. Real surveyed acquisition costs (not retail/insured price). Public domain; current-year dataset auto-resolved.",
      inputSchema: s('Drug price (NADAC)', { ndc: { type: 'string', description: '11-digit National Drug Code.' }, name: { type: 'string', description: 'Drug name/description keyword.' }, limit: { type: 'integer', description: 'Max rows (1..100).' } }, []),
      invoke: (a) => c.medical.drugPrice(a as never),
    },
    {
      name: 'domain.intel',
      description: 'Domain intelligence in one call — composes DNS (A/AAAA/MX/NS/TXT), WHOIS/RDAP (registrar, dates, status, nameservers, DNSSEC), and the live TLS certificate (issuer, validity, SANs, fingerprint) for a domain. Returns a summary (resolves, has MX, registrar, domain expiry, HTTPS valid, days to cert expiry) plus a found/error block per section. For domain due diligence, security recon, and expiry monitoring.',
      inputSchema: s('Domain intel', { domain: { type: 'string', description: 'Domain name (e.g. example.com).' } }, ['domain']),
      invoke: (a) => c.domain.intel(a as never),
    },
    {
      name: 'business.kyb-360',
      description: 'Full Know-Your-Business (KYB) intelligence dossier on a company in one call. Pass name (company name); optional state narrows federal awards, optional ticker pulls SEC EDGAR identity + filings. Fans out to SAM registration, SAM exclusions (debarment), OFAC sanctions, GLEIF LEI, USAspending awards, FARA foreign-agent registration, and USPTO trademarks owned. Returns riskFlags + a cleared boolean (debarment+sanctions), a summary of every signal, and a found/error block per source. For vendor onboarding, KYB/AML, and procurement due diligence. Probabilistic name matching — verify with a hard identifier before acting.',
      inputSchema: s('KYB-360 dossier', { name: { type: 'string', description: 'Company name.' }, state: { type: 'string', description: 'Optional US state (narrows awards).' }, ticker: { type: 'string', description: 'Optional ticker → SEC EDGAR.' }, threshold: { type: 'number', description: 'Sanctions match threshold 0..1 (default 0.85).' }, limit: { type: 'integer', description: 'Max rows per source (1..20).' } }, ['name']),
      invoke: (a) => c.business.kyb360(a as never),
    },
    {
      name: 'edi.ack',
      description: 'Generate the ANSI X12 997 Functional Acknowledgment for a received EDI interchange. POST edi with the raw inbound interchange (the 850/810/856 you received); returns the ready-to-send 997 in meta.ack — sender/receiver mirrored, delimiters echoed, one ST(997) per inbound functional group with correct AK1/AK2/AK5 and AK9 included/received/accepted counts. status controls the response: A=Accepted (default), E=Accepted with errors, P=Partial, R=Rejected, M/W/X=auth/security rejection. Deterministic, no external calls — the reply leg of EDI.',
      inputSchema: s('X12 997 generate', { edi: { type: 'string', description: 'Raw inbound X12 interchange text (begins with ISA).' }, status: { type: 'string', enum: ['A', 'E', 'P', 'R', 'M', 'W', 'X'], description: 'Ack status. Default A (Accepted).' }, controlNumber: { type: 'string', description: 'Control-number seed (digits). Default time-derived.' } }, ['edi']),
      invoke: (a) => c.edi.ack(a as never),
    },
    {
      name: 'edi.generate',
      description: 'Generate an outbound ANSI X12 EDI document from JSON. POST type (850 = Purchase Order, 810 = Invoice) + senderId, receiverId, documentNumber (PO#/invoice#), optional date, parties (N1 role+name), items (quantity, uom, price, productId); for 810 optionally poNumber + total. Returns the full X12 interchange in meta.edi (correct ISA/GS/ST…SE/GE/IEA envelope). Deterministic — the outbound complement to edi.parse + edi.ack.',
      inputSchema: s('X12 generate', { type: { type: 'string', enum: ['850', '810'], description: '850 PO or 810 invoice.' }, senderId: { type: 'string', description: 'Sender id.' }, receiverId: { type: 'string', description: 'Receiver id.' }, documentNumber: { type: 'string', description: 'PO# or invoice#.' }, poNumber: { type: 'string', description: 'For 810: the PO invoiced.' }, date: { type: 'string', description: 'YYYYMMDD (default today).' }, parties: { type: 'array', description: 'N1 loops (role+name).', items: { type: 'object' } }, items: { type: 'array', description: 'Line items.', items: { type: 'object' } }, total: { type: 'number', description: 'For 810: invoice total USD.' } }, ['type', 'senderId', 'receiverId', 'documentNumber', 'items']),
      invoke: (a) => c.edi.generate(a as never),
    },
    {
      name: 'factcheck.search',
      description: 'Search the global corpus of published fact-checks (ClaimReview) by claim text. Returns matching claims with the claimant, claim date, and each review\'s verdict (textualRating like "False"/"Misleading"/"True"), publisher (PolitiFact, Snopes, FactCheck.org, Reuters, AFP…), review URL and date. Covers all topics — politics, health, science, viral/misinformation. Optional language, maxAgeDays, and publisher-site filters. Check whether a claim was fact-checked + how it was rated instead of asserting from training.',
      inputSchema: s('Fact-check search', { query: { type: 'string', description: 'Claim text to search for.' }, language: { type: 'string', description: 'BCP-47 language code (e.g. en).' }, maxAgeDays: { type: 'integer', description: 'Only reviews newer than this many days.' }, publisher: { type: 'string', description: 'Filter to a publisher site (e.g. factcheck.org).' }, limit: { type: 'integer', description: 'Max claims (1-50, default 10).' } }, ['query']),
      invoke: (a) => c.factcheck.search(a as never),
    },
    {
      name: 'aviation.metar',
      description: 'Current aviation weather observation (METAR) for airports. Pass ids (comma-separated ICAO, e.g. KATL,EGLL). Returns raw METAR + decoded flight category, temp/dewpoint, wind, visibility, altimeter, clouds. Source: NOAA Aviation Weather Center (keyless).',
      inputSchema: s('METAR', { ids: { type: 'string', description: 'Comma-separated ICAO ids.' } }, ['ids']),
      invoke: (a) => c.aviation.metar(a as never),
    },
    {
      name: 'aviation.taf',
      description: 'Terminal Aerodrome Forecast (TAF) for airports — the official ~24–30h aviation forecast. Pass ids (comma-separated ICAO). Returns raw TAF + issue time. Source: NOAA Aviation Weather Center (keyless).',
      inputSchema: s('TAF', { ids: { type: 'string', description: 'Comma-separated ICAO ids.' } }, ['ids']),
      invoke: (a) => c.aviation.taf(a as never),
    },
    {
      name: 'aviation.accidents',
      description: 'Search NTSB civil aviation accident/incident history (CAROL database). Filter by registration (N-number), state, make, model, city, and/or date range (dateFrom/dateTo YYYY-MM-DD). Returns events with date, location, aircraft, injury severity/counts, flight phase, and an NTSB report URL. Free, US public-domain. At least one filter required.',
      inputSchema: s('NTSB accidents', {
        registration: { type: 'string', description: 'Aircraft registration / N-number (partial).' },
        state: { type: 'string', description: 'US state (2-letter or full name).' },
        make: { type: 'string', description: 'Aircraft make, e.g. Cessna.' },
        model: { type: 'string', description: 'Aircraft model, e.g. 172.' },
        city: { type: 'string', description: 'Event city (partial).' },
        dateFrom: { type: 'string', description: 'Earliest event date YYYY-MM-DD.' },
        dateTo: { type: 'string', description: 'Latest event date YYYY-MM-DD.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      }, []),
      invoke: (a) => c.aviation.accidents(a as never),
    },
    {
      name: 'health.disease-surveillance',
      description: 'Current US disease surveillance from the CDC (NNDSS weekly notifiable-disease counts, MMWR 2022→current). Filter by condition (substring), location (state/region/territory/national), and/or year; weeks/limit page results. Returns current-week count, prior-52-week max, and cumulative YTD per condition+location+week. Free, keyless CDC data. At least one of condition/location required.',
      inputSchema: s('CDC disease surveillance', {
        condition: { type: 'string', description: 'Disease/condition substring, e.g. measles.' },
        location: { type: 'string', description: 'Reporting area: state, region, territory, or "U.S. Residents".' },
        year: { type: 'integer', minimum: 2022, description: 'MMWR year.' },
        weeks: { type: 'integer', minimum: 1, maximum: 520, description: 'Most-recent N weeks.' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
      }, []),
      invoke: (a) => c.health.diseaseSurveillance(a as never),
    },
    {
      name: 'dev.rfc',
      description: 'Look up an IETF RFC by number. Returns status (e.g. INTERNET STANDARD/PROPOSED STANDARD), title, authors, date, stream, DOI, and the obsoletes/obsoleted-by/updates/updated-by relationship chain. Bundled RFC index (~9.8k RFCs); anti-hallucination on RFC status/relationships.',
      inputSchema: s('RFC lookup', {
        number: { type: 'string', description: 'RFC number, e.g. RFC2616 or 2616.' },
      }, ['number']),
      invoke: (a) => c.dev.rfc(a as never),
    },
    {
      name: 'dev.preflight',
      description: "Check whether a shell command is runnable before running it — a pre-execution gate for agent-generated commands. POST command (curl/wget/httpie or anything with a URL). Parses out method, target URL, and headers and returns a structured verdict: verdict ('runnable'/'invalid'), runnable boolean, and a checks breakdown (hasTarget, urlValid, schemeOk, hostPresent, methodValid, privateTarget). Default is STATIC + deterministic (no network) — a command with no URL is invalid. Pass probe=true to also run a guarded HEAD against the target and report dnsResolves/reachable/tlsValid/httpStatus. Private/loopback targets are refused (SSRF-safe).",
      inputSchema: s('Command preflight', { command: { type: 'string', description: 'Shell command to check.' }, probe: { type: 'boolean', description: 'Also do a live guarded HEAD probe (default false).' } }, ['command']),
      invoke: (a) => c.dev.preflight(a as never),
    },
    {
      name: 'water.gauge',
      description: 'Real-time US river/stream conditions from a USGS monitoring site. Pass site (USGS site number, e.g. 01646500). Returns latest streamflow, gage height, water temp + site name/location. Source: USGS NWIS (keyless).',
      inputSchema: s('USGS water gauge', { site: { type: 'string', description: 'USGS site number.' } }, ['site']),
      invoke: (a) => c.water.gauge(a as never),
    },
    {
      name: 'crypto.defi',
      description: 'DeFi total-value-locked (TVL) via DefiLlama. No params → top protocols by TVL (name, category, TVL, 1d/7d change, chains) + total DeFi TVL. protocol=<slug> (e.g. lido, aave, uniswap) → one protocol; chain=<name> (e.g. ethereum, solana) → that chain\'s TVL. Distinct from crypto.markets (spot prices) — protocol/chain capital locked. Free, keyless.',
      inputSchema: s('DeFi TVL', { protocol: { type: 'string', description: 'Protocol slug (e.g. lido). Omit for top list.' }, chain: { type: 'string', description: 'Chain name (e.g. ethereum) for chain TVL.' }, limit: { type: 'integer', description: 'Top-list size (1–100, default 20).' } }),
      invoke: (a) => c.crypto.defi(a as never),
    },
    {
      name: 'crypto.contract',
      description: 'Decode an EVM smart contract. Pass chain (ethereum, base, polygon, arbitrum, optimism, bsc, avalanche) + address → whether source-verified (Sourcify), name/compiler/language, proxy + implementation, and human-readable function/event signatures from the ABI. Optional selector (0x 4-byte) → decode what it calls (from the contract ABI if verified, else the 4byte directory). Pairs with crypto.tx. Free, keyless.',
      inputSchema: s('EVM contract decode', { chain: { type: 'string', description: 'EVM chain (ethereum, base, …).' }, address: { type: 'string', description: '0x contract address.' }, selector: { type: 'string', description: 'Optional 0x 4-byte selector to decode.' } }, ['chain', 'address']),
      invoke: (a) => c.crypto.contract(a as never),
    },
    {
      name: 'crypto.fear-greed',
      description: 'Crypto Fear & Greed Index — 0–100 market sentiment (0 = Extreme Fear, 100 = Extreme Greed), updated daily, with classification. Pass limit (1–90) for recent history. Contrarian sentiment signal. Source: alternative.me.',
      inputSchema: s('Crypto fear & greed', { limit: { type: 'integer', description: 'Recent daily readings (1–90, default 1).' } }),
      invoke: (a) => c.crypto.fearGreed(a as never),
    },
    {
      name: 'crypto.markets',
      description: 'Top cryptocurrencies by market cap with live price, market cap, 24h volume, and 24h + 7d % change. Pass limit (1–100, default 20). Source: CoinGecko. Single token = crypto.token-price; market overview = crypto.global.',
      inputSchema: s('Crypto markets', { limit: { type: 'integer', description: 'Top N coins (1–100, default 20).' } }),
      invoke: (a) => c.crypto.markets(a as never),
    },
    {
      name: 'crypto.global',
      description: 'Whole-crypto-market overview: total market cap, 24h volume, 24h change, BTC + ETH dominance, active-coin count. Source: CoinGecko.',
      inputSchema: s('Crypto global', {}),
      invoke: (a) => c.crypto.global(a as never),
    },
    {
      name: 'crypto.trending',
      description: 'Most-searched trending cryptocurrencies right now (24h), with symbol, name, market-cap rank, price. Attention signal. Source: CoinGecko.',
      inputSchema: s('Crypto trending', {}),
      invoke: (a) => c.crypto.trending(a as never),
    },
    {
      name: 'geo.elevation',
      description: 'Ground elevation above sea level (meters + feet) for any coordinate on Earth. Pass lat + lon. ~90m DEM. Source: Open-Meteo (keyless).',
      inputSchema: s('Elevation', { lat: { type: 'number' }, lon: { type: 'number' } }, ['lat', 'lon']),
      invoke: (a) => c.geo.elevation(a as never),
    },
    {
      name: 'trade.tariff',
      description:
        'Look up or search the US Harmonized Tariff Schedule (HTS / HS codes). Pass code for an exact HTS number (returns the line + 10-digit stat suffixes with duty rates), or query for free-text → ranked candidate HS codes by hierarchical heading. ~29.6k public-domain USITC lines. The deterministic backbone for tariff classification.',
      inputSchema: s('Tariff lookup input', {
        code: { type: 'string', description: 'Exact HTS number (dots optional).' },
        query: { type: 'string', description: 'Free-text product description.' },
        limit: { type: 'integer', description: '1-50, default 20.' },
      }),
      invoke: (a) => c.trade.tariff(a as never),
    },
    {
      name: 'trade.locode',
      description:
        "Look up or search UN/LOCODE — the UN Code for Trade and Transport Locations (~116k locations, all countries). Pass locode for an exact code (e.g. USNYC), or query to search names with optional country (ISO alpha-2) and function (port, rail, road, airport, postal, multimodal, fixed, border) filters. Returns name, subdivision, transport functions, status, IATA code, coordinates. The standard location identifier in shipping, EDI, and customs documents.",
      inputSchema: s('LOCODE lookup input', {
        locode: { type: 'string', description: "Exact UN/LOCODE, e.g. USNYC or 'US NYC'." },
        query: { type: 'string', description: 'Location name to search.' },
        country: { type: 'string', description: 'ISO 3166 alpha-2 filter (query mode).' },
        function: { type: 'string', description: 'port | rail | road | airport | postal | multimodal | fixed | border.' },
        limit: { type: 'integer', description: '1-50, default 10.' },
      }),
      invoke: (a) => c.trade.locode(a as never),
    },
    {
      name: 'trade.flows',
      description:
        "Annual international merchandise-trade flows from UN Comtrade (HS classification). reporter = country whose trade you want (ISO-2/ISO-3 'US'/'USA', UN M49 number, or 'World'); optional partner (default World); year (YYYY); flow (export|import); commodity = 'TOTAL' (default), a specific HS code ('27','8703'), or 'AG2'/'AG4'/'AG6' for a top-commodity breakdown. Returns trade value (USD), net weight, quantity, HS commodity, sorted by value.",
      inputSchema: s('UN Comtrade trade flows', {
        reporter: { type: 'string', description: "Reporting country: ISO-2/ISO-3, UN M49 number, or 'World'." },
        partner: { type: 'string', description: 'Partner country (same formats). Default World.' },
        year: { type: 'string', description: 'Calendar year YYYY (annual data lags ~6-12 months).' },
        flow: { type: 'string', enum: ['export', 'import'], description: 'Direction from reporter. Default export.' },
        commodity: { type: 'string', description: "'TOTAL', an HS code, or 'AG2'/'AG4'/'AG6'. Default TOTAL." },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      }),
      invoke: (a) => c.trade.flows(a as never),
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

    {
      name: 'health.provider-profile',
      description: 'Provider 360 by NPI — merges NPPES identity (name, specialty, address, licenses) + CMS Open Payments (industry payments) + CMS Medicare billing in one call. Each section reports found/error independently. KYC, healthcare-fraud, provider due diligence.',
      inputSchema: s('Provider profile', {
        npi: { type: 'string', description: '10-digit National Provider Identifier.' },
      }, ['npi']),
      invoke: (a) => c.health.providerProfile(a as never),
    },
    {
      name: 'vehicle.profile',
      description: 'Vehicle 360 by VIN — decodes the VIN (make/model/year/trim/engine, NHTSA vPIC) then returns THAT vehicle\'s open safety recalls and owner complaints, keyed to the decoded make/model/year. Used-car due diligence, fleet safety, insurance.',
      inputSchema: s('Vehicle profile', {
        vin: { type: 'string', description: '17-character Vehicle Identification Number.' },
        modelYear: { type: 'integer', minimum: 1949, maximum: 2099, description: 'Optional — disambiguates older VINs.' },
      }, ['vin']),
      invoke: (a) => c.vehicle.profile(a as never),
    },
    {
      name: 'finance.company-profile',
      description: 'Company 360 by ticker — merges recent SEC filings + curated XBRL fundamentals (revenue, net income, EPS, assets) + recent insider (Form 4) transactions in one call. Equity research, due diligence, monitoring.',
      inputSchema: s('Company profile', {
        ticker: { type: 'string', description: 'US-listed ticker symbol.' },
        formType: { type: 'string', description: 'Optional filings filter, e.g. "10-K".' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, ['ticker']),
      invoke: (a) => c.finance.companyProfile(a as never),
    },
    {
      name: 'space.body',
      description: 'Asteroid/comet physical + orbital parameters from NASA JPL Small-Body Database by designation, number, or name (e.g. "433 Eros", "1P/Halley", "2024 YR4"). NEO/PHA flags, diameter, albedo, orbit class, eccentricity, period, Earth MOID.',
      inputSchema: s('Small body', { q: { type: 'string', description: 'Asteroid/comet designation, number, or name.' } }, ['q']),
      invoke: (a) => c.space.body(a as never),
    },
    {
      name: 'space.close-approaches',
      description: 'Near-Earth asteroid/comet close approaches to Earth in a date window + max distance (NASA JPL CAD). Returns designation, date, distance (AU + lunar distances), relative velocity, magnitude. Sorted nearest-first.',
      inputSchema: s('Close approaches', {
        dateMin: { type: 'string', format: 'date' }, dateMax: { type: 'string', format: 'date' },
        distMaxAu: { type: 'number', minimum: 0.0001, maximum: 1, default: 0.05 },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      }),
      invoke: (a) => c.space.closeApproaches(a as never),
    },
    {
      name: 'space.satellite',
      description: 'Current position of any cataloged satellite by NORAD number (e.g. 25544=ISS) via fresh Celestrak elements + SGP4. Returns sub-point lat/lon/altitude + speed; pass observer lat/lon for azimuth/elevation/range look angles.',
      inputSchema: s('Satellite position', {
        noradId: { type: 'integer', minimum: 1, maximum: 999999 },
        lat: { type: 'number', minimum: -90, maximum: 90 }, lon: { type: 'number', minimum: -180, maximum: 180 },
        altKm: { type: 'number' }, at: { type: 'string', format: 'date-time' },
      }, ['noradId']),
      invoke: (a) => c.space.satellite(a as never),
    },
    {
      name: 'space.satellites',
      description: 'Search the catalog of ~69k cataloged Earth-orbiting objects (CelesTrak SATCAT). Filter by name (q, e.g. "starlink"), owner/launching country (owner = US/PRC/CIS… or a name), object type (payload|rocket body|debris|unknown), launch-year range, intlDesignator prefix, on-orbit vs decayed, or exact noradId. Each row has NORAD id, name, owner+country, launch/decay dates, and orbital params. The envelope total is the full count matching the filter — so onOrbit=true&type=payload answers "how many active satellites".',
      inputSchema: s('Satellite catalog search', {
        q: { type: 'string', description: 'Name substring (e.g. "starlink").' },
        owner: { type: 'string', description: 'Owner code (US, PRC, CIS, ESA…) or country name.' },
        type: { type: 'string', description: 'payload | rocket body | debris | unknown' },
        noradId: { type: 'integer', minimum: 1, maximum: 999999 },
        intlDesignator: { type: 'string', description: 'COSPAR designator prefix (e.g. "2024-").' },
        launchYearFrom: { type: 'integer' }, launchYearTo: { type: 'integer' },
        onOrbit: { type: 'string', enum: ['true', 'false'] },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0 },
      }),
      invoke: (a) => c.space.satellites(a as never),
    },
    {
      name: 'space.launches',
      description: 'Upcoming or recent orbital rocket launches (Launch Library 2). when=upcoming|previous, optional search by rocket/provider/mission. Returns name, status, launch time + window, provider, rocket, pad, mission, webcast.',
      inputSchema: s('Launches', {
        when: { type: 'string', enum: ['upcoming', 'previous'], default: 'upcoming' },
        search: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.space.launches(a as never),
    },
    {
      name: 'space.sky-tonight',
      description: 'Observer-local sky almanac for a lat/lon + time (computed, no upstream): sun & moon rise/set + current alt/az, moon phase + illumination + next quarter, and all 7 naked-eye planets (alt/az, RA/dec, magnitude, above-horizon). Stargazing, astrophotography.',
      inputSchema: s('Sky tonight', {
        lat: { type: 'number', minimum: -90, maximum: 90 }, lon: { type: 'number', minimum: -180, maximum: 180 },
        altitudeM: { type: 'number' }, at: { type: 'string', format: 'date-time' },
      }, ['lat', 'lon']),
      invoke: (a) => c.space.skyTonight(a as never),
    },
    {
      name: 'space.exoplanet',
      description: 'Confirmed exoplanets from the NASA Exoplanet Archive (~6k, weekly). Filter by name, hostStar, discoveryYear, or method. Returns orbital period, radius/mass (Earth units), equilibrium temp, host-star params, distance (parsecs + light-years).',
      inputSchema: s('Exoplanet', {
        name: { type: 'string' }, hostStar: { type: 'string' },
        discoveryYear: { type: 'integer', minimum: 1989, maximum: 2030 }, method: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      }),
      invoke: (a) => c.space.exoplanet(a as never),
    },
    {
      name: 'bio.species',
      description: 'Resolve any organism (scientific or common name) to the GBIF taxonomic backbone: accepted name, full lineage (kingdom→species), vernacular names, global occurrence count, GBIF link. Fuzzy-matches misspellings.',
      inputSchema: s('Species', { name: { type: 'string', description: 'Scientific or common species name.' } }, ['name']),
      invoke: (a) => c.bio.species(a as never),
    },
    {
      name: 'bio.gene',
      description: 'Gene lookup by symbol + organism (taxid, default 9606=human): NCBI Gene identity (description, chromosome, map location, aliases, RefSeq summary) joined with UniProt protein (accession, name, length, function).',
      inputSchema: s('Gene', {
        symbol: { type: 'string', description: 'Official gene symbol, e.g. "TP53".' },
        taxid: { type: 'integer', default: 9606 },
      }, ['symbol']),
      invoke: (a) => c.bio.gene(a as never),
    },
    {
      name: 'space.skywatch',
      description: 'Synthesis — what is notable in YOUR sky right now (lat/lon): the live almanac (sun, moon phase, planets above your horizon), near-Earth asteroid close approaches this week, and the ISS (position + whether it is above your horizon now). One call, three sources, per-section found/error.',
      inputSchema: s('Skywatch', {
        lat: { type: 'number', minimum: -90, maximum: 90 }, lon: { type: 'number', minimum: -180, maximum: 180 },
        altitudeM: { type: 'number' },
      }, ['lat', 'lon']),
      invoke: (a) => c.space.skywatch(a as never),
    },
    {
      name: 'space.system',
      description: 'Synthesis — profile a confirmed exoplanetary system by host-star name (e.g. "TRAPPIST-1"). Groups the star\'s planets, summarizes the host star, and COMPUTES the habitable zone (inner/outer AU from stellar luminosity), flagging which planets fall in it.',
      inputSchema: s('Exoplanet system', { hostStar: { type: 'string', description: 'Host star name.' } }, ['hostStar']),
      invoke: (a) => c.space.system(a as never),
    },
    {
      name: 'space.observe',
      description: 'Where is an asteroid/comet in the sky and can you see it? Propagates JPL orbital elements (validated vs Horizons to <0.1 arcmin) to give geocentric RA/Dec, constellation, distance, phase angle, and apparent magnitude. With observer lat/lon: altitude/azimuth, visible-now flag, and the best dark-sky viewing window in the next 24h.',
      inputSchema: s('Observe body', {
        body: { type: 'string', description: 'Asteroid/comet designation, number, or name.' },
        lat: { type: 'number', minimum: -90, maximum: 90 }, lon: { type: 'number', minimum: -180, maximum: 180 },
        altKm: { type: 'number' }, at: { type: 'string', format: 'date-time' },
      }, ['body']),
      invoke: (a) => c.space.observe(a as never),
    },
    {
      name: 'bio.protein',
      description: 'Full UniProtKB protein entry by accession (e.g. P04637): names, gene, organism, sequence length + molecular weight, function, subcellular locations, GO terms, PDB structures, keywords. Protein-centric sibling to bio.gene.',
      inputSchema: s('Protein', { accession: { type: 'string', description: 'UniProtKB accession, e.g. "P04637".' } }, ['accession']),
      invoke: (a) => c.bio.protein(a as never),
    },
    {
      name: 'aircraft.profile',
      description: 'Identify a US-registered aircraft by tail (N-number) or icao24, AND screen its owner + operator against OFAC sanctions in one call. Returns the aircraft record + per-name sanctions screen with confidence + flagged. OSINT / asset-tracing / sanctions-evasion. Name-based screening is probabilistic.',
      inputSchema: s('Aircraft profile', {
        tail: { type: 'string', description: 'Tail / N-number.' },
        icao24: { type: 'string', description: '24-bit Mode-S hex.' },
        threshold: { type: 'number', minimum: 0.1, maximum: 1, default: 0.5 },
      }),
      invoke: (a) => c.aircraft.profile(a as never),
    },
    {
      name: 'business.entity-screen',
      description: 'KYC in one call: look up a business in a US state registry (NY/CO/CT) AND screen it + its registered agent against OFAC sanctions. Returns matched entities each with a sanctions screen (confidence + flagged). Counterparty due-diligence, AML. Probabilistic name match.',
      inputSchema: s('Entity screen', {
        state: { type: 'string', enum: ['NY', 'CO', 'CT'] },
        name: { type: 'string' }, entityId: { type: 'string' },
        threshold: { type: 'number', minimum: 0.1, maximum: 1, default: 0.5 },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
      }, ['state']),
      invoke: (a) => c.business.entityScreen(a as never),
    },
    {
      name: 'crypto.ens-resolve',
      description: 'Resolve ENS live on Ethereum mainnet: pass an ENS name (e.g. "vitalik.eth") to get its address, or a 0x address to get its primary ENS name (reverse). Also returns avatar, email, url, twitter, github, description text records. On-chain lookup agents can\'t do from a sandbox.',
      inputSchema: s('ENS resolve', { query: { type: 'string', description: 'ENS name or 0x address.' } }, ['query']),
      invoke: (a) => c.crypto.ensResolve(a as never),
    },
    {
      name: 'html.to-markdown',
      description: 'Convert raw HTML you already have into clean reading markdown (no URL fetch). POST { html }. Strips scripts/nav/ads, extracts main content, preserves headings/links/lists. For fetching a live URL use url.clean instead.',
      inputSchema: s('HTML to markdown', { html: { type: 'string', description: 'Raw HTML (<=2MB).' } }, ['html']),
      invoke: (a) => c.html.toMarkdown(a as never),
    },
    {
      name: 'tls.cert-info',
      description: 'Open a live TLS connection to a host and return its certificate: protocol + cipher, chain validity, leaf subject + issuer, valid-from/to, days-until-expiry, serial, SHA-256 fingerprint, SANs, chain length. Active probe; SSRF-guarded. Cert-expiry monitoring, TLS audits.',
      inputSchema: s('TLS cert info', {
        host: { type: 'string', description: 'Hostname or IP.' },
        port: { type: 'integer', minimum: 1, maximum: 65535, default: 443 },
      }, ['host']),
      invoke: (a) => c.tls.certInfo(a as never),
    },
    // ── Law ──────────────────────────────────────────────────────────
    {
      name: 'law.docket-search',
      description: 'Search US federal court dockets (civil + criminal) from the RECAP/PACER archive. q full-text (case/party name) with optional court id + filed date range, or exact docketNumber. Returns case name, court, docket number, dates, judge, docket URL.',
      inputSchema: s('Docket search', {
        q: { type: 'string', description: 'Case name / party full-text query.' },
        court: { type: 'string', description: 'CourtListener court id, e.g. "cand", "nysd", "ca9".' },
        docketNumber: { type: 'string', description: 'Exact docket number, e.g. "1:22-cr-00673".' },
        filedAfter: { type: 'string', format: 'date' },
        filedBefore: { type: 'string', format: 'date' },
        page: { type: 'integer', minimum: 1, default: 1 },
      }),
      invoke: (a) => c.law.docketSearch(a as never),
    },
    {
      name: 'gov.inmate-locator',
      description: 'Federal Bureau of Prisons inmate search, 1982-present (current + released). By lastName (+ firstName/age/sex/race) or exact BOP register number. Returns name, register number, facility, projected/actual release dates.',
      inputSchema: s('Inmate locator', {
        lastName: { type: 'string' },
        firstName: { type: 'string' },
        middleName: { type: 'string' },
        inmateNumber: { type: 'string', description: 'BOP register number, e.g. "61727-054".' },
        age: { type: 'integer', minimum: 18, maximum: 120 },
        sex: { type: 'string', enum: ['Male', 'Female'] },
        race: { type: 'string' },
      }),
      invoke: (a) => c.gov.inmateLocator(a as never),
    },
    {
      name: 'gov.lobbying-filings',
      description: 'US federal lobbying disclosures (Senate LDA) — who lobbies for whom, on what issues, for how much. Filter by registrant (firm), client, lobbyist, year, period, type. Returns income/expenses, registrant + client, issues, document URL.',
      inputSchema: s('Lobbying filings', {
        registrant: { type: 'string', description: 'Lobbying firm name (partial).' },
        client: { type: 'string', description: 'Client organization name (partial).' },
        lobbyist: { type: 'string' },
        year: { type: 'integer', minimum: 1999, maximum: 2030 },
        period: { type: 'string', enum: ['first_quarter', 'second_quarter', 'third_quarter', 'fourth_quarter', 'mid_year', 'year_end'] },
        type: { type: 'string', description: 'Filing type code, e.g. RR, Q1.' },
        page: { type: 'integer', minimum: 1, default: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 25, default: 10 },
      }),
      invoke: (a) => c.gov.lobbyingFilings(a as never),
    },
    {
      name: 'gov.congress-filings',
      description: "Track US House members' financial-disclosure filings incl. Periodic Transaction Reports (PTRs — the STOCK Act stock-trade disclosures). Defaults to PTRs; type=annual|candidate|amendment|all for others. Filter by member name (q), state, year, or filing-date range. Returns member, state+district, filing type+label, filing date, and a direct link to the source document. The envelope total answers 'how many PTRs'. 2008→present, refreshed daily. Trades are disclosed up to 45 days after they happen — current-to-the-filing, not real-time.",
      inputSchema: s('Congress filings', {
        q: { type: 'string', description: 'Member name substring (e.g. "Pelosi").' },
        state: { type: 'string', description: '2-letter state.' },
        type: { type: 'string', description: 'ptr (default) | annual | candidate | amendment | all.' },
        chamber: { type: 'string', enum: ['house', 'senate'] },
        year: { type: 'integer', minimum: 2008, maximum: 2100 },
        dateFrom: { type: 'string', description: 'Filing date >= YYYY-MM-DD.' },
        dateTo: { type: 'string', description: 'Filing date <= YYYY-MM-DD.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0 },
      }),
      invoke: (a) => c.gov.congressFilings(a as never),
    },
    {
      name: 'gov.congress-trades',
      description: "Search individual US Congress member stock trades parsed from STOCK Act PTRs into clean rows. Filter by member (q), ticker (e.g. NVDA), type (purchase|sale|exchange), state, chamber, or transaction-date range. Each trade: member + state/district, owner (self/spouse/joint), ticker + asset, buy/sell, the disclosed dollar RANGE (amountMin/amountMax — ranges, not exact), transaction + disclosure dates, days-to-disclose, and a link to the source filing. envelope total answers 'how many bought NVDA'. Amounts are ranges; trades disclosed up to 45 days after they happen. Coverage: US House e-filed now, expanding to scanned + Senate.",
      inputSchema: s('Congress trades', {
        q: { type: 'string', description: 'Member name substring.' },
        ticker: { type: 'string', description: 'Stock symbol (e.g. NVDA).' },
        type: { type: 'string', enum: ['purchase', 'sale', 'exchange'] },
        chamber: { type: 'string', enum: ['house', 'senate'] },
        state: { type: 'string', description: '2-letter state.' },
        dateFrom: { type: 'string', description: 'Transaction date >= YYYY-MM-DD.' },
        dateTo: { type: 'string', description: 'Transaction date <= YYYY-MM-DD.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0 },
      }),
      invoke: (a) => c.gov.congressTrades(a as never),
    },
    {
      name: 'health.mortality-stats',
      description: 'US mortality statistics (CDC NCHS). dataset=leading-causes: annual deaths + age-adjusted rate by state and top-10 cause, 1999-2017. dataset=weekly-counts: provisional weekly deaths by jurisdiction + cause, 2020-2023.',
      inputSchema: s('Mortality stats', {
        dataset: { type: 'string', enum: ['leading-causes', 'weekly-counts'], default: 'leading-causes' },
        state: { type: 'string', description: 'Full state name ("California") or "United States".' },
        year: { type: 'integer', minimum: 1999, maximum: 2023 },
        cause: { type: 'string', description: 'leading-causes only, e.g. "Heart disease", "Suicide".' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.health.mortalityStats(a as never),
    },
    {
      name: 'health.hospital-quality',
      description: 'CMS Care Compare hospital quality ratings (~5,300 Medicare-certified US hospitals): overall star rating + mortality/safety/readmission/patient-experience measure summaries. By facilityId, or state/city/name filters.',
      inputSchema: s('Hospital quality', {
        facilityId: { type: 'string', description: 'CMS certification number, e.g. "030103".' },
        state: { type: 'string' },
        city: { type: 'string' },
        name: { type: 'string', description: 'Hospital name, partial match.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.health.hospitalQuality(a as never),
    },
    {
      name: 'health.medicare-provider',
      description: 'Medicare utilization + payments by provider (CMS annual dataset): beneficiary counts, total services, submitted charges, Medicare payment amounts per NPI. By npi, or lastName + state. Pairs with health.open-payments.',
      inputSchema: s('Medicare provider', {
        npi: { type: 'string', description: '10-digit provider NPI.' },
        lastName: { type: 'string', description: 'Exact last/organization name as published by CMS.' },
        state: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.health.medicareProvider(a as never),
    },
    {
      name: 'business.sos-search',
      description: 'State Secretary-of-State business registry search, normalized across states (currently NY, CO). By name (partial) or exact entityId. Returns entity id, name, type, status, jurisdiction, formation date, address, registered agent.',
      inputSchema: s('SoS business search', {
        state: { type: 'string', enum: ['NY', 'CO', 'CT'] },
        name: { type: 'string', description: 'Entity name, partial match.' },
        entityId: { type: 'string', description: 'Exact state entity id.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }, ['state']),
      invoke: (a) => c.business.sosSearch(a as never),
    },
    {
      name: 'business.entity-profile',
      description: 'Full business-entity dossier from a state registry — master record plus officers/principals, registered agent (name, phone, email, address), and filing history. v1 state: CT (Connecticut). Resolve by entityId (registry record id), accountNumber, or name (partial; most recent registration wins). Returns status, type, registration date, mailing address, minority/woman/veteran/disability/LGBTQI ownership flags, officers, registered agent, and recent filings. KYB / counterparty due-diligence; official state open-data portal.',
      inputSchema: s('CT business entity profile', {
        state: { type: 'string', enum: ['CT'], description: 'State registry (v1: CT only).' },
        entityId: { type: 'string', description: 'State registry record id (canonical join key).' },
        accountNumber: { type: 'string', description: 'State business account number.' },
        name: { type: 'string', description: 'Entity name, partial match.' },
        filingsLimit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, ['state']),
      invoke: (a) => c.business.entityProfile(a as never),
    },
    {
      name: 'business.naics',
      description:
        'NAICS 2022 industry classification codes (US Census, public domain). Pass code for an exact NAICS code (2-6 digits, or a sector range like 31-33) → official title, hierarchy path, full description, activity index terms, and direct child codes. Or pass query for free-text search over titles + the official ~20k-entry activity index → ranked candidate codes, optionally filtered by level (2=sector … 6=national industry). Ground truth for industry coding in KYC, registrations, and ERP setup.',
      inputSchema: s('NAICS lookup/search', {
        code: { type: 'string', description: 'Exact NAICS code, 2-6 digits (e.g. 513210) or sector range (e.g. 31-33). XOR with query.' },
        query: { type: 'string', description: 'Free-text industry/activity description to search. XOR with code.' },
        level: { type: 'integer', minimum: 2, maximum: 6, description: 'Search mode: restrict to one hierarchy level.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      }),
      invoke: (a) => c.business.naics(a as never),
    },
    {
      name: 'business.lei',
      description:
        'Look up or search the global LEI (Legal Entity Identifier) registry — the authoritative ISO 17442 directory of ~2.6M legal entities worldwide (GLEIF, CC0). Pass lei for an exact 20-character LEI, or query to search by legal/other name (ranked best-match). Filter name search by country (HQ ISO 2-letter) and status (active|all). Returns LEI, legal name, jurisdiction, entity category, legal-form code, entity + registration status, HQ address, registration/renewal dates, and managing LOU. Canonicalize a company name to its LEI, resolve a counterparty, or enrich a vendor master.',
      inputSchema: s('GLEIF LEI lookup/search', {
        lei: { type: 'string', description: 'Exact 20-character ISO 17442 LEI. XOR with query.' },
        query: { type: 'string', description: 'Free-text legal/other name search. XOR with lei.' },
        country: { type: 'string', description: 'HQ country ISO 2-letter filter (name search only).' },
        status: { type: 'string', enum: ['active', 'all'], description: 'active = ACTIVE entities only; all (default).' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      }),
      invoke: (a) => c.business.lei(a as never),
    },
    {
      name: 'business.entity-match',
      description:
        "Fuzzy entity resolution: resolve a messy, free-text company name to its canonical GLEIF Legal Entity Identifier (LEI) with a 0-1 similarity score and high/medium/low confidence. Tolerant of legal-suffix noise (Inc/Ltd/GmbH/S.A.), word order, ampersands, punctuation, and former/alternate names (e.g. 'Apple Computer Inc' → Apple Inc.). Returns ranked candidates plus a single bestMatch (null below medium confidence — safe for KYB). The record-linkage complement to business.lei. Optional country (ISO-2) narrows the jurisdiction.",
      inputSchema: s('GLEIF fuzzy entity match', {
        name: { type: 'string', description: 'Free-text company / legal-entity name to resolve (messy input is fine).' },
        country: { type: 'string', description: 'Optional ISO-2 country of the entity HQ to narrow the match.' },
        limit: { type: 'integer', minimum: 1, maximum: 25, default: 5 },
      }),
      invoke: (a) => c.business.entityMatch(a as never),
    },
    {
      name: 'edu.school-lookup',
      description: 'Every US public K-12 school (~102k, NCES Common Core of Data). Search by name/district (partial), state, city, zip, or exact 12-digit NCES id. Returns address, level, type, charter/magnet/virtual flags, enrollment, grade span.',
      inputSchema: s('School lookup', {
        name: { type: 'string', description: 'School name, partial match.' },
        district: { type: 'string', description: 'District (LEA) name, partial match.' },
        state: { type: 'string' },
        city: { type: 'string' },
        zip: { type: 'string' },
        ncessch: { type: 'string', description: 'Exact 12-digit NCES school id.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.edu.schoolLookup(a as never),
    },
    {
      name: 'license.trades',
      description: 'US trade/occupational license verification (currently TX TDLR: electricians, A/C techs, cosmetologists, tow operators, +40 trades). By name (owner/business, partial), licenseNumber, licenseType, county. Returns type, number, names, expiration.',
      inputSchema: s('Trades license', {
        state: { type: 'string', enum: ['TX'] },
        name: { type: 'string', description: 'Owner or business name, partial match.' },
        licenseNumber: { type: 'string' },
        licenseType: { type: 'string', description: 'Partial, e.g. "Electrician".' },
        county: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }, ['state']),
      invoke: (a) => c.license.trades(a as never),
    },
    {
      name: 'license.real-estate',
      description: 'US real-estate license verification (currently TX TREC: brokers, sales agents, broker companies). By name (partial), licenseNumber, licenseType, status. Returns type, number, holder, status, dates, supervising broker.',
      inputSchema: s('Real-estate license', {
        state: { type: 'string', enum: ['TX'] },
        name: { type: 'string', description: 'License holder name, partial match.' },
        licenseNumber: { type: 'string' },
        licenseType: { type: 'string', description: 'Partial, e.g. "Broker", "Sales Agent".' },
        status: { type: 'string', description: 'E.g. "Active".' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }, ['state']),
      invoke: (a) => c.license.realEstate(a as never),
    },
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
      name: 'law.citation-check',
      description:
        'Anti-hallucination checker for legal references. POST text to verify every cited case (CourtListener), US Code section, and CFR regulation EXISTS, with canonical metadata + source URLs. POST quotes:[{citation,quote}] to deterministically verify an attributed QUOTE actually appears in the cited opinion (ellipsis-aware) — catches fabricated quotations. Returns per-reference exists/quote-present + a summary. Checks facts (existence, quote presence), NOT whether a case legally supports a proposition.',
      inputSchema: s('Citation check input', {
        text: { type: 'string', description: 'Legal passage to scan for case/USC/CFR citations (existence check).', maxLength: 50000 },
        quotes: {
          type: 'array',
          description: 'Explicit quote checks: each { citation, quote } verifies the citation exists AND the quote appears in its opinion.',
          items: { type: 'object', properties: { citation: { type: 'string' }, quote: { type: 'string' } }, required: ['citation', 'quote'] },
        },
      }),
      invoke: (a) => c.law.citationCheck(a as never),
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
      name: 'law.cfr-section',
      description:
        'Fetch the authoritative full text of a US Code of Federal Regulations section by title + section number (e.g. title 17, section 240.10b-5). Optional date (yyyy-mm-dd, back to 2017) returns the historical text in force on that date. Returns citation, heading, plain text, Federal Register source credit, and official eCFR link. Public-domain, updated daily.',
      inputSchema: s('CFR section input', {
        title: { type: 'integer', minimum: 1, maximum: 50, description: 'CFR title number, 1-50.' },
        section: { type: 'string', description: 'Section as "part.section", e.g. "1026.43" or "240.10b-5".' },
        date: { type: 'string', format: 'date', description: 'Optional point-in-time date (yyyy-mm-dd, coverage starts 2017-01-03).' },
      }, ['title', 'section']),
      invoke: (a) => c.law.cfrSection(a as never),
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
    {
      name: 'law.usc-section',
      description:
        'Fetch the authoritative current text of a United States Code section by title + section number (e.g. title 17, section 107 = fair use). Returns citation, heading, hierarchy context, full statutory text, Statutes-at-Large source credit, and the official OLRC link; includeNotes adds amendment history. Handles hyphenated/lettered sections like 1395w-4 or 78j. Verify statutory citations instead of relying on model memory. Public-domain.',
      inputSchema: s('USC section input', {
        title: { type: 'integer', minimum: 1, maximum: 54, description: 'USC title number, 1-54.' },
        section: { type: 'string', description: 'Section number, e.g. "107", "78j", "1395w-4".' },
        includeNotes: { type: 'boolean', default: false, description: 'Include editorial notes (amendment history, effective dates).' },
      }, ['title', 'section']),
      invoke: (a) => c.law.uscSection(a as never),
    },
    {
      name: 'law.trademark-status',
      description:
        'Verify a US trademark by USPTO serial number (8 digits) or registration number: word mark, LIVE/DEAD status with detail and dates, current owner, mark type, and international classes covered. Authoritative real-time USPTO TSDR data — confirm a mark exists and is active instead of trusting model memory. Number lookup only (no text search).',
      inputSchema: s('Trademark status', {
        serialNumber: { type: 'string', description: '8-digit application serial number (XOR with registrationNumber).' },
        registrationNumber: { type: 'string', description: 'US registration number, 6-8 digits (XOR with serialNumber).' },
      }),
      invoke: (a) => c.law.trademarkStatus(a as never),
    },
    {
      name: 'law.trademark-search',
      description:
        'Search US trademarks by wordmark text, owner, or goods/services — the text search the USPTO offers no public API for. Pass query for full-text (best-match ranked), or serial / registrationNumber for an exact record. Filter by field (mark|owner|all), status (live=registered+pending, default; all includes dead), and intlClass (Nice class). Returns wordmark, serial, registration number, status (+ live flag), dates, owner, classes, and goods/services. Use law.trademark-status for live USPTO prosecution detail on a known serial.',
      inputSchema: s('Trademark search', {
        query: { type: 'string', description: 'Free-text search over wordmark (default), owner, or goods/services.' },
        serial: { type: 'string', description: 'Exact USPTO serial number (digits).' },
        registrationNumber: { type: 'string', description: 'Exact USPTO registration number.' },
        field: { type: 'string', enum: ['mark', 'owner', 'all'], description: 'Which text to search. Default mark.' },
        status: { type: 'string', enum: ['live', 'all'], description: 'live (default) = registered+pending; all includes dead.' },
        intlClass: { type: 'string', description: 'Nice international class filter, e.g. 9 or 009.' },
        limit: { type: 'integer', description: '1-100, default 20.' },
        offset: { type: 'integer', description: 'Pagination offset, default 0.' },
      }),
      invoke: (a) => c.law.trademarkSearch(a as never),
    },
    {
      name: 'nutrition.food',
      description:
        'USDA FoodData Central nutrition lookup (~400k foods). Search by name (query=cheddar cheese) for matching foods with fdcId, or fetch one food (fdcId=328637) for its full analyzed nutrient profile — energy, protein, fats, carbs, vitamins, minerals with amounts and units, plus ingredients for branded foods. Real analyzed values instead of model-estimated nutrition facts.',
      inputSchema: s('Food lookup', {
        query: { type: 'string', minLength: 2, maxLength: 120, description: 'Food name to search (XOR with fdcId).' },
        fdcId: { type: 'integer', minimum: 1, description: 'FDC food id for the full nutrient profile (XOR with query).' },
        dataType: { type: 'string', enum: ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'], description: 'Restrict search to one data type.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        page: { type: 'integer', minimum: 1, default: 1 },
      }),
      invoke: (a) => c.nutrition.food(a as never),
    },
    {
      name: 'tld.info',
      description:
        'TLD registry + Public Suffix List intelligence. tld=io returns IANA root-zone metadata (type, managing organization, unicode form). domain=shop.example.co.uk runs the full PSL algorithm: effective public suffix, registrable domain, subdomain, matched rule, and whether the suffix is ICANN or private/corporate (github.io, s3.amazonaws.com). For cookie scoping, per-registrant rate limiting, URL dedup, and abuse analysis.',
      inputSchema: s('TLD info', {
        tld: { type: 'string', minLength: 2, maxLength: 64, description: 'TLD label, e.g. "io" (XOR with domain).' },
        domain: { type: 'string', minLength: 3, maxLength: 253, description: 'Domain to analyze, e.g. "shop.example.co.uk" (XOR with tld).' },
      }),
      invoke: (a) => c.tld.info(a as never),
    },
    {
      name: 'climate.station-history',
      description:
        'Historical daily weather observations (NOAA GHCN-Daily) for one station + date range (≤366 days): max/min/avg temperature °C, precipitation/snow mm, wind m/s. Records back to the 1800s — actual measured values for "what was the weather on this date". Find a station id with climate.station-near first.',
      inputSchema: s('Station history', {
        station: { type: 'string', description: 'GHCN station id (11 chars), e.g. USW00094728.' },
        startDate: { type: 'string', format: 'date', description: 'Range start, YYYY-MM-DD.' },
        endDate: { type: 'string', format: 'date', description: 'Range end, YYYY-MM-DD.' },
        dataTypes: { type: 'string', description: 'Comma-separated element codes (TMAX,TMIN,TAVG,PRCP,SNOW,SNWD,AWND,WSF2,WSF5,EVAP). Default TMAX,TMIN,PRCP.' },
      }, ['station', 'startDate', 'endDate']),
      invoke: (a) => c.climate.stationHistory(a as never),
    },
    {
      name: 'search.web',
      description:
        'Live web search: ranked results with title, URL, snippet, site name, and page age — fresh information past any training cutoff. Supports paging (count/offset), country, freshness (pd/pw/pm/py or date range), safesearch. Use for current events, fact verification, documentation, research.',
      inputSchema: s('Web search', {
        q: { type: 'string', minLength: 1, maxLength: 400, description: 'Search query.' },
        count: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
        offset: { type: 'integer', minimum: 0, maximum: 9, default: 0 },
        country: { type: 'string', description: '2-letter country code.' },
        freshness: { type: 'string', description: 'pd | pw | pm | py | YYYY-MM-DDtoYYYY-MM-DD.' },
        safesearch: { type: 'string', enum: ['off', 'moderate', 'strict'], default: 'moderate' },
      }, ['q']),
      invoke: (a) => c.search.web(a as never),
    },
    {
      name: 'security.cve',
      description:
        'Look up a CVE by id (e.g. CVE-2021-44228) across three authoritative vulnerability feeds in one call: the canonical record (description, CVSS base score + severity + vector, CWE ids, dates, references), whether it is on the US CISA Known Exploited Vulnerabilities catalog (with remediation due date + known-ransomware flag), and its EPSS exploit-probability score + percentile. The exploited and EPSS sections degrade independently. 404 if unknown. For vulnerability triage, prioritization, and anti-hallucination. Sources: NIST NVD, CISA KEV, FIRST.org EPSS.',
      inputSchema: s('CVE lookup', {
        cve: { type: 'string', description: 'CVE id, e.g. CVE-2021-44228.' },
      }, ['cve']),
      invoke: (a) => c.security.cve(a as never),
    },
    {
      name: 'security.package',
      description:
        'Security + provenance for an open-source package, composed live in one call from OSV (known vulnerabilities — aggregates GitHub Security Advisories, PyPA, RustSec, Go vuln DB, etc., each with CVE aliases + severity + references), deps.dev (resolved license + deprecation), and OpenSSF Scorecard (source-repo health: overall 0-10 + per-check, plus stars/forks/open-issues). Pass ecosystem (npm/pypi/go/maven/cargo/nuget) + name (+ optional version). Live — new advisories appear within hours. Distinct from registry.npm/pypi-lookup (metadata only): "is this dependency safe to add, what license, how well-maintained."',
      inputSchema: s('Package security', {
        ecosystem: { type: 'string', description: 'npm, pypi, go, maven, cargo, or nuget.' },
        name: { type: 'string', description: 'Package name (e.g. lodash).' },
        version: { type: 'string', description: 'Version (defaults to latest).' },
      }, ['ecosystem', 'name']),
      invoke: (a) => c.security.package(a as never),
    },
    {
      name: 'security.cve-search',
      description: 'Find CVEs affecting a product by searching the NIST NVD. Pass product (free-text keyword, e.g. "apache log4j", "openssl") or cpe (exact CPE 2.3 name). Returns matching CVEs newest-first with id, description, CVSS score/severity/vector, dates. Optional limit (1-50). For "what CVEs affect X" — distinct from security.cve (resolve one id across NVD+KEV+EPSS). Free, keyless.',
      inputSchema: s('CVE search', { product: { type: 'string', description: 'Free-text product/keyword.' }, cpe: { type: 'string', description: 'Exact CPE 2.3 name.' }, limit: { type: 'integer', description: 'Max CVEs (1-50, default 20).' } }),
      invoke: (a) => c.security.cveSearch(a as never),
    },
    {
      name: 'news.search',
      description:
        'Live news search: recent headlines with publisher source, relative age, and breaking flag. freshness narrows recency (pd=past day, pw, pm, py). Use for current events and monitoring.',
      inputSchema: s('News search', {
        q: { type: 'string', minLength: 1, maxLength: 400, description: 'News query.' },
        count: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
        offset: { type: 'integer', minimum: 0, maximum: 9, default: 0 },
        country: { type: 'string', description: '2-letter country code.' },
        freshness: { type: 'string', enum: ['pd', 'pw', 'pm', 'py'] },
      }, ['q']),
      invoke: (a) => c.news.search(a as never),
    },
    {
      name: 'crypto.token-price',
      description:
        'Current spot price, market cap, 24h volume and 24h change for crypto assets by CoinGecko asset id (lowercase, e.g. "bitcoin,ethereum,solana" — not ticker symbols). vs sets quote currencies (default usd). Price data by CoinGecko.',
      inputSchema: s('Token price', {
        ids: { type: 'string', description: 'Comma-separated CoinGecko asset ids, max 25.' },
        vs: { type: 'string', description: 'Comma-separated quote currencies, default "usd".' },
      }, ['ids']),
      invoke: (a) => c.crypto.tokenPrice(a as never),
    },
    {
      name: 'flight.status',
      description:
        'Live flight status by flight designator (UAL1 / UA1) or tail number: origin/destination airports, status, cancellation/diversion, scheduled vs estimated vs actual gate + runway times, delays, progress percent, aircraft type and registration. Answers "where is this flight, is it delayed, when does it land".',
      inputSchema: s('Flight status', {
        ident: { type: 'string', minLength: 2, maxLength: 12, description: 'Flight designator or tail number.' },
        identType: { type: 'string', enum: ['designator', 'registration', 'fa_flight_id'] },
        limit: { type: 'integer', minimum: 1, maximum: 15, default: 5 },
      }, ['ident']),
      invoke: (a) => c.flight.status(a as never),
    },
    {
      name: 'transcribe.audio',
      description:
        'Transcribe an audio file URL to text (wav, mp3, m4a, ogg/opus, flac, webm; ≤15 MB, ≤15 minutes — split longer recordings). Returns punctuated transcript, confidence, duration, detected language, word-level timestamps, and (diarize=true) speaker-segmented utterances.',
      inputSchema: s('Transcribe audio', {
        url: { type: 'string', description: 'Public audio file URL.' },
        language: { type: 'string', description: 'BCP-47 hint, e.g. "en"; auto-detected when omitted.' },
        diarize: { type: 'boolean', default: false, description: 'Label speakers + return utterances.' },
      }, ['url']),
      invoke: (a) => c.transcribe.audio(a as never),
    },
    {
      name: 'person.cross-registry',
      description:
        'Sweep a person name across five US public registries in one call: FINRA brokers, federal-court attorneys, federal inmates (BOP), Texas trade licenses, Texas real-estate licenses. Per-registry found/error blocks with matching records — name-matched CANDIDATES, not identity-resolved (verify with each registry\'s identifier). Due-diligence and background-research triage.',
      inputSchema: s('Person cross-registry', {
        name: { type: 'string', minLength: 3, maxLength: 120, description: 'Person full name, "First Last" works best.' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Max matches per registry.' },
      }, ['name']),
      invoke: (a) => c.person.crossRegistry(a as never),
    },
    {
      name: 'geo.nearby',
      description:
        'Everything around a coordinate in one call: nearby airports, public K-12 schools, NOAA climate stations, and past-week earthquakes, each with distance and an independent found/error block. radiusKm default 25 (max 200), limit per category. Site assessment, relocation research, risk screening.',
      inputSchema: s('Geo nearby', {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
        radiusKm: { type: 'number', minimum: 1, maximum: 200, default: 25 },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
      }, ['lat', 'lon']),
      invoke: (a) => c.geo.nearby(a as never),
    },
    {
      name: 'stocks.quote',
      description:
        'Latest daily stock quote for a US-listed ticker (e.g. AAPL, MSFT, BRK.B): open/high/low/close, volume, VWAP, trade count, change and percent change vs the prior session, plus company name, exchange, security type, and market cap. NOTE: end-of-day / delayed data (response flags delayed=true) — for daily snapshots and post-close analysis, not real-time trading. Market data by Massive (formerly Polygon.io).',
      inputSchema: s('Stock quote', {
        ticker: { type: 'string', minLength: 1, maxLength: 12, description: 'US ticker symbol, e.g. AAPL.' },
      }, ['ticker']),
      invoke: (a) => c.stocks.quote(a as never),
    },
    {
      name: 'medical.rxnorm',
      description:
        'Normalize and verify drug names against RxNorm, the canonical US drug vocabulary (NIH). term="tylenol 500mg" returns ranked RxCUI candidates with normalized names (typos tolerated); rxcui=… returns the canonical concept plus related ingredients, brand names, and dose forms. Verify drugs exist and get stable identifiers instead of trusting model memory. Sibling of medical.icd10.',
      inputSchema: s('RxNorm lookup', {
        term: { type: 'string', minLength: 2, maxLength: 200, description: 'Free-text drug name (XOR with rxcui).' },
        rxcui: { type: 'string', description: 'RxNorm concept id (XOR with term).' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
      }),
      invoke: (a) => c.medical.rxnorm(a as never),
    },
    {
      name: 'nonprofit.screen',
      description:
        'Look up US 501(c) nonprofits and screen each against the OFAC sanctions list in one call: registry record (EIN, name, location, NTEE) + per-org sanctions block (flagged, match count, SDN matches with confidence). Grant-making due diligence and donation compliance.',
      inputSchema: s('Nonprofit screen', {
        q: { type: 'string', minLength: 2, maxLength: 120, description: 'Organization name (XOR with ein).' },
        ein: { type: 'string', description: '9-digit EIN (XOR with q).' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
      }),
      invoke: (a) => c.nonprofit.screen(a as never),
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
      name: 'aircraft.lookup',
      description: 'Look up a US-registered aircraft by tail number (N-number, e.g. N757F) or icao24 Mode-S hex (e.g. aa3487). Pass exactly one. Returns make/model/owner/operator + the icao24 that links to live ADS-B flight-tracking. ~307k US airframes (OpenSky, CC-BY-SA).',
      inputSchema: s('Aircraft lookup', {
        tail: { type: 'string', description: 'Tail / N-number (e.g. N757F).' },
        icao24: { type: 'string', description: '24-bit Mode-S hex (e.g. aa3487).' },
      }, []),
      invoke: (a) => c.aircraft.lookup(a as never),
    },
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
      name: 'weather.alerts',
      description:
        'Live US National Weather Service active alerts (watches/warnings/advisories) for a point ("lat,lon") OR an area (2-letter US state or marine code). Real-time severe-weather data. Optional severity/urgency filter; sorted most-severe first.',
      inputSchema: s('Active weather alerts', {
        point: { type: 'string', description: 'Location as "lat,lon" decimal degrees, e.g. "25.7617,-80.1918". Provide point OR area.' },
        area: { type: 'string', description: '2-letter US state/territory or NWS marine area code, e.g. "FL". Provide point OR area.' },
        severity: { type: 'string', enum: ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'], description: 'Filter to a single severity level.' },
        urgency: { type: 'string', enum: ['Immediate', 'Expected', 'Future', 'Past', 'Unknown'], description: 'Filter to a single urgency level.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max alerts (1-100, default 20).' },
      }),
      invoke: (a) => c.weather.alerts(a as never),
    },
    {
      name: 'weather.forecast',
      description: 'Official US National Weather Service forecast for a coordinate (US land + territories). Pass lat + lon for ~7 days of day/night periods, or hourly=true for an hourly forecast. Each period: temperature, wind, chance of precipitation, short + detailed forecast. Keyless, public domain. For active warnings use weather.alerts.',
      inputSchema: s('NWS forecast', {
        lat: { type: 'number', description: 'Latitude.' },
        lon: { type: 'number', description: 'Longitude.' },
        hourly: { type: 'boolean', description: 'Hourly instead of day/night periods.' },
        limit: { type: 'integer', description: 'Max periods.' },
      }, ['lat', 'lon']),
      invoke: (a) => c.weather.forecast(a as never),
    },
    {
      name: 'weather.air-quality',
      description: 'Current air quality for any coordinate worldwide: US AQI (+ category) and European AQI, plus PM2.5, PM10, ozone, NO2, SO2, CO concentrations. Source: Open-Meteo/CAMS (keyless).',
      inputSchema: s('Air quality', { lat: { type: 'number' }, lon: { type: 'number' } }, ['lat', 'lon']),
      invoke: (a) => c.weather.airQuality(a as never),
    },
    {
      name: 'weather.marine',
      description: 'Current marine/sea-state for an ocean or coastal coordinate: significant wave height, direction, period, plus wind-wave and swell components. Source: Open-Meteo marine (keyless). 404 for inland points.',
      inputSchema: s('Marine conditions', { lat: { type: 'number' }, lon: { type: 'number' } }, ['lat', 'lon']),
      invoke: (a) => c.weather.marine(a as never),
    },
    {
      name: 'weather.history',
      description: 'Historical daily weather (ERA5, 1940→~5 days ago) for a coordinate + date range (start, end YYYY-MM-DD, ≤366 days): per-day max/min/mean temp, precipitation total + hours, max wind. Source: Open-Meteo archive (keyless).',
      inputSchema: s('Weather history', { lat: { type: 'number' }, lon: { type: 'number' }, start: { type: 'string' }, end: { type: 'string' } }, ['lat', 'lon', 'start', 'end']),
      invoke: (a) => c.weather.history(a as never),
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
      name: 'medical.icd10',
      description: 'Verify an ICD-10-CM diagnosis code (with or without the dot, e.g. E11.9) or keyword-search the official US code set (FY2026, ~98k entries). Returns a verified flag, the exact match, more-specific child codes, billable status, and short/long descriptions. CMS/NCHS public-domain data, refreshed each US fiscal year. Provide exactly one of code or q.',
      inputSchema: s('ICD-10-CM verify/search', {
        code: { type: 'string', description: 'ICD-10-CM code to verify, e.g. E11.9 or E119. Provide code or q, not both.' },
        q: { type: 'string', description: 'Keyword search over official code descriptions, e.g. "type 2 diabetes neuropathy".' },
        billable_only: { type: 'boolean', description: 'When true, only codes valid for claim submission.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, []),
      invoke: (a) => c.medical.icd10(a as never),
    },
    {
      name: 'medical.drug-status',
      description: 'One-call drug situational awareness: whether a drug is currently in FDA shortage, any open/recent FDA recalls, and FDA NDC-directory metadata (labeler, DEA schedule, pharm class). Give a drug name (resolved via RxNorm), or an exact rxcui or ndc. Returns hasCurrentShortage/hasOpenRecall plus per-source found/error blocks. Free, public-domain FDA + NIH data.',
      inputSchema: s('Drug status', {
        drug: { type: 'string', description: 'Free-text drug name (resolved via RxNorm).' },
        rxcui: { type: 'string', description: 'Exact RxNorm RxCUI.' },
        ndc: { type: 'string', description: 'Exact NDC (product or package).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, []),
      invoke: (a) => c.medical.drugStatus(a as never),
    },
    {
      name: 'net.asn',
      description: 'Autonomous System (BGP) intelligence by AS number (e.g. AS3333). Returns the AS holder/operator, IANA/RIR allocation block, whether it is announced, and live routing status: announced IPv4/IPv6 prefixes + address counts, RIS peer visibility, and observed neighbour count. RIPEstat (RIPE NCC), free. Distinct from geo.ip and dns/whois — who owns and routes an AS, observed live.',
      inputSchema: s('ASN/BGP lookup', {
        asn: { type: 'string', description: 'AS number, e.g. AS3333 or 3333.' },
      }, ['asn']),
      invoke: (a) => c.net.asn(a as never),
    },
    {
      name: 'net.mac-vendor',
      description: 'Resolve a MAC address (or bare OUI prefix) to its IEEE-registered hardware vendor. Accepts any format (FC:FB:FB:01:02:03, fc-fb-fb-01-02-03, fcfb.fb01.0203, fcfbfb, or a 9-hex MA-S prefix). Longest-prefix match across the IEEE MA-L/MA-M/MA-S registries, so subdivided blocks resolve to the real manufacturer. Returns the vendor, matched OUI + registry, and decoded address bits: multicast/group, locally administered, or randomized (privacy) MAC. Bundled authoritative IEEE data, free.',
      inputSchema: s('MAC vendor lookup', {
        mac: { type: 'string', description: 'MAC address or OUI prefix in any common format.' },
      }, ['mac']),
      invoke: (a) => c.net.macVendor(a as never),
    },
    {
      name: 'research.org',
      description: 'Resolve a research organization via the Research Organization Registry (ROR). Pass id (a ROR id) or name (free-text search). Returns canonical ROR id, name, type, location (GeoNames), website, external ids (GRID/ISNI/Wikidata/Fundref), relationships, and aliases. Free, CC0. The canonical institution key in scholarly metadata.',
      inputSchema: s('Research org (ROR)', {
        id: { type: 'string', description: 'ROR id, e.g. 056y0v115 or its full URL.' },
        name: { type: 'string', description: 'Free-text organization name.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
      }, []),
      invoke: (a) => c.research.org(a as never),
    },
    {
      name: 'research.author',
      description: 'Resolve a researcher by ORCID iD. Returns name, affiliations (employments + educations with a current flag), a works count, and a works summary (title, type, year, DOI). Free, keyless ORCID Public API. The canonical author key in scholarly metadata.',
      inputSchema: s('Research author (ORCID)', {
        orcid: { type: 'string', description: 'ORCID iD, e.g. 0000-0002-1825-0097.' },
        worksLimit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      }, ['orcid']),
      invoke: (a) => c.research.author(a as never),
    },
    {
      name: 'research.funding',
      description: 'Search US federal biomedical research grants via NIH RePORTER. Filter by term (title/terms/abstract), org, pi, and/or fiscalYear. Returns awards with project number, title, fiscal year, award amount, PI, organization, funding agency, and dates — newest first, with a total count. Free, public-domain.',
      inputSchema: s('Research funding (NIH RePORTER)', {
        term: { type: 'string', description: 'Free-text over project title, terms, and abstract.' },
        org: { type: 'string', description: 'Funded organization name.' },
        pi: { type: 'string', description: 'Principal-investigator name.' },
        fiscalYear: { type: 'integer', description: 'US federal fiscal year, e.g. 2026.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }, []),
      invoke: (a) => c.research.funding(a as never),
    },
    {
      name: 'geo.flood-zone',
      description: 'FEMA flood zone for a coordinate (lat/lon). Returns the FEMA flood zone code (AE, VE, X, …), Special-Flood-Hazard-Area flag (isSFHA — the 1% annual-chance floodplain where flood insurance is mandatory), a plain-language risk level + description, base flood elevation, and source FIRM panel. FEMA NFHL, free and keyless.',
      inputSchema: s('FEMA flood zone', {
        lat: { type: 'number', minimum: -90, maximum: 90, description: 'Latitude (WGS84).' },
        lon: { type: 'number', minimum: -180, maximum: 180, description: 'Longitude (WGS84).' },
      }, ['lat', 'lon']),
      invoke: (a) => c.geo.floodZone(a as never),
    },
    {
      name: 'geo.location-dossier',
      description: 'Static risk & context dossier for a US location. Pass lat+lon or a US address (geocoded for you); optional zip adds ACS demographics. Composes five keyless federal sources: Census place context (county/state/tract/congressional district), FEMA flood zone + SFHA status, USGS ASCE 7-16 seismic design parameters (Ss/S1/SDS/SD1/seismic design category/PGA), the nearest NOAA/GHCN climate station, and Census ACS 5-year demographics (zip only). Each layer is isolated. The slow-moving structural-risk picture for siting/insurance/diligence — distinct from real-time weather/earthquake conditions.',
      inputSchema: s('Location risk dossier', {
        lat: { type: 'number', minimum: -90, maximum: 90, description: 'Latitude (WGS84). With lon, or use address.' },
        lon: { type: 'number', minimum: -180, maximum: 180, description: 'Longitude (WGS84). With lat, or use address.' },
        address: { type: 'string', description: 'US street address (alternative to lat/lon).' },
        zip: { type: 'string', description: 'Optional 5-digit ZIP to include ACS demographics.' },
        riskCategory: { type: 'string', enum: ['I', 'II', 'III', 'IV'], description: 'ASCE risk category (default II).' },
        siteClass: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'], description: 'ASCE soil site class (default D).' },
      }, []),
      invoke: (a) => c.geo.locationDossier(a as never),
    },
    {
      name: 'gov.contract-opportunities',
      description: 'Search ACTIVE US federal contract opportunities (solicitations, RFPs/RFQs, sources-sought) from SAM.gov. Requires postedFrom + postedTo (MM/DD/YYYY, ≤1yr span); optional title, naics, state, setAside, ptype. Returns notice id, title, solicitation number, type, department, deadline, NAICS, set-aside, office location, and a sam.gov link. Free, public-domain. Distinct from gov.usaspending-awards (past) — this is what is OPEN to bid now.',
      inputSchema: s('Federal contract opportunities', {
        postedFrom: { type: 'string', description: 'Start of posted-date window, MM/DD/YYYY.' },
        postedTo: { type: 'string', description: 'End of posted-date window, MM/DD/YYYY.' },
        title: { type: 'string', description: 'Keyword in the title.' },
        naics: { type: 'string', description: 'NAICS code.' },
        state: { type: 'string', description: '2-letter place/office state.' },
        setAside: { type: 'string', description: 'Set-aside code, e.g. SBA, 8A, WOSB, SDVOSBC.' },
        ptype: { type: 'string', description: 'Notice type: o=solicitation, p=presolicitation, r=sources-sought, k=combined.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }, ['postedFrom', 'postedTo']),
      invoke: (a) => c.gov.contractOpportunities(a as never),
    },
    {
      name: 'gov.entity',
      description: 'Look up entities registered to do business with the US federal government in SAM.gov. Search by ueiSAM, cageCode, or legalBusinessName. Returns UEI, CAGE, legal/DBA name, registration status + dates, an active-exclusion flag, address, and business types. Free, public-domain. The federal counterparty identity key.',
      inputSchema: s('SAM entity lookup', {
        legalBusinessName: { type: 'string', description: 'Legal business name.' },
        ueiSAM: { type: 'string', description: '12-char Unique Entity ID.' },
        cageCode: { type: 'string', description: 'CAGE code.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
      }, []),
      invoke: (a) => c.gov.entity(a as never),
    },
    {
      name: 'gov.exclusions',
      description: 'Check whether a person or company is excluded (debarred/suspended) from US federal contracts, grants, or assistance — the SAM.gov Exclusions list. Search by name, ueiSAM, cageCode, classificationType. Returns each exclusion with classification, type, program, excluding agency, dates, and address. Free, public-domain. Distinct from law.sanctions-check (OFAC).',
      inputSchema: s('SAM exclusions (debarment)', {
        name: { type: 'string', description: 'Person or entity name.' },
        ueiSAM: { type: 'string', description: '12-char Unique Entity ID.' },
        cageCode: { type: 'string', description: 'CAGE code.' },
        classificationType: { type: 'string', description: 'Individual | Firm | Vessel | Special Entity Designation.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
      }, []),
      invoke: (a) => c.gov.exclusions(a as never),
    },
    {
      name: 'gov.counterparty',
      description: 'Federal counterparty due-diligence dossier on one name, in a single call: SAM registration + SAM exclusions (debarment) + OFAC SDN sanctions + GLEIF LEI + USAspending federal awards + FARA foreign-agent registration. Returns headline riskFlags (federally_debarred, sanctions_high_confidence_match, registered_foreign_agent), a cleared boolean (debarment+sanctions only — FARA is context), a summary, and per-source found/error blocks. Free, public-domain. The federal counterpart to business.entity-screen.',
      inputSchema: s('Federal counterparty dossier', {
        name: { type: 'string', description: 'Company or person name to screen.' },
        state: { type: 'string', description: 'Optional 2-letter state to scope award history.' },
        threshold: { type: 'number', minimum: 0.1, maximum: 1, default: 0.4, description: 'OFAC fuzzy-match threshold.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
      }, ['name']),
      invoke: (a) => c.gov.counterparty(a as never),
    },
    {
      name: 'gov.foreign-agents',
      description: 'Search currently-active FARA (Foreign Agents Registration Act) registrants by name. Returns whether the entity is a registered foreign agent (isRegisteredForeignAgent), a KYB-safe bestMatch (null below medium confidence — no false positives), and scored candidates with registration number, date, and city/state. FARA registration is a US disclosure status (acting for a foreign principal), not wrongdoing. DOJ FARA eFile, free and keyless.',
      inputSchema: s('FARA foreign-agent search', {
        name: { type: 'string', description: 'Company or person name to screen against FARA registrants.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
      }, ['name']),
      invoke: (a) => c.gov.foreignAgents(a as never),
    },
    {
      name: 'gov.risk-index',
      description: 'FEMA National Risk Index for a US county — the authoritative natural-hazard risk profile. Look up by countyFips (5-digit STCOFIPS), state + county name, or a lat/lon point. Returns the composite Risk Index score/rating/national-percentile (18-hazard model = Expected Annual Loss × Social Vulnerability ÷ Community Resilience), each component, and per-hazard risk ratings + expected annual loss for all 18 hazards (wildfire, earthquake, hurricane, riverine & coastal flooding, tornado, heat/cold wave, drought, …). Free, public-domain. For siting, insurance, and resilience planning; complements geo.flood-zone (flood SFHA only).',
      inputSchema: s('FEMA National Risk Index', {
        countyFips: { type: 'string', description: '5-digit county FIPS (STCOFIPS), e.g. 06037.' },
        state: { type: 'string', description: 'State name or 2-letter abbreviation (with county).' },
        county: { type: 'string', description: 'County name (with state).' },
        lat: { type: 'number', minimum: -90, maximum: 90, description: 'Latitude (with lon) for a point lookup.' },
        lon: { type: 'number', minimum: -180, maximum: 180, description: 'Longitude (with lat) for a point lookup.' },
      }, []),
      invoke: (a) => c.gov.riskIndex(a as never),
    },
    {
      name: 'gov.fcc-id',
      description: 'Resolve an FCC ID (printed on US wireless/electronic devices) to the grantee — the manufacturer holding the FCC equipment authorization. Pass fccId in any form (BCG-E3217A, BCGE3217A). Returns grantee code, product code, and the grantee company (name, city, state, country, registration date). FCC EAS open dataset, free and keyless — the "who made this device" lookup an agent reading a hardware label cannot do natively. (Per-product RF detail like frequencies/equipment class is not in the open dataset.)',
      inputSchema: s('FCC ID lookup', {
        fccId: { type: 'string', description: 'An FCC ID, e.g. BCG-E3217A or BCGE3217A.' },
      }, ['fccId']),
      invoke: (a) => c.gov.fccId(a as never),
    },
    {
      name: 'gov.nfip-claims',
      description: 'FEMA National Flood Insurance Program (NFIP) claims history for a US location — the flood losses actually paid out in an area. Requires state (2-letter); narrow by county (5-digit FIPS), ZIP, and yearOfLoss range. Returns the total matching claim count plus recent redacted claims (date of loss, county/census tract/ZIP, rated flood zone, cause, water depth, net building + contents payment USD, approx lat/lon), largest net payout first. FEMA redacts city, so filter by county/ZIP. Free, public-domain (OpenFEMA). Distinct from geo.flood-zone (current SFHA) and gov.risk-index (modeled future risk) — this is the realized loss track record, for underwriting + property diligence.',
      inputSchema: s('NFIP flood-insurance claims', {
        state: { type: 'string', description: '2-letter US state/territory code (required).' },
        county: { type: 'string', description: '5-digit county FIPS, e.g. 48201.' },
        zip: { type: 'string', description: 'Reported ZIP code.' },
        yearFrom: { type: 'integer', description: 'Earliest year of loss (inclusive).' },
        yearTo: { type: 'integer', description: 'Latest year of loss (inclusive).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, ['state']),
      invoke: (a) => c.gov.nfipClaims(a as never),
    },
    {
      name: 'gov.disaster-declarations',
      description: 'FEMA federal disaster & emergency declarations — every federally declared disaster since 1953, including ones declared this week. Filter by state (2-letter), disasterNumber, declarationType (DR=major disaster, EM=emergency, FM/FS/FW=fire management), incidentType (Hurricane, Fire, Flood, Severe Storm, …), county (5-digit FIPS), fiscal year (fyDeclared), and declaration date range (fromDate/toDate, YYYY-MM-DD). No filter → most recent declarations nationwide. Returns total matching count + records (one per designated county/area) with declaration string, disaster number, title, incident type, declaration/incident/closeout dates, designated area, county FIPS, FEMA region, and authorized assistance programs (Individuals & Households, Individual Assistance, Public Assistance, Hazard Mitigation). Free, public-domain (OpenFEMA). Distinct from gov.risk-index (modeled future risk) and gov.nfip-claims (realized flood losses) — the official federal-response record, for disaster logistics, eligibility checks, insurance, emergency management.',
      inputSchema: s('FEMA disaster declarations', {
        state: { type: 'string', description: '2-letter US state/territory code.' },
        disasterNumber: { type: 'integer', description: 'FEMA disaster number, e.g. 4673.' },
        declarationType: { type: 'string', description: 'DR, EM, FM, FS, or FW.' },
        incidentType: { type: 'string', description: 'Incident type, e.g. Hurricane, Fire, Flood, Severe Storm.' },
        county: { type: 'string', description: '5-digit county FIPS, e.g. 12086.' },
        fyDeclared: { type: 'integer', description: 'Fiscal year declared, e.g. 2026.' },
        fromDate: { type: 'string', description: 'Earliest declaration date, YYYY-MM-DD.' },
        toDate: { type: 'string', description: 'Latest declaration date, YYYY-MM-DD.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, []),
      invoke: (a) => c.gov.disasterDeclarations(a as never),
    },
    {
      name: 'gov.disaster-assistance',
      description: 'FEMA disaster assistance dollars — how much federal aid was approved or obligated for a declared disaster, by place. program=individuals (default) returns Individuals & Households Program (IHP) approved housing assistance, one record per ZIP per disaster, with FEMA-approved repair/replace, rental, and other-needs dollars and valid-registration counts (tenancy=owner default, or renter). program=public returns Public Assistance funded-project summaries, one record per applicant (state/local government, tribe, or eligible nonprofit) per disaster, with the federally obligated grant amount and project count. Filter by disasterNumber (the join key to gov.disaster-declarations), state (2-letter), and zipCode (5-digit, IHP only); ordered by approved/obligated dollars (highest first) with the total matching count + a normalized approvedAmountUSD per record. Free, public-domain (OpenFEMA). Distinct from gov.disaster-declarations (what was declared/authorized), gov.risk-index (modeled risk), gov.nfip-claims (flood-insurance losses) — the realized federal-spend record.',
      inputSchema: s('FEMA disaster assistance', {
        program: { type: 'string', enum: ['individuals', 'public'], description: "'individuals' (IHP, default) or 'public' (Public Assistance)." },
        tenancy: { type: 'string', enum: ['owner', 'renter'], description: "For program=individuals: 'owner' (default) or 'renter'." },
        disasterNumber: { type: 'integer', description: 'FEMA disaster number, e.g. 4673.' },
        state: { type: 'string', description: '2-letter US state/territory code.' },
        zipCode: { type: 'string', description: '5-digit ZIP code (program=individuals only).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, []),
      invoke: (a) => c.gov.disasterAssistance(a as never),
    },
    {
      name: 'gov.carrier-safety',
      description: 'FMCSA motor-carrier (trucking/bus) safety profile. Pass dot (USDOT number) for the full record: legal/DBA name, state, interstate/intrastate, operating-authority status (allowedToOperate), FMCSA safety rating, fleet size, crash history (total/fatal/injury/tow-away), roadside-inspection history with driver+vehicle out-of-service rates, and CSA BASIC measures (Unsafe Driving, Hours-of-Service, Driver Fitness, Controlled Substances, Vehicle Maintenance, Hazmat, Crash Indicator). Or pass name to search → matching carriers + DOT numbers. Free, public-domain US DOT data. For commercial-auto/freight underwriting, broker/shipper vetting, vendor diligence.',
      inputSchema: s('FMCSA carrier safety', {
        dot: { type: 'integer', description: 'USDOT number for the full safety profile.' },
        name: { type: 'string', description: 'Carrier name to search (returns matches with DOT numbers).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, []),
      invoke: (a) => c.gov.carrierSafety(a as never),
    },
    {
      name: 'gov.representatives',
      description: "Your sitting US Congress members for a location. Pass a US address (geocoded to its state + congressional district) or an explicit state (2-letter) + optional district. Returns the current US House representative + the state's two US senators, each with name, party, state/district, Bioguide ID, DC office, phone, official website, and contact form. State-only → just the two senators; DC/territories → their non-voting delegate. Bundled CC0 data (unitedstates/congress-legislators). Fills the gap after gov.district (which gives the district, not the people) — civic lookup, advocacy, constituent tooling.",
      inputSchema: s('US representatives', {
        address: { type: 'string', description: 'US street address (geocoded to district).' },
        state: { type: 'string', description: '2-letter state/territory code (alternative to address).' },
        district: { type: 'string', description: 'Congressional district number (with state); omit for senators only.' },
      }, []),
      invoke: (a) => c.gov.representatives(a as never),
    },
    {
      name: 'timezone.lookup',
      description: 'Resolve a coordinate to its IANA timezone, current UTC offset, local wall time, DST status, and short abbreviation. Polygon lookup against a CC0 timezone boundary index + runtime tzdata for current transition rules.',
      inputSchema: s('Timezone lookup', {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
        at: { type: 'string', format: 'date-time', description: 'Optional ISO 8601 instant. Defaults to now.' },
      }, ['lat', 'lon']),
      invoke: (a) => c.timezone.lookup(a as never),
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
      name: 'earth.events',
      description: 'Active and historical global natural events via NASA EONET v3: wildfires, severe storms, volcanoes, floods, droughts, landslides, sea/lake ice, dust/haze, manmade incidents, water-color anomalies. Each event includes geo-located observation points and category. Filter by status, days-back, category, or bbox.',
      inputSchema: s('Earth events (NASA EONET)', {
        status: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
        days: { type: 'integer', minimum: 1, maximum: 365 },
        category: { type: 'string', enum: ['drought', 'dustHaze', 'earthquakes', 'floods', 'landslides', 'manmade', 'seaLakeIce', 'severeStorms', 'snow', 'tempExtremes', 'volcanoes', 'waterColor', 'wildfires'] },
        bbox: { type: 'string' },
      }),
      invoke: (a) => c.earth.events(a as never),
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
      name: 'geo.postal',
      description:
        'Resolve a postal/ZIP code to place name(s), administrative divisions (state/province, county/district), and coordinates. Pass postalCode + 2-letter country (default US). International — major markets (US, GB, CA, DE, FR, AU, NL, ES, IT, CH, SE, MX). Normalize + enrich addresses or derive state/county for a ZIP.',
      inputSchema: s('Postal lookup input', {
        postalCode: { type: 'string', description: 'Postal / ZIP code.' },
        country: { type: 'string', description: '2-letter ISO country (default US).' },
      }, ['postalCode']),
      invoke: (a) => c.geo.postal(a as never),
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
      description: 'Fetch a page and return its article content with clutter stripped (no nav, ads, footer, scripts). format: markdown (default), text, both (JSON), html (self-contained reader page), or pdf (typeset reading doc). html/pdf return raw bytes.',
      inputSchema: s('URL clean', {
        url: { type: 'string', format: 'uri' },
        format: { type: 'string', enum: ['markdown', 'text', 'both', 'html', 'pdf'], default: 'markdown' },
      }, ['url']),
      invoke: (a) => c.url.clean(a as never),
    },
    {
      name: 'url.render',
      description: 'Like url.clean but renders the page in a real headless browser (JS executed) — for client-rendered / SPA pages where a raw fetch sees an empty shell. Same formats (markdown/text/both/html/pdf). Tier 2 (~10× url.clean). Use url.clean for server-rendered pages.',
      inputSchema: s('URL render', {
        url: { type: 'string', format: 'uri' },
        format: { type: 'string', enum: ['markdown', 'text', 'both', 'html', 'pdf'], default: 'markdown' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], default: 'networkidle2' },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 15000, default: 12000 },
      }, ['url']),
      invoke: (a) => c.url.render(a as never),
    },
    {
      name: 'url.map',
      description: 'Discover the URLs a page or sitemap points at in a single fetch — <loc> entries from an XML sitemap/sitemap-index, or <a href> links from an HTML page (auto-detected). Resolved-absolute, deduped, http(s)-only. Stateless, no JS, NOT a recursive crawler — re-call on a child sitemap/page to go deeper. limit 1-2000 (default 200); sameHostOnly keeps same-host links.',
      inputSchema: s('URL map', {
        url: { type: 'string', format: 'uri' },
        limit: { type: 'integer', minimum: 1, maximum: 2000, default: 200 },
        sameHostOnly: { type: 'boolean', default: false },
      }, ['url']),
      invoke: (a) => c.url.map(a as never),
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
      name: 'vehicle.safety-ratings',
      description:
        'NHTSA NCAP 5-Star crash-test ratings by make/model/year. Returns one item per crash-tested body style with overall/front/side/rollover star ratings, rollover probability, crash-avoidance tech flags, and complaint/recall/investigation counts. Untested vehicles return an empty list.',
      inputSchema: s('Safety ratings', {
        make: { type: 'string', description: 'Manufacturer, e.g., "Honda".' },
        model: { type: 'string', description: 'Model name, e.g., "Accord".' },
        modelYear: { type: 'integer', description: '4-digit model year.' },
      }, ['make', 'model', 'modelYear']),
      invoke: (a) => c.vehicle.safetyRatings(a as never),
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

    // ── Public records: licenses / banks / health / nonprofit ────────
    {
      name: 'license.medical',
      description: 'US healthcare provider lookup (NPPES NPI Registry). Lookup by 10-digit NPI (precise) or firstName + lastName + state. Returns name, credentials, specialty taxonomies with state license numbers, addresses, phone, identifiers.',
      inputSchema: s('NPI lookup', {
        npi: { type: 'string', description: '10-digit NPI for direct lookup.' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        name: { type: 'string', description: 'Convenience — last-name search when firstName not set.' },
        state: { type: 'string', description: '2-letter US state.' },
        enumerationType: { type: 'string', enum: ['1', '2'], description: '1 = individual, 2 = organization.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 10 },
        skip: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.license.medical(a as never),
    },
    {
      name: 'license.broker',
      description: 'FINRA BrokerCheck — registered US brokers / investment advisors. Search by free-text query (name + firm) or by CRD number. Returns CRD, name + aliases, scopes, disclosure flag, industry-start date, current + previous employments.',
      inputSchema: s('Broker lookup', {
        query: { type: 'string', description: 'Free-text query — name + firm.' },
        crd: { type: 'string', description: 'Direct CRD number.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.license.broker(a as never),
    },
    {
      name: 'bank.lookup',
      description: 'FDIC-insured US bank directory. Lookup by name (fuzzy), FDIC certificate, RSSD ID, or state. Returns name, web address, active flag, location, established + insured dates, charter, branch count, assets/deposits ($1000s).',
      inputSchema: s('Bank lookup', {
        name: { type: 'string', description: 'Fuzzy name search.' },
        cert: { type: 'string', description: 'FDIC certificate number.' },
        rssdId: { type: 'string', description: 'Federal Reserve RSSD ID.' },
        state: { type: 'string', description: '2-letter US state.' },
        status: { type: 'string', enum: ['active', 'inactive', 'any'], default: 'active' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.bank.lookup(a as never),
    },
    {
      name: 'health.open-payments',
      description: 'CMS Open Payments — Sunshine Act payments from pharma/device manufacturers to US physicians or teaching hospitals (~10M records per year). Lookup by NPI, name, payer (manufacturer) name, or state. Returns recipient + payer + payment (amount, date, nature: consulting/food/travel/royalty) + associated product (drug/device + therapeutic area).',
      inputSchema: s('Open Payments search', {
        npi: { type: 'string', description: 'Recipient physician NPI.' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        payerName: { type: 'string', description: 'Manufacturer/GPO name (contains match).' },
        state: { type: 'string', description: '2-letter US state.' },
        minAmount: { type: 'number', description: 'Min USD payment amount.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.health.openPayments(a as never),
    },
    {
      name: 'nonprofit.search',
      description: 'US 501(c) nonprofit organization search via ProPublica Nonprofit Explorer (IRS Form 990 + BMF). Search by name, 9-digit EIN, state, NTEE category code (e.g. "B99"), or subsection code (3 = 501(c)(3)). Returns EIN, name, location, NTEE code, subsection code + human description.',
      inputSchema: s('Nonprofit search', {
        q: { type: 'string', description: 'Free-text name search.' },
        ein: { type: 'string', description: '9-digit EIN (with or without hyphen).' },
        state: { type: 'string', description: '2-letter US state.' },
        nteeCode: { type: 'string', description: 'NTEE category (e.g., "B99").' },
        subsectionCode: { type: 'integer', description: 'IRS subsection (3 = 501(c)(3), etc.).' },
        page: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.nonprofit.search(a as never),
    },

    {
      name: 'health.hospital-lookup',
      description: 'CMS Care Compare hospital lookup. Lookup by 6-digit CMS Facility ID, or fuzzy by name + city + state + hospital type with optional min star rating. Returns address, phone, type, ownership, emergency services, overall rating, per-measure-group counts.',
      inputSchema: s('Hospital lookup', {
        facilityId: { type: 'string', description: '6-digit CMS Facility ID.' },
        name: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string', description: '2-letter US state.' },
        hospitalType: { type: 'string' },
        minRating: { type: 'integer', minimum: 1, maximum: 5 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.health.hospitalLookup(a as never),
    },
    {
      name: 'worldbank.indicator',
      description: 'World Bank Open Data — fetch a time series of a specific indicator (e.g., NY.GDP.MKTP.CD = GDP current US$) for a country (ISO 2/3-letter code or "all"). Optional yearFrom/yearTo bracket. 1000+ indicators, 200+ countries.',
      inputSchema: s('World Bank indicator', {
        country: { type: 'string', description: 'ISO 2/3-letter or "all".' },
        indicator: { type: 'string', description: 'World Bank indicator code.' },
        yearFrom: { type: 'integer', minimum: 1960, maximum: 2100 },
        yearTo: { type: 'integer', minimum: 1960, maximum: 2100 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        page: { type: 'integer', minimum: 1, default: 1 },
      }, ['country', 'indicator']),
      invoke: (a) => c.worldbank.indicator(a as never),
    },
    {
      name: 'book.search',
      description: 'Open Library book metadata search. Lookup by free-text query (title + author), or by individual title / author / ISBN. Returns work key, title, authors, first publish year, edition count, cover image URL, ISBNs, publishers, languages, subjects, ebook access.',
      inputSchema: s('Book search', {
        q: { type: 'string' },
        title: { type: 'string' },
        author: { type: 'string' },
        isbn: { type: 'string', description: 'ISBN-10 or ISBN-13 (with or without hyphens).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        page: { type: 'integer', minimum: 1, default: 1 },
      }),
      invoke: (a) => c.book.search(a as never),
    },

    {
      name: 'clinical.trial-search',
      description: "Search ClinicalTrials.gov — every registered US (+ many international) clinical study (~500k). Free-text query, or direct NCT ID. Optional filters: recruitment status, sponsor, phase, country.",
      inputSchema: s('Clinical trial search', {
        query: { type: 'string' },
        nctId: { type: 'string', description: 'NCT\\d{8}.' },
        status: { type: 'string', enum: ['RECRUITING', 'ACTIVE_NOT_RECRUITING', 'COMPLETED', 'TERMINATED', 'WITHDRAWN', 'NOT_YET_RECRUITING', 'SUSPENDED'] },
        sponsor: { type: 'string' },
        phase: { type: 'string' },
        country: { type: 'string' },
        pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        pageToken: { type: 'string' },
      }),
      invoke: (a) => c.clinical.trialSearch(a as never),
    },
    {
      name: 'paper.doi-lookup',
      description: 'Resolve a DOI to authoritative bibliographic metadata via Crossref. Returns work type, title, container (journal), publisher, dates, abstract, authors (ORCID + affiliations), pages, ISSN/ISBN, license, subjects, reference + citation counts.',
      inputSchema: s('DOI lookup', {
        doi: { type: 'string', description: 'Bare DOI (10.1038/nature12373) or full https://doi.org/... URL.' },
      }, ['doi']),
      invoke: (a) => c.paper.doiLookup(a as never),
    },
    {
      name: 'code.repo-lookup',
      description: 'Look up a public GitHub repository by "owner/name". Returns description, language, topics, license, counts (stars/forks/watchers/issues), timestamps, visibility, feature flags. Rate-limited to 60 req/hr/IP (unauthenticated).',
      inputSchema: s('Repo lookup', {
        repo: { type: 'string', description: 'GitHub "owner/name" slug.' },
      }, ['repo']),
      invoke: (a) => c.code.repoLookup(a as never),
    },
    {
      name: 'wikidata.entity',
      description: 'Fetch a Wikidata entity (Q42, P31, etc.) — structured knowledge-graph record with labels + descriptions in selectable languages, claims (property → value), sitelinks. 110M+ entities, CC0.',
      inputSchema: s('Wikidata entity', {
        id: { type: 'string', description: 'Wikidata identifier (Q/P/L/M/S + digits).' },
        languages: { type: 'string', description: 'Comma-separated language codes (default "en").' },
        includeClaims: { type: 'boolean', default: true },
        maxClaimsPerProperty: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      }, ['id']),
      invoke: (a) => c.wikidata.entity(a as never),
    },

    {
      name: 'registry.npm-lookup',
      description: 'Look up an npm package by name (supports @scope/name). Returns description, repository, license, author + maintainers, keywords, distTags, latest version, and the 50 most recent versions with publish dates.',
      inputSchema: s('npm lookup', { name: { type: 'string' } }, ['name']),
      invoke: (a) => c.registry.npmLookup(a as never),
    },
    {
      name: 'registry.pypi-lookup',
      description: 'Look up a Python package on PyPI. Returns version, summary, project URLs, license, author/maintainer, classifiers, requires-python, runtime deps, recent release dates, yanked versions.',
      inputSchema: s('PyPI lookup', { name: { type: 'string' } }, ['name']),
      invoke: (a) => c.registry.pypiLookup(a as never),
    },
    {
      name: 'fx.rates',
      description: 'Daily reference exchange rates from the European Central Bank (via Frankfurter). 30+ major currencies. Optional base (default USD), symbols (target codes), date (YYYY-MM-DD; omit for latest), amount.',
      inputSchema: s('FX rates', {
        base: { type: 'string', description: '3-letter ISO 4217.' },
        symbols: { type: 'string', description: 'Comma-separated target codes.' },
        date: { type: 'string', format: 'date' },
        amount: { type: 'number' },
      }),
      invoke: (a) => c.fx.rates(a as never),
    },
    {
      name: 'fx.timeseries',
      description: 'Historical daily exchange-rate series from the European Central Bank (via Frankfurter) with computed stats. base (default USD), start (YYYY-MM-DD, required), optional end (default latest), symbols (comma-separated target codes), amount. Range capped at 366 days. Returns per-currency first/last/min/max/mean and absolute + % change, plus the full daily series. Business days only.',
      inputSchema: s('FX timeseries', {
        base: { type: 'string', description: '3-letter ISO 4217.' },
        symbols: { type: 'string', description: 'Comma-separated target codes.' },
        start: { type: 'string', format: 'date', description: 'Inclusive start date YYYY-MM-DD.' },
        end: { type: 'string', format: 'date', description: 'Inclusive end date YYYY-MM-DD; default latest.' },
        amount: { type: 'number' },
      }, ['start']),
      invoke: (a) => c.fx.timeseries(a as never),
    },
    {
      name: 'bls.series',
      description: 'US Bureau of Labor Statistics time-series data. seriesIds = comma-separated BLS series IDs (1-10 per call), optional startYear + endYear (max 10 years). Common: LNS14000000 (unemployment), CUUR0000SA0 (CPI-U), CES0000000001 (nonfarm employment).',
      inputSchema: s('BLS series', {
        seriesIds: { type: 'string' },
        startYear: { type: 'integer', minimum: 1900, maximum: 2100 },
        endYear: { type: 'integer', minimum: 1900, maximum: 2100 },
      }, ['seriesIds']),
      invoke: (a) => c.bls.series(a as never),
    },
    {
      name: 'country.lookup',
      description: 'Country metadata via REST Countries. Lookup by alpha2 (ISO 3166-1), alpha3, or name (with optional fullText exact match). Returns names, ISO codes, region/subregion, capital, population, area, languages, currencies, calling code, flag, coordinates, driving side, TLDs.',
      inputSchema: s('Country lookup', {
        alpha2: { type: 'string' },
        alpha3: { type: 'string' },
        name: { type: 'string' },
        fullText: { type: 'boolean', default: false },
      }),
      invoke: (a) => c.country.lookup(a as never),
    },
    {
      name: 'news.hn-top',
      description: 'Hacker News feed. kind = top | new | best | ask | show | job. Returns items with title, URL, score, comment count, author, time, dead/deleted flags.',
      inputSchema: s('HN feed', {
        kind: { type: 'string', enum: ['top', 'new', 'best', 'ask', 'show', 'job'], default: 'top' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
      }),
      invoke: (a) => c.news.hnTop(a as never),
    },
    {
      name: 'news.hn-item',
      description: 'Fetch a specific Hacker News item by numeric ID.',
      inputSchema: s('HN item', { id: { type: 'integer' } }, ['id']),
      invoke: (a) => c.news.hnItem(a as never),
    },
    {
      name: 'food.barcode-lookup',
      description: 'Food product lookup by UPC/EAN barcode via Open Food Facts (CC0, >3M products). Returns product name, brand, ingredients, allergens, nutriments (per-100g + per-serving), Nutri-Score (a-e), NOVA processing classification (1-4), Eco-Score, categories, manufacturing origin, packaging, product image URLs.',
      inputSchema: s('Food barcode lookup', { barcode: { type: 'string', description: '6-14 digit UPC/EAN.' } }, ['barcode']),
      invoke: (a) => c.food.barcodeLookup(a as never),
    },
    {
      name: 'word.define',
      description: 'English dictionary entry via dictionaryapi.dev (Wiktionary, CC BY-SA). Returns IPA phonetic transcription(s), audio URLs, and meanings grouped by part of speech with definitions, examples, synonyms, antonyms.',
      inputSchema: s('Word define', { word: { type: 'string', description: '1-50 English alphabetic characters.' } }, ['word']),
      invoke: (a) => c.word.define(a as never),
    },
    {
      name: 'word.related',
      description: 'Related-word lookup via Datamuse. Supply a seed word and relation kind: rhymes, near-rhymes, synonyms, antonyms, means (semantic match), triggers, homophones, sounds-like, spelled-like, follows-from, preceded-by. Returns ranked candidates with relevance score, syllable count, and grammar tags.',
      inputSchema: s('Word related', {
        word: { type: 'string' },
        relation: { type: 'string', enum: ['rhymes', 'near-rhymes', 'synonyms', 'antonyms', 'means', 'triggers', 'homophones', 'sounds-like', 'spelled-like', 'follows-from', 'preceded-by'] },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      }, ['word', 'relation']),
      invoke: (a) => c.word.related(a as never),
    },

    // ── Gov ──────────────────────────────────────────────────────────
    {
      name: 'gov.congress-bill',
      description: 'US Congressional bill lookup (congress + type + number) or filtered list via Library of Congress Congress.gov API. Bill types: hr (House), s (Senate), hjres/sjres (joint resolution), hconres/sconres (concurrent), hres/sres (simple).',
      inputSchema: s('Congress bill', {
        congress: { type: 'integer' },
        type: { type: 'string', enum: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'] },
        number: { type: 'integer' },
        fromDate: { type: 'string' },
        toDate: { type: 'string' },
        sort: { type: 'string', enum: ['updateDate+desc', 'updateDate+asc'], default: 'updateDate+desc' },
        limit: { type: 'integer', minimum: 1, maximum: 250, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.congressBill(a as never),
    },
    {
      name: 'gov.congress-member',
      description: 'US Congress member lookup by bioguide ID or filtered list (state, district, congress, currentMember). Bioguide IDs are stable across history.',
      inputSchema: s('Congress member', {
        bioguideId: { type: 'string' },
        congress: { type: 'integer' },
        state: { type: 'string' },
        district: { type: 'integer' },
        currentMember: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 250, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.congressMember(a as never),
    },
    {
      name: 'gov.district',
      description: 'Resolve a US street address to its congressional district (119th Congress), state, and county via the US Census Bureau geocoder. Returns matched address, lat/lon, state (name + abbr), county, and district number (null for at-large/delegate). The point-in-polygon district lookup an agent can\'t do from a sandbox; pair with gov.congress-member for the reps. Public domain, keyless.',
      inputSchema: s('Address to district', { address: { type: 'string', description: 'US street address (one line).' } }, ['address']),
      invoke: (a) => c.gov.district(a as never),
    },
    {
      name: 'gov.fec-candidate',
      description: 'Search US federal political candidates via OpenFEC. Filter by q (name), candidate ID, state/district, party, office (P/S/H), cycle, electionYear, hasRaised. Returns FEC candidate ID linkable to /api/gov/fec-committee.',
      inputSchema: s('FEC candidate', {
        q: { type: 'string' },
        candidateId: { type: 'string' },
        state: { type: 'string' },
        district: { type: 'string' },
        party: { type: 'string' },
        office: { type: 'string', enum: ['P', 'S', 'H'] },
        cycle: { type: 'integer' },
        electionYear: { type: 'integer' },
        hasRaised: { type: 'boolean' },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        page: { type: 'integer', minimum: 1, default: 1 },
      }),
      invoke: (a) => c.gov.fecCandidate(a as never),
    },
    {
      name: 'gov.fec-committee',
      description: 'Search US federal political committees (PACs, super PACs, party committees, candidate principal committees) via OpenFEC. Filter by q, committeeId, candidateId, committeeType, designation, state, party, cycle, organizationType.',
      inputSchema: s('FEC committee', {
        q: { type: 'string' },
        committeeId: { type: 'string' },
        candidateId: { type: 'string' },
        committeeType: { type: 'string' },
        designation: { type: 'string' },
        state: { type: 'string' },
        party: { type: 'string' },
        cycle: { type: 'integer' },
        organizationType: { type: 'string' },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        page: { type: 'integer', minimum: 1, default: 1 },
      }),
      invoke: (a) => c.gov.fecCommittee(a as never),
    },
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
      name: 'gov.product-recalls',
      description:
        'CPSC consumer-product recalls (SaferProducts.gov), newest first. Covers everything outside FDA (food/drug/device) and NHTSA (vehicles): strollers, appliances, lithium batteries, furniture, toys, power tools, etc. All filters optional (none set → last 12 months). Each record has recall number+date, title, CPSC URL, affected products, hazards, remedies, injuries, manufacturers/importers/distributors/retailers, where sold, countries, images.',
      inputSchema: s('CPSC product recalls', {
        title: { type: 'string', description: 'Substring match on the recall title.' },
        productName: { type: 'string', description: 'Substring match on an affected product name.' },
        recallNumber: { type: 'string', description: 'Exact CPSC recall number, e.g. "26094".' },
        dateStart: { type: 'string', description: 'Earliest recall date (YYYY-MM-DD).' },
        dateEnd: { type: 'string', description: 'Latest recall date (YYYY-MM-DD).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      }),
      invoke: (a) => c.gov.productRecalls(a as never),
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

    {
      name: 'gov.fec-contributions',
      description: 'FEC Schedule A — itemized contributions to federal political committees (>264M rows). Filter by recipient committeeId/candidateId, contributor name/city/state/zip/employer/occupation, amount + date ranges, cycle, isIndividual. Sort by date or amount.',
      inputSchema: s('FEC Schedule A', {
        committeeId: { type: 'string' },
        candidateId: { type: 'string' },
        contributorName: { type: 'string' },
        contributorCity: { type: 'string' },
        contributorState: { type: 'string' },
        contributorZip: { type: 'string' },
        contributorEmployer: { type: 'string' },
        contributorOccupation: { type: 'string' },
        minAmount: { type: 'number' },
        maxAmount: { type: 'number' },
        twoYearTransactionPeriod: { type: 'integer' },
        minDate: { type: 'string' },
        maxDate: { type: 'string' },
        isIndividual: { type: 'boolean' },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        page: { type: 'integer', minimum: 1, default: 1 },
        sortField: { type: 'string', enum: ['contribution_receipt_date', 'contribution_receipt_amount'] },
        sortDirection: { type: 'string', enum: ['asc', 'desc'] },
      }),
      invoke: (a) => c.gov.fecContributions(a as never),
    },
    {
      name: 'gov.fec-expenditures',
      description: 'FEC Schedule B — itemized committee disbursements (>157M rows). Filter by committeeId, recipient name/city/state, disbursement purpose category, description, amount + date ranges, cycle.',
      inputSchema: s('FEC Schedule B', {
        committeeId: { type: 'string' },
        recipientName: { type: 'string' },
        recipientCity: { type: 'string' },
        recipientState: { type: 'string' },
        disbursementPurposeCategory: { type: 'string' },
        disbursementDescription: { type: 'string' },
        minAmount: { type: 'number' },
        maxAmount: { type: 'number' },
        twoYearTransactionPeriod: { type: 'integer' },
        minDate: { type: 'string' },
        maxDate: { type: 'string' },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        page: { type: 'integer', minimum: 1, default: 1 },
        sortField: { type: 'string', enum: ['disbursement_date', 'disbursement_amount'] },
        sortDirection: { type: 'string', enum: ['asc', 'desc'] },
      }),
      invoke: (a) => c.gov.fecExpenditures(a as never),
    },
    {
      name: 'gov.fec-totals',
      description: 'FEC aggregate financial totals (receipts, disbursements, cash-on-hand, debt, etc.) for candidates (scope=candidates) or committees (scope=committees). Filter by candidate/committee ID, cycle, office, party, state, district. For candidates, electionFull=true rolls all cycles of one election into a row.',
      inputSchema: s('FEC totals', {
        scope: { type: 'string', enum: ['candidates', 'committees'] },
        candidateId: { type: 'string' },
        committeeId: { type: 'string' },
        cycle: { type: 'integer' },
        office: { type: 'string', enum: ['P', 'S', 'H'] },
        party: { type: 'string' },
        state: { type: 'string' },
        district: { type: 'string' },
        electionFull: { type: 'boolean' },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        page: { type: 'integer', minimum: 1, default: 1 },
      }, ['scope']),
      invoke: (a) => c.gov.fecTotals(a as never),
    },
    {
      name: 'gov.congress-committee',
      description: 'US Congressional committee list or single-committee detail (Congress.gov). Filter list by congress + chamber (house/senate/joint). Pass systemCode (e.g. hspw00) for single committee.',
      inputSchema: s('Congress committee', {
        congress: { type: 'integer' },
        chamber: { type: 'string', enum: ['house', 'senate', 'joint'] },
        systemCode: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 250, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.congressCommittee(a as never),
    },
    {
      name: 'gov.congress-amendment',
      description: 'US Congressional amendments lookup or list (Congress.gov). Types: hamdt (House), samdt (Senate), suamdt (Senate Unprinted). Pass congress+type+number for single amendment.',
      inputSchema: s('Congress amendment', {
        congress: { type: 'integer' },
        type: { type: 'string', enum: ['hamdt', 'samdt', 'suamdt'] },
        number: { type: 'integer' },
        fromDate: { type: 'string' },
        toDate: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 250, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.congressAmendment(a as never),
    },
    {
      name: 'gov.congress-nomination',
      description: 'US presidential nominations (cabinet, judicial, executive) sent to the Senate for confirmation (Congress.gov). Pass congress+number for single nomination; or filter by congress + date range.',
      inputSchema: s('Congress nomination', {
        congress: { type: 'integer' },
        number: { type: 'integer' },
        fromDate: { type: 'string' },
        toDate: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 250, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.congressNomination(a as never),
    },
    {
      name: 'gov.congress-hearing',
      description: 'US Congressional hearings (Congress.gov). Pass congress+chamber+jacketNumber for single hearing; otherwise list by congress+chamber with optional date range.',
      inputSchema: s('Congress hearing', {
        congress: { type: 'integer' },
        chamber: { type: 'string', enum: ['house', 'senate'] },
        jacketNumber: { type: 'integer' },
        fromDate: { type: 'string' },
        toDate: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 250, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.congressHearing(a as never),
    },
    {
      name: 'gov.congress-treaty',
      description: 'International treaties transmitted to the US Senate for advice and consent (Congress.gov).',
      inputSchema: s('Congress treaty', {
        congress: { type: 'integer' },
        number: { type: 'integer' },
        suffix: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 250, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.congressTreaty(a as never),
    },
    {
      name: 'gov.congress-record',
      description: 'Daily Congressional Record issues (official US House+Senate proceedings transcript) via Congress.gov. Filter by year/month/day.',
      inputSchema: s('Congressional Record', {
        year: { type: 'integer' },
        month: { type: 'integer', minimum: 1, maximum: 12 },
        day: { type: 'integer', minimum: 1, maximum: 31 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.congressRecord(a as never),
    },
    {
      name: 'gov.bill-summaries',
      description: 'Latest US Congressional bill summaries (CRS-authored, attached to specific bill versions) via Congress.gov. Filter by congress + bill type + date range.',
      inputSchema: s('Bill summaries', {
        congress: { type: 'integer' },
        type: { type: 'string', enum: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'] },
        fromDate: { type: 'string' },
        toDate: { type: 'string' },
        sort: { type: 'string', enum: ['updateDate+desc', 'updateDate+asc'] },
        limit: { type: 'integer', minimum: 1, maximum: 250, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.billSummaries(a as never),
    },
    {
      name: 'gov.osha-inspections',
      description: 'Search OSHA inspection records via US Department of Labor Open Data Portal (~5M historical inspections). Filter by state/city/zip, establishment name substring, plus raw OData filter clauses.',
      inputSchema: s('OSHA inspections', {
        state: { type: 'string' },
        city: { type: 'string' },
        zip: { type: 'string' },
        estabName: { type: 'string' },
        fields: { type: 'string' },
        filter: { type: 'string' },
        sort: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.oshaInspections(a as never),
    },
    {
      name: 'gov.osha-violations',
      description: 'OSHA citation / violation records via DOL Open Data Portal (~13.2M citations). Link to inspections by activityNr. Filter by standard (29 CFR section), issuance date range, initial-penalty min/max, emphasis program code.',
      inputSchema: s('OSHA violations', {
        activityNr: { type: 'integer' },
        citationId: { type: 'string' },
        standard: { type: 'string' },
        issuanceDateMin: { type: 'string' },
        issuanceDateMax: { type: 'string' },
        initialPenalty: { type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' } } },
        emphasis: { type: 'string' },
        fields: { type: 'string' },
        sort: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.oshaViolations(a as never),
    },
    {
      name: 'gov.osha-accidents',
      description: 'OSHA-investigated workplace accident reports via DOL Open Data Portal (~165k). Each row carries summary_nr, related inspection nr, event date, narrative, nature of injury, body part, source, occupation, age, sex, degree of injury (1=fatality).',
      inputSchema: s('OSHA accidents', {
        summaryNr: { type: 'integer' },
        activityNr: { type: 'integer' },
        reportId: { type: 'string' },
        eventDateMin: { type: 'string' },
        eventDateMax: { type: 'string' },
        natureOfInj: { type: 'string' },
        fatality: { type: 'boolean' },
        fields: { type: 'string' },
        sort: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.oshaAccidents(a as never),
    },
    {
      name: 'gov.msha-accidents',
      description: 'MSHA mine safety accident records via DOL Open Data Portal (~738k). Every US coal + metal/nonmetal mine accident since 2000. Filter by mine id, contractor id, FIPS state code, subunit (underground/surface/mill), accident date range, classification code.',
      inputSchema: s('MSHA accidents', {
        mineId: { type: 'string' },
        contractorId: { type: 'string' },
        state: { type: 'string', description: '2-char FIPS code (numeric).' },
        subunit: { type: 'string' },
        accidentDateMin: { type: 'string' },
        accidentDateMax: { type: 'string' },
        classification: { type: 'string' },
        fields: { type: 'string' },
        sort: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.gov.mshaAccidents(a as never),
    },

    // ── Education / Energy / Park / Recreation / Job (api.data.gov + USAJobs) ──
    {
      name: 'edu.college-scorecard',
      description: 'Search US colleges + universities via the Department of Education College Scorecard. Filter by name, IPEDS id, state/city/zip, ownership (1=Public | 2=Private nonprofit | 3=Private for-profit), predominant degree (0..4), enrollment range. Returns curated identity + admissions + cost + aid + completion + earnings + repayment fields per school.',
      inputSchema: s('College Scorecard', {
        q: { type: 'string' },
        schoolId: { type: 'integer' },
        state: { type: 'string' },
        city: { type: 'string' },
        zip: { type: 'string' },
        ownership: { type: 'integer', enum: [1, 2, 3] },
        degreePredominant: { type: 'integer', enum: [0, 1, 2, 3, 4] },
        minEnrollment: { type: 'integer' },
        maxEnrollment: { type: 'integer' },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        page: { type: 'integer', minimum: 0, default: 0 },
        fields: { type: 'string' },
      }),
      invoke: (a) => c.edu.collegeScorecard(a as never),
    },
    {
      name: 'energy.fuel-stations',
      description: 'NREL alternative-fuel station locator. Filter by lat/lon + radius, state, zip, fuelType (BD/CNG/ELEC/E85/HY/LNG/LPG/RD), status, access, EV network. For EV: returns connector types, Level1/2/DC-fast counts, pricing, hours.',
      inputSchema: s('Fuel stations (NREL)', {
        lat: { type: 'number' },
        lon: { type: 'number' },
        radius: { type: 'number', maximum: 500 },
        fuelType: { type: 'string', description: 'Comma-separated codes.' },
        state: { type: 'string' },
        zip: { type: 'string' },
        status: { type: 'string', enum: ['all', 'E', 'P', 'T'] },
        accessCode: { type: 'string', enum: ['all', 'public', 'private'] },
        network: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
      }),
      invoke: (a) => c.energy.fuelStations(a as never),
    },
    {
      name: 'energy.solar-resource',
      description: 'NREL solar resource averages (NSRDB) for a lat/lon. Returns annual + monthly DNI (direct normal irradiance), GHI (global horizontal), and tilted-at-latitude irradiance in kWh/m²/day.',
      inputSchema: s('Solar resource (NREL)', {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
      }, ['lat', 'lon']),
      invoke: (a) => c.energy.solarResource(a as never),
    },
    {
      name: 'energy.prices',
      description:
        'US energy benchmark prices from the EIA open-data API. Omit series for a one-call snapshot of every benchmark; pass series for its recent time series. Benchmarks: wti_crude / brent_crude ($/barrel), henry_hub_gas ($/MMBtu), gasoline_regular / diesel ($/gallon), electricity_retail (cents/kWh). Each observation has date, value, units, frequency.',
      inputSchema: s('EIA energy prices', {
        series: { type: 'string', enum: ['wti_crude', 'brent_crude', 'henry_hub_gas', 'gasoline_regular', 'diesel', 'electricity_retail'], description: 'Benchmark id. Omit for a snapshot of all.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 12, description: 'Observations in single-series mode.' },
      }),
      invoke: (a) => c.energy.prices(a as never),
    },
    {
      name: 'energy.generation-mix',
      description:
        'Electricity generation mix by fuel type for a US state (2-letter) or "US", from EIA — the latest monthly net generation (thousand MWh) per fuel (natural gas, coal, nuclear, solar, wind, hydro…) with each fuel\'s % share and the all-fuels total. For grid carbon-intensity and decarbonization reasoning. Public-domain.',
      inputSchema: s('Generation mix', {
        location: { type: 'string', description: '2-letter US state code, or "US".' },
      }, ['location']),
      invoke: (a) => c.energy.generationMix(a as never),
    },
    {
      name: 'energy.electricity-rates',
      description:
        'Retail electricity price + sales for a US state by customer sector (residential/commercial/industrial/transportation/all), monthly newest-first, from EIA. Returns price (cents/kWh), sales (MWh), revenue ($M), customers. More granular than energy.prices (national benchmark only).',
      inputSchema: s('Electricity rates', {
        state: { type: 'string', description: '2-letter US state code.' },
        sector: { type: 'string', enum: ['residential', 'commercial', 'industrial', 'transportation', 'all'] },
        months: { type: 'integer', minimum: 1, maximum: 120 },
      }, ['state']),
      invoke: (a) => c.energy.electricityRates(a as never),
    },
    {
      name: 'energy.utility-rates',
      description:
        'Which electric utility serves a US lat/lng + a summary of its published rate plans, from OpenEI URDB (CC0). Each plan: utility, rate name, sector, EIA utility id, fixed monthly charge, first-tier energy rate ($/kWh), tariff link. For solar/EV/storage economics, bill estimation, and "who is my utility".',
      inputSchema: s('Utility rates', {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      }, ['lat', 'lon']),
      invoke: (a) => c.energy.utilityRates(a as never),
    },
    {
      name: 'park.lookup',
      description: 'Unified read API over the US National Park Service developer.nps.gov. resource = parks | alerts | campgrounds | events | newsreleases | thingstodo | visitorcenters. Filter by parkCode (CSV), state, free-text query.',
      inputSchema: s('NPS park lookup', {
        resource: { type: 'string', enum: ['parks', 'alerts', 'campgrounds', 'events', 'newsreleases', 'thingstodo', 'visitorcenters'] },
        parkCode: { type: 'string' },
        state: { type: 'string' },
        q: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        start: { type: 'integer', minimum: 0, default: 0 },
      }, ['resource']),
      invoke: (a) => c.park.lookup(a as never),
    },
    {
      name: 'recreation.search',
      description: 'Recreation Information Database (RIDB / Recreation.gov) — federal lands across NPS, USFS, BLM, USACE, BOR, FWS, NARA. resource = recareas | facilities | campsites | permits | tours | events | activities. Filter by query, state, activity ID, lat/lon + radius.',
      inputSchema: s('Recreation search (RIDB)', {
        resource: { type: 'string', enum: ['recareas', 'facilities', 'campsites', 'permits', 'tours', 'events', 'activities'] },
        query: { type: 'string' },
        state: { type: 'string' },
        activity: { type: 'integer' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        radius: { type: 'number', maximum: 50 },
        lastUpdated: { type: 'string', description: 'MM-DD-YYYY.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }, ['resource']),
      invoke: (a) => c.recreation.search(a as never),
    },
    {
      name: 'job.federal-search',
      description: 'Search current US federal job postings via USAJobs. Filter by keyword, positionTitle, locationName, remote, pay grade range, jobCategoryCode (occupational series), organization, whoMayApply.',
      inputSchema: s('USAJobs search', {
        keyword: { type: 'string' },
        positionTitle: { type: 'string' },
        locationName: { type: 'string' },
        remote: { type: 'boolean' },
        payGradeLow: { type: 'string' },
        payGradeHigh: { type: 'string' },
        jobCategoryCode: { type: 'string' },
        organization: { type: 'string' },
        whoMayApply: { type: 'string', enum: ['all', 'public', 'status'] },
        resultsPerPage: { type: 'integer', minimum: 1, maximum: 500, default: 25 },
        page: { type: 'integer', minimum: 1, default: 1 },
        sortField: { type: 'string', enum: ['OpenDate', 'CloseDate', 'PositionTitle', 'Salary'] },
        sortDirection: { type: 'string', enum: ['Asc', 'Desc'] },
      }),
      invoke: (a) => c.job.federalSearch(a as never),
    },
    {
      name: 'job.federal-codes',
      description: 'USAJobs reference codelists — 33 lookup tables (agencysubelements, occupationalseries, paygrades, payplans, hiringpaths, securityclearances, locationcodes, languagecodes, etc.) feeding /api/job/federal-search filters.',
      inputSchema: s('USAJobs codelist', {
        name: { type: 'string', enum: ['academichonors', 'agencysubelements', 'announcementclosingtypes', 'applicantsuppliers', 'cyberworkroles', 'countries', 'countrysubdivisions', 'degreetypecodes', 'documentations', 'ethnicities', 'federalemploymentstatuses', 'geoloccodes', 'hiringpaths', 'languagecodes', 'languageproficiencies', 'locationcodes', 'militarystatuscodes', 'missioncriticalcodes', 'occupationalseries', 'paygrades', 'payplans', 'positionofferingtypecodes', 'positionopeningstatuses', 'positionscheduletypecodes', 'racecodes', 'refereetypecodes', 'remunerationrateintervalcodes', 'requiredstandarddocuments', 'securityclearances', 'servicetypes', 'specialhirings', 'travelpercentages', 'whomayapply'] },
      }, ['name']),
      invoke: (a) => c.job.federalCodes(a as never),
    },

    // ── Property (NYC OpenData via Socrata) ────────────────────────────
    {
      name: 'property.nyc-parcel-lookup',
      description: 'NYC tax-lot lookup via PLUTO — every NYC lot with owner, zoning, lot/building area, year built, classification, lat/lon. Pass bbl (10-digit Borough-Block-Lot) for exact lookup or address (partial) optionally constrained by borough (MN/BX/BK/QN/SI). The BBL returned here is the universal join key for property.nyc-deed-history / nyc-permits / nyc-violations.',
      inputSchema: s('NYC parcel lookup', {
        bbl: { type: 'string', description: '10-digit BBL.' },
        address: { type: 'string' },
        borough: { type: 'string', description: 'Name or 2-letter code (MN/BX/BK/QN/SI).' },
      }),
      invoke: (a) => c.property.nycParcelLookup(a as never),
    },
    {
      name: 'property.nyc-deed-history',
      description: 'NYC ACRIS deed + mortgage history for a BBL. Each row carries a documentId you can use to drill into the ACRIS master dataset (URL pattern in response).',
      inputSchema: s('NYC deed history', {
        bbl: { type: 'string', description: '10-digit BBL.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }, ['bbl']),
      invoke: (a) => c.property.nycDeedHistory(a as never),
    },
    {
      name: 'property.nyc-permits',
      description: 'NYC DOB construction permits. Filter by bbl or address, jobType (A1/A2/A3/NB/DM/etc.), permitStatus (ISSUED/IN PROCESS/etc.). Returns job + permit IDs, work type, building type, residential flag, filing/issuance/expiration dates, estimated fee.',
      inputSchema: s('NYC permits', {
        bbl: { type: 'string' },
        address: { type: 'string' },
        jobType: { type: 'string' },
        permitStatus: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.property.nycPermits(a as never),
    },
    {
      name: 'property.nyc-violations',
      description: 'NYC HPD housing violations. Filter by bbl or address, classCode (A=least severe through C=immediately hazardous), currentStatusOnly=true (open violations). Returns full address + apartment + story, inspection + certify-by + correct-by dates, current status, NOV narrative.',
      inputSchema: s('NYC HPD violations', {
        bbl: { type: 'string' },
        address: { type: 'string' },
        classCode: { type: 'string', enum: ['A', 'B', 'C'] },
        currentStatusOnly: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      }),
      invoke: (a) => c.property.nycViolations(a as never),
    },

    // ── Treasury (US Treasury Fiscal Data) ─────────────────────────────
    {
      name: 'treasury.debt',
      description: 'US National Debt — daily Debt to the Penny via US Treasury Fiscal Data. Total public debt + held-by-public + intragovernmental holdings, every weekday since 1993.',
      inputSchema: s('Treasury debt', {
        fields: { type: 'string' },
        filter: { type: 'string', description: 'Fiscal Data syntax e.g. record_date:gte:2024-01-01' },
        sort: { type: 'string', default: '-record_date' },
        pageSize: { type: 'integer', minimum: 1, maximum: 10000, default: 100 },
        pageNumber: { type: 'integer', minimum: 1 },
      }),
      invoke: (a) => c.treasury.debt(a as never),
    },
    {
      name: 'treasury.cash',
      description: 'Daily Treasury Statement (DTS) operating cash balance — Treasury General Account at the Federal Reserve, plus tax-and-loan + Federal Reserve deposit accounts. Liquidity-tracking + macro signals.',
      inputSchema: s('Treasury cash', {
        fields: { type: 'string' },
        filter: { type: 'string' },
        sort: { type: 'string', default: '-record_date' },
        pageSize: { type: 'integer', minimum: 1, maximum: 10000, default: 100 },
        pageNumber: { type: 'integer', minimum: 1 },
      }),
      invoke: (a) => c.treasury.cash(a as never),
    },
    {
      name: 'treasury.exchange-rates',
      description: 'Official US Treasury exchange rates (quarterly) — used by federal agencies for foreign-currency reporting. Pair with /api/fx/rates (ECB daily) for cross-validation.',
      inputSchema: s('Treasury FX', {
        fields: { type: 'string' },
        filter: { type: 'string', description: 'e.g. country:eq:Brazil' },
        sort: { type: 'string', default: '-record_date' },
        pageSize: { type: 'integer', minimum: 1, maximum: 10000, default: 100 },
        pageNumber: { type: 'integer', minimum: 1 },
      }),
      invoke: (a) => c.treasury.exchangeRates(a as never),
    },
    {
      name: 'treasury.monthly-statement',
      description: 'Monthly Treasury Statement (MTS) — Table 4 federal receipts by source. Monthly + fiscal-year-to-date totals by classification (individual income tax, corporate income tax, social-insurance, excise, customs, estate-and-gift, misc).',
      inputSchema: s('Treasury MTS', {
        fields: { type: 'string' },
        filter: { type: 'string' },
        sort: { type: 'string', default: '-record_date' },
        pageSize: { type: 'integer', minimum: 1, maximum: 10000, default: 100 },
        pageNumber: { type: 'integer', minimum: 1 },
      }),
      invoke: (a) => c.treasury.monthlyStatement(a as never),
    },
  ]
  return t
}
