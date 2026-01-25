import { ClobClient, Side, AssetType } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { getThirdwebSigner } from "./thirdwebWallet";

const POLYMARKET_HOST = process.env.POLYMARKET_HOST ?? "https://clob.polymarket.com";
const POLYMARKET_CHAIN_ID = Number(process.env.POLYMARKET_CHAIN_ID ?? "137");

// Multi-user: Each user gets unique signer via Thirdweb derivation
// No more global shared signer

// Formato que o clob-client espera
export type ApiCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

// Multi-user API credentials cache: phone → credentials
const apiCredsCache = new Map<string, ApiCreds>();

function normalizeBase64ForAtob(input: string): string {
  const trimmed = input.trim();
  const base64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (base64.length % 4)) % 4;
  return base64 + "=".repeat(padLen);
}

function coerceApiCreds(raw: any): ApiCreds {
  if (!raw || typeof raw !== "object") throw new Error("Invalid api creds: not an object");
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

export async function getPolymarketAddress(phone: string) {
  const signer = await getThirdwebSigner(phone);
  return signer.getAddress();
}

export async function getApiCreds(phone: string): Promise<ApiCreds> {
  // Check cache first
  if (apiCredsCache.has(phone)) {
    return apiCredsCache.get(phone)!;
  }

  try {
    // Get user-specific signer
    const signer = await getThirdwebSigner(phone);
    
    // L1 client (no credentials needed for derivation)
    const l1 = new ClobClient(POLYMARKET_HOST, POLYMARKET_CHAIN_ID, signer);

    const nonceEnv = process.env.POLYMARKET_API_NONCE;
    const nonceMaybe = nonceEnv ? Number(nonceEnv) : undefined;
    const nonce = Number.isFinite(nonceMaybe as number) ? (nonceMaybe as number) : undefined;

    const raw = await l1.createOrDeriveApiKey(nonce);
    const creds = coerceApiCreds(raw);
    
    // Cache per user
    apiCredsCache.set(phone, creds);
    
    console.log(`[Executor CLOB] API credentials derived and cached for user ${phone.slice(-4)}`);
    return creds;
  } catch (error: any) {
    // If credentials derivation fails, clear cache and re-throw
    apiCredsCache.delete(phone);
    console.error(`[Executor CLOB] Failed to derive API credentials for ${phone.slice(-4)}:`, error);
    throw error;
  }
}

export async function getL2Client(phone: string) {
  const signer = await getThirdwebSigner(phone);
  const creds = await getApiCreds(phone);
  const funder = await signer.getAddress();

  console.log(`[Executor CLOB] L2 client created for user ${phone.slice(-4)} (funder: ${funder})`);
  
  // signatureType 0 = EOA
  return new ClobClient(POLYMARKET_HOST, POLYMARKET_CHAIN_ID, signer, creds, 0, funder);
}

export { Side, AssetType };
