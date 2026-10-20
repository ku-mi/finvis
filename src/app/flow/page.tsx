"use client";

import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { EChart } from "@/components/EChart";
import { Card, PageHead, Seg } from "@/components/ui";
import { GROUP_LABEL } from "@/config/categories";
import { totals, totalsBy } from "@/lib/aggregate";
import { base, catAxis, valAxis } from "@/lib/chartBase";
import { compact, money, pct } from "@/lib/format";
import { colorOf, GROUP_COLOR, INK, SERIES } from "@/lib/palette";

type Depth = "cat" | "sub" | "group";

export default function Flow() {
  const { ds, txs, mode, months } = useData();
  const k = INK[mode];
  const [depth, setDepth] = useState<Depth>("sub");

  const sankey = useMemo(() => {
    const nodes = new Map<string, { name: string; itemStyle: { color: string }; depth: number }>();
    const links: { source: string; target: string; value: number }[] = [];
    const node = (name: string, color: string, d: number) => {
      if (!nodes.has(name)) nodes.set(name, { name, itemStyle: { color }, depth: d });
      return name;
    };
    const BUDGET = "Budget";
    const { income, expense } = totals(txs);
    const inc = totalsBy(txs, "income", (t) => t.category).filter(([, v]) => v > 0);
    const offset = depth === "group" ? 1 : 0;
    node(BUDGET, k.secondary, 1);
    for (const [c, v] of inc) links.push({ source: node(`${c} `, colorOf(mode, ds.categoryOrder.income, c), 0), target: BUDGET, value: v });
    if (expense > income) links.push({ source: node("From savings", k.other, 0), target: BUDGET, value: expense - income });
    else if (income > expense) links.push({ source: BUDGET, target: node("Saved", SERIES[mode][5], 2), value: income - expense });

    const exp = txs.filter((t) => t.kind === "expense");
    const catTotals = totalsBy(exp, "expense", (t) => t.category).filter(([, v]) => v > 0);
    for (const [c, v] of catTotals) {
      const color = colorOf(mode, ds.categoryOrder.expense, c);
      const cn = node(c, color, 2 + offset);
      if (depth === "group") {
        const g = exp.find((t) => t.category === c)!.group;
        // a category can span groups via subcategory overrides — split by group
        for (const [gg, gv] of totalsBy(exp.filter((t) => t.category === c), "expense", (t) => t.group)) {
          if (gv <= 0) continue;
          const gn = node(GROUP_LABEL[gg as keyof typeof GROUP_LABEL] ?? gg, (GROUP_COLOR(mode) as any)[gg], 2);
          links.push({ source: gn, target: cn, value: gv });
        }
        void g;
      } else {
        links.push({ source: BUDGET, target: cn, value: v });
      }
      if (depth !== "cat") {
        const subs = totalsBy(exp.filter((t) => t.category === c), "expense", (t) => t.subcategory).filter(([, sv]) => sv > 0);
        const top = subs.slice(0, 4);
        const rest = subs.slice(4).reduce((s, [, sv]) => s + sv, 0);
        for (const [s, sv] of top) links.push({ source: cn, target: node(`${c} › ${s}`, color, 3 + offset), value: sv });
        if (rest > 0) links.push({ source: cn, target: node(`${c} › other`, color, 3 + offset), value: rest });
      }
    }
    if (depth === "group") {
      for (const [g, v] of totalsBy(exp, "expense", (t) => t.group)) {
        if (v <= 0) continue;
        links.push({ source: BUDGET, target: GROUP_LABEL[g as keyof typeof GROUP_LABEL] ?? g, value: v });
      }
    }
    return { nodes: [...nodes.values()], links: links.map((l) => ({ ...l, value: Math.round(l.value) })), income, expense };
  }, [txs, depth, mode, ds]);

  const total = Math.max(sankey.income, sankey.expense);
  const sankeyOpt = useMemo(() => ({
    ...base(mode),
    tooltip: {
      ...(base(mode).tooltip as object),
      trigger: "item",
      formatter: (p: any) =>
        p.dataType === "edge"
          ? `${p.data.source.trim()} → ${p.data.target.replace(/^.* › /, "")}<br/><b>${money(p.value)}</b> · ${pct(p.value / total, 1)} of flow`
          : `${p.name.trim()}<br/><b>${money(p.value)}</b> · ${pct(p.value / total, 1)}`,
    },
    series: [{
      type: "sankey",
      top: 8, bottom: 8, left: 4, right: depth === "cat" ? 140 : 180,
      nodeGap: 7, nodeWidth: 10, draggable: true, layoutIterations: 64,
      emphasis: { focus: "adjacency" },
      data: sankey.nodes,
      links: sankey.links,
      lineStyle: { color: "gradient", opacity: 0.28, curveness: 0.5 },
      itemStyle: { borderWidth: 0, borderRadius: 2 },
      label: {
        color: k.primary, fontSize: 11,
        formatter: (p: any) => `${p.name.replace(/^.* › /, "").trim()}  {v|${compact(p.value)}}`,
        rich: { v: { color: k.muted, fontSize: 11 } },
      },
    }],
  }), [sankey, mode, depth, total]);

  // Waterfall of an average month: income, minus each category, = what's left
  const wf = useMemo(() => {
    const n = months.length || 1;
    const cats = totalsBy(txs, "expense", (t) => t.category).filter(([, v]) => v > 0).map(([c, v]) => [c, v / n] as const);
    const inc = sankey.income / n;
    const labels = ["Income", ...cats.map(([c]) => c), "Left over"];
    const invisible: number[] = [0];
    const visible: { value: number; itemStyle: { color: string } }[] = [{ value: inc, itemStyle: { color: SERIES[mode][0] } }];
    let level = inc;
    for (const [c, v] of cats) {
      level -= v;
      invisible.push(Math.max(0, Math.min(level, level + v)));
      visible.push({ value: Math.abs(v), itemStyle: { color: colorOf(mode, ds.categoryOrder.expense, c) } });
    }
    invisible.push(Math.min(0, level));
    visible.push({ value: Math.abs(level), itemStyle: { color: level >= 0 ? SERIES[mode][5] : SERIES[mode][7] } });
    return { labels, invisible, visible, left: level };
  }, [txs, months, sankey.income, mode, ds]);

  const wfOpt = useMemo(() => ({
    ...base(mode),
    grid: { ...(base(mode).grid as object), top: 16, bottom: 4 },
    tooltip: {
      ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: any[]) => { const p = ps.find((x) => x.seriesName === "v"); return `${p.name}<br/><b>${money(p.value)}</b> / month`; },
    },
    xAxis: catAxis(mode, wf.labels, { axisLabel: { color: k.muted, fontSize: 11, interval: 0, rotate: 35 } }),
    yAxis: valAxis(mode),
    series: [
      { type: "bar", stack: "w", data: wf.invisible, itemStyle: { color: "transparent" }, emphasis: { disabled: true }, silent: true },
      { name: "v", type: "bar", stack: "w", data: wf.visible, barMaxWidth: 38, itemStyle: { borderRadius: 4 },
        label: { show: true, position: "top", color: k.secondary, fontSize: 11, formatter: (p: any) => compact(p.value) } },
    ],
  }), [wf, mode]);

  return (
    <>
      <PageHead title="Money flow">
        Follow every złoty from where it came from to where it went. Hover a band to isolate it; drag nodes to untangle.
      </PageHead>
      <div className="grid">
        <Card
          span={12}
          title="Income → budget → spending"
          sub={`${money(sankey.income)} in · ${money(sankey.expense)} out`}
          right={<Seg label="Depth" value={depth} onChange={setDepth} options={[{ v: "cat", l: "Categories" }, { v: "sub", l: "+ Subcategories" }, { v: "group", l: "Via groups" }]} />}
        >
          <EChart option={sankeyOpt as any} height={depth === "cat" ? 460 : 720} />
        </Card>
        <Card span={12} title="An average month, as a waterfall" sub={`Average monthly income, minus each category. ${wf.left >= 0 ? `≈ ${money(wf.left)} left over each month.` : `Short by ≈ ${money(-wf.left)} each month.`}`}>
          <EChart option={wfOpt as any} height={340} />
        </Card>
      </div>
    </>
  );
}
