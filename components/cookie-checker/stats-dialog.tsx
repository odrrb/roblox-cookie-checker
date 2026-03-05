"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  ChartBarIcon,
  CreditCardIcon,
  CrownIcon,
  ShieldCheckIcon,
  EnvelopeSimpleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react"

import type { CookieEntry } from "./types"
import { fmt, fmtDuration, fmtElapsed } from "./helpers"

interface StatsDialogProps {
  entries: CookieEntry[]
  checkDurationMs: number | null
  onClose: () => void
}

export function StatsDialog({ entries, checkDurationMs, onClose }: StatsDialogProps) {
  const stats = React.useMemo(() => {
    const valid = entries.filter((e) => e.status === "done" && e.result?.valid)
    const invalid = entries.filter(
      (e) => (e.status === "done" && !e.result?.valid) || e.status === "error",
    )

    let totalRobux = 0
    let totalRap = 0
    let totalSpent = 0
    let totalCredit = 0
    let totalPlaytime = 0
    let withCard = 0
    let withPremium = 0
    let withVerified = 0
    let withEmail = 0
    let banned = 0
    let maxRobux: { name: string; val: number } | null = null
    let maxRap: { name: string; val: number } | null = null
    let maxSpent: { name: string; val: number } | null = null
    let maxPlaytime: { name: string; val: number } | null = null

    for (const e of valid) {
      const r = e.result!
      const robux = r.robux ?? 0
      const rap = r.rap ?? 0
      const spent = r.totalSpent ?? 0
      const playtime = r.totalPlaytimeMinutes ?? 0
      const name = r.user?.name ?? "?"

      totalRobux += robux
      totalRap += rap
      totalSpent += spent
      totalCredit += r.creditBalance ?? 0
      totalPlaytime += playtime

      if (r.hasLinkedCard) withCard++
      if (r.premium) withPremium++
      if (r.hasVerifiedBadge) withVerified++
      if (r.emailVerified) withEmail++
      if (r.isBanned) banned++

      if (!maxRobux || robux > maxRobux.val) maxRobux = { name, val: robux }
      if (!maxRap || rap > maxRap.val) maxRap = { name, val: rap }
      if (!maxSpent || spent > maxSpent.val) maxSpent = { name, val: spent }
      if (!maxPlaytime || playtime > maxPlaytime.val) maxPlaytime = { name, val: playtime }
    }

    return {
      total: entries.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      totalRobux,
      totalRap,
      totalSpent,
      totalCredit,
      totalPlaytime,
      withCard,
      withPremium,
      withVerified,
      withEmail,
      banned,
      maxRobux,
      maxRap,
      maxSpent,
      maxPlaytime,
      avgRobux: valid.length ? totalRobux / valid.length : 0,
    }
  }, [entries])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const pct = (n: number) =>
    stats.validCount ? `${Math.round((n / stats.validCount) * 100)}%` : "0%"

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-label="Overall statistics"
          className="w-full max-w-md overflow-hidden rounded-none border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
              <ChartBarIcon className="size-4 text-primary" weight="bold" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Overall Statistics</p>
              <p className="text-[11px] text-muted-foreground">
                {stats.total} cookies checked
                {checkDurationMs != null ? ` in ${fmtElapsed(checkDurationMs)}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={onClose}>
              <XIcon />
            </Button>
          </div>

          {/* Valid / Invalid bar */}
          <div className="border-b px-5 py-4">
            <div className="mb-2 flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats.validCount}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valid</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums text-destructive">
                  {stats.invalidCount}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Invalid
                </p>
              </div>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {stats.validCount > 0 && (
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(stats.validCount / stats.total) * 100}%` }}
                />
              )}
              {stats.invalidCount > 0 && (
                <div
                  className="h-full bg-destructive transition-all"
                  style={{ width: `${(stats.invalidCount / stats.total) * 100}%` }}
                />
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-3 divide-x border-b">
            <BigStat label="Total Robux" value={fmt(stats.totalRobux)} />
            <BigStat label="Total RAP" value={fmt(stats.totalRap)} />
            <BigStat label="Total Spent" value={fmt(stats.totalSpent)} />
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-3 divide-x border-b">
            <BigStat label="Total Credit" value={`$${stats.totalCredit.toFixed(2)}`} />
            <BigStat label="Avg Robux" value={fmt(Math.round(stats.avgRobux))} />
            <BigStat label="Weekly Playtime" value={fmtDuration(stats.totalPlaytime)} />
          </div>

          {/* Feature breakdown */}
          <div className="space-y-0 border-b">
            <FeatureRow
              icon={<CreditCardIcon className="size-3.5" />}
              label="Linked Card"
              count={stats.withCard}
              total={stats.validCount}
              pct={pct(stats.withCard)}
            />
            <FeatureRow
              icon={<CrownIcon className="size-3.5" />}
              label="Premium"
              count={stats.withPremium}
              total={stats.validCount}
              pct={pct(stats.withPremium)}
            />
            <FeatureRow
              icon={<ShieldCheckIcon className="size-3.5" />}
              label="Verified Badge"
              count={stats.withVerified}
              total={stats.validCount}
              pct={pct(stats.withVerified)}
            />
            <FeatureRow
              icon={<EnvelopeSimpleIcon className="size-3.5" />}
              label="Email Verified"
              count={stats.withEmail}
              total={stats.validCount}
              pct={pct(stats.withEmail)}
            />
            {stats.banned > 0 && (
              <FeatureRow
                icon={<WarningIcon className="size-3.5" />}
                label="Banned"
                count={stats.banned}
                total={stats.validCount}
                pct={pct(stats.banned)}
                destructive
              />
            )}
          </div>

          {/* Top accounts */}
          {stats.validCount > 1 && (
            <div className="px-5 py-3.5">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Top Accounts
              </p>
              <div className="space-y-1.5">
                {stats.maxRobux && stats.maxRobux.val > 0 && (
                  <TopRow
                    label="Richest"
                    name={stats.maxRobux.name}
                    value={`${fmt(stats.maxRobux.val)} R$`}
                  />
                )}
                {stats.maxRap && stats.maxRap.val > 0 && (
                  <TopRow
                    label="Highest RAP"
                    name={stats.maxRap.name}
                    value={`${fmt(stats.maxRap.val)} R$`}
                  />
                )}
                {stats.maxSpent && stats.maxSpent.val > 0 && (
                  <TopRow
                    label="Most Spent"
                    name={stats.maxSpent.name}
                    value={`${fmt(stats.maxSpent.val)} R$`}
                  />
                )}
                {stats.maxPlaytime && stats.maxPlaytime.val > 0 && (
                  <TopRow
                    label="Most Played"
                    name={stats.maxPlaytime.name}
                    value={fmtDuration(stats.maxPlaytime.val)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="font-mono text-base font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}

function FeatureRow({
  icon,
  label,
  count,
  total,
  pct,
  destructive,
}: {
  icon: React.ReactNode
  label: string
  count: number
  total: number
  pct: string
  destructive?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 text-xs">
      <span className={destructive ? "text-destructive" : "text-muted-foreground"}>{icon}</span>
      <span className="flex-1 font-medium">{label}</span>
      <span className="tabular-nums text-muted-foreground">
        {count}/{total}
      </span>
      <div className="w-16">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${destructive ? "bg-destructive" : "bg-primary"}`}
            style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }}
          />
        </div>
      </div>
      <span
        className={`w-8 text-right font-medium tabular-nums ${destructive ? "text-destructive" : ""}`}
      >
        {pct}
      </span>
    </div>
  )
}

function TopRow({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 truncate font-mono font-medium">{name}</span>
      <span className="shrink-0 font-mono tabular-nums text-primary">{value}</span>
    </div>
  )
}
