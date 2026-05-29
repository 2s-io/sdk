package twosio

import (
	"context"
	"net/url"
	"strconv"
)

// ── Patents ──────────────────────────────────────────────────────────────

type PatentsAPI struct{ c *Client }

type PatentsSearchInput struct {
	Q               string `json:"q"`
	YearFrom        int    `json:"yearFrom,omitempty"`
	YearTo          int    `json:"yearTo,omitempty"`
	ApplicationType string `json:"applicationType,omitempty"`
	Limit           int    `json:"limit,omitempty"`
	Offset          int    `json:"offset,omitempty"`
}

type PatentHit struct {
	ApplicationNumber string   `json:"applicationNumber"`
	Title             *string  `json:"title"`
	ApplicationType   *string  `json:"applicationType"`
	FirstInventor     *string  `json:"firstInventor"`
	Inventors         []string `json:"inventors"`
	Applicants        []string `json:"applicants"`
	FilingDate        *string  `json:"filingDate"`
	CPCSymbols        []string `json:"cpcSymbols"`
	URL               string   `json:"url"`
}

type PatentsSearchResult struct {
	Total   int         `json:"total"`
	Hits    []PatentHit `json:"hits"`
}

func (a PatentsAPI) Search(ctx context.Context, in PatentsSearchInput) (CallResult[PatentsSearchResult], error) {
	q := url.Values{}
	q.Set("q", in.Q)
	if in.YearFrom != 0 {
		q.Set("yearFrom", strconv.Itoa(in.YearFrom))
	}
	if in.YearTo != 0 {
		q.Set("yearTo", strconv.Itoa(in.YearTo))
	}
	if in.ApplicationType != "" {
		q.Set("applicationType", in.ApplicationType)
	}
	if in.Limit > 0 {
		q.Set("limit", strconv.Itoa(in.Limit))
	}
	if in.Offset > 0 {
		q.Set("offset", strconv.Itoa(in.Offset))
	}
	var out PatentsSearchResult
	gr, err := a.c.request(ctx, "GET", "/api/patents/search", "patents.search", q, nil, &out)
	if err != nil {
		return CallResult[PatentsSearchResult]{}, err
	}
	return resultOf(out, gr), nil
}

// ── Crypto ───────────────────────────────────────────────────────────────

type CryptoAPI struct{ c *Client }

type CryptoAddressValidateInput struct {
	Chain   string `json:"chain"`
	Address string `json:"address"`
}

type CryptoAddressValidateResult struct {
	Chain     string  `json:"chain"`
	Address   string  `json:"address"`
	Valid     bool    `json:"valid"`
	Canonical *string `json:"canonical"`
	Format    *string `json:"format"`
	Reason    *string `json:"reason"`
}

func (a CryptoAPI) AddressValidate(ctx context.Context, in CryptoAddressValidateInput) (CallResult[CryptoAddressValidateResult], error) {
	q := url.Values{}
	q.Set("chain", in.Chain)
	q.Set("address", in.Address)
	var out CryptoAddressValidateResult
	gr, err := a.c.request(ctx, "GET", "/api/crypto/address-validate", "crypto.address-validate", q, nil, &out)
	if err != nil {
		return CallResult[CryptoAddressValidateResult]{}, err
	}
	return resultOf(out, gr), nil
}

// ── AI ───────────────────────────────────────────────────────────────────

type AIAPI struct{ c *Client }

type AISummarizeInput struct {
	URL         string `json:"url"`
	Instruction string `json:"instruction,omitempty"`
}

type AISummarizeResult struct {
	URL                     string   `json:"url"`
	FinalURL                string   `json:"finalUrl"`
	Summary                 string   `json:"summary"`
	KeyPoints               []string `json:"keyPoints"`
	Title                   *string  `json:"title"`
	Audience                *string  `json:"audience"`
	EstimatedReadingMinutes *int     `json:"estimatedReadingMinutes"`
}

func (a AIAPI) Summarize(ctx context.Context, in AISummarizeInput) (CallResult[AISummarizeResult], error) {
	var out AISummarizeResult
	gr, err := a.c.request(ctx, "POST", "/api/ai/summarize", "ai.summarize", nil, in, &out)
	if err != nil {
		return CallResult[AISummarizeResult]{}, err
	}
	return resultOf(out, gr), nil
}

// ── Stub group types for the remaining namespaces (typed methods to be
// added incrementally; until they ship, use the raw client.request via
// the embedded *Client). ───────────────────────────────────────────────

type LawAPI struct{ c *Client }
type GeocodeAPI struct{ c *Client }
type AirportAPI struct{ c *Client }
type WeatherAPI struct{ c *Client }
type DNSAPI struct{ c *Client }
type DomainAPI struct{ c *Client }
type URLAPI struct{ c *Client }
type AccountAPI struct{ c *Client }

func resultOf[T any](data T, gr *genericResult) CallResult[T] {
	return CallResult[T]{
		Data:       data,
		Endpoint:   gr.Endpoint,
		CostUSD:    gr.CostUSD,
		Settlement: gr.Settlement,
		BalanceUSD: gr.BalanceUSD,
	}
}
