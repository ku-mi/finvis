import { GROUP_LABEL } from "@/config/categories";
import { mean, merchantStats, pivot, recurring, stdev, sum, totals, totalsBy } from "./aggregate";
import type { Dataset, Kind, Tx } from "./types";

export interface SummaryOptions {
  granularity: "month" | "year";
  subcategories: boolean;
  merchants: boolean;
  topMerchants: number;
  anomalies: boolean;
  preface: string;
}

export interface SummaryInput {
  ds: Dataset;
  txs: Tx[];
  prevTxs: Tx[];
  months: string[];
  from: string;
  to: string;
  includeTransfers: boolean;
  wallets: string[];
  hidden: string[]; // "kind:Category" keys left out of the summary
}

const r = (v: number) => Math.round(v);
const p = (v: number) => `${(v * 100).toFixed(1)}%`;

function buckets(months: string[], g: "month" | "year") {
  return g === "month" ? months : [...new Set(months.map((m) => m.slice(0, 4)))];
}
const bucketOf = (g: "month" | "year") => (g === "month" ? (t: Tx) => t.ym : (t: Tx) => String(t.year));

function mdTable(head: string[], rows: (string | number)[][]) {
  const fmt = (v: string | number) => (typeof v === "number" ? String(r(v)) : v);
  return [`| ${head.join(" | ")} |`, `|${head.map((_, i) => (i ? "---:" : "---")).join("|")}|`, ...rows.map((row) => `| ${row.map(fmt).join(" | ")} |`)].join("\n");
}

/** Structured summary — the single source for all three output formats. */
export function buildSummary(inp: SummaryInput, o: SummaryOptions) {
  const { ds, txs, months } = inp;
  const B = buckets(months, o.granularity);
  const bOf = bucketOf(o.granularity);
  const t = totals(txs);
  const perBucket = B.map((b) => {
    const inB = txs.filter((x) => bOf(x) === b);
    const tt = totals(inB);
    return { period: b, income: r(tt.income), spending: r(tt.expense), net: r(tt.net), savingsRate: tt.income ? +tt.savingsRate.toFixed(3) : null };
  });

  const catTable = (kind: Kind) => {
    const piv = pivot(txs, kind, B, (x) => x.category, bOf);
    const subPiv = pivot(txs, kind, B, (x) => `${x.category}\u0000${x.subcategory}`, bOf);
    const grand = sum([...piv.values()].map(sum)) || 1;
    return [...piv]
      .sort((a, b) => sum(b[1]) - sum(a[1]))
      .map(([category, vals]) => ({
        category,
        group: kind === "expense" ? GROUP_LABEL[txs.find((x) => x.category === category && x.kind === kind)!.group as keyof typeof GROUP_LABEL] ?? "" : "income",
        values: vals.map(r),
        total: r(sum(vals)),
        avg: r(sum(vals) / B.length),
        share: +(sum(vals) / grand).toFixed(3),
        transactions: txs.filter((x) => x.kind === kind && x.category === category).length,
        subcategories: o.subcategories
          ? [...subPiv]
              .filter(([k]) => k.startsWith(category + "\u0000"))
              .sort((a, b) => sum(b[1]) - sum(a[1]))
              .map(([k, v]) => ({ name: k.split("\u0000")[1], values: v.map(r), total: r(sum(v)) }))
          : undefined,
      }));
  };

  const groupPiv = pivot(txs, "expense", B, (x) => x.group, bOf);
  const groups = [...groupPiv].map(([g, v]) => ({ group: GROUP_LABEL[g as keyof typeof GROUP_LABEL] ?? g, values: v.map(r), total: r(sum(v)), share: +(sum(v) / (t.expense || 1)).toFixed(3) }));

  const prev = totals(inp.prevTxs);
  const nowC = new Map(totalsBy(txs, "expense", (x) => x.category));
  const prevC = new Map(totalsBy(inp.prevTxs, "expense", (x) => x.category));
  const changes = inp.prevTxs.length
    ? [...new Set([...nowC.keys(), ...prevC.keys()])]
        .map((c) => ({ category: c, now: r(nowC.get(c) ?? 0), previous: r(prevC.get(c) ?? 0), change: r((nowC.get(c) ?? 0) - (prevC.get(c) ?? 0)) }))
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    : [];

  const ms = merchantStats(txs);
  const anomalies: { category: string; month: string; amount: number; usual: number }[] = [];
  if (o.anomalies) {
    for (const [c, vals] of pivot(txs, "expense", months, (x) => x.category)) {
      const mu = mean(vals), sd = stdev(vals);
      if (!sd || mu < 50) continue;
      vals.forEach((v, i) => { if ((v - mu) / sd >= 2 && v - mu > 300) anomalies.push({ category: c, month: months[i], amount: r(v), usual: r(mu) }); });
    }
    anomalies.sort((a, b) => b.amount - b.usual - (a.amount - a.usual));
  }

  const monthlySpend = perBucket.map((x) => x.spending);
  const exp = txs.filter((x) => x.kind === "expense");
  const nw = ds.netWorth.filter((n) => n.date.slice(0, 7) >= inp.from && n.date.slice(0, 7) <= inp.to);

  return {
    meta: {
      currency: ds.currency,
      period: { from: inp.from, to: inp.to, months: months.length },
      granularity: o.granularity,
      periods: B,
      wallets: inp.wallets.length ? inp.wallets : "all",
      excludedCategories: inp.hidden.map((k) => { const [kind, ...rest] = k.split(":"); return `${rest.join(":")} (${kind})`; }),
      internalTransfers: inp.includeTransfers ? "included" : "excluded",
      transactions: txs.length,
      dataQuality: {
        autoCategorisedShareOfSpending: +(sum(exp.filter((x) => x.inferred).map((x) => x.value)) / (t.expense || 1)).toFixed(3),
        uncategorisedSpending: r(sum(exp.filter((x) => x.category === "Uncategorised").map((x) => x.value))),
        uncategorisedIncome: r(sum(txs.filter((x) => x.kind === "income" && x.category === "Uncategorised").map((x) => x.value))),
        firstMonthWithData: txs[0]?.ym ?? null,
      },
      signConvention: "All amounts are positive flows; negative values in spending are refunds.",
    },
    totals: {
      income: r(t.income), spending: r(t.expense), net: r(t.net), savingsRate: +t.savingsRate.toFixed(3),
      avgIncomePerPeriod: r(t.income / B.length), avgSpendingPerPeriod: r(t.expense / B.length),
      medianSpendingPerPeriod: r([...monthlySpend].sort((a, b) => a - b)[Math.floor(monthlySpend.length / 2)] ?? 0),
      previousPeriod: inp.prevTxs.length ? { income: r(prev.income), spending: r(prev.expense), net: r(prev.net), savingsRate: +prev.savingsRate.toFixed(3) } : null,
    },
    netWorth: nw.length ? { start: { date: nw[0].date, value: r(nw[0].netWorth) }, end: { date: nw[nw.length - 1].date, value: r(nw[nw.length - 1].netWorth) } } : null,
    perPeriod: perBucket,
    spendingByCategory: catTable("expense"),
    incomeByCategory: catTable("income"),
    spendingByGroup: groups,
    changeVsPreviousPeriod: changes,
    topMerchants: o.merchants ? ms.slice(0, o.topMerchants).map((m) => ({ merchant: m.name, category: m.category, total: r(m.total), payments: m.count, avgTicket: r(m.avg), monthsActive: m.months })) : undefined,
    recurringPayments: o.merchants ? recurring(ms).slice(0, 25).map((m) => ({ merchant: m.name, category: m.category, perMonth: r(m.perMonth), monthsSeen: m.months })) : undefined,
    anomalies: o.anomalies ? anomalies.slice(0, 15) : undefined,
  };
}

