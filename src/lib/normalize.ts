import {
  CATEGORY_BY_FIRST_EMOJI,
  EXTRA_RULES,
  GENERAL_SUBCATEGORY,
  GROUP_BY_CATEGORY,
  GROUP_BY_SUBCATEGORY,
  SUBCATEGORY_BY_EMOJI,
  TAX_NAME,
  type SpendGroup,
} from "@/config/categories";
import type { Dataset, Kind, MortgageHint, RawExport, Tx } from "./types";

const UNCAT = "Uncategorised";

/** Same shape Finantly uses for suggestion patterns: ASCII uppercase letters + single spaces. */
export function patternize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CARD_RE = /PŁATNOŚĆ KARTĄ [\d.,]+ [A-Z]{3}(?: (?:1 [A-Z]{3}=[\d.,]+ [A-Z]{3}|[\d.,]+ [A-Z]{3}))? (.+)$/;
const GENERIC = new Set(["SKLEP", "SP", "PH", "THE", "MY", "WWW", "BAR", "CAFE", "KAWIARNIA", "RESTAURACJA", "APTEKA"]);

/** Best-effort merchant name from Polish bank descriptions. */
export function extractMerchant(desc: string): string {
  const d = desc.trim();
  if (!d || d === "—") return "(no description)";
  if (/^PROWIZJA ZA PRZEWALUT/i.test(d)) return "Bank · FX fee";
  if (/^(Opłata|Prowizja)/i.test(d)) return "Bank · fees";
  if (/^(SPŁATA KREDYTU|rata)\b/i.test(d)) return "Loan installment";
  if (/^\/TI\/|VAT-7/i.test(d)) return "Tax office";
  if (/skladk|składk/i.test(d)) return "Social insurance";
  if (/WYPŁATA|WYPLATA/.test(d)) return "Cash withdrawal";
  if (/^\/VAT\//.test(d)) return "VAT split payment";
  if (/^Płatność kredytu|kredyt/i.test(d)) return "Loan installment";
  let m = d.match(CARD_RE)?.[1];
  if (!m) {
    const blik = d.match(/^Zakup BLIK (.+?)(?: ref:|$)/i)?.[1];
    if (blik) m = blik;
  }
  if (!m) {
    if (/^przelew/i.test(d)) return "Transfer";
    return d.length > 32 ? d.slice(0, 32) + "…" : d;
  }
  const toks = m
    .toUpperCase()
    .replace(/^WWW\./, "")
    .replace(/\s*-\s*/g, "-")
    .split(/[\s*]+/)
    .filter(Boolean);
  let name = toks[0] ?? m;
  if ((name.length <= 3 || GENERIC.has(name)) && toks[1] && !/\d{3,}/.test(toks[1])) name = `${name} ${toks[1]}`;
  return name.replace(/[.,]+$/, "");
}

function isoParts(iso: string) {
  const date = iso.slice(0, 10);
  const [y, mo, d] = date.split("-").map(Number);
  const js = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0=Sun
  return { date, ym: date.slice(0, 7), year: y, month: mo, dom: d, dow: (js + 6) % 7 };
}

export function normalize(raw: RawExport): Dataset {
  // --- resolve category & subcategory names ---
  const catName = new Map<string, string>();
  const catType = new Map<string, Kind>();
  const sub = new Map<string, { name: string; emoji: string }>();
  for (const c of raw.categories ?? []) {
    const first = c.subcategories[0]?.emoji ?? "";
    const name = c.groupName?.trim() || CATEGORY_BY_FIRST_EMOJI[first] || `Category ${c.id.slice(-4)}`;
    catName.set(c.id, name);
    catType.set(c.id, c.type);
    for (const s of c.subcategories) {
      const nm = s.name && s.name !== "undefined" ? s.name : SUBCATEGORY_BY_EMOJI[s.emoji ?? ""] ?? "Other";
      sub.set(s.id, { name: nm, emoji: s.emoji ?? "" });
    }
  }
  const nameToId = new Map([...catName].map(([id, n]) => [n, id]));

  // --- suggestion patterns (longest first so the most specific wins) ---
  const suggestions = (raw.suggestions ?? [])
    .filter((s) => s.pattern && catName.has(s.categoryId))
    .sort((a, b) => b.pattern.length - a.pattern.length);

  const txs: Tx[] = [];
  for (const t of raw.transactions ?? []) {
    if (t.type === "wallet-balance-change") continue; // asset revaluations, not cash flow
    if (t.subtransactions?.length) continue; // split parent — its children carry the money

    let catId = t.categoryId;
    let subId = t.subcategoryId;
    let subName: string | undefined;
    let inferred = false;

    if (!catId) {
      const p = patternize(t.description);
      const hit = p && suggestions.find((s) => p === s.pattern || (s.pattern.length >= 3 && p.includes(s.pattern)));
      if (hit) {
        catId = hit.categoryId;
        subId = hit.subcategoryId;
        inferred = true;
      } else {
        const sign = t.amount >= 0 ? "income" : "expense";
        const rule = EXTRA_RULES.find((r) => r.sign === sign && r.test.test(t.description));
        const target = rule?.category.find((c) => nameToId.has(c));
        if (rule && target) {
          catId = nameToId.get(target)!;
          subId = null;
          subName = rule.subcategory;
          inferred = true;
        }
      }
    }

    const kind: Kind = catId && catType.has(catId) ? catType.get(catId)! : t.amount >= 0 ? "income" : "expense";
    const category = catId ? catName.get(catId) ?? UNCAT : UNCAT;
    const s = subId ? sub.get(subId) : undefined;
    const subcategory = subName ?? s?.name ?? (category === UNCAT ? (kind === "income" ? "Incoming" : "Outgoing") : GENERAL_SUBCATEGORY[category] ?? "General");
    const group: Tx["group"] =
      kind === "income"
        ? "income"
        : GROUP_BY_SUBCATEGORY[subcategory] ?? GROUP_BY_CATEGORY[category] ?? ((TAX_NAME.test(category) ? "taxes" : "other") as SpendGroup);

    txs.push({
      id: t.id,
      ...isoParts(t.date),
      kind,
      value: kind === "income" ? t.amount : -t.amount,
      wallet: t.walletName,
      category,
      subcategory,
      emoji: s?.emoji ?? "",
      group,
      merchant: extractMerchant(t.description),
      description: t.description,
      included: t.type === "subtransaction" ? true : t.includeInAnalysis,
      inferred,
    });
  }
  txs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // stable colour order: all-time included volume per kind; Uncategorised always last
  const vol: Record<Kind, Map<string, number>> = { income: new Map(), expense: new Map() };
  for (const t of txs) if (t.included) vol[t.kind].set(t.category, (vol[t.kind].get(t.category) ?? 0) + t.value);
  const order = (k: Kind) =>
    [...vol[k]].sort((a, b) => (a[0] === UNCAT ? 1 : b[0] === UNCAT ? -1 : b[1] - a[1])).map(([n]) => n);

  return {
    currency: raw.profile?.currency ?? "PLN",
    exportedAt: raw.meta?.exportedAt ?? "",
    txs,
    wallets: (raw.wallets ?? []).map((w) => ({ name: w.name, type: w.type, balance: w.balance })),
    netWorth: (raw.netWorth ?? []).map((n) => {
      const a = Object.values(n.assets ?? {}).reduce((s, v) => s + v, 0);
      const l = Object.values(n.liabilities ?? {}).reduce((s, v) => s + v, 0);
      return {
        date: n.date.slice(0, 10),
        netWorth: n.netWorth,
        assets: a,
        liabilities: l,
        breakdown: { ...(n.assets ?? {}), ...(n.liabilities ?? {}) },
      };
    }),
    categoryOrder: { income: order("income"), expense: order("expense") },
    mortgages: mortgageHints(raw, txs),
  };
}

const OVERPAY_RE = /nadpłat|nadplat|overpay/i;

function mortgageHints(raw: RawExport, txs: Tx[]): MortgageHint[] {
  const liab = (raw.wallets ?? []).filter(
    (w) => w.type === "liability" && (w.category === "mortgage" || /mortgage|kredyt|hipote/i.test(w.name)),
  );
  if (!liab.length) return [];
  const asOf = (raw.meta?.exportedAt ?? new Date().toISOString()).slice(0, 10);
  // instalments are paid from bank accounts, so detect them by subcategory rather than by wallet
  const pays = txs.filter((t) => t.kind === "expense" && t.included && t.subcategory === "Mortgage" && t.value > 0);
  const last = pays.filter((t) => !OVERPAY_RE.test(t.description)).at(-1);
  const [y, m] = (last?.ym ?? asOf.slice(0, 7)).split("-").map(Number);
  const recent = new Set([0, 1, 2].map((i) => {
    const idx = y * 12 + m - 1 - i;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  }));
  // median of the last 3 months, so a one-off lump doesn't look like a monthly habit
  const perMonth = [...recent].map((ym) => pays.filter((t) => OVERPAY_RE.test(t.description) && t.ym === ym).reduce((s, t) => s + t.value, 0));
  const over = perMonth.sort((a, b) => a - b)[1];
  // with several mortgages we can't tell whose instalment is whose
  const single = liab.length === 1;
  return liab.map((w) => ({
    name: w.name,
    balance: Math.abs(w.balance),
    asOf,
    installment: single ? last?.value : undefined,
    installmentDate: single ? last?.date : undefined,
    overpaymentPerMonth: single && over > 0 ? Math.round(over) : undefined,
  }));
}

/** Strip personal/profile data before it ever reaches the browser. */
export function sanitize(raw: RawExport): RawExport {
  return {
    meta: raw.meta,
    profile: { currency: raw.profile?.currency },
    wallets: raw.wallets,
    transactions: raw.transactions,
    categories: raw.categories,
    netWorth: raw.netWorth,
    suggestions: raw.suggestions,
  };
}
