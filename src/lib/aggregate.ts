import type { Dataset, Kind, Tx } from "./types";

export interface Filters {
  from: string; // YYYY-MM inclusive
  to: string; // YYYY-MM inclusive
  wallets: string[]; // empty = all
  includeTransfers: boolean;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function applyFilters(ds: Dataset, f: Filters): Tx[] {
  return ds.txs.filter(
    (t) =>
      t.ym >= f.from &&
      t.ym <= f.to &&
      (f.includeTransfers || t.included) &&
      (f.wallets.length === 0 || f.wallets.includes(t.wallet)),
  );
}

export const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

export function totals(txs: Tx[]) {
  let income = 0, expense = 0;
  for (const t of txs) t.kind === "income" ? (income += t.value) : (expense += t.value);
  return { income, expense, net: income - expense, savingsRate: income > 0 ? (income - expense) / income : 0 };
}

export function monthly(txs: Tx[], months: string[]) {
  const idx = new Map(months.map((m, i) => [m, i]));
  const rows = months.map((ym) => ({ ym, income: 0, expense: 0, net: 0 }));
  for (const t of txs) {
    const i = idx.get(t.ym);
    if (i === undefined) continue;
    rows[i][t.kind] += t.value;
  }
  for (const r of rows) r.net = r.income - r.expense;
  return rows;
}

/** key → values aligned to `buckets` (months or years). */
export function pivot(
  txs: Tx[],
  kind: Kind,
  buckets: string[],
  key: (t: Tx) => string,
  bucketOf: (t: Tx) => string = (t) => t.ym,
): Map<string, number[]> {
  const idx = new Map(buckets.map((b, i) => [b, i]));
  const out = new Map<string, number[]>();
  for (const t of txs) {
    if (t.kind !== kind) continue;
    const i = idx.get(bucketOf(t));
    if (i === undefined) continue;
    const k = key(t);
    let row = out.get(k);
    if (!row) out.set(k, (row = new Array(buckets.length).fill(0)));
    row[i] += t.value;
  }
  return out;
}

export function totalsBy(txs: Tx[], kind: Kind, key: (t: Tx) => string) {
  const m = new Map<string, number>();
  for (const t of txs) if (t.kind === kind) m.set(key(t), (m.get(key(t)) ?? 0) + t.value);
  return [...m].sort((a, b) => b[1] - a[1]);
}

/** Order keys by the dataset's stable all-time order, unknowns at the end by value. */
export function stableOrder(keys: string[], order: string[]) {
  const pos = new Map(order.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => (pos.get(a) ?? 999) - (pos.get(b) ?? 999));
}

export interface MerchantStat {
  name: string;
  count: number;
  total: number;
  avg: number;
  months: number;
  category: string;
  group: Tx["group"];
  first: string;
  last: string;
  monthlyCv: number; // coefficient of variation of per-month totals
}

export function merchantStats(txs: Tx[]): MerchantStat[] {
  const by = new Map<string, Tx[]>();
  for (const t of txs) if (t.kind === "expense" && t.value > 0) (by.get(t.merchant) ?? by.set(t.merchant, []).get(t.merchant)!).push(t);
  const out: MerchantStat[] = [];
  for (const [name, list] of by) {
    const total = sum(list.map((t) => t.value));
    const perMonth = new Map<string, number>();
    const cats = new Map<string, number>();
    for (const t of list) {
      perMonth.set(t.ym, (perMonth.get(t.ym) ?? 0) + t.value);
      cats.set(t.category, (cats.get(t.category) ?? 0) + t.value);
    }
    const pm = [...perMonth.values()];
    const mean = sum(pm) / pm.length;
    const sd = Math.sqrt(sum(pm.map((v) => (v - mean) ** 2)) / pm.length);
    const category = [...cats].sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      name,
      count: list.length,
      total,
      avg: total / list.length,
      months: perMonth.size,
      category,
      group: list.find((t) => t.category === category)!.group,
      first: list[0].date,
      last: list[list.length - 1].date,
      monthlyCv: mean ? sd / mean : 0,
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

/** Merchants that look like recurring payments: present in most months of their lifetime with steady amounts. */
export function recurring(stats: MerchantStat[]) {
  return stats
    .filter((m) => {
      if (m.months < 3) return false;
      const span = monthRange(m.first.slice(0, 7), m.last.slice(0, 7)).length;
      return m.months / span >= 0.6 && m.monthlyCv < 0.5;
    })
    .map((m) => ({ ...m, perMonth: m.total / m.months }))
    .sort((a, b) => b.perMonth - a.perMonth);
}

export function dailyExpense(txs: Tx[]) {
  const m = new Map<string, number>();
  for (const t of txs) if (t.kind === "expense") m.set(t.date, (m.get(t.date) ?? 0) + t.value);
  return m;
}

export function mean(xs: number[]) {
  return xs.length ? sum(xs) / xs.length : 0;
}

export function stdev(xs: number[]) {
  const mu = mean(xs);
  return Math.sqrt(mean(xs.map((v) => (v - mu) ** 2)));
}
