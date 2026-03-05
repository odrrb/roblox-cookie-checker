"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  CurrencyCircleDollarIcon,
  XIcon,
  CaretRightIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  TimerIcon,
  SpinnerIcon,
} from "@phosphor-icons/react"

import type { CookieEntry, PlaytimeEntry, SpendGroup } from "./types"
import { fmt, calcAge, groupTransactions, fmtDuration } from "./helpers"

interface DetailDialogProps {
  entry: CookieEntry
  onClose: () => void
}

export function DetailDialog({ entry, onClose }: DetailDialogProps) {
  const r = entry.result!
  const u = r.user!
  const loading = !r.detailsLoaded
  const txns = r.transactions ?? []
  const spendGroups = React.useMemo(() => groupTransactions(txns), [txns])

  const playtime = r.playtime ?? []
  const totalPlaytime = r.totalPlaytimeMinutes ?? 0
  const screenTime = r.screenTime ?? null

  const [activeTab, setActiveTab] = React.useState<"robux" | "playtime">("playtime")
  const [robuxSearch, setRobuxSearch] = React.useState("")
  const [playtimeSearch, setPlaytimeSearch] = React.useState("")

  const filteredPlaytime = React.useMemo(() => {
    if (!playtimeSearch.trim()) return playtime
    const q = playtimeSearch.toLowerCase()
    return playtime.filter((e) => e.gameName.toLowerCase().includes(q))
  }, [playtime, playtimeSearch])

  const filteredSpendGroups = React.useMemo(() => {
    if (!robuxSearch.trim()) return spendGroups
    const q = robuxSearch.toLowerCase()
    return spendGroups
      .map((g) => ({ ...g, items: g.items.filter((t) => t.name.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0)
  }, [spendGroups, robuxSearch])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-label={`Details for ${u.name}`}
          className="flex h-full max-h-[720px] w-full max-w-xl flex-col overflow-hidden rounded-none border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3.5">
            {r.avatarUrl ? (
              <img src={r.avatarUrl} alt="" className="size-10 rounded-full bg-muted" />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <span className="text-sm font-bold">{u.name[0]?.toUpperCase()}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold">@{u.name}</p>
                {r.hasVerifiedBadge && (
                  <CheckCircleIcon className="size-3.5 shrink-0 text-primary" weight="fill" />
                )}
                {r.premium && (
                  <span className="shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-bold text-amber-600">
                    PREMIUM
                  </span>
                )}
                {r.isBanned && (
                  <span className="shrink-0 rounded bg-destructive/10 px-1 py-0.5 text-[9px] font-bold text-destructive">
                    BANNED
                  </span>
                )}
              </div>
              {u.displayName !== u.name && (
                <p className="truncate text-[11px] text-muted-foreground">{u.displayName}</p>
              )}
            </div>
            <Button variant="ghost" size="icon-xs" onClick={onClose}>
              <XIcon />
            </Button>
          </div>

          {/* Primary stats */}
          <div className="grid shrink-0 grid-cols-4 divide-x border-b">
            <StatCell label="Balance" value={fmt(r.robux)} />
            <StatCell
              label="Credit"
              value={loading ? "…" : r.creditBalance != null ? `$${r.creditBalance.toFixed(2)}` : "—"}
            />
            <StatCell label="RAP" value={loading ? "…" : fmt(r.rap)} />
            <StatCell label="Total Spent" value={loading ? "…" : fmt(r.totalSpent ?? null)} />
          </div>

          {/* Info grid */}
          <div className="grid shrink-0 grid-cols-5 gap-px border-b bg-border text-[11px]">
            <InfoCell
              label="Card"
              value={loading ? "…" : r.hasLinkedCard == null ? "—" : r.hasLinkedCard ? "Yes" : "No"}
              highlight={r.hasLinkedCard === true}
            />
            <InfoCell
              label="Email"
              value={loading ? "…" : r.emailVerified == null ? "—" : r.emailVerified ? "Verified" : "Unverified"}
            />
            <InfoCell label="Birthdate" value={loading ? "…" : r.birthdate ?? "—"} />
            <InfoCell label="Age" value={loading ? "…" : calcAge(r.birthdate)} />
            <InfoCell label="Pending" value={loading ? "…" : fmt(r.pendingRobux)} />
          </div>

          {loading && (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <SpinnerIcon className="size-4 animate-spin" />
              Loading details…
            </div>
          )}

          {!loading && (
            <>
          {/* Tabs */}
          <div className="flex shrink-0 border-b">
            <TabButton
              active={activeTab === "playtime"}
              onClick={() => setActiveTab("playtime")}
              icon={<TimerIcon className="size-3.5" />}
              label="Playtime"
              count={playtime.length}
            />
            <TabButton
              active={activeTab === "robux"}
              onClick={() => setActiveTab("robux")}
              icon={<CurrencyCircleDollarIcon className="size-3.5" />}
              label="Robux Spent"
              count={txns.length}
            />
          </div>

          {/* Search */}
          <div className="shrink-0 border-b px-4 py-2.5">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              {activeTab === "playtime" ? (
                <Input
                  placeholder="Search games..."
                  value={playtimeSearch}
                  onChange={(e) => setPlaytimeSearch(e.target.value)}
                  className="pl-8"
                />
              ) : (
                <Input
                  placeholder="Search transactions..."
                  value={robuxSearch}
                  onChange={(e) => setRobuxSearch(e.target.value)}
                  className="pl-8"
                />
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "playtime" ? (
              <div>
                {(playtime.length > 0 || (screenTime && screenTime.totalWeeklyMinutes > 0)) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2 text-[11px]">
                    <span className="font-medium">
                      {playtime.length} game{playtime.length !== 1 ? "s" : ""}
                    </span>
                    {screenTime && screenTime.totalWeeklyMinutes > 0 && (
                      <span className="font-medium text-primary">
                        {fmtDuration(screenTime.totalWeeklyMinutes)} total this week
                      </span>
                    )}
                    {totalPlaytime > 0 && totalPlaytime !== screenTime?.totalWeeklyMinutes && (
                      <span className="text-muted-foreground">
                        {fmtDuration(totalPlaytime)} per-game total
                      </span>
                    )}
                  </div>
                )}
                <div className="divide-y">
                  {filteredPlaytime.length === 0 ? (
                    <EmptyState
                      text={
                        playtimeSearch ? "No games match your search" : "No playtime data found"
                      }
                    />
                  ) : (
                    filteredPlaytime.map((g, i) => (
                      <PlaytimeRow
                        key={g.universeId}
                        entry={g}
                        rank={i + 1}
                        totalMinutes={totalPlaytime}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y">
                {filteredSpendGroups.length === 0 ? (
                  <EmptyState
                    text={
                      robuxSearch ? "No transactions match your search" : "No transactions found"
                    }
                  />
                ) : (
                  filteredSpendGroups.map((g) => <SpendGroupRow key={g.type} group={g} />)
                )}
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function InfoCell({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="bg-background px-3 py-2 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-mono text-xs font-medium tabular-nums ${highlight ? "text-primary" : ""}`}>
        {value}
      </p>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
        active ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
      <span
        className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
          active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  )
}

function PlaytimeRow({
  entry,
  rank,
  totalMinutes,
}: {
  entry: PlaytimeEntry
  rank: number
  totalMinutes: number
}) {
  const pct = totalMinutes > 0 ? (entry.weeklyMinutes / totalMinutes) * 100 : 0
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-xs">
      <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entry.gameName}</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/60 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <span className="shrink-0 font-mono font-medium tabular-nums">
        {fmtDuration(entry.weeklyMinutes)}
      </span>
    </div>
  )
}

function SpendGroupRow({ group }: { group: SpendGroup }) {
  const [open, setOpen] = React.useState(false)
  const groupTotal = group.items.reduce((s, t) => s + t.amount, 0)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs transition-colors hover:bg-muted/40"
      >
        {open ? (
          <CaretDownIcon className="size-3 shrink-0" />
        ) : (
          <CaretRightIcon className="size-3 shrink-0" />
        )}
        <span className="flex-1 truncate font-medium">{group.type}</span>
        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
          {fmt(groupTotal)} R$
        </span>
      </button>
      {open && (
        <div className="border-t border-dashed bg-muted/20 px-4 py-2">
          <ul className="space-y-1">
            {group.items.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
              >
                <span className="truncate">{t.name}</span>
                <span className="shrink-0 font-mono tabular-nums">{fmt(t.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
