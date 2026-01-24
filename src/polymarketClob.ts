import { ClobClient, Side, AssetType } from "@polymarket/clob-client";
import { Wallet } from "ethers";

const POLYMARKET_HOST = process.env.POLYMARKET_HOST ?? "https://clob.polymarket.com";
const POLYMARKET_CHAIN_ID = Number(process.env.POLYMARKET_CHAIN_ID ?? "137");
const POLYMARKET_PRIVATE_KEY = process.env.POLYMARKET_PRIVATE_KEY;

if (!POLYMARKET_PRIVATE_KEY) {
  throw new Error("Missing POLYMARKET_PRIVATE_KEY in env");
}

// EOA signer (MVP)
const signer = new Wallet(POLYMARKET_PRIVATE_KEY);

// Formato que o clob-client espera
export type ApiCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

// cache simples em memória (MVP)
let apiCredsCache: ApiCreds | null = null;

function normalizeBase64ForAtob(input: string): string {
  const trimmed = input.trim();

  // base64url -> base64
  const base64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");

  // padding para múltiplo de 4
  const padLen = (4 - (base64.length % 4)) % 4;
  return base64 + "=".repeat(padLen);
}

function coerceApiCreds(raw: any): ApiCreds {
  if (!raw || typeof raw !== "object") throw new Error("Invalid api creds: not an object");

  // algumas libs chamam de key, outras de apiKey. Vamos aceitar os dois e padronizar em "key".
  const key = typeof raw.key === "string" ? raw.key : raw.apiKey;
  const secret = raw.secret;
  const passphrase = raw.passphrase;

  if (typeof key !== "string" || key.trim().length === 0) throw new Error("Invalid api creds: missing key/apiKey");
  if (typeof secret !== "string" || secret.trim().length === 0) throw new Error("Invalid api creds: missing secret");
  if (typeof passphrase !== "string" || passphrase.trim().length === 0) throw new Error("Invalid api creds: missing passphrase");

  return {
    key: key.trim(),
    passphrase: passphrase.trim(),
    secret: normalizeBase64ForAtob(secret),
  };
}

export async function getPolymarketAddress() {
  return signer.getAddress();
}

export async function getApiCreds(): Promise<ApiCreds> {
  if (apiCredsCache) return apiCredsCache;

  // L1 client (sem creds)
  const l1 = new ClobClient(POLYMARKET_HOST, POLYMARKET_CHAIN_ID, signer);

  const nonceEnv = process.env.POLYMARKET_API_NONCE;
  const nonceMaybe = nonceEnv ? Number(nonceEnv) : undefined;
  const nonce = Number.isFinite(nonceMaybe as number) ? (nonceMaybe as number) : undefined;

  const raw = await l1.createOrDeriveApiKey(nonce);

  apiCredsCache = coerceApiCreds(raw);
  return apiCredsCache;
}

export async function getL2Client() {
  const creds = await getApiCreds();
  const funder = await signer.getAddress();

  // signatureType 0 = EOA
  return new ClobClient(POLYMARKET_HOST, POLYMARKET_CHAIN_ID, signer, creds, 0, funder);
}

export { Side, AssetType };
