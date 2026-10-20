// Raw Finantly export (schemaVersion 3) — only the parts we use.
export interface RawExport {
  meta?: { schemaVersion?: number; exportedAt?: string };
  profile?: { currency?: string };
  wallets: { id: string; name: string; type: string; balance: number; category?: string }[];
  transactions: RawTx[];
  categories: RawCategory[];
  netWorth?: { date: string; netWorth: number; assets?: Record<string, number>; liabilities?: Record<string, number> }[];
  suggestions?: { pattern: string; type: string; categoryId: string; subcategoryId: string | null }[];
}

export interface RawTx {
  id: string;
  date: string;
  type: string;
  amount: number;
  walletId: string;
  walletName: string;
  categoryId: string | null;
  subcategoryId: string | null;
  description: string;
  includeInAnalysis: boolean;
  subtransactions: string[];
}

export interface RawCategory {
  id: string;
  type: "income" | "expense";
  groupName?: string;
  color?: string;
  subcategories: { id: string; name?: string; emoji?: string }[];
}

export type Kind = "income" | "expense";

/** Normalised transaction. `value` is positive for normal flow (income received / money spent); refunds are negative. */
export interface Tx {
  id: string;
  date: string; // YYYY-MM-DD
  ym: string; // YYYY-MM
  year: number;
  month: number; // 1-12
  dow: number; // 0=Mon … 6=Sun
  dom: number; // day of month
  kind: Kind;
  value: number;
  wallet: string;
  category: string;
  subcategory: string;
  emoji: string;
  group: import("@/config/categories").SpendGroup | "income";
  merchant: string;
  description: string;
  included: boolean; // includeInAnalysis (false = internal transfer etc.)
  inferred: boolean; // category assigned by a rule, not by the user
}

export interface Dataset {
  currency: string;
  exportedAt: string;
  txs: Tx[];
  wallets: { name: string; type: string; balance: number }[];
  netWorth: { date: string; netWorth: number; assets: number; liabilities: number; breakdown: Record<string, number> }[];
  /** Liabilities tagged as mortgage, with instalments detected from transactions — used to prefill the calculator. */
  mortgages: MortgageHint[];
  /** Stable category order by all-time volume, per kind — drives colour assignment. */
  categoryOrder: Record<Kind, string[]>;
}

export interface MortgageHint {
  name: string;
  balance: number; // outstanding, positive
  asOf: string; // YYYY-MM-DD
  installment?: number; // latest regular instalment
  installmentDate?: string;
  overpaymentPerMonth?: number; // median of the last 3 months
}
