//! # twosio
//!
//! Rust client for [2s.io](https://2s.io) — pay-per-call AI agent APIs
//! on Base via x402.
//!
//! ## Status
//!
//! | Mode | Status |
//! |---|---|
//! | Bearer (pre-funded API key) | ✅ ready |
//! | x402 (per-call USDC payment) | 🚧 pending — Rust x402 SDK is not yet mature |
//!
//! The TypeScript and Python SDKs already implement x402 end-to-end; the
//! Rust SDK starts bearer-only and will add x402 once the upstream Rust
//! ecosystem stabilizes.
//!
//! ## Quickstart (bearer)
//!
//! ```no_run
//! # async fn doc() -> anyhow::Result<()> {
//! use twosio::{Client, PatentsSearchInput};
//!
//! let client = Client::builder()
//!     .api_key(std::env::var("TWOSIO_API_KEY")?)
//!     .build()?;
//!
//! let res = client
//!     .patents_search(PatentsSearchInput {
//!         q: "neural network".into(),
//!         limit: Some(5),
//!         ..Default::default()
//!     })
//!     .await?;
//! println!("{}", res.data.hits[0].title.as_deref().unwrap_or(""));
//! # Ok(())
//! # }
//! ```

use serde::{Deserialize, Serialize};
use thiserror::Error;

const DEFAULT_BASE: &str = "https://2s.io";

#[derive(Debug, Error)]
pub enum TwoSError {
    #[error("http error: {status} {message}")]
    Http {
        status: u16,
        code: Option<String>,
        message: String,
        url: String,
    },
    #[error("payment refused: ${advertised_usd:.6} > max")]
    PaymentRefused { url: String, advertised_usd: f64 },
    #[error("missing both signer and api_key — pick one")]
    NoAuth,
    #[error("x402 sign-and-retry not yet implemented in the Rust SDK; use bearer mode")]
    X402NotImplemented,
    #[error(transparent)]
    Reqwest(#[from] reqwest::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Default)]
pub struct ClientBuilder {
    api_key: Option<String>,
    base_url: Option<String>,
    max_price_usd: Option<f64>,
}

impl ClientBuilder {
    pub fn api_key(mut self, k: impl Into<String>) -> Self {
        self.api_key = Some(k.into());
        self
    }
    pub fn base_url(mut self, u: impl Into<String>) -> Self {
        self.base_url = Some(u.into());
        self
    }
    pub fn max_price_usd(mut self, p: f64) -> Self {
        self.max_price_usd = Some(p);
        self
    }
    pub fn build(self) -> Result<Client, TwoSError> {
        if self.api_key.is_none() {
            return Err(TwoSError::NoAuth);
        }
        Ok(Client {
            api_key: self.api_key,
            base_url: self.base_url.unwrap_or_else(|| DEFAULT_BASE.into()),
            max_price_usd: self.max_price_usd.unwrap_or(0.10),
            http: reqwest::Client::new(),
        })
    }
}

pub struct Client {
    api_key: Option<String>,
    base_url: String,
    max_price_usd: f64,
    http: reqwest::Client,
}

impl Client {
    pub fn builder() -> ClientBuilder {
        ClientBuilder::default()
    }
}

/// Wraps every endpoint response with normalized metadata.
#[derive(Debug, Deserialize)]
pub struct CallResult<T> {
    pub data: T,
    #[serde(default)]
    pub cost_usd: f64,
    #[serde(default)]
    pub balance_usd: Option<f64>,
}

#[derive(Debug, Default, Serialize)]
pub struct PatentsSearchInput {
    pub q: String,
    #[serde(rename = "yearFrom", skip_serializing_if = "Option::is_none")]
    pub year_from: Option<i32>,
    #[serde(rename = "yearTo", skip_serializing_if = "Option::is_none")]
    pub year_to: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct PatentHit {
    #[serde(rename = "applicationNumber")]
    pub application_number: String,
    pub title: Option<String>,
    pub inventors: Vec<String>,
    pub applicants: Vec<String>,
    #[serde(rename = "filingDate")]
    pub filing_date: Option<String>,
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct PatentsSearchResult {
    pub total: i64,
    pub hits: Vec<PatentHit>,
}

impl Client {
    pub async fn patents_search(
        &self,
        input: PatentsSearchInput,
    ) -> Result<CallResult<PatentsSearchResult>, TwoSError> {
        let url = format!("{}/api/patents/search", self.base_url);
        let mut req = self.http.get(&url).query(&input);
        if let Some(ref k) = self.api_key {
            req = req.bearer_auth(k);
        }
        let res = req.send().await?;
        if res.status().as_u16() == 402 {
            // SDK roadmap: integrate Rust x402 client here.
            return Err(TwoSError::X402NotImplemented);
        }
        if !res.status().is_success() {
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            return Err(TwoSError::Http {
                status,
                code: None,
                message: body.chars().take(200).collect(),
                url,
            });
        }
        let body: serde_json::Value = res.json().await?;
        let data: PatentsSearchResult = serde_json::from_value(
            body.get("data").cloned().unwrap_or_else(|| body.clone()),
        )?;
        let cost_usd = body
            .pointer("/meta/cost/usd")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let balance_usd = body.pointer("/meta/balance/usd").and_then(|v| v.as_f64());
        Ok(CallResult { data, cost_usd, balance_usd })
    }
}
