# 🚀 Deploy Guide: Polymarket Executor na Railway

## ✅ Preparação Completa

Todos os arquivos estão prontos:
- ✅ `README.md` criado
- ✅ `.env.example` criado  
- ✅ `.gitignore` configurado (não vaza `.env`)
- ✅ `package.json` com scripts build/start
- ✅ Git commit feito localmente

---

## 📝 PASSO 1: Criar Repositório no GitHub (VOCÊ FAZ)

1. Abra: https://github.com/new
2. Preencha:
   - **Repository name**: `polymarket-executor`
   - **Description**: `Trading adapter service to bypass Polymarket geo-blocking`
   - **Visibility**: Public
   - **NÃO marque**: "Add README" (já temos)
3. Clique **Create repository**

4. Na página que abrir, **copie o comando** que aparece em "push an existing repository":
   ```bash
   git remote add origin https://github.com/lucaspinsdorf-mb/polymarket-executor.git
   git branch -M main
   git push -u origin main
   ```

5. **COLE AQUI NO TERMINAL** (estou em `/workspaces/polymarket-executor`):

---

## 🚂 PASSO 2: Deploy na Railway (VOCÊ FAZ)

### 2.1 Criar Projeto
1. Acesse: https://railway.app/new
2. Clique **"Deploy from GitHub repo"**
3. Se pedir autorização, autorize Railway a acessar seus repos
4. Selecione: `lucaspinsdorf-mb/polymarket-executor`

### 2.2 CRÍTICO: Escolher Região Certa
⚠️ **IMPORTANTE**: Na configuração do projeto:
1. Vá em **Settings** → **Environment** → **Region**
2. Escolha: **`europe-west4` (Netherlands)** ou **`europe-west1` (Belgium)**
3. ❌ **NÃO USE**: `europe-west2` (London/UK) ou `europe-west3` (Germany)

### 2.3 Configurar Environment Variables

No Railway, vá em **Variables** e adicione:

```bash
# 1. Token do Executor (CRIAR UM NOVO - use gerador online)
EXECUTOR_API_TOKEN=<gerar-token-aleatorio-forte>

# 2. Polymarket Config (copiar do seu .env do Core)
POLYMARKET_HOST=https://clob.polymarket.com
POLYMARKET_CHAIN_ID=137
POLYMARKET_PRIVATE_KEY=<sua-private-key-atual>
POLYMARKET_API_NONCE=0

# 3. Contratos Polymarket (já fixos)
POLY_EXCHANGE_ADDRESS=0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
POLY_CTF_ADDRESS=0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
POLY_COLLATERAL_TOKEN_ADDRESS=0x2791Bca1f2de4661ed88A30C99A7a9449Aa84174

# 4. RPC Polygon
POLYGON_RPC_URL=https://polygon-rpc.com
```

⚠️ **ATENÇÃO**:
- `EXECUTOR_API_TOKEN`: CRIAR UM NOVO (não reusar o do Core)
- `POLYMARKET_PRIVATE_KEY`: Usar a MESMA chave do Core

### 2.4 Deploy

Railway vai detectar automaticamente:
- `npm install` (via package.json)
- `npm run build` (compila TypeScript)
- `npm start` (roda `node dist/server.js`)

Aguarde o deploy finalizar (~2-3 minutos).

---

## 🧪 PASSO 3: Testar Geo-blocking (EU AJUDO)

Quando Railway der a URL pública, **me avise** e vou criar os testes:

```bash
# Teste 1: Health check
curl https://polymarket-executor-production-XXXX.up.railway.app/health

# Teste 2: Geoblock (CRÍTICO - deve retornar blocked: false)
curl -H "x-executor-token: SEU_TOKEN" \
  https://polymarket-executor-production-XXXX.up.railway.app/polymarket/geoblock
```

### ✅ Resultado Esperado:
```json
{
  "ok": true,
  "status": 200,
  "data": {
    "blocked": false,
    "country": "NL"  // ou "BE" se Belgium
  }
}
```

❌ Se vier `"blocked": true` ou `"country": "GB"`, **trocar região no Railway**.

---

## 🔗 PASSO 4: Integrar Core → Executor (EU FAÇO)

Quando teste passar, vou adicionar no `polymarket-core`:

1. Criar `src/executor.ts` com helper `executorFetch()`
2. Adicionar env vars no Core (Render):
   - `EXECUTOR_BASE_URL=https://seu-executor.railway.app`
   - `EXECUTOR_API_TOKEN=<token-que-você-criou>`
3. Atualizar rotas que estão bloqueadas para usar o Executor

---

## 📋 Checklist Final

- [ ] Passo 1: Repo criado no GitHub e push feito
- [ ] Passo 2: Projeto criado na Railway
- [ ] Região: Netherlands ou Belgium selecionada
- [ ] Env vars configuradas (11 variáveis)
- [ ] Deploy finalizado com sucesso
- [ ] Passo 3: `/health` retornando OK
- [ ] **CRÍTICO**: `/polymarket/geoblock` retornando `blocked: false`
- [ ] Passo 4: Me passar URL + token para integração

---

## 🆘 Troubleshooting

### Deploy falhou na Railway
- Verifique logs: pode ser env var faltando
- `EXECUTOR_API_TOKEN` é obrigatório

### Geoblock ainda retorna blocked: true
- Trocar região do projeto no Railway Settings
- Restart após trocar região

### Build error no Railway
- Railway deve rodar `npm install && npm run build && npm start`
- Se não detectar: Settings → Build Command: `npm run build`
- Start Command: `npm start`
