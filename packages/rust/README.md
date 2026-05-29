# twosio (Rust)

**Rust client for [2s.io](https://2s.io) — pay-per-call AI agent APIs on Base via x402.**

```toml
[dependencies]
twosio = "0.1"
tokio = { version = "1", features = ["full"] }
```

## Status

| Mode | Status |
|---|---|
| Bearer (pre-funded API key) | ✅ ready |
| x402 (per-call USDC payment) | 🚧 pending — Rust x402 ecosystem is not yet mature |

The TypeScript and Python SDKs already implement x402 end-to-end. The Rust SDK starts bearer-only.

## Quickstart (bearer)

```rust
use twosio::{Client, PatentsSearchInput};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let client = Client::builder()
        .api_key(std::env::var("TWOSIO_API_KEY")?)
        .build()?;

    let res = client
        .patents_search(PatentsSearchInput {
            q: "neural network".into(),
            limit: Some(5),
            ..Default::default()
        })
        .await?;

    for hit in &res.data.hits {
        println!("{} — {}", hit.application_number, hit.title.as_deref().unwrap_or(""));
    }
    Ok(())
}
```

## License

MIT.