export type Summary = ReturnType<typeof buildSummary>;

const label = (b: string) => b;

export function toMarkdown(s: Summary, o: SummaryOptions): string {
  const c = s.meta.currency;
  const out: string[] = [];
  if (o.preface.trim()) out.push(o.preface.trim(), "");
  out.push(`# Personal finance summary (${c})`, "");
  out.push(
    `- Period: ${s.meta.period.from} to ${s.meta.period.to} (${s.meta.period.months} months), broken down per ${s.meta.granularity}`,
    `- Wallets: ${s.meta.wallets === "all" ? "all" : (s.meta.wallets as string[]).join(", ")}; internal transfers ${s.meta.internalTransfers}; ${s.meta.transactions} transactions`,
    ...(s.meta.excludedCategories.length ? [`- Deliberately EXCLUDED from all figures below: ${s.meta.excludedCategories.join(", ")}. Totals and savings rate are without them.`] : []),
    `- ${s.meta.signConvention}`,
    `- Data quality: ${p(s.meta.dataQuality.autoCategorisedShareOfSpending)} of spending was auto-categorised by rules; uncategorised spending ${s.meta.dataQuality.uncategorisedSpending} ${c}, uncategorised income ${s.meta.dataQuality.uncategorisedIncome} ${c}.`,
    "",
  );

  const T = s.totals;
  out.push("## Totals", "", mdTable(["Metric", `Value (${c})`], [
    ["Income", T.income], ["Spending", T.spending], ["Net (saved)", T.net], ["Savings rate", p(T.savingsRate)],
    [`Avg income per ${s.meta.granularity}`, T.avgIncomePerPeriod], [`Avg spending per ${s.meta.granularity}`, T.avgSpendingPerPeriod],
    [`Median spending per ${s.meta.granularity}`, T.medianSpendingPerPeriod],
    ...(T.previousPeriod ? [["Previous equal-length period: income / spending / savings rate", `${T.previousPeriod.income} / ${T.previousPeriod.spending} / ${p(T.previousPeriod.savingsRate)}`]] : []),
    ...(s.netWorth ? [["Net worth at start → end", `${s.netWorth.start.value} → ${s.netWorth.end.value}`]] : []),
  ]), "");

  out.push(`## Income vs spending per ${s.meta.granularity}`, "", mdTable(["Period", "Income", "Spending", "Net", "Savings rate"],
    s.perPeriod.map((x) => [x.period, x.income, x.spending, x.net, x.savingsRate === null ? "–" : p(x.savingsRate)])), "");

  const catSection = (title: string, rows: Summary["spendingByCategory"]) => {
    const head = ["Category", ...s.meta.periods.map(label), "Total", "Avg", "Share"];
    const body: (string | number)[][] = [];
    for (const row of rows) {
      body.push([`**${row.category}**`, ...row.values, row.total, row.avg, p(row.share)]);
      for (const sc of row.subcategories ?? []) if (sc.total !== 0) body.push([`↳ ${sc.name}`, ...sc.values, sc.total, "", ""]);
    }
    out.push(title, "", mdTable(head, body), "");
  };
  catSection(`## Spending by category per ${s.meta.granularity}`, s.spendingByCategory);
  catSection(`## Income by category per ${s.meta.granularity}`, s.incomeByCategory);

  out.push(`## Spending by group per ${s.meta.granularity}`, "",
    "Groups: Fixed & obligations (housing, mortgage, insurance, social insurance, bank fees), Essentials (groceries, health, transport, education), Lifestyle (restaurants, travel, entertainment, clothing, self care, gifts), Business costs (accounting, software, equipment), Taxes (VAT and income tax), Unclassified (categories not mapped to a group).", "",
    mdTable(["Group", ...s.meta.periods, "Total", "Share"], s.spendingByGroup.map((g) => [g.group, ...g.values, g.total, p(g.share)])), "");

  if (s.changeVsPreviousPeriod.length) {
    out.push("## Spending change vs previous equal-length period", "", mdTable(["Category", "Now", "Previous", "Change"],
      s.changeVsPreviousPeriod.map((x) => [x.category, x.now, x.previous, `${x.change > 0 ? "+" : ""}${x.change}`])), "");
  }
  if (s.topMerchants?.length) {
    out.push("## Top merchants", "", mdTable(["Merchant", "Category", "Total", "Payments", "Avg ticket", "Months active"],
      s.topMerchants.map((m) => [m.merchant, m.category, m.total, m.payments, m.avgTicket, m.monthsActive])), "");
  }
  if (s.recurringPayments?.length) {
    out.push("## Recurring payments (detected)", "", mdTable(["Merchant", "Category", "Per month", "Months seen"],
      s.recurringPayments.map((m) => [m.merchant, m.category, m.perMonth, m.monthsSeen])), "");
  }
  if (s.anomalies?.length) {
    out.push("## Unusual category-months (> 2σ above the category's average)", "", mdTable(["Category", "Month", "Amount", "Usual"],
      s.anomalies.map((a) => [a.category, a.month, a.amount, a.usual])), "");
  }
  return out.join("\n");
}

/** Long/tidy CSV — easiest for code-interpreter style analysis. */
export function toLongCsv(txs: Tx[], g: "month" | "year") {
  const bOf = bucketOf(g);
  const m = new Map<string, { v: number; n: number }>();
  for (const t of txs) {
    const key = [bOf(t), t.kind, t.group, t.category, t.subcategory].join("\u0000");
    const e = m.get(key) ?? { v: 0, n: 0 };
    e.v += t.value; e.n++;
    m.set(key, e);
  }
  const esc = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [...m].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, e]) => [...k.split("\u0000").map(esc), e.v.toFixed(2), e.n].join(","));
  return ["period,kind,group,category,subcategory,amount,transactions", ...rows].join("\n");
}

export const DEFAULT_PREFACE = `You are a personal finance analyst. Below is a summary of my finances exported from my budgeting app (amounts in the stated currency; I am self-employed / B2B, so "Company" covers business taxes and costs). Please:
1. Describe my spending structure and how it changed over time.
2. Flag categories or months that look unusual and suggest likely reasons.
3. Estimate realistic monthly savings opportunities, ranked by impact and effort.
4. Comment on my savings rate and fixed-cost ratio vs common guidelines (e.g. 50/30/20).
5. List questions you would need answered to give better advice.`;
