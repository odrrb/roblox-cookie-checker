import type { CookieEntry, FilterMode, SpendGroup, SortCol, TransactionItem } from "./types"

export const CONCURRENCY_OPTIONS = [1, 3, 5, 10] as const
export const DEFAULT_CONCURRENCY = 3

export const COOKIE_RE = /_\|WARNING:[^|]*\|_\S+/g

export function fmt(n: number | null | undefined): string {
  if (n == null) return "—"
  return n.toLocaleString()
}

function sanitizeCookie(s: string): string {
  return s
    .replace(/^\uFEFF/, "")     // strip BOM
    .replace(/[\r\n\t]/g, "")   // strip control chars
    .replace(/\s+$/, "")        // trailing whitespace
    .replace(/^\s+/, "")        // leading whitespace
}

export function parseCookieLines(raw: string): string[] {
  const matches = raw.match(COOKIE_RE)
  if (matches) return [...new Set(matches.map(sanitizeCookie))]

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const results: string[] = []
  for (let l of lines) {
    if (l.startsWith("Cookie:")) l = l.slice(7).trim()

    const robloMatch = l.match(/\.ROBLOSECURITY=([^\s;]+)/)
    if (robloMatch) {
      results.push(sanitizeCookie(robloMatch[1]))
      continue
    }

    const parts = l.split(/[:\s;|]+/)
    const token = parts.find((p) => p.length > 100)
    if (token) {
      results.push(sanitizeCookie(token))
      continue
    }

    if (l.length > 50) results.push(sanitizeCookie(l))
  }
  return [...new Set(results)]
}

export function sortVal(e: CookieEntry, col: SortCol, i: number): string | number {
  if (col === "index") return i
  if (col === "status") return e.status !== "done" ? -1 : e.result?.valid ? 1 : 0
  if (!e.result?.valid) return -1

  switch (col) {
    case "username":
      return e.result.user?.name.toLowerCase() ?? ""
    case "robux":
      return e.result.robux ?? -1
    case "rap":
      return e.result.rap ?? -1
    case "card":
      return e.result.hasLinkedCard ? 1 : 0
    case "spent":
      return e.result.totalSpent ?? -1
    case "playtime":
      return e.result.totalPlaytimeMinutes ?? -1
  }
}

export function calcAge(birthdate: string | null | undefined): string {
  if (!birthdate) return "—"
  const parts = birthdate.split("/")
  if (parts.length !== 3) return "—"

  const [m, d, y] = parts.map(Number)
  if (!m || !d || !y || y < 1900) return "—"

  const born = new Date(y, m - 1, d)
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const hadBirthday =
    now.getMonth() > born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() >= born.getDate())
  if (!hadBirthday) age--

  return age >= 0 && age < 150 ? `${age}y` : "—"
}

export function groupTransactions(txns: TransactionItem[]): SpendGroup[] {
  const map = new Map<string, SpendGroup>()
  for (const t of txns) {
    const key = t.game
    let g = map.get(key)
    if (!g) {
      g = { type: key, items: [], total: 0 }
      map.set(key, g)
    }
    g.items.push(t)
    g.total += t.amount
  }
  const groups = [...map.values()].sort((a, b) => b.total - a.total)
  for (const g of groups) g.items.sort((a, b) => b.amount - a.amount)
  return groups
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

export function fmtElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rs = Math.round(s % 60)
  return `${m}m ${rs}s`
}

export function matchesFilter(e: CookieEntry, filter: FilterMode): boolean {
  switch (filter) {
    case "all":
      return true
    case "valid":
      return e.status === "done" && e.result?.valid === true
    case "invalid":
      return (e.status === "done" && !e.result?.valid) || e.status === "error"
    case "pending":
      return e.status === "pending" || e.status === "checking"
  }
}
