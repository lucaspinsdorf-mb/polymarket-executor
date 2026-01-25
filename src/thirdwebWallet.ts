/**
 * Thirdweb Wallet Integration
 * Server-side wallet management for multi-user trading
 * 
 * Architecture: Deterministic address derivation from master key
 * - One master private key (POLYMARKET_PRIVATE_KEY)
 * - Each user gets unique address via: Hash(master_key + phone_number)
 * - Each user's address has its own private key (derived deterministically)
 * - Scalable to unlimited users without additional key management
 */

import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import { ethers, Signer, providers, utils, BigNumber } from 'ethers';

// Environment validation
const MASTER_PRIVATE_KEY = process.env.POLYMARKET_PRIVATE_KEY;
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const CHAIN_ID = 137; // Polygon

if (!MASTER_PRIVATE_KEY) {
  throw new Error('Missing POLYMARKET_PRIVATE_KEY environment variable');
}

// Cache for SDK instances per user (each user has unique derived key)
const sdkCache = new Map<string, ThirdwebSDK>();

/**
 * Derive deterministic private key for user
 * Uses: keccak256(master_key + phone_number) → unique private key per user
 * 
 * Security: Phone number acts as salt, different users get different keys
 * Reproducibility: Same phone always generates same key/address
 */
function deriveUserPrivateKey(phone: string): string {
  // Create deterministic seed from master key + phone
  const seed = ethers.utils.solidityKeccak256(
    ['bytes32', 'string'],
    [MASTER_PRIVATE_KEY!, phone]
  );
  
  // Ensure valid private key (32 bytes)
  return seed;
}

/**
 * Get ThirdwebSDK instance for specific user
 * Each user gets unique SDK with their derived private key
 */
function getSDKForUser(phone: string): ThirdwebSDK {
  if (!sdkCache.has(phone)) {
    const userPrivateKey = deriveUserPrivateKey(phone);
    const sdk = ThirdwebSDK.fromPrivateKey(
      userPrivateKey,
      'polygon'
    );
    sdkCache.set(phone, sdk);
  }
  return sdkCache.get(phone)!;
}

// ============================================================================
// WALLET MANAGEMENT
// ============================================================================

export interface WalletInfo {
  address: string;
  thirdwebWalletId: string;
  provider: string;
  chainId: number;
}

/**
 * Get or create server wallet for user
 * Each user gets unique address derived from phone number
 * Address is deterministic: same phone → same address always
 */
export async function getOrCreateServerWallet(phone: string): Promise<WalletInfo> {
  try {
    const sdk = getSDKForUser(phone);
    
    // Get unique wallet address for this user
    const address = await sdk.wallet.getAddress();

    console.log(`[Thirdweb] Unique wallet for ${phone}: ${address}`);

    return {
      address,
      thirdwebWalletId: phone,
      provider: 'thirdweb',
      chainId: CHAIN_ID,
    };
  } catch (error: any) {
    console.error('[Thirdweb] Failed to get wallet:', error);
    throw new Error(`Thirdweb wallet creation failed: ${error.message}`);
  }
}

/**
 * Get wallet address for a user
 */
export async function getWalletAddress(phone: string): Promise<string> {
  const wallet = await getOrCreateServerWallet(phone);
  return wallet.address;
}

// ============================================================================
// THIRDWEB SIGNER - Compatible with ethers.js
// ============================================================================

/**
 * ThirdwebSigner implements ethers.Signer interface
 * Wraps the Thirdweb SDK wallet for compatibility with CLOB and onchain operations
 */
export class ThirdwebSigner extends Signer {
  private _phone: string;
  private _sdk: ThirdwebSDK;
  private _address: string | null = null;
  public address: string = ''; // Synchronous address property for compatibility

  constructor(
    phone: string,
    provider?: providers.Provider
  ) {
    super();
    this._phone = phone;
    this._sdk = getSDKForUser(phone); // Each user gets their unique SDK
    
    // Initialize address synchronously using cached wallet address
    const wallet = getOrCreateServerWallet(phone);
    wallet.then(w => {
      this.address = w.address;
      this._address = w.address;
    }).catch(err => {
      console.error('[ThirdwebSigner] Failed to initialize address:', err);
    });
    
    if (provider) {
      Object.defineProperty(this, 'provider', {
        enumerable: true,
        value: provider,
        writable: false,
      });
    }
  }

