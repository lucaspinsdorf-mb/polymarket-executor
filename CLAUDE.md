# Polymarket Executor

Proxy geo-bypass que executa operações WRITE no Polymarket CLOB a partir de uma região não-bloqueada (Netherlands).

## Por que existe

Cloudflare bloqueia WRITE operations (market orders) de UK/GB onde o Core roda. READ operations (orderbook, markets) funcionam direto do Core. Este serviço é um proxy mínimo que recebe ordens do Core e as executa desde a região NL.

## Arquivos (5 arquivos, ~764 LOC total)

| Arquivo | LOC | Propósito |
|---------|-----|----------|
| `src/server.ts` | 130 | Express app, 7 endpoints, auth middleware |
| `src/thirdwebWallet.ts` | 364 | Wallet derivation (DUPLICADO do Core — deve ser idêntico) |
| `src/polymarketClob.ts` | 94 | CLOB client wrapper (market orders) |
| `src/polymarketOnchain.ts` | 103 | Onchain approvals |
| `src/polymarketGamma.ts` | 73 | Gamma API wrapper mínimo |

## Endpoints

| Método | Path | Auth | Propósito |
|--------|------|------|----------|
| GET | `/health` | Nenhuma | Health check |
| GET | `/polymarket/geoblock` | Token | Diagnóstico de geo-blocking |
| GET | `/polymarket/address` | Token + Phone | Endereço do usuário |
| GET | `/polymarket/balance` | Token + Phone | Saldo CLOB (collateral + allowance) |
| GET | `/polymarket/orderbook/:tokenId` | Token | Orderbook público |
| POST | `/polymarket/orders/market` | Token + Phone | **Market order (BUY/SELL)** |
| GET | `/polymarket/markets/top` | Token | Top markets via Gamma |

Auth: `x-executor-token` header. User context: `x-user-phone` header.

## Regra crítica

**`POLYMARKET_PRIVATE_KEY` DEVE ser idêntica entre Core e Executor.** Se forem diferentes, wallets derivados serão diferentes, e ordens executarão no endereço errado.

## Deploy

- **Plataforma**: Railway
- **Região**: Netherlands/Amsterdam (geo-unblocked)
- **URL produção**: https://polymarket-executor-production.up.railway.app
- **Auto-deploy**: push para main

## Relação com Core

- Core chama Executor **apenas** para operações WRITE (orders/market)
- Core faz health check antes de cada trade
- Core passa `x-executor-token` + `x-user-phone` nos headers
- Executor **não tem banco de dados** — apenas executa e retorna resultado
- **NÃO duplicar lógica de negócio do Core aqui** — executor é proxy mínimo

## Manutenção de documentação

| O que mudou | Onde atualizar |
|-------------|----------------|
| Endpoint novo no executor | Esta seção "Endpoints" + `ARCHITECTURE.md` no Core |
| thirdwebWallet.ts alterado no Core | Sincronizar este arquivo manualmente |
| Mudança de região/plataforma | Esta seção "Deploy" + `ARCHITECTURE.md` no Core |
