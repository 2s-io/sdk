// Package twosio is the Go client for 2s.io — pay-per-call AI agent
// APIs on Base via x402.
//
// Two auth modes:
//
//	x402 (default): pass a *crypto.PrivateKey via WithSigner. The client
//	auto-handles 402 responses, signs an EIP-3009 USDC authorization via
//	the official x402 Go SDK, retries, and returns the typed result.
//
//	Bearer: pass an API key via WithAPIKey to debit a pre-funded account.
//
// Example:
//
//	signer, _ := crypto.HexToECDSA(strings.TrimPrefix(os.Getenv("EVM_PRIVATE_KEY"), "0x"))
//	client := twosio.New(twosio.WithSigner(signer))
//	res, err := client.Patents.Search(ctx, twosio.PatentsSearchInput{Q: "neural network", Limit: 5})
package twosio

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const (
	DefaultBaseURL       = "https://2s.io"
	DefaultMaxPriceUSD   = 0.10
	DefaultTimeoutSec    = 30
)

// Option configures a Client at construction.
type Option func(*Client)

// WithSigner enables x402 mode using the provided ECDSA key (any USDC-bearing
// Base mainnet address). The key is used only to sign EIP-3009 single-use
// authorizations; no allowances are issued.
func WithSigner(key *ecdsa.PrivateKey) Option { return func(c *Client) { c.signer = key } }

// WithAPIKey enables bearer mode using a pre-funded 2s.io API key.
func WithAPIKey(k string) Option { return func(c *Client) { c.apiKey = k } }

// WithBaseURL overrides the default https://2s.io host.
func WithBaseURL(u string) Option { return func(c *Client) { c.baseURL = u } }

// WithMaxPriceUSD caps the per-call payment the client is willing to sign.
// Default is $0.10. Calls advertising a higher price return an error
// without signing.
func WithMaxPriceUSD(p float64) Option { return func(c *Client) { c.maxPriceUSD = p } }

// WithHTTPClient injects a custom *http.Client (timeouts, proxies, etc.).
func WithHTTPClient(h *http.Client) Option { return func(c *Client) { c.http = h } }

// Client is the main entrypoint. Construct once, reuse across calls.
type Client struct {
	signer      *ecdsa.PrivateKey
	apiKey      string
	baseURL     string
	maxPriceUSD float64
	http        *http.Client

	Patents PatentsAPI
	Crypto  CryptoAPI
	AI      AIAPI
	Law     LawAPI
	Geocode GeocodeAPI
	Airport AirportAPI
	Weather WeatherAPI
	DNS     DNSAPI
	Domain  DomainAPI
	URL     URLAPI
	Account AccountAPI
}

// New constructs a Client with the supplied options.
func New(opts ...Option) *Client {
	c := &Client{
		baseURL:     DefaultBaseURL,
		maxPriceUSD: DefaultMaxPriceUSD,
		http:        &http.Client{Timeout: DefaultTimeoutSec * time.Second},
	}
	for _, o := range opts {
		o(c)
	}
	c.Patents = PatentsAPI{c}
	c.Crypto = CryptoAPI{c}
	c.AI = AIAPI{c}
	c.Law = LawAPI{c}
	c.Geocode = GeocodeAPI{c}
	c.Airport = AirportAPI{c}
	c.Weather = WeatherAPI{c}
	c.DNS = DNSAPI{c}
	c.Domain = DomainAPI{c}
	c.URL = URLAPI{c}
	c.Account = AccountAPI{c}
	return c
}

// CallResult normalizes every endpoint response.
type CallResult[T any] struct {
	Data       T
	Endpoint   string
	CostUSD    float64
	Settlement *Settlement
	BalanceUSD *float64
}

// Settlement describes an x402 on-chain settlement.
type Settlement struct {
	TxHash  string `json:"tx_hash"`
	Network string `json:"network"`
	Success bool   `json:"success"`
}

// TwoSError is an HTTP error from 2s.io (4xx/5xx after payment).
type TwoSError struct {
	Status  int
	Code    string
	Message string
	URL     string
}

func (e *TwoSError) Error() string {
	return fmt.Sprintf("2sio: %d %s (%s) %s", e.Status, e.Message, e.Code, e.URL)
}

