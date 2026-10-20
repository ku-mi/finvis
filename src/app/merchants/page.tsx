"use client";

import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { EChart } from "@/components/EChart";
import { Card, PageHead } from "@/components/ui";
import { GROUP_LABEL } from "@/config/categories";
import { merchantStats, recurring } from "@/lib/aggregate";
import { base, dot } from "@/lib/chartBase";
import { compact, money } from "@/lib/format";
import { colorOf, GROUP_COLOR, INK } from "@/lib/palette";

const NOT_MERCHANTS = /^(Tax office|Loan installment|Social insurance|Transfer|VAT split payment|Cash withdrawal|\(no description\))$/;

export default function Merchants() {
  const { ds, txs, mode, months } = useData();
  const k = INK[mode];
  const [hideObligations, setHide] = useState(true);
  const stats = useMemo(() => merchantStats(txs), [txs]);
  const shown = stats.filter((m) => !hideObligations || !NOT_MERCHANTS.test(m.name));
  const rec = useMemo(() => recurring(stats), [stats]);

  const groups = ["fixed", "essentials", "lifestyle", "business"] as const;
  const bubbleOpt = useMemo(() => {
    const top = shown.slice(0, 150);
    const maxT = Math.max(...top.map((m) => m.total), 1);
    return {
      ...base(mode),
      legend: { ...(base(mode).legend as object), data: groups.map((g) => GROUP_LABEL[g]) },
      grid: { left: 8, right: 24, top: 52, bottom: 28, containLabel: true },
      tooltip: { ...(base(mode).tooltip as object), trigger: "item",
        formatter: (p: any) => { const m = p.data.m; return `<b>${m.name}</b> · ${m.category}<br/>${m.count} payments · avg ${money(m.avg)}<br/>total <b>${money(m.total)}</b> over ${m.months} month(s)`; } },
      xAxis: { type: "log", name: "number of payments", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: k.muted }, min: 1,
        axisLabel: { color: k.muted }, splitLine: { lineStyle: { color: k.grid } }, axisLine: { lineStyle: { color: k.axis } } },
      yAxis: { type: "log", name: "average ticket", nameLocation: "end", nameTextStyle: { color: k.muted, align: "left" }, axisLabel: { color: k.muted, formatter: (v: number) => compact(v) },
        splitLine: { lineStyle: { color: k.grid } } },
      series: groups.map((g) => ({
        name: GROUP_LABEL[g], type: "scatter",
        data: top.filter((m) => m.group === g).map((m) => ({ value: [m.count, Math.max(1, m.avg)], m, name: m.name })),
        symbolSize: (_: unknown, p: any) => 8 + Math.sqrt(p.data.m.total / maxT) * 46,
        itemStyle: { color: GROUP_COLOR(mode)[g], opacity: 0.75, borderColor: k.surface, borderWidth: 2 },
        label: { show: true, formatter: (p: any) => (p.data.m.total / maxT > 0.12 ? p.data.m.name : ""), position: "right", color: k.secondary, fontSize: 11 },
        labelLayout: { hideOverlap: true },
        emphasis: { focus: "series", label: { show: true, formatter: (p: any) => p.data.m.name } },
      })),
    };
  }, [shown, mode]);

  const treeOpt = useMemo(() => {
    const byCat = new Map<string, typeof shown>();
    for (const m of shown.slice(0, 200)) (byCat.get(m.category) ?? byCat.set(m.category, []).get(m.category)!).push(m);
    return {
      ...base(mode),
      tooltip: { ...(base(mode).tooltip as object), formatter: (p: any) => `${p.treePathInfo.slice(1).map((x: any) => x.name).join(" › ")}<br/><b>${money(p.value)}</b>` },
      series: [{
        type: "treemap", roam: false, nodeClick: "zoomToNode", top: 4, left: 0, right: 0, bottom: 28,
        breadcrumb: { bottom: 0, itemStyle: { color: k.mid, textStyle: { color: k.primary } } },
        itemStyle: { borderColor: k.surface, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
        upperLabel: { show: true, height: 20, color: "#fff", fontSize: 11 },
        label: { fontSize: 11, formatter: (p: any) => `${p.name}\n${compact(p.value)}` },
        levels: [{ itemStyle: { gapWidth: 3 } }, { colorAlpha: [0.55, 1], itemStyle: { gapWidth: 1 } }],
        data: [...byCat].map(([c, ms]) => ({
          name: c, itemStyle: { color: colorOf(mode, ds.categoryOrder.expense, c) },
          children: ms.map((m) => ({ name: m.name, value: Math.round(m.total) })),
        })),
      }],
    };
  }, [shown, mode, ds]);

  const recTotal = rec.reduce((s, r) => s + r.perMonth, 0);

  return (
    <>
      <PageHead title="Merchants">
        Who gets paid, how often, and how much per visit. Merchant names are parsed from bank descriptions, so some are approximate.
      </PageHead>
      <label className="chk" style={{ marginBottom: 12, display: "inline-flex" }}>
        <input type="checkbox" checked={hideObligations} onChange={(e) => setHide(e.target.checked)} />
        Hide taxes, loans, insurance, transfers and cash withdrawals
      </label>
      <div className="grid">
        <Card span={7} title="Frequency vs ticket size" sub="Right = often, up = expensive per visit, bubble = total. Top-right is where money really goes; bottom-right is death by a thousand cuts.">
          <EChart option={bubbleOpt as any} height={460} />
        </Card>
        <Card span={5} title="Top merchants" sub={`${shown.length} merchants in the period.`}>
          <div className="tbl-wrap" style={{ maxHeight: 460 }}>
            <table className="tbl">
              <thead><tr><th>Merchant</th><th>Total</th><th>#</th><th>Avg</th></tr></thead>
              <tbody>
                {shown.slice(0, 60).map((m) => (
                  <tr key={m.name}>
                    <td title={m.category}><span className="swatch" style={{ background: colorOf(mode, ds.categoryOrder.expense, m.category) }} />{m.name}</td>
                    <td>{money(m.total)}</td><td>{m.count}</td><td>{compact(m.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card span={12} title="Merchants inside categories" sub="Treemap — area is money. Click a category to zoom in.">
          <EChart option={treeOpt as any} height={480} />
        </Card>
        <Card span={12} title="Recurring payments" sub={`Merchants paid in most months with steady amounts — subscriptions, bills, habits. ≈ ${money(recTotal)} per month, ${money(recTotal * 12)} per year.`}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Merchant</th><th style={{ textAlign: "left" }}>Category</th><th>Per month</th><th>Per year</th><th>Months seen</th><th>Payments</th><th>Since</th><th>Last</th></tr></thead>
              <tbody>
                {rec.map((r) => (
                  <tr key={r.name}>
                    <td>{dotHtml(colorOf(mode, ds.categoryOrder.expense, r.category))}{r.name}</td>
                    <td className="l">{r.category}</td>
                    <td>{money(r.perMonth)}</td><td>{money(r.perMonth * 12)}</td>
                    <td>{r.months} / {months.length}</td><td>{r.count}</td><td>{r.first}</td><td>{r.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function dotHtml(color: string) {
  return <span className="swatch" style={{ background: color }} />;
}
void dot;
