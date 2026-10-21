"use client";

import { useMemo } from "react";
import { useData } from "@/components/DataProvider";
import { EChart } from "@/components/EChart";
import { Card, PageHead } from "@/components/ui";
import { GROUP_LABEL, type SpendGroup } from "@/config/categories";
import { applyFilters, mean, monthRange, pivot, shiftMonth, stdev, sum, totalsBy } from "@/lib/aggregate";
import { base, catAxis, dot, valAxis } from "@/lib/chartBase";
import { compact, money, pct, ymLabel, ymLong } from "@/lib/format";
import { colorOf, DIV_BLUE, DIV_RED, GROUP_COLOR, INK } from "@/lib/palette";

export default function Trends() {
  const { ds, txs, filters, months, mode, firstMonth, lastMonth } = useData();
  // year-over-year views use every year in the data (wallet/transfer filters still apply)
  const allTx = useMemo(() => applyFilters(ds, { ...filters, from: firstMonth, to: lastMonth }), [ds, filters, firstMonth, lastMonth]);
  const allMonths = useMemo(() => monthRange(firstMonth, lastMonth), [firstMonth, lastMonth]);
  const yearsWithData = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const t of allTx) (m.get(t.year) ?? m.set(t.year, new Set()).get(t.year)!).add(t.ym);
    return [...m].filter(([, s]) => s.size >= 3).map(([y]) => y).sort();
  }, [allTx]);
  const k = INK[mode];
  const order = ds.categoryOrder.expense;

  // ---- period vs previous period, per category ----
  const change = useMemo(() => {
    const n = months.length;
    const prevTx = applyFilters(ds, { ...filters, from: shiftMonth(filters.from, -n), to: shiftMonth(filters.from, -1) });
    const now = new Map(totalsBy(txs, "expense", (t) => t.category));
    const before = new Map(totalsBy(prevTx, "expense", (t) => t.category));
    const cats = [...new Set([...now.keys(), ...before.keys()])];
    return {
      prevLabel: `${ymLong(shiftMonth(filters.from, -n))} – ${ymLong(shiftMonth(filters.from, -1))}`,
      hasPrev: prevTx.length > 0,
      rows: cats.map((c) => ({ c, now: now.get(c) ?? 0, before: before.get(c) ?? 0, d: (now.get(c) ?? 0) - (before.get(c) ?? 0) }))
        .filter((r) => Math.abs(r.d) > 1).sort((a, b) => a.d - b.d),
    };
  }, [ds, txs, filters, months.length]);

  const changeOpt = useMemo(() => ({
    ...base(mode),
    grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: any[]) => { const r = change.rows[ps[0].dataIndex];
        return `<b>${r.c}</b><br/>now ${money(r.now)}<br/>before ${money(r.before)}<br/>change <b>${r.d >= 0 ? "+" : ""}${money(r.d)}</b>${r.before ? ` (${r.d >= 0 ? "+" : ""}${pct(r.d / r.before)})` : ""}`; } },
    xAxis: valAxis(mode),
    yAxis: catAxis(mode, change.rows.map((r) => r.c), { axisLabel: { color: k.secondary, fontSize: 11 } }),
    series: [{
      type: "bar", barMaxWidth: 18,
      data: change.rows.map((r) => ({ value: r.d, itemStyle: { color: r.d > 0 ? DIV_RED[1] : DIV_BLUE[1], borderRadius: r.d > 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
      label: { show: true, position: "right", color: k.secondary, fontSize: 11, formatter: (p: any) => `${p.value > 0 ? "+" : ""}${compact(p.value)}` },
    }],
  }), [change, mode]);

  // ---- rolling 3-month average per group ----
  const rollOpt = useMemo(() => {
    // include 2 months before the window so the first points are real 3-month averages
    const ext = [shiftMonth(months[0], -2), shiftMonth(months[0], -1), ...months];
    const extTx = applyFilters(ds, { ...filters, from: ext[0] });
    const piv = pivot(extTx, "expense", ext, (t) => t.group);
    const groups = (["fixed", "essentials", "lifestyle", "business", "taxes", "other"] as SpendGroup[]).filter((g) => piv.has(g));
    const roll = (arr: number[]) => arr.slice(2).map((_, i) => mean(arr.slice(i, i + 3)));
    return {
      ...base(mode),
      legend: { ...(base(mode).legend as object), data: groups.map((g) => GROUP_LABEL[g]) },
      tooltip: { ...(base(mode).tooltip as object), trigger: "axis", valueFormatter: (v: number) => money(v) },
      xAxis: catAxis(mode, months.map(ymLabel), { boundaryGap: false }),
      yAxis: valAxis(mode),
      series: groups.map((g) => ({
        name: GROUP_LABEL[g], type: "line", data: roll(piv.get(g)!), smooth: 0.3, symbol: "none",
        lineStyle: { width: 2, color: GROUP_COLOR(mode)[g] }, itemStyle: { color: GROUP_COLOR(mode)[g] },
        endLabel: { show: true, color: k.secondary, fontSize: 11, formatter: (p: any) => compact(p.value) },
      })),
      grid: { ...(base(mode).grid as object), right: 48 },
    };
  }, [ds, filters, months, mode]);

  // ---- bump chart: category rank per year (all years in data that overlap the period) ----
  const bump = useMemo(() => {
    const years = yearsWithData.map(String);
    const piv = pivot(allTx, "expense", years, (t) => t.category, (t) => String(t.year));
    const cats = [...piv.keys()].filter((c) => sum(piv.get(c)!) > 0);
    const ranks = new Map(cats.map((c) => [c, [] as (number | null)[]]));
    years.forEach((_, yi) => {
      const sorted = cats.filter((c) => piv.get(c)![yi] > 0).sort((a, b) => piv.get(b)![yi] - piv.get(a)![yi]);
      cats.forEach((c) => ranks.get(c)!.push(sorted.includes(c) ? sorted.indexOf(c) + 1 : null));
    });
    return { years, cats: cats.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)), ranks, piv };
  }, [allTx, order, yearsWithData]);

  const bumpOpt = useMemo(() => ({
    ...base(mode),
    grid: { left: 8, right: 120, top: 16, bottom: 8, containLabel: true },
    legend: { show: false },
    tooltip: { ...(base(mode).tooltip as object), trigger: "item",
      formatter: (p: any) => `${dot(p.color)}${p.seriesName} · ${bump.years[p.dataIndex]}<br/>rank #${p.value} · ${money(bump.piv.get(p.seriesName)![p.dataIndex])}` },
    xAxis: catAxis(mode, bump.years, { boundaryGap: false, position: "top" }),
    yAxis: { type: "value", inverse: true, min: 1, max: Math.max(bump.cats.length, 1), interval: 1, axisLabel: { color: k.muted, formatter: (v: number) => `#${v}` }, splitLine: { show: false } },
    series: bump.cats.map((c) => ({
      name: c, type: "line", data: bump.ranks.get(c), symbol: "circle", symbolSize: 10, connectNulls: false,
      lineStyle: { width: 2, color: colorOf(mode, order, c) }, itemStyle: { color: colorOf(mode, order, c), borderColor: k.surface, borderWidth: 2 },
      endLabel: { show: true, color: k.secondary, fontSize: 11, formatter: (p: any) => p.seriesName },
      emphasis: { focus: "series" },
    })),
  }), [bump, mode, order]);

  // ---- boxplot: distribution of monthly spending per year ----
  const box = useMemo(() => {
    const years = yearsWithData;
    const perMonth = pivot(allTx, "expense", allMonths, () => "all").get("all") ?? [];
    const quart = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      const q = (p: number) => { const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
      return [s[0], q(0.25), q(0.5), q(0.75), s[s.length - 1]];
    };
    const data = years.map((y) => quart(allMonths.map((m, i) => (m.startsWith(String(y)) ? perMonth[i] : NaN)).filter((v) => !isNaN(v) && v > 0)));
    return { years: years.map(String), data };
  }, [allTx, allMonths, yearsWithData]);

  const boxOpt = useMemo(() => ({
    ...base(mode),
    grid: { ...(base(mode).grid as object), top: 16 },
    tooltip: { ...(base(mode).tooltip as object), trigger: "item",
      formatter: (p: any) => { const [, mn, q1, md, q3, mx] = p.data; return `<b>${p.name}</b><br/>max ${money(mx)}<br/>Q3 ${money(q3)}<br/>median ${money(md)}<br/>Q1 ${money(q1)}<br/>min ${money(mn)}`; } },
    xAxis: catAxis(mode, box.years),
    yAxis: valAxis(mode),
    series: [{ type: "boxplot", data: box.data, boxWidth: [12, 40], itemStyle: { color: "transparent", borderColor: DIV_BLUE[1], borderWidth: 2 } }],
  }), [box, mode]);

  // ---- anomalies: category-months far above that category's usual level ----
  const anomalies = useMemo(() => {
    const piv = pivot(txs, "expense", months, (t) => t.category);
    const out: { c: string; m: string; v: number; mu: number; z: number }[] = [];
    for (const [c, vals] of piv) {
      const mu = mean(vals), sd = stdev(vals);
      if (sd === 0 || mu < 50) continue;
      vals.forEach((v, i) => { const z = (v - mu) / sd; if (z >= 2 && v - mu > 300) out.push({ c, m: months[i], v, mu, z }); });
    }
    return out.sort((a, b) => b.v - b.mu - (a.v - a.mu)).slice(0, 12);
  }, [txs, months]);

  return (
    <>
      <PageHead title="Trends">How spending shifts: against the previous period, across years, and month to month.</PageHead>
      <div className="grid">
        <Card span={6} title="What changed vs the previous period" sub={change.hasPrev ? `Compared with ${change.prevLabel}. Red = spending more, blue = spending less.` : "No data in the preceding period of equal length."}>
          <EChart option={changeOpt as any} height={Math.max(240, change.rows.length * 26 + 30)} />
        </Card>
        <Card span={6} title="Lifestyle creep check" sub="3-month rolling average per spending group. A rising Lifestyle line means discretionary spend is growing.">
          <EChart option={rollOpt as any} height={Math.max(240, change.rows.length * 26 + 30)} />
        </Card>
        <Card span={7} title="Category ranking by year" sub="Bump chart — which categories climb or fall in importance. Always uses every year in the data.">
          <EChart option={bumpOpt as any} height={Math.max(300, bump.cats.length * 28 + 40)} />
        </Card>
        <Card span={5} title="How predictable is a month?" sub="Spread of monthly spending within each year (box = middle 50% of months). All years.">
          <EChart option={boxOpt as any} height={Math.max(300, bump.cats.length * 28 + 40)} />
        </Card>
        <Card span={12} title="Unusual months" sub="Category-months more than 2 standard deviations above that category's average in the period.">
          {anomalies.length === 0 ? <p className="note">Nothing stands out in this period.</p> : (
            <table className="tbl">
              <thead><tr><th>Category</th><th>Month</th><th>Spent</th><th>Usual</th><th>Excess</th><th style={{ textAlign: "left" }}>Largest items</th></tr></thead>
              <tbody>
                {anomalies.map((a) => (
                  <tr key={a.c + a.m}>
                    <td>{a.c}</td><td>{ymLong(a.m)}</td><td>{money(a.v)}</td><td>{money(a.mu)}</td><td>+{money(a.v - a.mu)}</td>
                    <td className="l">{txs.filter((t) => t.kind === "expense" && t.category === a.c && t.ym === a.m).sort((x, y) => y.value - x.value).slice(0, 3).map((t) => `${t.merchant} ${compact(t.value)}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
