// Month-by-month mortgage simulation with overpayments and rate changes.
// Pure functions — no dependency on the finance dataset.

export type InstallmentType = "annuity" | "decreasing"; // equal instalments / decreasing instalments
export type Strategy = "shorten" | "lower" | "snowball";

export interface MortgageInput {
  principal: number;
  annualRate: number; // %
  termMonths: number;
  start: string; // YYYY-MM of the first instalment
  type: InstallmentType;
  monthlyOverpayment: number;
  overpaymentFrom: string; // YYYY-MM
  overpaymentTo: string; // YYYY-MM, "" = until paid off
  lumps: { month: string; amount: number }[];
  rateChanges: { month: string; rate: number }[];
  strategy: Strategy;
  overpaymentFee: number; // % charged on overpaid amount
}

export interface Row {
  i: number;
  month: string;
  rate: number;
  payment: number; // scheduled instalment (interest + principal)
  interest: number;
  principal: number;
  overpayment: number;
  fee: number;
  balance: number;
}

export interface Result {
  rows: Row[];
  totalInterest: number;
  totalPaid: number;
  totalOverpaid: number;
  totalFees: number;
  months: number;
  end: string;
  firstPayment: number;
}

export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + m - 1 + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function annuity(balance: number, r: number, n: number) {
  if (n <= 0) return balance;
  if (r === 0) return balance / n;
  return (balance * r) / (1 - Math.pow(1 + r, -n));
}

/** Months needed to repay `balance` with instalment `payment` at monthly rate `r` (Infinity if it never amortises). */
export function nper(balance: number, r: number, payment: number) {
  if (r === 0) return Math.ceil(balance / payment);
  if (payment <= balance * r) return Infinity;
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r));
}

export function simulate(inp: MortgageInput, withOverpayments = true): Result {
  const rows: Row[] = [];
  let balance = inp.principal;
  let rate = inp.annualRate;
  let r = rate / 1200;
  let remaining = Math.max(1, Math.round(inp.termMonths));
  let A = annuity(balance, r, remaining); // annuity instalment
  let K = balance / remaining; // decreasing: fixed principal part
  const rateAt = new Map(inp.rateChanges.map((c) => [c.month, c.rate]));
  const lumpAt = new Map<string, number>();
  for (const l of inp.lumps) lumpAt.set(l.month, (lumpAt.get(l.month) ?? 0) + l.amount);
  let baseOutlay = 0; // snowball: total monthly outlay to keep constant
  const fee = Math.max(0, inp.overpaymentFee) / 100;

  for (let i = 0; balance > 0.005 && i < 1200; i++) {
    const month = addMonths(inp.start, i);
    if (i > 0 && rateAt.has(month)) {
      rate = rateAt.get(month)!;
      r = rate / 1200;
      // the bank re-computes the instalment for the remaining term
      A = annuity(balance, r, remaining);
      K = balance / remaining;
    }
    const interest = balance * r;
    let principal = inp.type === "annuity" ? A - interest : K;
    principal = Math.min(Math.max(principal, 0), balance);
    const payment = principal + interest;
    balance -= principal;
    remaining = Math.max(remaining - 1, 1);

    let over = 0;
    if (withOverpayments) {
      const inWindow = month >= inp.overpaymentFrom && (!inp.overpaymentTo || month <= inp.overpaymentTo);
      const lump = lumpAt.get(month) ?? 0;
      if (inp.strategy === "snowball" && inWindow) {
        // keep the total monthly outlay fixed: whatever the instalment drops by goes to overpayment
        if (!baseOutlay) baseOutlay = payment + inp.monthlyOverpayment;
        over = Math.max(baseOutlay - payment, 0) + lump;
      } else {
        over = (inWindow ? inp.monthlyOverpayment : 0) + lump;
      }
    }
    over = Math.min(over, balance);
    const f = over * fee;
    balance -= over;
    if (balance < 0.005) balance = 0;

    if (over > 0 && balance > 0) {
      if (inp.strategy === "lower") {
        A = annuity(balance, r, remaining);
        K = balance / remaining;
      } else {
        // shorten / snowball: keep the instalment, the term shrinks
        remaining = inp.type === "annuity" ? Math.max(1, nper(balance, r, A)) : Math.max(1, Math.ceil(balance / K));
      }
    }
    rows.push({ i, month, rate, payment, interest, principal, overpayment: over, fee: f, balance });
  }

  const sum = (f: (x: Row) => number) => rows.reduce((s, x) => s + f(x), 0);
  return {
    rows,
    totalInterest: sum((x) => x.interest),
    totalOverpaid: sum((x) => x.overpayment),
    totalFees: sum((x) => x.fee),
    totalPaid: sum((x) => x.payment + x.overpayment + x.fee),
    months: rows.length,
    end: rows.at(-1)?.month ?? inp.start,
    firstPayment: rows[0]?.payment ?? 0,
  };
}
