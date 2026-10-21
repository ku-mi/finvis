# finvis — personal finance views

A local Next.js dashboard for a **Finantly JSON export**. It looks at income and spending per month or per year and per category, from several angles. It can also produce a **numbers-only summary** to paste into an AI assistant.

## Run

```bash
npm install
npm run dev        # http://localhost:3210
```

Data is read from `data/finance.json` (git-ignored). You can point to another file with `FINANCE_DATA=/path/to/export.json`. You can also load a different export from the sidebar ("Load export…"); it is parsed in the browser only.

## Views

| Page | Angle | Charts |
|---|---|---|
| Overview | the big picture | KPI tiles with Δ vs previous period, mirrored income/spending bars + net line, spending-group donut, cumulative savings, top categories, net worth (assets vs liabilities) |
| Money flow | where it goes | Sankey income → budget → categories → subcategories (or via Fixed/Essentials/Lifestyle groups), average-month waterfall |
| Categories | what it's spent on | Sunburst (click to drill in), stacked bars by month/year (amount or share), heatmap vs each category's own average, small multiples, pivot table |
| Rhythm | when it's spent | Calendar heatmap of daily spend, weekday habits, pay-day rhythm (day of month), polar "year clock", cumulative "year race" |
| Trends | how it changes | Category change vs previous period, 3-month rolling average per group (lifestyle creep), bump chart of category rank by year, boxplot of monthly spend per year, unusual months |
| Merchants | who gets paid | Frequency vs ticket-size bubble chart, top merchants, merchant treemap inside categories, detected recurring payments |
| What if… | try a different budget | Sliders per category and for income, group presets, a waterfall from today's savings to the scenario, budget now vs scenario, a compounding projection, and a link that turns the extra savings into a mortgage overpayment |
| Mortgage | overpayment calculator | Standalone: equal or decreasing instalments; monthly, one-off and time-limited overpayments; shorter-term, lower-instalment or keep-outlay strategies; rate changes; overpayment fee. Charts: balance, yearly interest/principal/overpayment, cumulative interest, monthly outlay, total cost, overpayment sensitivity, and a schedule you can expand to months. "Start from your data" fills the form from a mortgage liability in the export. |
| Transactions | every row | Search, filter and sort, CSV download |
| AI summary | export | Markdown / JSON / tidy CSV per category per month or year, with an editable instruction preface |

The filter bar (period, monthly/yearly, wallet, internal transfers, categories) applies to every page. The category control hides any categories you pick, or whole groups, from every chart, total and AI summary. You can save a selection as a named view (e.g. "No taxes"); views are stored in your browser. The seasonal views (year clock, year race, bump chart, boxplot) always use every year in the data.

## Data handling

- `wallet-balance-change` rows (asset revaluations) are ignored. Split transactions are replaced by their parts.
- Rows with `includeInAnalysis: false` (mostly transfers between your own accounts) are hidden unless you tick "Include internal transfers".
- Finantly's default categories have no names in the export, so names are resolved from emoji in `src/config/categories.ts`. Edit that file to rename categories, change the Fixed / Essentials / Lifestyle / Business / Taxes grouping, or add auto-categorisation rules. Categories missing from the grouping go to Taxes when the name looks like a tax (VAT, PIT, PPE…), otherwise to Unclassified.
- Uncategorised rows are matched against Finantly's own `suggestions` patterns first, then against `EXTRA_RULES`. Rows categorised this way are marked **auto** in the Transactions table.
- Profile and subscription details are stripped on the server and never reach the browser.
