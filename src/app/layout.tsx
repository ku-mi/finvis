import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { DataProvider } from "@/components/DataProvider";
import { Shell } from "@/components/Shell";
import { sanitize } from "@/lib/normalize";
import type { RawExport } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = { title: "finvis — personal finance views" };
export const dynamic = "force-dynamic";

async function loadRaw(): Promise<RawExport | null> {
  const file = process.env.FINANCE_DATA || path.join(process.cwd(), "data", "finance.json");
  try {
    return sanitize(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return null;
  }
}

const themeBoot = `try{var t=localStorage.getItem('finvis.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = await loadRaw();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <DataProvider raw={raw}>
          <Shell>{children}</Shell>
        </DataProvider>
      </body>
    </html>
  );
}
