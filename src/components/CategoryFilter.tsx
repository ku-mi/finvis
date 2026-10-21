"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GROUP_LABEL, type SpendGroup } from "@/config/categories";
import { applyFilters, catKey } from "@/lib/aggregate";
import { compact } from "@/lib/format";
import { colorOf } from "@/lib/palette";
import type { Kind } from "@/lib/types";
import { useData } from "./DataProvider";

const LS_VIEWS = "finvis.views.v1";
interface View { name: string; hidden: string[] }

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Filter-bar control for leaving categories out of every chart, with user-named saved views. */
export function CategoryFilter() {
  const { ds, filters, setFilters, mode } = useData();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<View[]>([]);
  const [name, setName] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(LS_VIEWS) ?? "[]"); if (Array.isArray(v)) setViews(v); } catch {}
  }, []);
  const saveViews = (v: View[]) => {
    setViews(v);
    try { localStorage.setItem(LS_VIEWS, JSON.stringify(v)); } catch {}
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Every category in the data, with its total for the current period/wallet — ignoring what is hidden,
  // so a hidden category still shows how much it would add back.
  const cats = useMemo(() => {
    const txs = applyFilters(ds, { ...filters, hidden: [] });
    const m = new Map<string, { key: string; kind: Kind; category: string; group: SpendGroup | "income"; total: number }>();
    // a category's group = the group holding most of its all-time money (subcategories can differ)
    const byGroup = new Map<string, Map<SpendGroup | "income", number>>();
    for (const t of ds.txs) {
      const key = catKey(t);
      if (!m.has(key)) m.set(key, { key, kind: t.kind, category: t.category, group: t.group, total: 0 });
      const g = byGroup.get(key) ?? byGroup.set(key, new Map()).get(key)!;
      g.set(t.group, (g.get(t.group) ?? 0) + Math.abs(t.value));
    }
    for (const [key, g] of byGroup) m.get(key)!.group = [...g].sort((a, b) => b[1] - a[1])[0][0];
    for (const t of txs) m.get(catKey(t))!.total += t.value;
    return [...m.values()].sort((a, b) => (a.kind === b.kind ? b.total - a.total : a.kind === "expense" ? -1 : 1));
  }, [ds, filters.from, filters.to, filters.wallets, filters.includeTransfers]);

  const hidden = filters.hidden;
  const isHidden = (k: string) => hidden.includes(k);
  const setHidden = (h: string[]) => setFilters({ hidden: [...new Set(h)] });
  const toggle = (k: string) => setHidden(isHidden(k) ? hidden.filter((x) => x !== k) : [...hidden, k]);

  const groups = useMemo(() => {
    const g = new Map<SpendGroup, string[]>();
    for (const c of cats) if (c.kind === "expense" && c.group !== "income") (g.get(c.group) ?? g.set(c.group, []).get(c.group)!).push(c.key);
    return [...g];
  }, [cats]);

  const activeView = views.find((v) => sameSet(v.hidden, hidden));
  const label = hidden.length === 0 ? "All categories" : activeView ? activeView.name : `${hidden.length} hidden`;
  const hiddenSpend = cats.filter((c) => c.kind === "expense" && isHidden(c.key)).reduce((s, c) => s + c.total, 0);

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button className={`btn${hidden.length ? " active" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label} ▾
      </button>
      {hidden.length > 0 && (
        <button className="btn ghost" onClick={() => setHidden([])} title="Show all categories" style={{ marginLeft: 4 }}>✕</button>
      )}
      {open && (
        <div className="pop" role="dialog" aria-label="Choose categories">
          <div className="pop-sec">
            <div className="lbl">Saved views</div>
            <div className="chips">
              <button className={`chip${hidden.length === 0 ? " on" : ""}`} onClick={() => setHidden([])}>All categories</button>
              {views.map((v) => (
                <span key={v.name} className={`chip${activeView === v ? " on" : ""}`}>
                  <button onClick={() => setHidden(v.hidden.filter((k) => cats.some((c) => c.key === k)))}>{v.name}</button>
                  <button className="x" aria-label={`Delete view ${v.name}`} onClick={() => saveViews(views.filter((x) => x !== v))}>✕</button>
                </span>
              ))}
            </div>
            {hidden.length > 0 && !activeView && (
              <form style={{ display: "flex", gap: 6, marginTop: 8 }} onSubmit={(e) => {
                e.preventDefault();
                const n = name.trim();
                if (!n) return;
                saveViews([...views.filter((v) => v.name !== n), { name: n, hidden }]);
                setName("");
              }}>
                <input type="text" placeholder="Name this view, e.g. No taxes" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                <button className="btn" type="submit">Save</button>
              </form>
            )}
          </div>

          <div className="pop-sec">
            <div className="lbl">Hide a whole group</div>
            <div className="chips">
              {groups.map(([g, keys]) => {
                const all = keys.every(isHidden);
                return (
                  <button key={g} className={`chip${all ? " off" : ""}`} title={all ? "Show this group again" : "Hide every category in this group"}
                    onClick={() => setHidden(all ? hidden.filter((k) => !keys.includes(k)) : [...hidden, ...keys])}>
                    {all ? "＋ " : "− "}{GROUP_LABEL[g]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pop-sec" style={{ maxHeight: 340, overflow: "auto" }}>
            {(["expense", "income"] as const).map((kind) => (
              <div key={kind}>
                <div className="lbl" style={{ margin: "6px 0 2px" }}>{kind === "expense" ? "Spending" : "Income"} categories</div>
                {cats.filter((c) => c.kind === kind).map((c) => (
                  <label key={c.key} className="cat-row" style={{ opacity: isHidden(c.key) ? 0.55 : 1 }}>
                    <input type="checkbox" checked={!isHidden(c.key)} onChange={() => toggle(c.key)} />
                    <span className="swatch" style={{ background: colorOf(mode, ds.categoryOrder[kind], c.category) }} />
                    <span style={{ flex: 1 }}>{c.category}</span>
                    <span className="note">{c.group !== "income" ? GROUP_LABEL[c.group] : ""}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "right" }}>{compact(c.total)}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          {hiddenSpend > 0 && <p className="note" style={{ margin: "8px 2px 0" }}>Hidden spending in this period: {compact(hiddenSpend)} zł. Totals, savings rate and every chart exclude it.</p>}
        </div>
      )}
    </div>
  );
}
