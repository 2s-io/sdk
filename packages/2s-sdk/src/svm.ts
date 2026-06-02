/**
 * Solana signer construction for the @2sio/sdk.
 *
 * The SDK accepts a Solana secret key in any of three shapes — base58 string
 * (Phantom export, solana-cli paper-key), 64-byte raw `Uint8Array`, or the
 * 64-number JSON array format that `solana-keygen` writes. This module
 * normalizes whichever the caller hands us into a `@solana/kit`
 * `TransactionSigner` that `@x402/svm`'s `registerExactSvmScheme` consumes.
 *
 * Why dynamic-import the Solana deps: the SDK supports EVM-only callers and
 * Solana-only callers alike. Loading `@solana/kit` + `@x402/svm` at module
 * level would force EVM-only consumers to ship ~600KB of unused Solana SDK
 * code in their bundle. By gating the import behind the first Solana-keyed
 * constructor call, EVM callers pay nothing for the Solana path.
 */

import type { x402Client } from '@x402/core/client'

/** Anything the SDK will accept as a Solana secret key. */
export type SolanaKeyInput =
  | string // base58 (Phantom / solana-cli paper key) — 64 bytes b58-encoded
  | Uint8Array // raw 64-byte secret
  | number[] // solana-keygen JSON array (numeric bytes)

/**
 * Lazy-loader for the @solana/kit signer + @x402/svm scheme registrar.
 *
 * Returns a builder that takes a normalized 64-byte secret and produces a
 * `TransactionSigner`. We keep this opaque so `index.ts` doesn't have to
 * import @solana/kit's types at the top level (would defeat the lazy-load).
 */
export async function loadSvmRegistrar(): Promise<{
  buildSigner(secret: Uint8Array): Promise<unknown>
  registerScheme(client: x402Client, signer: unknown): void
}> {
  // Static imports inside an async function are still tree-shake-friendly
  // when targets understand dynamic-import — but to be safe across bundlers
  // we use explicit `await import()` so EVM-only callers never pay the cost.
  const kit = await import('@solana/kit')
  const svm = await import('@x402/svm/exact/client')

  return {
    async buildSigner(secret: Uint8Array): Promise<unknown> {
      // @solana/kit splits the 64-byte secret into the 32-byte seed + the
      // 32-byte public key. `createKeyPairSignerFromBytes` accepts the
      // full 64-byte form directly and derives the public key.
      if (secret.length !== 64) {
        throw new Error(
          `@2sio/sdk: solana secret must be 64 bytes, got ${secret.length}`,
        )
      }
      return await kit.createKeyPairSignerFromBytes(secret)
    },
    registerScheme(client: x402Client, signer: unknown): void {
      svm.registerExactSvmScheme(client, {
        signer: signer as Parameters<typeof svm.registerExactSvmScheme>[1]['signer'],
      })
    },
  }
}

/**
 * Normalize whatever the caller passed to a 64-byte `Uint8Array`. Throws if
 * the input doesn't look like a Solana secret in any of the supported
 * shapes.
 */
export function normalizeSolanaSecret(input: SolanaKeyInput): Uint8Array {
  if (input instanceof Uint8Array) {
    if (input.length !== 64) {
      throw new Error(
        `@2sio/sdk: solana secret must be 64 bytes, got ${input.length}`,
      )
    }
    return input
  }
  if (Array.isArray(input)) {
    if (input.length !== 64 || !input.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new Error(
        '@2sio/sdk: solanaPrivateKey array must be 64 integers in 0-255 (solana-keygen JSON format)',
      )
    }
    return Uint8Array.from(input)
  }
  if (typeof input === 'string') {
    // Base58 string — try decoding.
    const decoded = base58Decode(input)
    if (decoded.length !== 64) {
      throw new Error(
        `@2sio/sdk: solanaPrivateKey base58 string must decode to 64 bytes, got ${decoded.length}`,
      )
    }
    return decoded
  }
  throw new Error(
    '@2sio/sdk: solanaPrivateKey must be a base58 string, Uint8Array, or 64-element number[]',
  )
}

/**
 * Tiny base58 decoder — only ~30 lines, avoids pulling in `bs58` as an
 * additional dep for one function. Returns `Uint8Array` on success or
 * throws on invalid input.
 */
function base58Decode(input: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const map: Record<string, number> = {}
  for (let i = 0; i < ALPHABET.length; i++) {
    const ch = ALPHABET[i]!
    map[ch] = i
  }

  const bytes: number[] = [0]
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!
    if (!(c in map)) throw new Error(`@2sio/sdk: invalid base58 character '${c}' in solanaPrivateKey`)
    let carry = map[c]!
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  // Count leading zeros (1's in base58 → 0x00 bytes).
  let leading = 0
  for (let i = 0; i < input.length && input[i] === '1'; i++) leading++
  const out = new Uint8Array(bytes.length + leading)
  for (let i = 0; i < bytes.length; i++) out[leading + (bytes.length - 1 - i)] = bytes[i]!
  return out
}
