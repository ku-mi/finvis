"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { shiftMonth } from "@/lib/aggregate";
import { ymLong } from "@/lib/format";
import { Uploader, useData } from "./DataProvider";

const NAV = [
  { href: "/", label: "Overview", hint: "the big picture" },
  { href: "/flow", label: "Money flow", hint: "where it goes" },
  { href: "/categories", label: "Categories", hint: "what it's spent on" },
  { href: "/rhythm", label: "Rhythm", hint: "when it's spent" },
  { href: "/trends", label: "Trends", hint: "how it changes" },
  { href: "/merchants", label: "Merchants", hint: "who gets paid" },
  { href: "/what-if", label: "What if…", hint: "try a different budget" },
  { href: "/mortgage", label: "Mortgage", hint: "overpayment calculator" },
  { href: "/transactions", label: "Transactions", hint: "every row" },
  { href: "/ai", label: "AI summary", hint: "export for analysis" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { ds, loadRaw } = useData();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">fin<span>vis</span></div>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""}>
              <span>
                {n.label}
                <small>{n.hint}</small>
              </span>
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <ThemeToggle />
          <Uploader onLoad={loadRaw} compact />
          <span>
            {ds.txs.length.toLocaleString("en-US")} transactions · exported {ds.exportedAt.slice(0, 10)}
          </span>
        </div>
      </aside>
      <div className="main" style={path === "/mortgage" ? { paddingTop: 20 } : undefined}>
        {path !== "/mortgage" && <FilterBar />}
        {children}
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [t, setT] = useState<"system" | "light" | "dark">("system");
  useEffect(() => {
    const cur = document.documentElement.dataset.theme;
    if (cur === "light" || cur === "dark") setT(cur);
  }, []);
  const pick = (v: typeof t) => {
    setT(v);
    if (v === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = v;
    try { v === "system" ? localStorage.removeItem("finvis.theme") : localStorage.setItem("finvis.theme", v); } catch {}
  };
  return (
    <div className="seg" role="group" aria-label="Theme">
      {(["system", "light", "dark"] as const).map((v) => (
        <button key={v} className={t === v ? "on" : ""} onClick={() => pick(v)}>
          {v === "system" ? "Auto" : v[0].toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );
}

function FilterBar() {
  const { ds, filters, setFilters, granularity, setGranularity, firstMonth, lastMonth } = useData();
  const years = [...new Set(ds.txs.map((t) => t.year))].sort((a, b) => b - a);
  const allMonths: string[] = [];
  for (let m = lastMonth; m >= firstMonth; m = shiftMonth(m, -1)) allMonths.push(m);
  const wallets = [...new Set(ds.txs.map((t) => t.wallet))];

  const presets: { id: string; label: string; from: string; to: string }[] = [
    { id: "12m", label: "Last 12 months", from: shiftMonth(lastMonth, -11), to: lastMonth },
    { id: "ytd", label: "Year to date", from: `${lastMonth.slice(0, 4)}-01`, to: lastMonth },
    ...years.map((y) => ({ id: String(y), label: String(y), from: `${y}-01`, to: `${y}-12` < lastMonth ? `${y}-12` : lastMonth })),
    { id: "all", label: "All time", from: firstMonth, to: lastMonth },
  ];
  const active = presets.find((p) => p.from === filters.from && p.to === filters.to)?.id ?? "custom";

  return (
    <div className="filterbar">
      <span className="lbl">Period</span>
      <select
        value={active}
        onChange={(e) => {
          const p = presets.find((x) => x.id === e.target.value);
          if (p) setFilters({ from: p.from, to: p.to });
        }}
      >
        {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        {active === "custom" && <option value="custom">Custom</option>}
      </select>
      <select value={filters.from} onChange={(e) => setFilters({ from: e.target.value, to: e.target.value > filters.to ? e.target.value : filters.to })} aria-label="From month">
        {allMonths.map((m) => <option key={m} value={m}>{ymLong(m)}</option>)}
      </select>
      <span className="lbl">to</span>
      <select value={filters.to} onChange={(e) => setFilters({ to: e.target.value, from: e.target.value < filters.from ? e.target.value : filters.from })} aria-label="To month">
        {allMonths.map((m) => <option key={m} value={m}>{ymLong(m)}</option>)}
      </select>
      <span className="sep" />
      <div className="seg" role="group" aria-label="Granularity">
        <button className={granularity === "month" ? "on" : ""} onClick={() => setGranularity("month")}>Monthly</button>
        <button className={granularity === "year" ? "on" : ""} onClick={() => setGranularity("year")}>Yearly</button>
      </div>
      <span className="sep" />
      <select
        value={filters.wallets[0] ?? ""}
        onChange={(e) => setFilters({ wallets: e.target.value ? [e.target.value] : [] })}
        aria-label="Wallet"
      >
        <option value="">All wallets</option>
        {wallets.map((w) => <option key={w} value={w}>{w}</option>)}
      </select>
      <label className="chk" title="Transactions excluded from analysis in Finantly — mostly transfers between your own accounts">
        <input type="checkbox" checked={filters.includeTransfers} onChange={(e) => setFilters({ includeTransfers: e.target.checked })} />
        Include internal transfers
      </label>
    </div>
  );
}
