import { Contract, Wallet, providers, utils, BigNumber } from "ethers";

const RPC_URL = (process.env.POLYGON_RPC_URL || "").trim() || "https://polygon-rpc.com";
const PRIVATE_KEY = (process.env.POLYMARKET_PRIVATE_KEY || "").trim();

function mustEnv(name: string): string {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`Missing ${name} in env`);
  return v;
}

function normalizeAddress(raw: string, name: string): string {
  const v = raw.trim();
  try {
    return utils.getAddress(v);
  } catch {
    throw new Error(`Invalid address in ${name}`);
  }
}

const EXCHANGE = normalizeAddress(mustEnv("POLY_EXCHANGE_ADDRESS"), "POLY_EXCHANGE_ADDRESS");
const CTF = normalizeAddress(mustEnv("POLY_CTF_ADDRESS"), "POLY_CTF_ADDRESS");
const COLLATERAL = normalizeAddress(mustEnv("POLY_COLLATERAL_TOKEN_ADDRESS"), "POLY_COLLATERAL_TOKEN_ADDRESS");

if (!PRIVATE_KEY) throw new Error("Missing POLYMARKET_PRIVATE_KEY in env");

const provider = new providers.JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);

// ABIs mínimos
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const ERC1155_ABI = [
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
];

const usdc = new Contract(COLLATERAL, ERC20_ABI, wallet);
const ctf = new Contract(CTF, ERC1155_ABI, wallet);

// Polygon-RPC às vezes exige gas mínimo; a gente põe um piso pra não morrer
async function txOverrides() {
  const gp = await provider.getGasPrice();
  const floor = utils.parseUnits("30", "gwei");
  return { gasPrice: gp.lt(floor) ? floor : gp };
}

export async function getOnchainApprovals() {
  const owner = await wallet.getAddress();
  const allowance: BigNumber = await usdc.allowance(owner, EXCHANGE);
  const approved: boolean = await ctf.isApprovedForAll(owner, EXCHANGE);

  return {
    owner,
    exchange: EXCHANGE,
    usdcAllowanceToExchange: allowance.toString(),
    ctfApprovedForAllToExchange: approved,
  };
}

export async function enableTrading(spenders?: string[]) {
  const owner = await wallet.getAddress();
  const uniqueSpenders = Array.from(
    new Set([EXCHANGE, ...(spenders || [])].map((s) => normalizeAddress(String(s), "spender")))
  );

  const out: any = {
    owner,
    exchange: EXCHANGE,
    approvals: [],
    ctf: { wasApproved: false, txHash: null as null | string },
  };

  // 1) USDC allowance para (exchange + spenders)
  for (const spender of uniqueSpenders) {
    const current: BigNumber = await usdc.allowance(owner, spender);
    const isAlreadyMaxish = current.gt(utils.parseUnits("1000000", 6)); // heurística simples

    if (isAlreadyMaxish) {
      out.approvals.push({ spender, alreadyOk: true });
      continue;
    }

    const tx = await usdc.approve(spender, BigNumber.from(2).pow(256).sub(1), await txOverrides());
    out.approvals.push({ spender, alreadyOk: false, txHash: tx.hash });
    await tx.wait();
  }

  // 2) CTF setApprovalForAll pro exchange
  const already = await ctf.isApprovedForAll(owner, EXCHANGE);
  out.ctf.wasApproved = already;

  if (!already) {
    const tx = await ctf.setApprovalForAll(EXCHANGE, true, await txOverrides());
    out.ctf.txHash = tx.hash;
    await tx.wait();
  }

  return out;
}
