package twosio

import (
	"context"
	"errors"
	"net/http"
)

// x402SignAndRetry is the integration with the Coinbase x402 Go SDK.
// Pending wire-up while we stabilize the package API surface against the
// upstream `github.com/coinbase/x402/go` v2 client. Until this is filled
// in, paying calls return an explicit error so users hit a clear failure
// instead of silently succeeding without payment.
//
// Tracking: github.com/2s-io/sdk/issues — pin the milestone there.
func (c *Client) x402SignAndRetry(
	ctx context.Context, method, url string, body402 []byte, hdr http.Header, reqBody interface{},
) (*http.Response, error) {
	return nil, errors.New(
		"2sio (Go): x402 sign-and-retry is not yet implemented for the Go SDK. " +
			"Use bearer mode (WithAPIKey) for now, or the TypeScript/Python SDK which both implement x402 end-to-end.",
	)
}
