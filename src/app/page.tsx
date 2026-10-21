"use client";

import { useMemo } from "react";
import { useData } from "@/components/DataProvider";
import { EChart } from "@/components/EChart";
import { Card, Kpi, PageHead } from "@/components/ui";
import { applyFilters, monthRange, pivot, shiftMonth, totals, totalsBy } from "@/lib/aggregate";
import { base, catAxis, dot, ROUND_DOWN, ROUND_UP, valAxis } from "@/lib/chartBase";
import { money, pct, ymLabel, ymLong } from "@/lib/format";
import { colorOf, GROUP_COLOR, INK, SERIES } from "@/lib/palette";
import { GROUP_LABEL } from "@/config/categories";

export default function Overview() {
  const { ds, txs, filters, months, buckets, bucketOf, granularity, mode } = useData();
  const k = INK[mode];
  const label = (b: string) => (granularity === "month" ? ymLabel(b) : b);

  const t = totals(txs);
  const prev = useMemo(() => {
    const n = months.length;
    const f = { ...filters, from: shiftMonth(filters.from, -n), to: shiftMonth(filters.from, -1) };
    const p = applyFilters(ds, f);
    return p.length ? totals(p) : null;
  }, [ds, filters, months.length]);
  const rel = (a: number, b?: number) => (b ? (a - b) / Math.abs(b) : null);
  const activeMonths = new Set(txs.map((x) => x.ym)).size || 1;
  const topCat = totalsBy(txs, "expense", (x) => x.category)[0];

  const flows = useMemo(() => {
    const inc = pivot(txs, "income", buckets, () => "i", bucketOf).get("i") ?? buckets.map(() => 0);
    const exp = pivot(txs, "expense", buckets, () => "e", bucketOf).get("e") ?? buckets.map(() => 0);
    return { inc, exp, net: inc.map((v, i) => v - exp[i]) };
  }, [txs, buckets, bucketOf]);

  const flowOpt = useMemo(() => ({
    ...base(mode),
    legend: { ...(base(mode).legend as object), data: ["Income", "Spending", "Net"] },
    tooltip: {
      ...(base(mode).tooltip as object),
      trigger: "axis",
      formatter: (ps: any[]) => {
        const i = ps[0].dataIndex;
        return `<b>${ps[0].axisValue}</b><br/>${dot(SERIES[mode][0])}Income <b>${money(flows.inc[i])}</b><br/>${dot(SERIES[mode][1])}Spending <b>${money(flows.exp[i])}</b><br/>${dot(k.primary)}Net <b>${money(flows.net[i])}</b> (${flows.inc[i] ? pct(flows.net[i] / flows.inc[i]) : "–"} saved)`;
      },
    },
    xAxis: catAxis(mode, buckets.map(label)),
    yAxis: valAxis(mode),
    series: [
      { name: "Income", type: "bar", stack: "f", data: flows.inc, barMaxWidth: 26, itemStyle: { color: SERIES[mode][0], borderRadius: ROUND_UP } },
      { name: "Spending", type: "bar", stack: "f", data: flows.exp.map((v) => -v), barMaxWidth: 26, itemStyle: { color: SERIES[mode][1], borderRadius: ROUND_DOWN } },
      { name: "Net", type: "line", data: flows.net, symbol: "circle", symbolSize: 7, lineStyle: { width: 2, color: k.primary }, itemStyle: { color: k.primary, borderColor: k.surface, borderWidth: 2 } },
    ],
  }), [flows, buckets, mode]);

  const cumOpt = useMemo(() => {
    let run = 0;
    const cum = flows.net.map((v) => (run += v));
    return {
      ...base(mode),
      grid: { ...(base(mode).grid as object), top: 16 },
      legend: { show: false },
      tooltip: { ...(base(mode).tooltip as object), trigger: "axis", valueFormatter: (v: number) => money(v) },
      xAxis: catAxis(mode, buckets.map(label), { boundaryGap: false }),
      yAxis: valAxis(mode),
      series: [{
        name: "Cumulative net", type: "line", data: cum, symbol: "none", lineStyle: { width: 2, color: SERIES[mode][2] },
        areaStyle: { color: SERIES[mode][2], opacity: 0.12 },
        markLine: { silent: true, symbol: "none", lineStyle: { color: k.axis, type: "solid" }, data: [{ yAxis: 0 }], label: { show: false } },
      }],
    };
  }, [flows, buckets, mode]);

  const nw = useMemo(() => {
    const pts = ds.netWorth.filter((p) => p.date.slice(0, 7) >= filters.from && p.date.slice(0, 7) <= filters.to);
    const use = pts.length > 1 ? pts : ds.netWorth;
    // sample one point per month (last of month) to keep the line calm
    const byMonth = new Map<string, (typeof use)[number]>();
    for (const p of use) byMonth.set(p.date.slice(0, 7), p);
    return [...byMonth.values()];
  }, [ds, filters]);

  const nwOpt = useMemo(() => ({
    ...base(mode),
    legend: { ...(base(mode).legend as object), data: ["Assets", "Liabilities", "Net worth"] },
    tooltip: { ...(base(mode).tooltip as object), trigger: "axis", valueFormatter: (v: number) => money(v) },
    xAxis: catAxis(mode, nw.map((p) => ymLabel(p.date.slice(0, 7))), { boundaryGap: false }),
    yAxis: valAxis(mode),
    series: [
      { name: "Assets", type: "line", data: nw.map((p) => p.assets), symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: SERIES[mode][0], opacity: 0.25 } },
      { name: "Liabilities", type: "line", data: nw.map((p) => p.liabilities), symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: SERIES[mode][7], opacity: 0.25 } },
      { name: "Net worth", type: "line", data: nw.map((p) => p.netWorth), symbol: "none", lineStyle: { width: 2, color: k.primary } },
    ],
    color: [SERIES[mode][0], SERIES[mode][7], k.primary],
  }), [nw, mode]);

  const groups = totalsBy(txs, "expense", (x) => x.group);
  const groupOpt = useMemo(() => ({
    ...base(mode),
    tooltip: { ...(base(mode).tooltip as object), trigger: "item", formatter: (p: any) => `${dot(p.color)}${p.name}<br/><b>${money(p.value)}</b> · ${p.percent}%` },
    legend: { show: false },
    series: [{
      type: "pie", radius: ["40%", "64%"], padAngle: 1.5, minShowLabelAngle: 4, itemStyle: { borderRadius: 4, borderColor: k.surface, borderWidth: 2 },
      label: { color: k.secondary, formatter: "{b}\n{d}%", fontSize: 11 },
      data: groups.map(([g, v]) => ({ name: GROUP_LABEL[g as keyof typeof GROUP_LABEL] ?? g, value: Math.round(v), itemStyle: { color: (GROUP_COLOR(mode) as any)[g] } })),
    }],
  }), [groups, mode]);

  const cats = totalsBy(txs, "expense", (x) => x.category).slice(0, 10);
  const maxCat = cats[0]?.[1] ?? 1;
  const period = `${ymLong(filters.from)} – ${ymLong(filters.to)}`;

  return (
    <>
      <PageHead title="Overview">{period} · {monthRange(filters.from, filters.to).length} months. All amounts in {ds.currency}.
        {filters.hidden.length > 0 && <> Excluding {filters.hidden.map((k) => k.slice(k.indexOf(":") + 1)).join(", ")}.</>}
      </PageHead>
      <div className="grid">
        <Kpi label="Income" value={money(t.income)} delta={rel(t.income, prev?.income)} />
        <Kpi label="Spending" value={money(t.expense)} delta={rel(t.expense, prev?.expense)} goodWhenUp={false} />
        <Kpi label="Net saved" value={money(t.net)} note={`Savings rate ${pct(t.savingsRate)}${prev ? ` (was ${pct(prev.savingsRate)})` : ""}`} />
        <Kpi label="Avg monthly spending" value={money(t.expense / activeMonths)} note={topCat ? `Largest: ${topCat[0]} (${pct(topCat[1] / t.expense)})` : undefined} />

        <Card span={8} title="Income vs spending" sub="Income above the line, spending below; the line is what was left over.">
          <EChart option={flowOpt as any} height={320} />
        </Card>
        <Card span={4} title="Where spending lands" sub="Fixed obligations, essentials, lifestyle choices, business costs and taxes.">
          <EChart option={groupOpt as any} height={320} />
        </Card>

        <Card span={6} title="Cumulative savings" sub="Running total of income minus spending across the period.">
          <EChart option={cumOpt as any} height={260} />
        </Card>
        <Card span={6} title="Top spending categories" sub="Share of total spending in the period.">
          <ul className="ranklist">
            {cats.map(([c, v]) => (
              <li key={c}>
                <span><span className="swatch" style={{ background: colorOf(mode, ds.categoryOrder.expense, c) }} />{c}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{money(v)} <span className="note">{pct(v / t.expense)}</span></span>
                <div className="bar-bg"><div style={{ width: `${(v / maxCat) * 100}%`, background: colorOf(mode, ds.categoryOrder.expense, c) }} /></div>
              </li>
            ))}
          </ul>
        </Card>

        <Card span={12} title="Net worth" sub="Assets (property, cash, bank) against liabilities (mortgage), from Finantly's daily snapshots.">
          <EChart option={nwOpt as any} height={280} />
        </Card>
      </div>
    </>
  );
}
