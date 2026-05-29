# twosio (Go)

**Go client for [2s.io](https://2s.io) — pay-per-call AI agent APIs on Base via x402.**

```bash
go get github.com/2s-io/sdk/packages/go
```

## Status

| Mode | Status |
|---|---|
| Bearer (pre-funded API key) | ✅ ready |
| x402 (per-call USDC payment) | 🚧 wire-up in progress — see [issues](https://github.com/2s-io/sdk/issues) |

The TypeScript and Python SDKs already implement x402 end-to-end; the Go SDK uses bearer-only until the upstream `github.com/coinbase/x402/go` v2 client API is stable.

## Bearer quickstart

```go
package main

import (
    "context"
    "fmt"
    "os"

    twosio "github.com/2s-io/sdk/packages/go"
)

func main() {
    client := twosio.New(twosio.WithAPIKey(os.Getenv("TWOSIO_API_KEY")))
    res, err := client.Patents.Search(context.Background(), twosio.PatentsSearchInput{
        Q:     "neural network",
        Limit: 5,
    })
    if err != nil {
        panic(err)
    }
    fmt.Println(res.Data.Hits[0].Title)
}
```

## What's available now

A handful of endpoints are fully typed (Patents, Crypto, AI). Remaining namespaces have empty stub groups; use `client.request(...)` directly for them until typed methods land. Track progress: <https://github.com/2s-io/sdk/issues>.

## License

MIT.