  async getAddress(): Promise<string> {
    if (!this._address) {
      this._address = await this._sdk.wallet.getAddress();
      this.address = this._address; // Update sync property
    }
    return this._address;
  }

  async signMessage(message: string | utils.Bytes): Promise<string> {
    try {
      const messageString = typeof message === 'string' 
        ? message 
        : utils.hexlify(message);

      const signature = await this._sdk.wallet.sign(messageString);
      return signature;
    } catch (error: any) {
      console.error('[ThirdwebSigner] signMessage failed:', error);
      throw new Error(`Failed to sign message: ${error.message}`);
    }
  }

  async signTransaction(transaction: providers.TransactionRequest): Promise<string> {
    throw new Error('signTransaction not implemented - use sendTransaction instead');
  }

  connect(provider: providers.Provider): ThirdwebSigner {
    return new ThirdwebSigner(this._phone, provider);
  }

  // Helper to send transactions directly via Thirdweb
  async sendTransaction(transaction: providers.TransactionRequest): Promise<providers.TransactionResponse> {
    try {
      if (!this.provider) {
        throw new Error('Provider required to send transaction');
      }

      // Use Thirdweb SDK's wallet to send transaction
      const tx = await this._sdk.wallet.sendRawTransaction(transaction);
      
      return tx as unknown as providers.TransactionResponse;
    } catch (error: any) {
      console.error('[ThirdwebSigner] sendTransaction failed:', error);
      throw new Error(`Failed to send transaction: ${error.message}`);
    }
  }
}

/**
 * Get ethers.Wallet signer for a user (for CLOB compatibility)
 * Creates a standard ethers.Wallet from the user's derived private key
 */
