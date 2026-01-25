import express from "express";
import cors from "cors";
import "dotenv/config";
import { z } from "zod";

import { getL2Client, getPolymarketAddress, Side, AssetType } from "./polymarketClob";
import { gammaTopMarkets } from "./polymarketGamma";

const app = express();
app.use(cors());
app.use(express.json());

// Auth do executor (secreto)
const EXECUTOR_API_TOKEN = (process.env.EXECUTOR_API_TOKEN || "").trim();

app.use((req, res, next) => {
  if (req.path === "/health") return next();

  if (!EXECUTOR_API_TOKEN) {
    return res.status(500).json({ ok: false, error: "EXECUTOR_API_TOKEN missing" });
  }

  const token = req.header("x-executor-token");
  if (token !== EXECUTOR_API_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "polymarket-executor", timestamp: new Date().toISOString() });
});

// Diagnóstico: do ponto de vista do executor, estou bloqueado?
app.get("/polymarket/geoblock", async (_req, res) => {
  const r = await fetch("https://polymarket.com/api/geoblock", { method: "GET" });
  const text = await r.text();

  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 500) };
  }

  res.status(r.status).json({ ok: r.ok, status: r.status, data });
});

app.get("/polymarket/address", async (req, res) => {
  const userPhone = req.header("x-user-phone");
  
  if (!userPhone) {
    return res.status(400).json({ ok: false, error: "MISSING_USER_PHONE_HEADER" });
  }

  const address = await getPolymarketAddress(userPhone);
  res.json({ ok: true, address });
});

app.get("/polymarket/balance", async (req, res) => {
  const userPhone = req.header("x-user-phone");
  
  if (!userPhone) {
    return res.status(400).json({ ok: false, error: "MISSING_USER_PHONE_HEADER" });
  }

  const client = await getL2Client(userPhone);
  const address = await getPolymarketAddress(userPhone);
  
  const collateral = await client.getBalanceAllowance({
    asset_type: AssetType.COLLATERAL,
  });

  // Add address to response for fund isolation validation
  res.json({ ok: true, data: { ...collateral, address } });
});

app.get("/polymarket/orderbook/:tokenId", async (req, res) => {
  // Orderbook é público, não precisa de user phone
  // Mas aceitamos o header se vier (para compatibilidade)
  const userPhone = req.header("x-user-phone") || "+5511000000000"; // default fallback
  
  const client = await getL2Client(userPhone);
  const book = await client.getOrderBook(req.params.tokenId);
  res.json({ ok: true, data: book });
});

app.post("/polymarket/orders/market", async (req, res) => {
  const userPhone = req.header("x-user-phone");
  
  if (!userPhone) {
    return res.status(400).json({ ok: false, error: "MISSING_USER_PHONE_HEADER" });
  }

  const body = z
    .object({
      tokenId: z.string().min(1),
      side: z.enum(["BUY", "SELL"]),
      amount: z.number().positive(),
    })
    .parse(req.body);

  console.log(`[Executor] Market order for user ${userPhone.slice(-4)}: ${body.side} ${body.amount} of ${body.tokenId}`);

  const client = await getL2Client(userPhone);

  const result = await client.createAndPostMarketOrder({
    tokenID: body.tokenId,
    side: body.side === "BUY" ? Side.BUY : Side.SELL,
    amount: body.amount,
  });

  res.json({ ok: true, data: result });
});

app.get("/polymarket/markets/top", async (req, res) => {
  // Market discovery é público, não precisa de user phone
  const limit = Number(req.query.limit ?? "10");
  const data = await gammaTopMarkets(Number.isFinite(limit) ? limit : 10);
  res.json({ ok: true, data });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

app.listen(port, "0.0.0.0", () => {
  console.log(`[executor] Multi-user mode enabled`);
  console.log(`[executor] listening on http://0.0.0.0:${port}`);
});
