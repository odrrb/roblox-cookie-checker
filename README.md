# Roblox Cookie Checker

A web-based tool for bulk-validating Roblox `.ROBLOSECURITY` cookies and viewing detailed account information. Built with Next.js 16, React 19, and Tailwind CSS 4.

## Features

- **Batch checking** — validate hundreds of cookies at once with configurable concurrency (1, 3, 5, or 10 workers)
- **Flexible input** — drag-and-drop file upload (`.txt`, `.cookie`, `.cookies`) or paste cookies directly
- **Smart parsing** — auto-detects `_|WARNING:...|_` format, `Cookie:` headers, `.ROBLOSECURITY=` assignments, or raw tokens
- **Two-phase checking** — fast validation first, then automatic detail fetching for valid accounts in the background
- **Multi-view UI** — input → progress → results → table flow with compact, centered layout
- **Live progress** — progress bars, counters, elapsed time, ETA, rate limit warnings, and scrolling logs
- **Virtualized table** — handles thousands of rows with sortable columns (Robux, RAP, Card, Spent, Playtime)

### Per-Account Details

Click any row in the valid table to open a detail dialog showing:

| Info | Description |
|------|-------------|
| Robux Balance | Current R$ balance |
| RAP | Recent Average Price of collectibles |
| Total Spent | Lifetime Robux spent (purchases) |
| Pending Robux | Pending transaction totals |
| Linked Card | Whether a payment method is on file |
| Email | Email verification status |
| Birthdate / Age | Account birthdate and calculated age |
| Playtime | Weekly total playtime |
| Premium | Active Roblox Premium subscription |
| Verified Badge | Roblox verified badge status |
| Ban Status | Whether the account is banned |
| Avatar | Account avatar thumbnail |

The detail dialog also includes two searchable tabs:

- **Playtime** — weekly screen time breakdown per game with percentage bars
- **Robux Spent** — transaction history grouped by game name (for in-game purchases) or "Avatar Shop" (for marketplace items) with expandable item lists

### Aggregate Statistics

After a batch check, view an overall statistics dialog with:

- Valid vs. invalid ratio with visual bar
- Total and average Robux, RAP, spending, and playtime across all valid accounts
- Feature breakdown — percentage of accounts with linked card, Premium, verified badge, and verified email
- Top accounts — richest, highest RAP, most spent, and most played

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js](https://nextjs.org) 16 (App Router) |
| UI | [React](https://react.dev) 19 |
| Styling | [Tailwind CSS](https://tailwindcss.com) 4 |
| Components | [shadcn/ui](https://ui.shadcn.com) + [Base UI](https://base-ui.com) |
| Icons | [Phosphor Icons](https://phosphoricons.com) |
| Virtualization | [TanStack Virtual](https://tanstack.com/virtual) |

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

### Deploy to Vercel

Push to a GitHub repo and import in [Vercel](https://vercel.com). Set the root directory to `checker` if the repo has a parent folder.

## Project Structure

```
app/
  api/
    check/
      route.ts             # Fast cookie validation (auth + basic user info)
      details/route.ts     # Detailed account info (robux, RAP, transactions, playtime, etc.)
  page.tsx                 # Root page
  layout.tsx               # App layout with metadata and fonts
components/
  cookie-checker/
    cookie-checker.tsx     # Main checker UI (input, progress, results, table views)
    detail-dialog.tsx      # Per-account detail dialog with playtime and spending tabs
    stats-dialog.tsx       # Aggregate statistics dialog
    helpers.ts             # Parsing, formatting, sorting utilities
    types.ts               # TypeScript interfaces
    index.ts               # Barrel export
  ui/                      # shadcn/ui primitives
```

## How It Works

1. Cookies are parsed client-side from file or text input
2. **Fast check**: each cookie is sent to `/api/check` for quick authentication and basic user info
3. **Detail fetch**: once the fast check completes, `/api/check/details` is called concurrently for all valid cookies to load full account data (robux, RAP, transactions, playtime, payment profiles, etc.)
4. Results populate a virtualized table; details show loading spinners until they arrive
5. Transaction data uses the `transaction-records` API to group purchases by game name (in-game) or "Avatar Shop" (marketplace)

## License

MIT
