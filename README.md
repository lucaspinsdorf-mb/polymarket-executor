# Polymarket Executor

Trading adapter service that bypasses Polymarket's geo-blocking restrictions.

## Purpose

This service runs in a **non-blocked region** (e.g., Netherlands/Amsterdam) to handle Polymarket CLOB operations that fail when executed from GB/DE regions due to Cloudflare geo-restrictions.

## Architecture

- **Core service** (`polymarket-core`) → Orchestrator with Unblock/Bridge integrations
- **Executor service** (this repo) → Trading adapter in non-blocked region
- Communication: Core proxies blocked calls to Executor via `executorFetch()`

## Endpoints

All endpoints except `/health` require `x-executor-token` header.

- `GET /health` - Health check (public)
- `GET /polymarket/geoblock` - Test if current region is blocked
- `GET /polymarket/address` - Get wallet address
- `GET /polymarket/balance` - Get CLOB balance/allowance
- `GET /polymarket/orderbook/:tokenId` - Get orderbook for token
- `POST /polymarket/orders/market` - Execute market order
- `GET /polymarket/markets/top?limit=N` - Get top markets from Gamma

## Deployment

### Railway Setup

1. Create new project in Railway
2. **IMPORTANT**: Select region: **Netherlands** or **Ireland** (avoid GB/DE/US)
3. Connect this GitHub repository
4. Configure environment variables (see `.env.example`)
5. Deploy

### Required Environment Variables

```bash
EXECUTOR_API_TOKEN=        # Secret token for authentication
POLYMARKET_PRIVATE_KEY=    # EOA wallet private key (0x...)
POLY_EXCHANGE_ADDRESS=     # Polymarket exchange contract
POLY_CTF_ADDRESS=          # CTF contract
POLY_COLLATERAL_TOKEN_ADDRESS= # USDC.e token
```

See [.env.example](.env.example) for complete list.

## Testing

After deployment, test geo-blocking status:

```bash
# Should return blocked: false
curl -H "x-executor-token: YOUR_TOKEN" https://your-executor.railway.app/polymarket/geoblock
```

## Development

```bash
npm install
npm run dev    # Development with auto-reload
npm run build  # Compile TypeScript
npm start      # Production mode
```
