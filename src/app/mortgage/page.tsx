"use client";

import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { EChart } from "@/components/EChart";
import { Card, PageHead, Seg } from "@/components/ui";
import { base, catAxis, dot, valAxis } from "@/lib/chartBase";
import { compact, money, money2, ymLong } from "@/lib/format";
import { addMonths, annuity, nper, simulate, type MortgageInput, type Result } from "@/lib/mortgage";
import { INK, SERIES } from "@/lib/palette";

const LS = "finvis.mortgage.v1";
const thisMonth = () => new Date().toISOString().slice(0, 7);

const DEFAULT: MortgageInput = {
  principal: 500000,
  annualRate: 6.5,
  termMonths: 300,
  start: addMonths(thisMonth(), 1),
  type: "annuity",
  monthlyOverpayment: 1000,
  overpaymentFrom: addMonths(thisMonth(), 1),
  overpaymentTo: "",
  lumps: [],
  rateChanges: [],
  strategy: "shorten",
  overpaymentFee: 0,
};

export default function MortgagePage() {
  return (
    <Suspense>
      <Mortgage />
    </Suspense>
  );
}

function Mortgage() {
  const { ds, mode } = useData();
  const k = INK[mode];
  const C = { principal: SERIES[mode][0], interest: SERIES[mode][1], over: SERIES[mode][2], fee: k.other };
  const params = useSearchParams();
  const [inp, setInp] = useState<MortgageInput>(DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const set = (p: Partial<MortgageInput>) => setInp((x) => ({ ...x, ...p }));

  useEffect(() => {
    let v: MortgageInput = DEFAULT;
    try { const s = JSON.parse(localStorage.getItem(LS) ?? "null"); if (s) v = { ...DEFAULT, ...s }; } catch {}
    const op = Number(params.get("overpay"));
    if (op > 0) v = { ...v, monthlyOverpayment: op };
    setInp(v);
    setLoaded(true);
  }, [params]);
  useEffect(() => { if (loaded) try { localStorage.setItem(LS, JSON.stringify(inp)); } catch {} }, [inp, loaded]);

  const valid = inp.principal > 0 && inp.termMonths > 0 && inp.annualRate >= 0;
  const baseRes = useMemo(() => (valid ? simulate(inp, false) : null), [inp, valid]);
  const plan = useMemo(() => (valid ? simulate(inp, true) : null), [inp, valid]);

  // sensitivity: same plan with different monthly overpayments
  const sens = useMemo(() => {
    if (!valid || !baseRes) return [];
    const top = Math.max(2000, Math.ceil((inp.monthlyOverpayment * 2) / 1000) * 1000, Math.ceil(baseRes.firstPayment / 1000) * 1000);
    const step = top / 10;
    return Array.from({ length: 11 }, (_, i) => {
      const amt = i * step;
      const r = simulate({ ...inp, monthlyOverpayment: amt }, true);
      return { amt, interest: r.totalInterest, end: r.end, months: r.months };
    });
  }, [inp, valid, baseRes]);

  if (!baseRes || !plan) {
    return (<><PageHead title="Mortgage calculator" /><Inputs inp={inp} set={set} /></>);
  }

  const saved = baseRes.totalInterest - plan.totalInterest - plan.totalFees;
  const monthsSaved = baseRes.months - plan.months;
  const roi = plan.totalOverpaid ? saved / plan.totalOverpaid : 0;

  // ---- balance over time ----
  const axis = baseRes.rows.map((r) => r.month);
  const balOpt = {
    ...base(mode),
    legend: { ...(base(mode).legend as object), data: ["Without overpayments", "With your plan"] },
    tooltip: { ...(base(mode).tooltip as object), trigger: "axis",
      formatter: (ps: any[]) => `<b>${ymLong(ps[0].axisValue)}</b><br/>` + ps.map((p) => `${dot(p.color)}${p.seriesName} <b>${p.value == null ? "paid off" : money(p.value)}</b>`).join("<br/>") },
    xAxis: catAxis(mode, axis, { boundaryGap: false, axisLabel: { color: k.muted, fontSize: 11, interval: (i: number) => axis[i].endsWith("-01") && Number(axis[i].slice(0, 4)) % (axis.length > 240 ? 5 : 2) === 0, formatter: (v: string) => v.slice(0, 4) } }),
    yAxis: valAxis(mode),
    series: [
      { name: "Without overpayments", type: "line", data: baseRes.rows.map((r) => r.balance), symbol: "none", lineStyle: { width: 2, color: k.muted, type: "dashed" }, itemStyle: { color: k.muted } },
      { name: "With your plan", type: "line", data: axis.map((_, i) => plan.rows[i]?.balance ?? null), symbol: "none", lineStyle: { width: 2, color: C.principal }, itemStyle: { color: C.principal },
        areaStyle: { color: C.principal, opacity: 0.12 },
        markLine: { silent: true, symbol: "none", lineStyle: { color: C.over, type: "solid", width: 1 },
          label: { color: k.primary, fontSize: 11, formatter: `paid off ${ymLong(plan.end)}`, position: "end" },
          data: [{ xAxis: plan.end }] } },
    ],
  };

  // ---- yearly composition ----
  const years = [...new Set(plan.rows.map((r) => r.month.slice(0, 4)))];
  const byYear = (res: Result, f: (r: Result["rows"][number]) => number) => years.map((y) => res.rows.filter((r) => r.month.startsWith(y)).reduce((s, r) => s + f(r), 0));
  const yi = byYear(plan, (r) => r.interest), yp = byYear(plan, (r) => r.principal), yo = byYear(plan, (r) => r.overpayment), yf = byYear(plan, (r) => r.fee);
  const yearOpt = {
    ...base(mode),
    legend: { ...(base(mode).legend as object), data: ["Interest", "Principal", "Overpayment", ...(plan.totalFees ? ["Fees"] : [])] },
    tooltip: { ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: any[]) => `<b>${ps[0].axisValue}</b> · ${money(ps.reduce((s, p) => s + p.value, 0))}<br/>` + ps.filter((p) => p.value).reverse().map((p) => `${dot(p.color)}${p.seriesName} <b>${money(p.value)}</b>`).join("<br/>") },
    xAxis: catAxis(mode, years),
    yAxis: valAxis(mode),
    series: [
      { name: "Interest", type: "bar", stack: "y", data: yi, itemStyle: { color: C.interest, borderColor: k.surface, borderWidth: 1 } },
      { name: "Principal", type: "bar", stack: "y", data: yp, itemStyle: { color: C.principal, borderColor: k.surface, borderWidth: 1 } },
      { name: "Overpayment", type: "bar", stack: "y", data: yo, itemStyle: { color: C.over, borderColor: k.surface, borderWidth: 1 } },
      ...(plan.totalFees ? [{ name: "Fees", type: "bar", stack: "y", data: yf, itemStyle: { color: C.fee } }] : []),
    ].map((s, i, arr) => (i === arr.length - 1 ? { ...s, itemStyle: { ...s.itemStyle, borderRadius: [4, 4, 0, 0] } } : s)),
  };

  // ---- cumulative interest ----
  const cum = (res: Result) => { let s = 0; return res.rows.map((r) => (s += r.interest)); };
  const ci = cum(baseRes), cp = cum(plan);
  const cumOpt = {
    ...base(mode),
    legend: { ...(base(mode).legend as object), data: ["Without overpayments", "With your plan"] },
    tooltip: { ...(base(mode).tooltip as object), trigger: "axis",
      formatter: (ps: any[]) => { const i = ps[0].dataIndex; const b = ci[i], p = cp[Math.min(i, cp.length - 1)];
        return `<b>${ymLong(axis[i])}</b><br/>${dot(k.muted)}Without <b>${money(b)}</b><br/>${dot(C.interest)}Plan <b>${money(p)}</b><br/>Saved so far <b>${money(b - p)}</b>`; } },
    xAxis: catAxis(mode, axis, { boundaryGap: false, axisLabel: (balOpt.xAxis as any).axisLabel }),
    yAxis: valAxis(mode),
    series: [
      { name: "Without overpayments", type: "line", data: ci, symbol: "none", lineStyle: { width: 2, color: k.muted, type: "dashed" }, itemStyle: { color: k.muted } },
      { name: "With your plan", type: "line", data: axis.map((_, i) => cp[Math.min(i, cp.length - 1)]), symbol: "none", lineStyle: { width: 2, color: C.interest }, itemStyle: { color: C.interest },
        areaStyle: { color: C.interest, opacity: 0.12 } },
    ],
  };

  // ---- total cost comparison ----
  const costOpt = {
    ...base(mode),
    legend: { ...(base(mode).legend as object), data: ["Principal", "Interest", ...(plan.totalFees ? ["Fees"] : [])] },
    grid: { left: 8, right: 70, top: 36, bottom: 8, containLabel: true },
    tooltip: { ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => money(v) },
    xAxis: valAxis(mode),
    yAxis: catAxis(mode, ["Your plan", "Without overpayments"], { axisLabel: { color: k.secondary } }),
    series: [
      { name: "Principal", type: "bar", stack: "c", barWidth: 26, data: [inp.principal, inp.principal], itemStyle: { color: C.principal, borderColor: k.surface, borderWidth: 2 } },
      { name: "Interest", type: "bar", stack: "c", data: [plan.totalInterest, baseRes.totalInterest], itemStyle: { color: C.interest, borderColor: k.surface, borderWidth: 2, borderRadius: plan.totalFees ? 0 : [0, 4, 4, 0] },
        label: { show: !plan.totalFees, position: "right", color: k.secondary, fontSize: 11, formatter: (p: any) => compact(inp.principal + p.value) } },
      ...(plan.totalFees ? [{ name: "Fees", type: "bar", stack: "c", data: [plan.totalFees, 0], itemStyle: { color: C.fee, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", color: k.secondary, fontSize: 11, formatter: (p: any) => compact(inp.principal + (p.dataIndex ? baseRes.totalInterest : plan.totalInterest + plan.totalFees)) } }] : []),
    ],
  };

  // ---- monthly outlay over time ----
  const payOpt = {
    ...base(mode),
    legend: { ...(base(mode).legend as object), data: ["Instalment", "Overpayment"] },
    tooltip: { ...(base(mode).tooltip as object), trigger: "axis",
      formatter: (ps: any[]) => `<b>${ymLong(ps[0].axisValue)}</b><br/>` + ps.map((p) => `${dot(p.color)}${p.seriesName} <b>${money(p.value)}</b>`).join("<br/>") },
    xAxis: catAxis(mode, plan.rows.map((r) => r.month), { boundaryGap: false, axisLabel: { color: k.muted, fontSize: 11, formatter: (v: string) => v.slice(0, 4) } }),
    yAxis: valAxis(mode),
    series: [
      { name: "Instalment", type: "line", stack: "p", step: "end", data: plan.rows.map((r) => r.payment), symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: C.principal, opacity: 0.55 }, itemStyle: { color: C.principal } },
      { name: "Overpayment", type: "line", stack: "p", step: "end", data: plan.rows.map((r) => r.overpayment), symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: C.over, opacity: 0.55 }, itemStyle: { color: C.over } },
    ],
  };

  // ---- sensitivity ----
  const sensOpt = {
    ...base(mode),
    grid: { ...(base(mode).grid as object), top: 24, bottom: 30 },
    tooltip: { ...(base(mode).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: any[]) => { const s = sens[ps[0].dataIndex]; return `<b>+${money(s.amt)}/month</b><br/>interest ${money(s.interest)}<br/>saves ${money(baseRes.totalInterest - s.interest)}<br/>paid off ${ymLong(s.end)} (${(s.months / 12).toFixed(1)} yrs)`; } },
    xAxis: catAxis(mode, sens.map((s) => `+${compact(s.amt)}`), { name: "monthly overpayment", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: k.muted } }),
    yAxis: valAxis(mode, { name: "total interest", nameTextStyle: { color: k.muted, align: "left" } }),
    series: [{
      type: "bar", barMaxWidth: 34,
      data: sens.map((s) => ({ value: s.interest, itemStyle: { color: C.interest, opacity: Math.abs(s.amt - inp.monthlyOverpayment) < 1 ? 1 : 0.45, borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: "top", color: k.secondary, fontSize: 10, formatter: (p: any) => sens[p.dataIndex].end.slice(0, 4) },
    }],
  };

  return (
    <>
      <PageHead title="Mortgage calculator">
        Model a mortgage with overpayments, one-off payments and rate changes. It works on its own; if your export has a mortgage, you can start from it.
      </PageHead>
      <div className="grid">
        <div className="c4" style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {ds.mortgages.length > 0 && <Prefill set={set} inp={inp} />}
          <Inputs inp={inp} set={set} />
        </div>
        <div className="c8" style={{ display: "grid", gap: 16, alignContent: "start", gridTemplateColumns: "repeat(12, 1fr)" }}>
          <section className="card c4 kpi" style={{ gridColumn: "span 4" }}><div className="l">First instalment</div><div className="v">{money2(baseRes.firstPayment)}</div>
            <div className="delta">{inp.type === "annuity" ? "equal instalments" : "decreasing instalments"} · {inp.annualRate}%</div></section>
          <section className="card kpi" style={{ gridColumn: "span 4" }}><div className="l">Interest saved</div><div className="v" style={{ color: saved > 0 ? "var(--good)" : undefined }}>{money(saved)}</div>
            <div className="delta">{money(plan.totalInterest)} instead of {money(baseRes.totalInterest)}</div></section>
          <section className="card kpi" style={{ gridColumn: "span 4" }}><div className="l">Paid off</div><div className="v">{ymLong(plan.end)}</div>
            <div className="delta">{monthsSaved > 0 ? `${Math.floor(monthsSaved / 12)} yrs ${monthsSaved % 12} mo earlier` : "on schedule"} (was {ymLong(baseRes.end)})</div></section>
          <section className="card kpi" style={{ gridColumn: "span 4" }}><div className="l">Total overpaid</div><div className="v">{money(plan.totalOverpaid)}</div>
            <div className="delta">each 1 zł overpaid saves {roi.toFixed(2)} zł of interest</div></section>
          <section className="card kpi" style={{ gridColumn: "span 4" }}><div className="l">Total cost</div><div className="v">{money(plan.totalPaid)}</div>
            <div className="delta">was {money(baseRes.totalPaid)}</div></section>
          <section className="card kpi" style={{ gridColumn: "span 4" }}><div className="l">Interest share of payments</div><div className="v">{((plan.totalInterest / plan.totalPaid) * 100).toFixed(0)}%</div>
            <div className="delta">was {((baseRes.totalInterest / baseRes.totalPaid) * 100).toFixed(0)}%</div></section>

          <div style={{ gridColumn: "span 12" }}>
            <Card span={12} title="Balance over time" sub="Dashed: paying only the instalments. Filled: with your overpayment plan.">
              <EChart option={balOpt as any} height={300} />
            </Card>
          </div>
        </div>

        <Card span={6} title="Where each year's money goes" sub="Interest, principal and overpayment, per calendar year.">
          <EChart option={yearOpt as any} height={300} />
        </Card>
        <Card span={6} title="Interest paid so far" sub="The gap between the lines is interest you don't pay.">
          <EChart option={cumOpt as any} height={300} />
        </Card>
        <Card span={6} title="Your monthly outlay" sub={inp.strategy === "lower" ? "With 'lower instalment', each overpayment shrinks the next instalments." : "Instalment plus overpayment, month by month."}>
          <EChart option={payOpt as any} height={280} />
        </Card>
        <Card span={6} title="Total cost of the loan" sub="Principal is the same either way; the difference is interest.">
          <EChart option={costOpt as any} height={280} />
        </Card>
        <Card span={12} title="How much does each extra złoty help?" sub="Total interest for different monthly overpayments (same plan otherwise). The label shows the payoff year; your current choice is highlighted.">
          <EChart option={sensOpt as any} height={280} />
        </Card>
        <Card span={12} title="Repayment schedule" sub="Per year; click a year to see its months.">
          <Schedule res={plan} />
        </Card>
      </div>
    </>
  );
}

function Prefill({ inp, set }: { inp: MortgageInput; set: (p: Partial<MortgageInput>) => void }) {
  const { ds } = useData();
  const [idx, setIdx] = useState(0);
  const m = ds.mortgages[idx];
  const start = addMonths(m.asOf.slice(0, 7), 1);
  const r = inp.annualRate / 1200;
  const solved = m.installment ? nper(m.balance, r, m.installment) : Infinity;
  const apply = () =>
    set({
      principal: Math.round(m.balance * 100) / 100,
      start,
      overpaymentFrom: start,
      ...(isFinite(solved) ? { termMonths: solved } : {}),
      ...(m.overpaymentPerMonth ? { monthlyOverpayment: m.overpaymentPerMonth } : {}),
    });
  return (
    <Card span={12} title="Start from your data" sub="Mortgages found in the Finantly export.">
      {ds.mortgages.length > 1 && (
        <select value={idx} onChange={(e) => setIdx(+e.target.value)} style={{ marginBottom: 8, width: "100%" }}>
          {ds.mortgages.map((x, i) => <option key={i} value={i}>{x.name} — {money(x.balance)}</option>)}
        </select>
      )}
      <table className="tbl" style={{ marginBottom: 10 }}>
        <tbody>
          <tr><td>Loan</td><td>{m.name}</td></tr>
          <tr><td>Outstanding</td><td>{money2(m.balance)} zł</td></tr>
          {m.installment && <tr><td>Latest instalment</td><td>{money2(m.installment)} zł <span className="note">{m.installmentDate}</span></td></tr>}
          {m.overpaymentPerMonth && <tr><td>Recent overpayments</td><td>≈ {money(m.overpaymentPerMonth)}/mo</td></tr>}
          {m.installment && <tr><td>Remaining term at {inp.annualRate}%</td><td>{isFinite(solved) ? `${Math.floor(solved / 12)} yrs ${solved % 12} mo` : "rate too high for this instalment"}</td></tr>}
        </tbody>
      </table>
      <button className="btn primary" onClick={apply}>Use this mortgage</button>
      <p className="note" style={{ marginTop: 8 }}>
        The export has no interest rate, so set the rate first. The remaining term is then worked out from your latest instalment.
      </p>
    </Card>
  );
}

function Num({ label, value, onChange, step = 1, suffix, min = 0 }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; min?: number }) {
  return (
    <label style={{ display: "grid", gap: 3 }}>
      <span className="lbl">{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" value={Number.isFinite(value) ? value : ""} step={step} min={min} onChange={(e) => onChange(e.target.value === "" ? 0 : +e.target.value)}
          style={{ font: "inherit", width: "100%", padding: "5px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }} />
        {suffix && <span className="note">{suffix}</span>}
      </span>
    </label>
  );
}

function Month({ label, value, onChange, allowEmpty }: { label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  return (
    <label style={{ display: "grid", gap: 3 }}>
      <span className="lbl">{label}</span>
      <input type="month" value={value} onChange={(e) => (e.target.value || allowEmpty) && onChange(e.target.value)} />
    </label>
  );
}

function Inputs({ inp, set }: { inp: MortgageInput; set: (p: Partial<MortgageInput>) => void }) {
  const years = Math.floor(inp.termMonths / 12), months = inp.termMonths % 12;
  const g2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as const;
  const r = inp.annualRate / 1200;
  return (
    <>
      <Card span={12} title="Loan">
        <div style={{ display: "grid", gap: 10 }}>
          <Num label="Amount still owed" value={inp.principal} step={1000} suffix="zł" onChange={(v) => set({ principal: v })} />
          <div style={g2}>
            <Num label="Interest rate" value={inp.annualRate} step={0.05} suffix="%" onChange={(v) => set({ annualRate: v })} />
            <Month label="First instalment" value={inp.start} onChange={(v) => set({ start: v })} />
          </div>
          <div style={g2}>
            <Num label="Term — years" value={years} onChange={(v) => set({ termMonths: Math.max(1, v * 12 + months) })} />
            <Num label="+ months" value={months} onChange={(v) => set({ termMonths: Math.max(1, years * 12 + Math.min(11, v)) })} />
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 3 }}>Instalments</div>
            <Seg label="Instalment type" value={inp.type} onChange={(v) => set({ type: v })} options={[{ v: "annuity", l: "Equal" }, { v: "decreasing", l: "Decreasing" }]} />
            <div className="note" style={{ marginTop: 4 }}>
              {inp.type === "annuity" ? `Equal (raty równe): ${money2(annuity(inp.principal, r, inp.termMonths))} zł every month` : `Decreasing (raty malejące): starts at ${money2(inp.principal / inp.termMonths + inp.principal * r)} zł`}
            </div>
          </div>
        </div>
      </Card>

      <Card span={12} title="Overpayments">
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 3 }}>
            <span className="lbl">Every month: <b style={{ color: "var(--ink)" }}>{money(inp.monthlyOverpayment)}</b></span>
            <input type="range" min={0} max={10000} step={100} value={Math.min(inp.monthlyOverpayment, 10000)} onChange={(e) => set({ monthlyOverpayment: +e.target.value })} style={{ accentColor: "var(--accent)" }} />
          </label>
          <div style={g2}>
            <Month label="From" value={inp.overpaymentFrom} onChange={(v) => set({ overpaymentFrom: v })} />
            <Month label="Until (empty = to the end)" value={inp.overpaymentTo} onChange={(v) => set({ overpaymentTo: v })} allowEmpty />
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 3 }}>After an overpayment</div>
            <Seg label="Strategy" value={inp.strategy} onChange={(v) => set({ strategy: v })}
              options={[{ v: "shorten", l: "Shorter term" }, { v: "lower", l: "Lower instalment" }, { v: "snowball", l: "Keep outlay" }]} />
            <div className="note" style={{ marginTop: 4 }}>
              {inp.strategy === "shorten" && "The instalment stays the same and the loan ends sooner. This usually saves the most interest."}
              {inp.strategy === "lower" && "The term stays the same and the next instalments get smaller."}
              {inp.strategy === "snowball" && "Your total monthly outlay stays fixed: whenever the instalment drops (decreasing instalments, a rate cut), the difference is overpaid too."}
            </div>
          </div>
          <Num label="Overpayment fee" value={inp.overpaymentFee} step={0.5} suffix="%" onChange={(v) => set({ overpaymentFee: v })} />
          <ListEditor title="One-off payments" items={inp.lumps.map((l) => ({ month: l.month, v: l.amount }))} unit="zł" defaultV={20000} start={inp.start}
            onChange={(items) => set({ lumps: items.map((x) => ({ month: x.month, amount: x.v })) })} />
          <ListEditor title="Rate changes" items={inp.rateChanges.map((l) => ({ month: l.month, v: l.rate }))} unit="%" defaultV={inp.annualRate} start={inp.start} step={0.05}
            onChange={(items) => set({ rateChanges: items.map((x) => ({ month: x.month, rate: x.v })) })} />
        </div>
      </Card>
    </>
  );
}

function ListEditor({ title, items, unit, defaultV, start, step = 1000, onChange }: {
  title: string; items: { month: string; v: number }[]; unit: string; defaultV: number; start: string; step?: number; onChange: (i: { month: string; v: number }[]) => void;
}) {
  const upd = (i: number, p: Partial<{ month: string; v: number }>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div>
      <div className="lbl" style={{ marginBottom: 4 }}>{title}</div>
      {items.map((x, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
          <input type="month" value={x.month} onChange={(e) => e.target.value && upd(i, { month: e.target.value })} />
          <input type="number" value={x.v} step={step} onChange={(e) => upd(i, { v: +e.target.value })} aria-label={`${title} ${unit}`}
            style={{ font: "inherit", padding: "5px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", minWidth: 0 }} />
          <button className="btn" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
        </div>
      ))}
      <button className="btn" onClick={() => onChange([...items, { month: addMonths(start, 12 * (items.length + 1)), v: defaultV }])}>+ Add</button>
    </div>
  );
}

function Schedule({ res }: { res: Result }) {
  const [open, setOpen] = useState<string | null>(null);
  const years = [...new Set(res.rows.map((r) => r.month.slice(0, 4)))];
  const sum = (rs: Result["rows"], f: (r: Result["rows"][number]) => number) => rs.reduce((s, r) => s + f(r), 0);
  return (
    <div className="tbl-wrap" style={{ maxHeight: 520 }}>
      <table className="tbl">
        <thead><tr><th>Year</th><th>Instalments</th><th>Interest</th><th>Principal</th><th>Overpayment</th><th>Rate</th><th>Balance at end</th></tr></thead>
        <tbody>
          {years.map((y) => {
            const rs = res.rows.filter((r) => r.month.startsWith(y));
            return (
              <Fragment key={y}>
                <tr onClick={() => setOpen(open === y ? null : y)} style={{ cursor: "pointer" }}>
                  <td><b>{open === y ? "▾" : "▸"} {y}</b></td>
                  <td>{money(sum(rs, (r) => r.payment))}</td><td>{money(sum(rs, (r) => r.interest))}</td><td>{money(sum(rs, (r) => r.principal))}</td>
                  <td>{money(sum(rs, (r) => r.overpayment))}</td><td>{rs.at(-1)!.rate}%</td><td>{money(rs.at(-1)!.balance)}</td>
                </tr>
                {open === y && rs.map((r) => (
                  <tr key={r.month} style={{ color: "var(--ink-2)" }}>
                    <td style={{ paddingLeft: 24 }}>{ymLong(r.month)}</td>
                    <td>{money2(r.payment)}</td><td>{money2(r.interest)}</td><td>{money2(r.principal)}</td><td>{r.overpayment ? money2(r.overpayment) : "·"}</td><td>{r.rate}%</td><td>{money2(r.balance)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