export async function getThirdwebSigner(phone: string): Promise<ethers.Wallet> {
  const privateKey = await deriveUserPrivateKey(phone);
  const provider = new providers.JsonRpcProvider(POLYGON_RPC_URL, {
    chainId: CHAIN_ID,
    name: 'polygon',
  });

  return new ethers.Wallet(privateKey, provider);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Sign arbitrary message with user's wallet
 */
export async function signMessage(phone: string, message: string): Promise<string> {
  const signer = await getThirdwebSigner(phone);
  return await signer.signMessage(message);
}

/**
 * Send native token (MATIC) to address
 */
export async function sendNativeToken(
  phone: string,
  toAddress: string,
  amountWei: string
): Promise<{ txHash: string }> {
  try {
    const signer = await getThirdwebSigner(phone);
    
    const tx = await signer.sendTransaction({
      to: toAddress,
      value: BigNumber.from(amountWei),
    });

    const receipt = await tx.wait();

    return { txHash: receipt.transactionHash };
  } catch (error: any) {
    console.error('[Thirdweb] sendNativeToken failed:', error);
    throw new Error(`Failed to send native token: ${error.message}`);
  }
}

/**
 * Get wallet balance (MATIC)
 */
export async function getWalletBalance(phone: string): Promise<string> {
  try {
    const wallet = await getOrCreateServerWallet(phone);
    const provider = new providers.JsonRpcProvider(POLYGON_RPC_URL, {
      chainId: CHAIN_ID,
      name: 'polygon',
    });

    const balance = await provider.getBalance(wallet.address);
    return balance.toString();
  } catch (error: any) {
    console.error('[Thirdweb] getWalletBalance failed:', error);
    throw new Error(`Failed to get balance: ${error.message}`);
  }
}

// ============================================================================
// GAS MANAGEMENT (MATIC AUTO-TOP-UP)
// ============================================================================

const MATIC_TOP_UP_THRESHOLD_WEI = ethers.utils.parseEther('0.1'); // 0.1 MATIC
const MATIC_TOP_UP_AMOUNT_WEI = ethers.utils.parseEther('0.5'); // Top up 0.5 MATIC each time
const MASTER_WALLET_MIN_BALANCE_WEI = ethers.utils.parseEther('10'); // Alert if master < 10 MATIC

/**
 * Ensure user wallet has sufficient MATIC for gas
 * Auto-tops up from master wallet if below threshold
 */
export async function ensureGasBalance(userPhone: string): Promise<void> {
  try {
    const provider = new providers.JsonRpcProvider(POLYGON_RPC_URL, {
      chainId: CHAIN_ID,
      name: 'polygon',
    });

    // Get user wallet address
    const userWallet = await getOrCreateServerWallet(userPhone);
    const userBalance = await provider.getBalance(userWallet.address);

    console.log(`[GasManager] User ${userPhone.slice(-4)} balance: ${ethers.utils.formatEther(userBalance)} MATIC`);

    // Check if user needs top-up
    if (userBalance.lt(MATIC_TOP_UP_THRESHOLD_WEI)) {
      console.log(`[GasManager] User ${userPhone.slice(-4)} below threshold (${ethers.utils.formatEther(MATIC_TOP_UP_THRESHOLD_WEI)} MATIC), topping up...`);

      // Create master wallet signer
      const masterWallet = new ethers.Wallet(MASTER_PRIVATE_KEY!, provider);
      const masterBalance = await provider.getBalance(masterWallet.address);

      console.log(`[GasManager] Master wallet balance: ${ethers.utils.formatEther(masterBalance)} MATIC`);

      // Check master wallet has sufficient balance
      if (masterBalance.lt(MATIC_TOP_UP_AMOUNT_WEI)) {
        throw new Error(`CRITICAL: Master wallet has insufficient MATIC (${ethers.utils.formatEther(masterBalance)} < ${ethers.utils.formatEther(MATIC_TOP_UP_AMOUNT_WEI)})`);
      }

      // Send MATIC from master to user
      const tx = await masterWallet.sendTransaction({
        to: userWallet.address,
        value: MATIC_TOP_UP_AMOUNT_WEI,
      });

      console.log(`[GasManager] Top-up transaction sent: ${tx.hash}`);

      await tx.wait();

      console.log(`[GasManager] ✓ User ${userPhone.slice(-4)} topped up with ${ethers.utils.formatEther(MATIC_TOP_UP_AMOUNT_WEI)} MATIC`);
    } else {
      console.log(`[GasManager] ✓ User ${userPhone.slice(-4)} has sufficient MATIC`);
    }
  } catch (error: any) {
    console.error(`[GasManager] Failed to ensure gas balance for ${userPhone.slice(-4)}:`, error);
    throw new Error(`Gas balance check failed: ${error.message}`);
  }
}

/**
 * Check master wallet balance and log warning if low
 * Should be called periodically (e.g., every hour)
 */
export async function checkMasterWalletBalance(): Promise<void> {
  try {
    const provider = new providers.JsonRpcProvider(POLYGON_RPC_URL, {
      chainId: CHAIN_ID,
      name: 'polygon',
    });

    const masterWallet = new ethers.Wallet(MASTER_PRIVATE_KEY!, provider);
    const masterBalance = await provider.getBalance(masterWallet.address);
    const balanceEther = ethers.utils.formatEther(masterBalance);

    console.log(`[GasManager] Master wallet balance: ${balanceEther} MATIC (${masterWallet.address})`);

    if (masterBalance.lt(MASTER_WALLET_MIN_BALANCE_WEI)) {
      console.warn(`⚠️  WARNING: Master wallet balance LOW (${balanceEther} MATIC < ${ethers.utils.formatEther(MASTER_WALLET_MIN_BALANCE_WEI)} MATIC)`);
      console.warn(`⚠️  Please top up master wallet: ${masterWallet.address}`);
    }
  } catch (error: any) {
    console.error('[GasManager] Failed to check master wallet balance:', error);
  }
}

/**
 * Start periodic master wallet balance monitoring
 * Checks every hour and logs warnings if balance is low
 */
export function startMasterWalletMonitoring(): void {
  console.log('[GasManager] Starting master wallet balance monitoring (hourly)...');
  
  // Check immediately on startup
  checkMasterWalletBalance();

  // Check every hour (3600000 ms)
  setInterval(() => {
    checkMasterWalletBalance();
  }, 3600000);
}
