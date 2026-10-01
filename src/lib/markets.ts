import { createServerFn } from "@tanstack/react-start";

export interface MarketQuote {
  symbol: string;
  label: string;
  price: number;
  prev: number;
  changePct: number;
}

const SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: "BZ=F", label: "BRENT" },
  { symbol: "GC=F", label: "GOLD" },
  { symbol: "ZW=F", label: "WHEAT" },
];

async function quote(symbol: string, label: string): Promise<MarketQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "AbuHureirahSitroom/1.0", Accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }[] };
  };
  const meta = json.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  const prev = Number(meta?.previousClose ?? meta?.chartPreviousClose);
  if (!Number.isFinite(price)) return null;
  const changePct = Number.isFinite(prev) && prev !== 0 ? ((price - prev) / prev) * 100 : 0;
  return { symbol, label, price, prev: Number.isFinite(prev) ? prev : price, changePct };
}

/** Theater-relevant tape: Brent, gold, wheat. Not a trading terminal. */
export const getTheaterMarkets = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await Promise.all(SYMBOLS.map((s) => quote(s.symbol, s.label).catch(() => null)));
  return rows.filter((r): r is MarketQuote => !!r);
});
