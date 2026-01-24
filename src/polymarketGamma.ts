const GAMMA_HOST = "https://gamma-api.polymarket.com";

type GammaError = Error & { status?: number; bodyText?: string; url?: string };

async function gammaGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const url = new URL(path, GAMMA_HOST);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const text = await res.text();

  if (!res.ok) {
    const err: GammaError = new Error(`Gamma error ${res.status}: ${text}`);
    err.status = res.status;
    err.bodyText = text;
    err.url = url.toString();
    throw err;
  }

  return JSON.parse(text) as T;
}

// MVP: "top" = últimos events (order=id desc) e achata markets
export async function gammaTopMarkets(limit = 10) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));

  // Padrão recomendado pela doc pra listar markets ativos
  const events = await gammaGet<any[]>("/events", {
    order: "id",
    ascending: false,
    closed: false,
    active: true,
    limit: safeLimit,
    offset: 0,
  });

  const markets: any[] = [];
  for (const ev of events) {
    const evMarkets = Array.isArray(ev?.markets) ? ev.markets : [];
    for (const m of evMarkets) {
      markets.push({
        eventId: ev.id,
        eventTitle: ev.title,
        eventSlug: ev.slug,
        id: m.id,
        question: m.question,
        slug: m.slug,
        active: m.active,
        endDate: m.endDate,
        outcomes: m.outcomes,
        outcomePrices: m.outcomePrices,
        clobTokenIds: m.clobTokenIds,
        volume: m.volume,
        liquidity: m.liquidity,
      });
    }
  }

  return markets.slice(0, safeLimit);
}
