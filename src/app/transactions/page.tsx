"use client";

import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Card, PageHead, Seg } from "@/components/ui";
import { sum } from "@/lib/aggregate";
import { money, money2 } from "@/lib/format";
import { colorOf } from "@/lib/palette";
import { download, toCsv } from "@/lib/download";

type SortKey = "date" | "value" | "category" | "merchant";

export default function Transactions() {
  const { ds, txs, mode } = useData();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "income" | "expense">("all");
  const [cat, setCat] = useState("");
  const [onlyInferred, setOnlyInferred] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "date", desc: true });
  const [limit, setLimit] = useState(200);

  const cats = useMemo(() => [...new Set(txs.map((t) => t.category))].sort(), [txs]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = txs.filter(
      (t) =>
        (kind === "all" || t.kind === kind) &&
        (!cat || t.category === cat) &&
        (!onlyInferred || t.inferred || t.category === "Uncategorised") &&
        (!needle || `${t.description} ${t.merchant} ${t.subcategory}`.toLowerCase().includes(needle)),
    );
    const dir = sort.desc ? -1 : 1;
    return r.sort((a, b) => {
      const av = sort.k === "value" ? a.value : a[sort.k];
      const bv = sort.k === "value" ? b.value : b[sort.k];
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }, [txs, q, kind, cat, onlyInferred, sort]);

  const th = (k: SortKey, l: string, left = false) => (
    <th style={{ cursor: "pointer", textAlign: left ? "left" : undefined }} onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : true }))}>
      {l}{sort.k === k ? (sort.desc ? " ↓" : " ↑") : ""}
    </th>
  );
  const inc = sum(rows.filter((t) => t.kind === "income").map((t) => t.value));
  const exp = sum(rows.filter((t) => t.kind === "expense").map((t) => t.value));

  return (
    <>
      <PageHead title="Transactions">Every row behind the charts. Amounts are positive for money in (income) and money out (spending); refunds show as negative.</PageHead>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input type="search" placeholder="Search description or merchant…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <Seg label="Kind" value={kind} onChange={setKind} options={[{ v: "all", l: "All" }, { v: "expense", l: "Spending" }, { v: "income", l: "Income" }]} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="chk"><input type="checkbox" checked={onlyInferred} onChange={(e) => setOnlyInferred(e.target.checked)} /> Only auto-categorised / uncategorised</label>
        <button className="btn" onClick={() => download("finvis-transactions.csv", toCsv(rows), "text/csv")}>Download CSV</button>
      </div>
      <div className="grid">
        <Card span={12} title={`${rows.length.toLocaleString("en-US")} transactions`} sub={`In ${money(inc)} · Out ${money(exp)}`}>
          <div className="tbl-wrap" style={{ maxHeight: "70vh" }}>
            <table className="tbl">
              <thead>
                <tr>{th("date", "Date")}{th("value", "Amount")}{th("category", "Category", true)}{th("merchant", "Merchant", true)}<th style={{ textAlign: "left" }}>Description</th><th>Wallet</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((t) => (
                  <tr key={t.id} style={t.included ? undefined : { opacity: 0.55 }}>
                    <td>{t.date}</td>
                    <td style={{ color: t.kind === "income" ? "var(--good)" : undefined }}>{t.kind === "income" ? "+" : "−"}{money2(t.value)}</td>
                    <td className="l">
                      <span className="swatch" style={{ background: colorOf(mode, ds.categoryOrder[t.kind], t.category) }} />
                      {t.category} <span className="note">› {t.emoji} {t.subcategory}</span>
                      {t.inferred && <span className="pill" title="Category assigned automatically by finvis rules"> auto</span>}
                      {!t.included && <span className="pill" title="Excluded from analysis in Finantly"> transfer</span>}
                    </td>
                    <td className="l">{t.merchant}</td>
                    <td className="l" style={{ maxWidth: 420, color: "var(--ink-2)" }}>{t.description}</td>
                    <td>{t.wallet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && <button className="btn" style={{ marginTop: 10 }} onClick={() => setLimit((l) => l + 500)}>Show more ({rows.length - limit} left)</button>}
        </Card>
      </div>
    </>
  );
}