// PaymentRefused is a local refusal — price cap or hook denied.
type PaymentRefused struct {
	URL           string
	AdvertisedUSD float64
}

func (e *PaymentRefused) Error() string {
	return fmt.Sprintf("2sio: payment refused for %s at $%.6f USDC", e.URL, e.AdvertisedUSD)
}

// request is the low-level call shared by every endpoint method.
func (c *Client) request(
	ctx context.Context,
	method, path string,
	endpoint string,
	query url.Values,
	body interface{},
	out interface{},
) (*genericResult, error) {
	u := c.baseURL + path
	if len(query) > 0 {
		u = u + "?" + query.Encode()
	}

	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, bodyReader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusPaymentRequired {
		return c.parse(res, endpoint, u, out)
	}

	// 402 — sign + retry via the x402 Go SDK.
	if c.signer == nil {
		return nil, errors.New("2sio: 402 received but no signer configured")
	}
	respBody, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	advertised, err := c.handlePaymentRequired(ctx, method, u, respBody, res.Header, body)
	if err != nil {
		return nil, err
	}
	return c.parse(advertised, endpoint, u, out)
}

// genericResult is the unparsed-response container; endpoint methods
// downcast into typed result wrappers.
type genericResult struct {
	Endpoint   string
	CostUSD    float64
	Settlement *Settlement
	BalanceUSD *float64
}

func (c *Client) parse(res *http.Response, endpoint, u string, out interface{}) (*genericResult, error) {
	defer res.Body.Close()
	ct := res.Header.Get("Content-Type")
	gr := &genericResult{Endpoint: endpoint}

	if hdr := res.Header.Get("payment-response"); hdr != "" {
		gr.Settlement = decodeSettlement(hdr)
	} else if hdr := res.Header.Get("x-payment-response"); hdr != "" {
		gr.Settlement = decodeSettlement(hdr)
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	if !res.StatusCode == 200 && res.StatusCode >= 400 {
		var apiErr struct {
			Error struct {
				Code, Message string
			} `json:"error"`
		}
		_ = json.Unmarshal(body, &apiErr)
		return nil, &TwoSError{
			Status: res.StatusCode, Code: apiErr.Error.Code,
			Message: apiErr.Error.Message, URL: u,
		}
	}

	if !contains(ct, "application/json") {
		// Binary — write raw bytes into *[]byte if provided.
		if bp, ok := out.(*[]byte); ok {
			*bp = body
		}
		return gr, nil
	}
	// Two-pass parse: extract meta first, then user data.
	var envelope struct {
		Data json.RawMessage `json:"data"`
		Meta struct {
			Cost    *struct{ Usd float64 } `json:"cost"`
			Balance *struct{ Usd float64 } `json:"balance"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		// Some endpoints return a flat object — try unmarshaling directly into out.
		if out != nil {
			if e := json.Unmarshal(body, out); e != nil {
				return nil, e
			}
		}
		return gr, nil
	}
	if envelope.Meta.Cost != nil {
		gr.CostUSD = envelope.Meta.Cost.Usd
	}
	if envelope.Meta.Balance != nil {
		v := envelope.Meta.Balance.Usd
		gr.BalanceUSD = &v
	}
	if out != nil && len(envelope.Data) > 0 {
		if err := json.Unmarshal(envelope.Data, out); err != nil {
			return nil, err
		}
	}
	return gr, nil
}

func (c *Client) handlePaymentRequired(
	ctx context.Context, method, u string, body []byte, respHeader http.Header, reqBody interface{},
) (*http.Response, error) {
	// The actual x402 Go SDK plumbing is intentionally factored into a
	// separate file so the package stays usable as a stub while we wire
	// it. See x402.go for the implementation. Calling this without that
	// file present returns an explanatory error.
	return c.x402SignAndRetry(ctx, method, u, body, respHeader, reqBody)
}

func decodeSettlement(b64 string) *Settlement {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil
	}
	var decoded struct {
		Transaction string `json:"transaction"`
		Network     string `json:"network"`
		Success     bool   `json:"success"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil
	}
	return &Settlement{TxHash: decoded.Transaction, Network: decoded.Network, Success: decoded.Success}
}

func contains(s, sub string) bool { return bytes.Contains([]byte(s), []byte(sub)) }

// formatFloat for query params.
func ff(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }
