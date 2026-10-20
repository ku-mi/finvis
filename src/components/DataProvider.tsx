"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyFilters, monthRange, shiftMonth, type Filters } from "@/lib/aggregate";
import { normalize } from "@/lib/normalize";
import type { Mode } from "@/lib/palette";
import type { Dataset, RawExport, Tx } from "@/lib/types";

export type Granularity = "month" | "year";

interface Ctx {
  ds: Dataset;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
  txs: Tx[];
  months: string[];
  buckets: string[];
  bucketOf: (t: Tx) => string;
  firstMonth: string;
  lastMonth: string;
  mode: Mode;
  loadRaw: (raw: RawExport) => void;
}

const DataCtx = createContext<Ctx | null>(null);

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData outside provider");
  return c;
}

const LS_KEY = "finvis.filters.v1";

function useMode(): Mode {
  const [mode, setMode] = useState<Mode>("light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const t = document.documentElement.dataset.theme;
      setMode(t === "dark" || t === "light" ? t : mq.matches ? "dark" : "light");
    };
    read();
    mq.addEventListener("change", read);
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", read); obs.disconnect(); };
  }, []);
  return mode;
}

export function DataProvider({ raw, children }: { raw: RawExport | null; children: React.ReactNode }) {
  const [source, setSource] = useState<RawExport | null>(raw);
  const ds = useMemo(() => (source ? normalize(source) : null), [source]);
  const mode = useMode();

  // Real data starts where monthly activity becomes dense; earlier months are sparse imports.
  const { firstMonth, lastMonth } = useMemo(() => {
    if (!ds || !ds.txs.length) return { firstMonth: "2000-01", lastMonth: "2000-01" };
    return { firstMonth: ds.txs[0].ym, lastMonth: ds.txs[ds.txs.length - 1].ym };
  }, [ds]);

  const [filters, setF] = useState<Filters>(() => ({
    from: shiftMonth(lastMonth, -11),
    to: lastMonth,
    wallets: [],
    includeTransfers: false,
  }));
  const [granularity, setGranularity] = useState<Granularity>("month");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "null");
      if (saved?.filters) setF((f) => ({ ...f, ...saved.filters }));
      if (saved?.granularity) setGranularity(saved.granularity);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ filters, granularity })); } catch {}
  }, [filters, granularity]);

  // a freshly loaded export starts on its own last 12 months
  const loadRaw = useCallback((r: RawExport) => {
    const n = normalize(r);
    const last = n.txs.length ? n.txs[n.txs.length - 1].ym : lastMonth;
    setSource(r);
    setF((f) => ({ ...f, from: shiftMonth(last, -11), to: last, wallets: [] }));
  }, [lastMonth]);

  const setFilters = useCallback((p: Partial<Filters>) => setF((f) => ({ ...f, ...p })), []);

  const value = useMemo<Ctx | null>(() => {
    if (!ds) return null;
    const txs = applyFilters(ds, filters);
    const months = monthRange(filters.from, filters.to);
    const years = [...new Set(months.map((m) => m.slice(0, 4)))];
    return {
      ds, filters, setFilters, granularity, setGranularity, txs, months,
      buckets: granularity === "month" ? months : years,
      bucketOf: granularity === "month" ? (t: Tx) => t.ym : (t: Tx) => String(t.year),
      firstMonth, lastMonth, mode, loadRaw,
    };
  }, [ds, filters, setFilters, granularity, firstMonth, lastMonth, mode, loadRaw]);

  if (!value) return <Uploader onLoad={loadRaw} />;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function Uploader({ onLoad, compact }: { onLoad: (r: RawExport) => void; compact?: boolean }) {
  const [err, setErr] = useState("");
  const read = async (file?: File) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!Array.isArray(json.transactions)) throw new Error("No `transactions` array — is this a Finantly export?");
      setErr("");
      onLoad(json);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const input = (
    <label className="btn">
      {compact ? "Load export…" : "Choose Finantly export (.json)"}
      <input type="file" accept="application/json,.json" hidden onChange={(e) => read(e.target.files?.[0])} />
    </label>
  );
  if (compact) return input;
  return (
    <main className="empty" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); read(e.dataTransfer.files[0]); }}>
      <h1>finvis</h1>
      <p>No data found at <code>data/finance.json</code>. Drop a Finantly JSON export here, or pick one. It stays in your browser.</p>
      {input}
      {err && <p className="err">{err}</p>}
    </main>
  );
}
