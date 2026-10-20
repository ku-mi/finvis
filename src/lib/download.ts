import type { Tx } from "./types";

export function toCsv(rows: Tx[]) {
  const esc = (s: string | number | boolean) => {
    const v = String(s);
    return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const head = ["date", "kind", "amount", "category", "subcategory", "group", "merchant", "wallet", "included", "inferred_category", "description"];
  return [head.join(","), ...rows.map((t) => [t.date, t.kind, t.value.toFixed(2), t.category, t.subcategory, t.group, t.merchant, t.wallet, t.included, t.inferred, t.description].map(esc).join(","))].join("\n");
}

export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
