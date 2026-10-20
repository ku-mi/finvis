"use client";

import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { EChart } from "@/components/EChart";
import { Card, PageHead, Seg } from "@/components/ui";
import { applyFilters, mean, sum } from "@/lib/aggregate";
import { base, catAxis, dot, ROUND_UP, valAxis } from "@/lib/chartBase";
import { compact, DOW, money, monthName } from "@/lib/format";
import { INK, SEQ, SERIES } from "@/lib/palette";
import type { Tx } from "@/lib/types";

type Scope = "discretionary" | "all";

export default function Rhythm() {
  const { ds, txs, mode, filters, firstMonth, lastMonth } = useData();
  const k = INK[mode];
  const [scope, setScope] = useState<Scope>("discretionary");
  const inScope = (t: Tx) => t.kind === "expense" && (scope === "all" || t.group === "essentials" || t.group === "lifestyle");
  const exp = useMemo(() => txs.filter(inScope), [txs, scope]);
  const scopeSel = (
    <Seg label="Scope" value={scope} onChange={setScope} options={[{ v: "discretionary", l: "Day-to-day" }, { v: "all", l: "Everything" }]} />
  );

  // seasonal views compare whole years, so they ignore the period (but keep wallet/transfer filters)
  const allExp = useMemo(() => applyFilters(ds, { ...filters, from: firstMonth, to: lastMonth }).filter(inScope), [ds, filters, firstMonth, lastMonth, scope]);
  const fullYears = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const t of allExp) (m.get(t.year) ?? m.set(t.year, new Set()).get(t.year)!).add(t.month);
    return [...m].filter(([, s]) => s.size >= 6).map(([y]) => y).sort().slice(-6);
  }, [allExp]);

  // ---- calendar ----
  const years = useMemo(() => [...new Set(exp.map((t) => t.year))].sort(), [exp]);
  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of exp) m.set(t.date, (m.get(t.date) ?? 0) + t.value);
    return m;
  }, [exp]);
  const calOpt = useMemo(() => {
    const vals = [...daily.values()].filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p: number) => vals[Math.floor(p * (vals.length - 1))] ?? 0;
    const cuts = [q(0.25), q(0.5), q(0.75), q(0.9), q(0.97)];
    const ramp = [SEQ[1], SEQ[3], SEQ[5], SEQ[7], SEQ[9], SEQ[12]];
    return {
      ...base(mode),
      tooltip: { ...(base(mode).tooltip as object), formatter: (p: any) => `${p.data[0]}<br/><b>${money(p.data[1])}</b>` },
      visualMap: {
        type: "piecewise", orient: "horizontal", left: "center", bottom: 0, itemWidth: 14, itemHeight: 10,
        textStyle: { color: k.muted, fontSize: 11 },
        pieces: [
          { lte: cuts[0], color: ramp[0], label: `≤ ${compact(cuts[0])}` },
          { gt: cuts[0], lte: cuts[1], color: ramp[1], label: `${compact(cuts[0])}–${compact(cuts[1])}` },
          { gt: cuts[1], lte: cuts[2], color: ramp[2], label: `–${compact(cuts[2])}` },
          { gt: cuts[2], lte: cuts[3], color: ramp[3], label: `–${compact(cuts[3])}` },
          { gt: cuts[3], lte: cuts[4], color: ramp[4], label: `–${compact(cuts[4])}` },
          { gt: cuts[4], color: ramp[5], label: `> ${compact(cuts[4])}` },
        ],
      },
      calendar: years.map((y, i) => ({
        top: 28 + i * 150, left: 40, cellSize: [17, 15],
        range: [y === Number(filters.from.slice(0, 4)) ? `${filters.from}-01` : `${y}-01-01`, y === Number(filters.to.slice(0, 4)) ? lastDay(filters.to) : `${y}-12-31`],
        itemStyle: { color: k.mid, borderColor: k.surface, borderWidth: 2 },
        splitLine: { show: false },
        yearLabel: { color: k.secondary, fontSize: 13, margin: 28 },
        monthLabel: { color: k.muted, fontSize: 11 },
        dayLabel: { color: k.muted, fontSize: 10, firstDay: 1, nameMap: ["S", "M", "T", "W", "T", "F", "S"] },
      })),
      series: years.map((y, i) => ({
        type: "heatmap", coordinateSystem: "calendar", calendarIndex: i,
        data: [...daily].filter(([d, v]) => d.startsWith(String(y)) && v > 0),
        itemStyle: { borderRadius: 3 },
      })),
    };
  }, [daily, years, mode, filters]);

  // ---- day of week ----
  const dowOpt = useMemo(() => {
    const days = new Map<string, number>(); // date → dow, to count distinct days per weekday
    const { from, to } = filters;
    const start = new Date(`${from}-01T00:00:00Z`);
    const end = new Date(`${to}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    for (let d = start; d < end; d = new Date(d.getTime() + 864e5)) days.set(d.toISOString().slice(0, 10), (d.getUTCDay() + 6) % 7);
    const nDays = DOW.map((_, i) => [...days.values()].filter((x) => x === i).length || 1);
    const tot = DOW.map((_, i) => sum(exp.filter((t) => t.dow === i).map((t) => t.value)));
    const cnt = DOW.map((_, i) => exp.filter((t) => t.dow === i).length);
    return {
      ...base(mode),
      grid: { ...(base(mode).grid as object), top: 16 },
      tooltip: { ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps: any[]) => { const i = ps[0].dataIndex; return `<b>${DOW[i]}</b><br/>avg ${money(tot[i] / nDays[i])} per ${DOW[i]}<br/>${(cnt[i] / nDays[i]).toFixed(1)} payments per day`; } },
      xAxis: catAxis(mode, DOW),
      yAxis: valAxis(mode),
      series: [{ type: "bar", data: tot.map((v, i) => v / nDays[i]), barMaxWidth: 36, itemStyle: { color: SERIES[mode][0], borderRadius: ROUND_UP },
        label: { show: true, position: "top", color: k.secondary, fontSize: 11, formatter: (p: any) => compact(p.value) } }],
    };
  }, [exp, filters, mode]);

  // ---- day of month: spending vs income timing ----
  const domOpt = useMemo(() => {
    const months = new Set(txs.map((t) => t.ym)).size || 1;
    const out = Array.from({ length: 31 }, (_, i) => sum(exp.filter((t) => t.dom === i + 1).map((t) => t.value)) / months);
    const inc = Array.from({ length: 31 }, (_, i) => sum(txs.filter((t) => t.kind === "income" && t.dom === i + 1).map((t) => t.value)) / months);
    return {
      ...base(mode),
      legend: { ...(base(mode).legend as object), data: ["Spending", "Income"] },
      tooltip: { ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps: any[]) => `<b>Day ${ps[0].axisValue}</b> (avg per month)<br/>` + ps.map((p) => `${dot(p.color)}${p.seriesName} <b>${money(Math.abs(p.value))}</b>`).join("<br/>") },
      xAxis: catAxis(mode, out.map((_, i) => String(i + 1))),
      yAxis: valAxis(mode),
      series: [
        { name: "Income", type: "bar", stack: "d", data: inc, itemStyle: { color: SERIES[mode][0], borderRadius: ROUND_UP }, barCategoryGap: "25%" },
        { name: "Spending", type: "bar", stack: "d", data: out.map((v) => -v), itemStyle: { color: SERIES[mode][1], borderRadius: [0, 0, 4, 4] } },
      ],
    };
  }, [exp, txs, mode]);

  // ---- seasonality: radial (polar) bars per calendar month, one ring per year ----
  const polarYears = fullYears;
  const polarOpt = useMemo(() => {
    const byYm = (y: number, m: number) => sum(allExp.filter((t) => t.year === y && t.month === m).map((t) => t.value));
    return {
      ...base(mode),
      legend: { ...(base(mode).legend as object), data: polarYears.map(String) },
      tooltip: { ...(base(mode).tooltip as object), trigger: "item", formatter: (p: any) => `${dot(p.color)}${monthName(p.dataIndex + 1)} ${p.seriesName}<br/><b>${money(p.value)}</b>` },
      polar: { radius: ["8%", "78%"], center: ["50%", "56%"] },
      angleAxis: { type: "category", data: Array.from({ length: 12 }, (_, i) => monthName(i + 1)), startAngle: 90,
        axisLine: { lineStyle: { color: k.axis } }, axisLabel: { color: k.muted }, axisTick: { show: false } },
      radiusAxis: { axisLabel: { color: k.muted, fontSize: 10, formatter: (v: number) => compact(v) }, splitLine: { lineStyle: { color: k.grid } }, axisLine: { show: false } },
      series: polarYears.map((y, i) => ({
        name: String(y), type: "bar", coordinateSystem: "polar", data: Array.from({ length: 12 }, (_, m) => byYm(y, m + 1)),
        itemStyle: { color: SERIES[mode][i], borderRadius: 2 }, emphasis: { focus: "series" },
      })),
    };
  }, [allExp, polarYears.join(), mode]);

  // ---- year race: cumulative spending through the year ----
  const raceOpt = useMemo(() => {
    const series = polarYears.map((y, i) => {
      const inY = allExp.filter((t) => t.year === y);
      const first = Math.min(...inY.map((t) => t.month));
      const last = Math.max(...inY.map((t) => t.month));
      let run = 0;
      const data = Array.from({ length: 12 }, (_, m) => {
        run += sum(inY.filter((t) => t.month === m + 1).map((t) => t.value));
        return m + 1 >= first && m + 1 <= last ? run : null;
      });
      return {
        name: String(y), type: "line", data, symbol: "circle", symbolSize: 6,
        lineStyle: { width: 2, color: SERIES[mode][i] }, itemStyle: { color: SERIES[mode][i], borderColor: k.surface, borderWidth: 1 },
        endLabel: { show: true, color: k.secondary, fontSize: 11, formatter: (p: any) => `${p.seriesName} ${compact(p.value)}` },
        emphasis: { focus: "series" },
      };
    });
    return {
      ...base(mode),
      grid: { ...(base(mode).grid as object), right: 80 },
      legend: { ...(base(mode).legend as object), data: polarYears.map(String) },
      tooltip: { ...(base(mode).tooltip as object), trigger: "axis", valueFormatter: (v: number) => (v == null ? "–" : money(v)) },
      xAxis: catAxis(mode, Array.from({ length: 12 }, (_, i) => monthName(i + 1)), { boundaryGap: false }),
      yAxis: valAxis(mode),
      series,
    };
  }, [allExp, polarYears.join(), mode]);

  const biggestDays = [...daily].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const quiet = [...daily.values()].filter((v) => v > 0).length;

  return (
    <>
      <PageHead title="Rhythm">
        When money moves — by day, weekday, day of month and season. &ldquo;Day-to-day&rdquo; hides mortgage, taxes, insurance and
        business costs so the habits show through.
      </PageHead>
      <div className="grid">
        <Card span={12} title="Spending calendar" sub={`Every day in the period; darker = more spent. ${quiet} days with spending.`} right={scopeSel}>
          <EChart option={calOpt as any} height={years.length * 150 + 50} />
        </Card>
        <Card span={6} title="Weekday habits" sub="Average spending per calendar weekday.">
          <EChart option={dowOpt as any} height={280} />
        </Card>
        <Card span={6} title="Pay-day rhythm" sub="Average per month by day of month: when income lands vs when money leaves.">
          <EChart option={domOpt as any} height={280} />
        </Card>
        <Card span={6} title="Year clock" sub="Each spoke is a month, each colour a year (all years with 6+ months of data, regardless of the period filter).">
          <EChart option={polarOpt as any} height={420} />
        </Card>
        <Card span={6} title="Year race" sub="Cumulative spending through each year — which year is running hotter? Uses all years, like the year clock.">
          <EChart option={raceOpt as any} height={420} />
        </Card>
        <Card span={12} title="Biggest days" sub="Days with the highest total spending in scope.">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Total</th><th style={{ textAlign: "left" }}>What</th></tr></thead>
            <tbody>
              {biggestDays.map(([d, v]) => (
                <tr key={d}>
                  <td>{d} <span className="note">{DOW[exp.find((t) => t.date === d)!.dow]}</span></td>
                  <td>{money(v)}</td>
                  <td className="l">{exp.filter((t) => t.date === d).sort((a, b) => b.value - a.value).slice(0, 4).map((t) => `${t.merchant} (${compact(t.value)})`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Mean day-to-day spend per active day: {money(mean([...daily.values()]))}. Tip: switch to &ldquo;Everything&rdquo; to include fixed costs.</p>
        </Card>
      </div>
      {ds.txs.length === 0 && <p>No data.</p>}
    </>
  );
}

function lastDay(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
