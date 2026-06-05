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
