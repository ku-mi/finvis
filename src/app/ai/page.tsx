"use client";

import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Card, PageHead, Seg } from "@/components/ui";
import { applyFilters, shiftMonth } from "@/lib/aggregate";
import { download } from "@/lib/download";
import { ymLong } from "@/lib/format";
import { buildSummary, DEFAULT_PREFACE, toLongCsv, toMarkdown, type SummaryOptions } from "@/lib/summary";

type Format = "md" | "json" | "csv";

export default function AiExport() {
  const { ds, txs, months, filters, granularity } = useData();
  const [fmt, setFmt] = useState<Format>("md");
  const [g, setG] = useState<"month" | "year">(granularity);
  const [subcategories, setSub] = useState(true);
  const [merchants, setMerchants] = useState(true);
  const [anomalies, setAnomalies] = useState(true);
  const [usePreface, setUsePreface] = useState(true);
  const [preface, setPreface] = useState(DEFAULT_PREFACE);
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    const opts: SummaryOptions = { granularity: g, subcategories, merchants, topMerchants: 25, anomalies, preface: usePreface ? preface : "" };
    if (fmt === "csv") return toLongCsv(txs, g);
    const prevTxs = applyFilters(ds, { ...filters, from: shiftMonth(filters.from, -months.length), to: shiftMonth(filters.from, -1) });
    const s = buildSummary({ ds, txs, prevTxs, months, from: filters.from, to: filters.to, includeTransfers: filters.includeTransfers, wallets: filters.wallets }, opts);
    if (fmt === "json") return JSON.stringify(usePreface ? { instructions: preface, ...s } : s, null, 1);
    return toMarkdown(s, opts);
  }, [fmt, g, subcategories, merchants, anomalies, usePreface, preface, ds, txs, months, filters]);

  const tokens = Math.round(text.length / 3.6);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const ext = fmt === "md" ? "md" : fmt;

  return (
    <>
      <PageHead title="AI summary">
        A compact, numbers-only digest of {ymLong(filters.from)} – {ymLong(filters.to)} per category per {g}, ready to paste into Claude or
        another assistant. No raw bank descriptions, card numbers or personal details are included — only aggregates
        {merchants ? " and merchant names" : ""}.
      </PageHead>
      <div className="grid">
        <Card span={4} title="Options" sub="The period and wallet come from the filter bar above.">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><div className="lbl">Format</div>
              <Seg label="Format" value={fmt} onChange={setFmt} options={[{ v: "md", l: "Markdown" }, { v: "json", l: "JSON" }, { v: "csv", l: "Tidy CSV" }]} />
            </div>
            <div><div className="lbl">Break down per</div>
              <Seg label="Granularity" value={g} onChange={setG} options={[{ v: "month", l: "Month" }, { v: "year", l: "Year" }]} />
            </div>
            {fmt !== "csv" && (
              <>
                <label className="chk"><input type="checkbox" checked={subcategories} onChange={(e) => setSub(e.target.checked)} /> Subcategory rows</label>
                <label className="chk"><input type="checkbox" checked={merchants} onChange={(e) => setMerchants(e.target.checked)} /> Top merchants &amp; recurring payments</label>
                <label className="chk"><input type="checkbox" checked={anomalies} onChange={(e) => setAnomalies(e.target.checked)} /> Unusual months</label>
                <label className="chk"><input type="checkbox" checked={usePreface} onChange={(e) => setUsePreface(e.target.checked)} /> Start with instructions for the AI</label>
                {usePreface && (
                  <textarea value={preface} onChange={(e) => setPreface(e.target.value)} rows={10}
                    style={{ font: "12px/1.45 system-ui", width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
                )}
              </>
            )}
            {fmt === "csv" && <p className="note">One row per period × category × subcategory, with group, amount and transaction count. Best for an assistant that can run code.</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn primary" onClick={copy}>{copied ? "Copied ✓" : "Copy to clipboard"}</button>
              <button className="btn" onClick={() => download(`finance-summary-${filters.from}_${filters.to}.${ext}`, text, fmt === "json" ? "application/json" : fmt === "csv" ? "text/csv" : "text/markdown")}>Download .{ext}</button>
            </div>
            <p className="note">≈ {tokens.toLocaleString("en-US")} tokens · {text.length.toLocaleString("en-US")} characters. Yearly granularity or fewer options make it shorter.</p>
          </div>
        </Card>
        <Card span={8} title="Preview">
          <pre className="out">{text}</pre>
        </Card>
      </div>
    </>
  );
}
