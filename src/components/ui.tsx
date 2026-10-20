"use client";

export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}

export function Card({
  title, sub, span = 12, right, children,
}: { title: string; sub?: React.ReactNode; span?: 3 | 4 | 5 | 6 | 7 | 8 | 12; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`card c${span}`}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Kpi({
  label, value, delta, goodWhenUp = true, note,
}: { label: string; value: string; delta?: number | null; goodWhenUp?: boolean; note?: string }) {
  let d: React.ReactNode = null;
  if (delta !== undefined && delta !== null && isFinite(delta)) {
    const up = delta >= 0;
    const good = up === goodWhenUp;
    d = (
      <div className="delta">
        <span className={good ? "up" : "down"}>
          {up ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(Math.abs(delta) < 0.1 ? 1 : 0)}%
        </span>{" "}
        vs previous period
      </div>
    );
  }
  return (
    <section className="card c3 kpi">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {d}
      {note && <div className="delta">{note}</div>}
    </section>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}
