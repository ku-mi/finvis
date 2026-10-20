"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { EChart } from "@/components/EChart";
import { Card, PageHead } from "@/components/ui";
import { GROUP_LABEL, type SpendGroup } from "@/config/categories";
import { stableOrder, totals, totalsBy } from "@/lib/aggregate";
import { base, catAxis, dot, valAxis } from "@/lib/chartBase";
import { compact, money, pct } from "@/lib/format";
import { colorOf, DIV_BLUE, DIV_RED, INK, SERIES } from "@/lib/palette";

const LS = "finvis.whatif.v1";

interface State {
  adj: Record<string, number>; // category → % change
  income: number; // % change
  years: number;
  ret: number; // annual return %
}
const DEFAULT: State = { adj: {}, income: 0, years: 10, ret: 5 };

export default function WhatIf() {
  const { ds, txs, months, mode } = useData();
  const k = INK[mode];
  const order = ds.categoryOrder.expense;
  const [s, setS] = useState<State>(DEFAULT);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(LS) ?? "null"); if (v) setS({ ...DEFAULT, ...v }); } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch {} }, [s]);

  const n = months.length || 1;
  const t = totals(txs);
  const cats = useMemo(() => {
    const tot = new Map(totalsBy(txs, "expense", (x) => x.category));
    return stableOrder([...tot.keys()], order)
      .filter((c) => tot.get(c)! > 0)
      .map((c) => {
        const group = txs.find((x) => x.kind === "expense" && x.category === c)!.group as SpendGroup;
        return { c, group, avg: tot.get(c)! / n };
      });
  }, [txs, order, n]);

  const rows = cats.map((x) => {
    const p = s.adj[x.c] ?? 0;
    return { ...x, p, next: x.avg * (1 + p / 100), delta: (x.avg * p) / 100 };
  });
  const incNow = t.income / n;
  const incNext = incNow * (1 + s.income / 100);
  const expNow = t.expense / n;
  const expNext = rows.reduce((a, r) => a + r.next, 0) + (expNow - rows.reduce((a, r) => a + r.avg, 0));
  const netNow = incNow - expNow;
  const netNext = incNext - expNext;
  const extra = netNext - netNow;

  const setAdj = (c: string, v: number) => setS((st) => ({ ...st, adj: { ...st.adj, [c]: v } }));
  const preset = (g: SpendGroup | "all", p: number) =>
    setS((st) => ({ ...st, adj: { ...st.adj, ...Object.fromEntries(cats.filter((x) => g === "all" || x.group === g).map((x) => [x.c, p])) } }));

  // ---- projection with monthly compounding ----
  const proj = useMemo(() => {
    const r = s.ret / 1200;
    const labels: string[] = [], a: number[] = [], b: number[] = [];
    let A = 0, B = 0;
    for (let m = 1; m <= s.years * 12; m++) {
      A = A * (1 + r) + netNow;
      B = B * (1 + r) + netNext;
      if (m % 12 === 0) { labels.push(`Year ${m / 12}`); a.push(A); b.push(B); }
    }
    return { labels, a, b };
  }, [s.ret, s.years, netNow, netNext]);

  const projOpt = useMemo(() => ({
    ...base(mode),
    legend: { ...(base(mode).legend as object), data: ["Current habits", "Scenario"] },
    tooltip: { ...(base(mode).tooltip as object), trigger: "axis",
      formatter: (ps: any[]) => { const i = ps[0].dataIndex; return `<b>${proj.labels[i]}</b><br/>${dot(k.muted)}Current <b>${money(proj.a[i])}</b><br/>${dot(SERIES[mode][2])}Scenario <b>${money(proj.b[i])}</b><br/>Difference <b>${money(proj.b[i] - proj.a[i])}</b>`; } },
    xAxis: catAxis(mode, proj.labels, { boundaryGap: false }),
    yAxis: valAxis(mode),
    grid: { ...(base(mode).grid as object), right: 64 },
    series: [
      { name: "Current habits", type: "line", data: proj.a, symbol: "none", lineStyle: { width: 2, color: k.muted, type: "dashed" }, itemStyle: { color: k.muted },
        endLabel: { show: true, color: k.secondary, fontSize: 11, formatter: (p: any) => compact(p.value) } },
      { name: "Scenario", type: "line", data: proj.b, symbol: "none", lineStyle: { width: 2, color: SERIES[mode][2] }, itemStyle: { color: SERIES[mode][2] },
        areaStyle: { color: SERIES[mode][2], opacity: 0.1 }, endLabel: { show: true, color: k.primary, fontSize: 11, formatter: (p: any) => compact(p.value) } },
    ],
  }), [proj, mode]);

  // ---- baseline vs scenario per category (ghost bar behind the new value) ----
  const barOpt = useMemo(() => {
    const rr = [...rows].reverse();
    return {
      ...base(mode),
      legend: { show: false },
      grid: { left: 8, right: 70, top: 8, bottom: 8, containLabel: true },
      tooltip: { ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps: any[]) => { const r = rr[ps[0].dataIndex]; return `<b>${r.c}</b><br/>now ${money(r.avg)}/mo<br/>scenario ${money(r.next)}/mo (${r.p > 0 ? "+" : ""}${r.p}%)`; } },
      xAxis: valAxis(mode),
      yAxis: catAxis(mode, rr.map((r) => r.c), { axisLabel: { color: k.secondary, fontSize: 11 } }),
      series: [
        { type: "bar", data: rr.map((r) => r.avg), barWidth: 16, itemStyle: { color: k.mid, borderRadius: [0, 4, 4, 0] }, silent: true, z: 1 },
        { type: "bar", data: rr.map((r) => ({ value: r.next, itemStyle: { color: colorOf(mode, order, r.c) } })), barWidth: 8, barGap: "-75%",
          itemStyle: { borderRadius: [0, 3, 3, 0] }, z: 2,
          label: { show: true, position: "right", color: k.secondary, fontSize: 11, formatter: (p: any) => { const r = rr[p.dataIndex]; return r.p ? `${r.delta > 0 ? "+" : ""}${compact(r.delta)}` : compact(r.avg); } } },
      ],
    };
  }, [rows, mode, order]);

  // ---- waterfall from current monthly savings to scenario savings ----
  const wfOpt = useMemo(() => {
    const steps: { name: string; d: number }[] = [];
    if (s.income) steps.push({ name: "Income", d: incNext - incNow });
    for (const r of rows) if (r.p) steps.push({ name: r.c, d: -r.delta });
    const labels = ["Saved now", ...steps.map((x) => x.name), "Scenario"];
    const ghost: number[] = [0], vis: any[] = [{ value: netNow, itemStyle: { color: k.muted } }];
    let lvl = netNow;
    for (const st of steps) {
      const next = lvl + st.d;
      ghost.push(Math.min(lvl, next));
      vis.push({ value: Math.abs(st.d), itemStyle: { color: st.d >= 0 ? DIV_BLUE[1] : DIV_RED[1] } });
      lvl = next;
    }
    ghost.push(0);
    vis.push({ value: lvl, itemStyle: { color: SERIES[mode][2] } });
    return {
      ...base(mode),
      grid: { ...(base(mode).grid as object), top: 16 },
      tooltip: { ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps: any[]) => { const i = ps[0].dataIndex; const st = steps[i - 1]; return `<b>${labels[i]}</b><br/>${st ? `${st.d >= 0 ? "+" : "−"}${money(Math.abs(st.d))} per month` : `${money(vis[i].value)} per month`}`; } },
      xAxis: catAxis(mode, labels, { axisLabel: { color: k.muted, fontSize: 11, interval: 0, rotate: labels.length > 6 ? 30 : 0 } }),
      yAxis: valAxis(mode),
      series: [
        { type: "bar", stack: "w", data: ghost, itemStyle: { color: "transparent" }, silent: true },
        { type: "bar", stack: "w", data: vis, barMaxWidth: 40, itemStyle: { borderRadius: 4 },
          label: { show: true, position: "top", color: k.secondary, fontSize: 11, formatter: (p: any) => compact(p.value) } },
      ],
    };
  }, [rows, s.income, incNow, incNext, netNow, mode]);

  const changed = rows.some((r) => r.p) || s.income !== 0;

  return (
    <>
      <PageHead title="What if…">
        Move the sliders to change each category&apos;s monthly average (from the selected period) and see what it does to your savings, now and over the years.
      </PageHead>
      <div className="grid">
        <section className="card c3 kpi"><div className="l">Saved per month</div><div className="v">{money(netNext)}</div>
          <div className="delta">now {money(netNow)} · <span className={extra >= 0 ? "up" : "down"}>{extra >= 0 ? "+" : "−"}{money(Math.abs(extra))}</span></div></section>
        <section className="card c3 kpi"><div className="l">Extra per year</div><div className="v">{extra >= 0 ? "+" : "−"}{money(Math.abs(extra * 12))}</div>
          <div className="delta">{changed ? "vs your current habits" : "move a slider to start"}</div></section>
        <section className="card c3 kpi"><div className="l">Savings rate</div><div className="v">{pct(incNext ? netNext / incNext : 0, 1)}</div>
          <div className="delta">now {pct(incNow ? netNow / incNow : 0, 1)}</div></section>
        <section className="card c3 kpi"><div className="l">After {s.years} years at {s.ret}%</div><div className="v">{money(proj.b.at(-1) ?? 0)}</div>
          <div className="delta">{proj.b.length ? `${money((proj.b.at(-1) ?? 0) - (proj.a.at(-1) ?? 0))} more than now` : ""}</div></section>

        <Card span={5} title="Your levers" sub={`Monthly averages over ${n} months. Slide left to cut, right to allow more.`}
          right={<button className="btn" onClick={() => setS((st) => ({ ...st, adj: {}, income: 0 }))}>Reset</button>}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 12px" }}>
            <button className="btn" onClick={() => preset("lifestyle", -20)}>{GROUP_LABEL.lifestyle} −20%</button>
            <button className="btn" onClick={() => preset("essentials", -10)}>{GROUP_LABEL.essentials} −10%</button>
            <button className="btn" onClick={() => preset("all", -5)}>Everything −5%</button>
          </div>
          <Slider label="Income" color={SERIES[mode][0]} avg={incNow} value={s.income} onChange={(v) => setS((st) => ({ ...st, income: v }))} min={-50} max={50} />
          <div style={{ height: 1, background: "var(--line)", margin: "6px 0 8px" }} />
          {rows.map((r) => (
            <Slider key={r.c} label={r.c} hint={GROUP_LABEL[r.group]} color={colorOf(mode, order, r.c)} avg={r.avg} value={r.p} onChange={(v) => setAdj(r.c, v)} min={-100} max={50} />
          ))}
        </Card>

        <div className="c7" style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Card span={12} title="From today's savings to the scenario" sub="Monthly effect of each change.">
            <EChart option={wfOpt as any} height={280} />
          </Card>
          <Card span={12} title="Category budget: now vs scenario" sub="Grey = current average, coloured = scenario.">
            <EChart option={barOpt as any} height={Math.max(220, rows.length * 26 + 20)} />
          </Card>
        </div>

        <Card span={12} title="Where it leads" sub="Monthly savings invested with monthly compounding. Ignores inflation and taxes."
          right={
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <label className="chk">Years <input type="range" min={1} max={30} value={s.years} onChange={(e) => setS((st) => ({ ...st, years: +e.target.value }))} /> <b>{s.years}</b></label>
              <label className="chk">Return <input type="range" min={0} max={12} step={0.5} value={s.ret} onChange={(e) => setS((st) => ({ ...st, ret: +e.target.value }))} /> <b>{s.ret}%</b></label>
            </div>
          }>
          <EChart option={projOpt as any} height={320} />
          {extra > 0 && (
            <p className="note" style={{ marginTop: 8 }}>
              Prefer paying off debt? <Link href={`/mortgage?overpay=${Math.round(extra)}`} style={{ color: "var(--accent)" }}>Use the extra {money(extra)} a month as a mortgage overpayment →</Link>
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Slider({ label, hint, color, avg, value, onChange, min, max }: {
  label: string; hint?: string; color: string; avg: number; value: number; onChange: (v: number) => void; min: number; max: number;
}) {
  const next = avg * (1 + value / 100);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1fr) 1.4fr 92px", gap: 10, alignItems: "center", padding: "4px 0" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><span className="swatch" style={{ background: color }} />{label}</div>
        <div className="note">{money(avg)}/mo{hint ? ` · ${hint}` : ""}</div>
      </div>
      <input type="range" min={min} max={max} step={5} value={value} onChange={(e) => onChange(+e.target.value)}
        aria-label={`${label} change`} style={{ width: "100%", accentColor: color }} onDoubleClick={() => onChange(0)} />
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{money(next)}</div>
        <div className="note" style={{ color: value ? (value < 0) === (label !== "Income") ? "var(--good)" : "var(--bad)" : undefined }}>{value > 0 ? "+" : ""}{value}%</div>
      </div>
    </div>
  );
}
