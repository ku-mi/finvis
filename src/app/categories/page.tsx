"use client";

import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { EChart } from "@/components/EChart";
import { Card, PageHead, Seg } from "@/components/ui";
import { mean, pivot, stableOrder, sum, totalsBy } from "@/lib/aggregate";
import { base, catAxis, dot, valAxis } from "@/lib/chartBase";
import { compact, money, pct, ymLabel } from "@/lib/format";
import { colorOf, DIV_BLUE, DIV_RED, foldKey, INK, OTHER, SEQ } from "@/lib/palette";
import type { Kind } from "@/lib/types";

export default function Categories() {
  const { ds, txs, buckets, bucketOf, granularity, mode } = useData();
  const k = INK[mode];
  const [kind, setKind] = useState<Kind>("expense");
  const [stackMode, setStackMode] = useState<"abs" | "share">("abs");
  const [heatMode, setHeatMode] = useState<"abs" | "rel">("rel");
  const [focus, setFocus] = useState<string | null>(null);
  const order = ds.categoryOrder[kind];
  const label = (b: string) => (granularity === "month" ? ymLabel(b) : b);
  const col = (c: string) => (c === OTHER ? k.other : colorOf(mode, order, c));

  const piv = useMemo(() => pivot(txs, kind, buckets, (t) => t.category, bucketOf), [txs, kind, buckets, bucketOf]);
  const cats = useMemo(() => stableOrder([...piv.keys()], order).filter((c) => sum(piv.get(c)!) > 0), [piv, order]);

  // ---- sunburst ----
  const sunOpt = useMemo(() => {
    const data = cats.map((c) => {
      const subs = totalsBy(txs.filter((t) => t.category === c), kind, (t) => t.subcategory).filter(([, v]) => v > 0);
      return { name: c, itemStyle: { color: col(c) }, children: subs.map(([s, v]) => ({ name: s, value: Math.round(v) })) };
    });
    const total = sum(cats.map((c) => sum(piv.get(c)!)));
    return {
      ...base(mode),
      tooltip: { ...(base(mode).tooltip as object), formatter: (p: any) => `${p.treePathInfo.slice(1).map((x: any) => x.name).join(" › ")}<br/><b>${money(p.value)}</b> · ${pct(p.value / total, 1)}` },
      series: [{
        type: "sunburst", data, radius: ["14%", "96%"], sort: undefined, nodeClick: "rootToNode",
        itemStyle: { borderColor: k.surface, borderWidth: 2, borderRadius: 3 },
        levels: [{}, { r0: "14%", r: "58%", label: { rotate: "tangential", color: "#fff", fontSize: 11, minAngle: 12 } },
          { r0: "58%", r: "96%", itemStyle: { opacity: 0.72 }, label: { color: k.primary, fontSize: 10, align: "right", minAngle: 6, rotate: "radial" } }],
      }],
    };
  }, [cats, txs, kind, mode, piv]);

  // ---- stacked bars over time (fold into 7 + Other) ----
  const stack = useMemo(() => {
    const folded = new Map<string, number[]>();
    for (const c of cats) {
      const key = foldKey(order, c);
      const row = folded.get(key) ?? new Array(buckets.length).fill(0);
      piv.get(c)!.forEach((v, i) => (row[i] += v));
      folded.set(key, row);
    }
    const keys = [...folded.keys()].sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : order.indexOf(a) - order.indexOf(b)));
    const totalsPerBucket = buckets.map((_, i) => sum(keys.map((key) => folded.get(key)![i])));
    return { keys, folded, totalsPerBucket };
  }, [cats, piv, order, buckets]);

  const stackOpt = useMemo(() => ({
    ...base(mode),
    legend: { ...(base(mode).legend as object), data: stack.keys },
    tooltip: {
      ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: any[]) => {
        const i = ps[0].dataIndex;
        const rows = [...ps].filter((p) => stack.folded.get(p.seriesName)![i] !== 0).reverse()
          .map((p) => `${dot(p.color)}${p.seriesName} <b style="float:right;margin-left:16px">${money(stack.folded.get(p.seriesName)![i])}</b>`);
        return `<b>${ps[0].axisValue}</b> · ${money(stack.totalsPerBucket[i])}<br/>${rows.join("<br/>")}`;
      },
    },
    xAxis: catAxis(mode, buckets.map(label)),
    yAxis: valAxis(mode, stackMode === "share" ? { max: 1, axisLabel: { color: k.muted, fontSize: 11, formatter: (v: number) => pct(v) } } : {}),
    series: stack.keys.map((key, si) => ({
      name: key, type: "bar", stack: "s", barMaxWidth: 34,
      data: stack.folded.get(key)!.map((v, i) => (stackMode === "share" ? (stack.totalsPerBucket[i] ? Math.max(0, v) / stack.totalsPerBucket[i] : 0) : Math.max(0, v))),
      itemStyle: { color: col(key), borderColor: k.surface, borderWidth: 1, borderRadius: si === stack.keys.length - 1 ? [4, 4, 0, 0] : 0 },
      emphasis: { focus: "series" },
    })),
  }), [stack, stackMode, buckets, mode]);

  // ---- heatmap category × bucket ----
  const heat = useMemo(() => {
    const rows = [...cats].reverse(); // top category at top
    const data: [number, number, number, number][] = [];
    rows.forEach((c, y) => {
      const vals = piv.get(c)!;
      const mu = mean(vals);
      vals.forEach((v, x) => data.push([x, y, heatMode === "rel" ? (mu ? v / mu - 1 : 0) : v, v]));
    });
    const max = Math.max(...data.map((d) => d[2]), 1);
    return { rows, data, max };
  }, [cats, piv, heatMode]);

  const heatOpt = useMemo(() => ({
    ...base(mode),
    grid: { left: 8, right: 8, top: 8, bottom: 52, containLabel: true },
    tooltip: {
      ...(base(mode).tooltip as object),
      formatter: (p: any) => {
        const [x, y, rel, v] = p.data;
        const extra = heatMode === "rel" ? `<br/>${rel >= 0 ? "+" : ""}${pct(rel)} vs this category's average` : "";
        return `${heat.rows[y]} · ${label(buckets[x])}<br/><b>${money(v)}</b>${extra}`;
      },
    },
    xAxis: catAxis(mode, buckets.map(label), { splitArea: { show: false } }),
    yAxis: catAxis(mode, heat.rows, { axisLine: { show: false } }),
    visualMap: heatMode === "rel"
      ? { type: "piecewise", orient: "horizontal", left: "center", bottom: 0, itemWidth: 14, itemHeight: 10, textStyle: { color: k.muted, fontSize: 11 },
          pieces: [
            { lt: -0.5, color: DIV_BLUE[0], label: "< −50%" }, { gte: -0.5, lt: -0.2, color: DIV_BLUE[1], label: "−50…−20%" },
            { gte: -0.2, lt: -0.05, color: DIV_BLUE[2], label: "−20…−5%" }, { gte: -0.05, lte: 0.05, color: k.mid, label: "≈ average" },
            { gt: 0.05, lte: 0.2, color: DIV_RED[0], label: "+5…20%" }, { gt: 0.2, lte: 0.5, color: DIV_RED[1], label: "+20…50%" },
            { gt: 0.5, color: DIV_RED[2], label: "> +50%" },
          ], dimension: 2 }
      : { type: "continuous", min: 0, max: heat.max, dimension: 2, orient: "horizontal", left: "center", bottom: 0, itemHeight: 220, itemWidth: 10,
          inRange: { color: [k.mid, ...SEQ.slice(2)] }, textStyle: { color: k.muted, fontSize: 11 }, formatter: (v: number) => compact(v) },
    series: [{
      type: "heatmap", data: heat.data,
      itemStyle: { borderColor: k.surface, borderWidth: 2, borderRadius: 3 },
      emphasis: { itemStyle: { borderColor: k.primary, borderWidth: 1 } },
    }],
  }), [heat, heatMode, buckets, mode]);

  // ---- small multiples ----
  const multiples = cats.slice(0, 16).map((c) => {
    const vals = piv.get(c)!;
    const mu = mean(vals);
    const half = Math.floor(vals.length / 2);
    const trend = half ? mean(vals.slice(half)) / (mean(vals.slice(0, half)) || 1) - 1 : 0;
    return { c, vals, mu, trend, total: sum(vals) };
  });

  // ---- focus drilldown ----
  const focusCat = focus && cats.includes(focus) ? focus : null;
  const focusOpt = useMemo(() => {
    if (!focusCat) return null;
    const subPiv = pivot(txs.filter((t) => t.category === focusCat), kind, buckets, (t) => t.subcategory, bucketOf);
    const subs = [...subPiv.keys()].sort((a, b) => sum(subPiv.get(b)!) - sum(subPiv.get(a)!));
    const color = col(focusCat);
    return {
      ...base(mode),
      legend: { ...(base(mode).legend as object), data: subs },
      tooltip: { ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => money(v) },
      xAxis: catAxis(mode, buckets.map(label)),
      yAxis: valAxis(mode),
      series: subs.map((s, i) => ({
        name: s, type: "bar", stack: "f", barMaxWidth: 34, data: subPiv.get(s)!.map((v) => Math.max(0, v)),
        itemStyle: { color, opacity: 1 - (i / Math.max(subs.length, 1)) * 0.7, borderColor: k.surface, borderWidth: 1 },
      })),
    };
  }, [focusCat, txs, kind, buckets, bucketOf, mode]);

  const pivTotals = buckets.map((_, i) => sum(cats.map((c) => piv.get(c)![i])));
  const grand = sum(pivTotals);

  return (
    <>
      <PageHead title="Categories">
        What the money is spent on — as a whole, over time, and against each category&apos;s own normal.
      </PageHead>
      <div style={{ marginBottom: 14 }}>
        <Seg label="Kind" value={kind} onChange={(v) => { setKind(v); setFocus(null); }} options={[{ v: "expense", l: "Spending" }, { v: "income", l: "Income" }]} />
      </div>
      <div className="grid">
        <Card span={5} title="Category › subcategory" sub="Click a slice to zoom in, click the centre to zoom out.">
          <EChart option={sunOpt as any} height={420} onEvents={useMemo(() => ({ click: (p: any) => p.treePathInfo?.length === 2 && setFocus(p.name) }), [])} />
        </Card>
        <Card
          span={7}
          title={`${kind === "expense" ? "Spending" : "Income"} by category, ${granularity === "month" ? "per month" : "per year"}`}
          sub="Top 7 categories keep their colour everywhere; the rest fold into Other. Click the legend to hide one."
          right={<Seg label="Scale" value={stackMode} onChange={setStackMode} options={[{ v: "abs", l: "Amount" }, { v: "share", l: "Share" }]} />}
        >
          <EChart option={stackOpt as any} height={400} onEvents={useMemo(() => ({ click: (p: any) => p.seriesName !== OTHER && setFocus(p.seriesName) }), [])} />
        </Card>

        <Card
          span={12}
          title="Category heatmap"
          sub={heatMode === "rel" ? "Each cell compared with that category's own average — red = above normal, blue = below. Spot the unusual months." : "Absolute amounts per cell."}
          right={<Seg label="Heat scale" value={heatMode} onChange={setHeatMode} options={[{ v: "rel", l: "vs own average" }, { v: "abs", l: "Absolute" }]} />}
        >
          <EChart option={heatOpt as any} height={Math.max(260, heat.rows.length * 30 + 90)} onEvents={useMemo(() => ({ click: (p: any) => setFocus(heat.rows[p.data[1]]) }), [heat.rows])} />
        </Card>

        {focusCat && focusOpt && (
          <Card span={12} title={`${focusCat} — by subcategory`} sub="Selected from the charts above." right={<button className="btn" onClick={() => setFocus(null)}>Close</button>}>
            <EChart option={focusOpt as any} height={300} />
          </Card>
        )}

        <Card span={12} title="Small multiples" sub="Each category on its own scale — the dashed line is its average; the arrow compares the second half of the period with the first.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {multiples.map((m) => (
              <div key={m.c} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 10px 2px", cursor: "pointer" }} onClick={() => setFocus(m.c)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <b style={{ fontSize: 13 }}><span className="swatch" style={{ background: col(m.c) }} />{m.c}</b>
                  <span className="note" title="Second half vs first half">
                    <span style={{ color: (m.trend > 0) === (kind === "expense") ? "var(--bad)" : "var(--good)" }}>{m.trend >= 0 ? "▲" : "▼"} {pct(Math.abs(m.trend))}</span>
                  </span>
                </div>
                <div className="note">{money(m.total)} · avg {money(m.mu)}/{granularity === "month" ? "mo" : "yr"}</div>
                <EChart height={70} option={{
                  grid: { left: 0, right: 0, top: 4, bottom: 0 },
                  xAxis: { type: "category", show: false, data: buckets },
                  yAxis: { type: "value", show: false, min: 0 },
                  tooltip: { ...(base(mode).tooltip as object), trigger: "axis", formatter: (ps: any) => `${label(buckets[ps[0].dataIndex])}: <b>${money(ps[0].value)}</b>` },
                  series: [{ type: "bar", data: m.vals.map((v) => Math.max(0, v)), itemStyle: { color: col(m.c), borderRadius: [2, 2, 0, 0] }, barCategoryGap: "20%",
                    markLine: { silent: true, symbol: "none", data: [{ yAxis: m.mu }], lineStyle: { color: k.secondary, type: "dashed", width: 1 }, label: { show: false } } }],
                } as any} />
              </div>
            ))}
          </div>
        </Card>

        <Card span={12} title={`Pivot table — ${kind === "expense" ? "spending" : "income"} per category per ${granularity}`} sub="The same numbers the AI summary uses. Shading marks each row's peak.">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Category</th>{buckets.map((b) => <th key={b}>{label(b)}</th>)}<th>Total</th><th>Avg</th><th>Share</th></tr>
              </thead>
              <tbody>
                {cats.map((c) => {
                  const vals = piv.get(c)!;
                  const mx = Math.max(...vals);
                  const tot = sum(vals);
                  return (
                    <tr key={c} onClick={() => setFocus(c)} style={{ cursor: "pointer" }}>
                      <td><span className="swatch" style={{ background: col(c) }} />{c}</td>
                      {vals.map((v, i) => (
                        <td key={i} style={v === mx && v > 0 ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)" } : undefined}>{v ? compact(v) : "·"}</td>
                      ))}
                      <td><b>{compact(tot)}</b></td><td>{compact(tot / buckets.length)}</td><td>{pct(tot / grand)}</td>
                    </tr>
                  );
                })}
                <tr className="tot"><td>Total</td>{pivTotals.map((v, i) => <td key={i}>{compact(v)}</td>)}<td>{compact(grand)}</td><td>{compact(grand / buckets.length)}</td><td>100%</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
