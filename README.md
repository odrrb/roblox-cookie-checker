# Roblox Cookie Checker

A web-based tool for bulk-validating Roblox `.ROBLOSECURITY` cookies and viewing detailed account information. Built with Next.js 16, React 19, and Tailwind CSS 4.

## Features

- **Batch checking** — validate hundreds of cookies at once with configurable concurrency (1–50 workers)
- **Flexible input** — drag-and-drop file upload (`.txt`, `.cookie`, `.cookies`) or paste cookies directly
- **Smart parsing** — auto-detects `_|WARNING:...|_` format, `Cookie:` headers, `.ROBLOSECURITY=` assignments, or raw tokens
- **Virtualized results table** — handles large lists smoothly with sortable columns and real-time filtering (all / valid / invalid / pending)
- **Live progress** — progress bar and counters update as cookies are checked, with stop/abort support

### Per-Account Details

Click any valid row to open a detail dialog showing:

| Info | Description |
|------|-------------|
| Robux Balance | Current R$ balance |
| Credit Balance | USD credit on account |
| RAP | Recent Average Price of collectibles |
| Total Spent | Lifetime Robux spent (purchases) |
| Linked Card | Whether a payment method is on file |
| Premium | Active Roblox Premium subscription |
| Verified Badge | Roblox verified badge status |
| Email | Email verification status |
| Birthdate / Age | Account birthdate and calculated age |
| Pending Robux | Pending transaction totals |
| Ban Status | Whether the account is banned |
| Avatar | Account avatar thumbnail |

The detail dialog also includes two searchable tabs:

- **Playtime** — weekly screen time breakdown per game with percentage bars
- **Robux Spent** — transaction history grouped by type (Game Pass, Developer Product, etc.) with expandable item lists

### Aggregate Statistics

After a batch check completes, view an overall statistics dialog with:

- Valid vs. invalid ratio with visual bar
- Total and average Robux, RAP, and spending across all valid accounts
- Total credit balance and weekly playtime
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

## Project Structure

```
app/
  api/check/route.ts    # Server-side cookie validation endpoint
  page.tsx              # Root page
  layout.tsx            # App layout with metadata and fonts
components/
  cookie-checker/
    cookie-checker.tsx  # Main checker UI (input, table, progress)
    detail-dialog.tsx   # Per-account detail dialog
    stats-dialog.tsx    # Aggregate statistics dialog
    helpers.ts          # Parsing, formatting, sorting utilities
    types.ts            # TypeScript interfaces
  ui/                   # shadcn/ui primitives
```

## How It Works

1. Cookies are parsed client-side from file or text input
2. The frontend sends each cookie to `/api/check` via POST with configurable concurrency
3. The API route authenticates against Roblox, then fetches account data from multiple Roblox endpoints in parallel (currency, premium, RAP, transactions, screen time, payment profiles, etc.)
4. Results stream back to the UI and populate the virtualized table in real time

## License

MIT
