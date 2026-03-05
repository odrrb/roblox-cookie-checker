"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  XIcon,
  CreditCardIcon,
  CrownIcon,
  ShieldCheckIcon,
  EnvelopeSimpleIcon,
  WarningIcon,
  CheckCircleIcon,
  XCircleIcon,
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

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <Card
          className="w-full max-w-md overflow-hidden"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Header */}
          <CardContent className="flex items-center gap-3 border-b p-4">
            <div className="flex-1">
              <p className="text-xs font-medium">Statistics</p>
              <p className="text-xs text-muted-foreground">
                {stats.total} checked{checkDurationMs != null ? ` in ${fmtElapsed(checkDurationMs)}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={onClose}>
              <XIcon />
            </Button>
          </CardContent>

          {/* Valid / Invalid */}
          <div className="border-b px-4 py-3">
            <div className="mb-2 flex items-end justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-full bg-muted text-emerald-500">
                  <CheckCircleIcon className="size-3" weight="bold" />
                </div>
                <div>
                  <p className="font-mono text-sm font-bold tabular-nums">{stats.validCount}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Valid</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <p className="font-mono text-sm font-bold tabular-nums text-destructive text-right">{stats.invalidCount}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Invalid</p>
                </div>
                <div className="flex size-7 items-center justify-center rounded-full bg-muted text-destructive">
                  <XCircleIcon className="size-3" weight="bold" />
                </div>
              </div>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
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
            <GridCell label="Total Robux" value={fmt(stats.totalRobux)} />
            <GridCell label="Total RAP" value={fmt(stats.totalRap)} />
            <GridCell label="Total Spent" value={fmt(stats.totalSpent)} />
          </div>
          <div className="grid grid-cols-3 divide-x border-b">
            <GridCell label="Avg Robux" value={fmt(Math.round(stats.avgRobux))} />
            <GridCell label="Playtime" value={fmtDuration(stats.totalPlaytime)} />
            <GridCell label="Avg Spent" value={fmt(Math.round(stats.validCount ? stats.totalSpent / stats.validCount : 0))} />
          </div>

          {/* Features */}
          <div className="divide-y border-b">
            <FeatureRow icon={<CreditCardIcon className="size-3.5" />} label="Linked Card" count={stats.withCard} total={stats.validCount} />
            <FeatureRow icon={<CrownIcon className="size-3.5" />} label="Premium" count={stats.withPremium} total={stats.validCount} />
            <FeatureRow icon={<ShieldCheckIcon className="size-3.5" />} label="Verified Badge" count={stats.withVerified} total={stats.validCount} />
            <FeatureRow icon={<EnvelopeSimpleIcon className="size-3.5" />} label="Email Verified" count={stats.withEmail} total={stats.validCount} />
            {stats.banned > 0 && (
              <FeatureRow icon={<WarningIcon className="size-3.5" />} label="Banned" count={stats.banned} total={stats.validCount} destructive />
            )}
          </div>

          {/* Top accounts */}
          {stats.validCount > 1 && (
            <CardContent className="p-4">
              <p className="mb-2 text-[9px] uppercase tracking-wider text-muted-foreground">Top Accounts</p>
              <div className="space-y-1.5">
                {stats.maxRobux && stats.maxRobux.val > 0 && (
                  <TopRow label="Richest" name={stats.maxRobux.name} value={`${fmt(stats.maxRobux.val)} R$`} />
                )}
                {stats.maxRap && stats.maxRap.val > 0 && (
                  <TopRow label="Top RAP" name={stats.maxRap.name} value={`${fmt(stats.maxRap.val)} R$`} />
                )}
                {stats.maxSpent && stats.maxSpent.val > 0 && (
                  <TopRow label="Top Spent" name={stats.maxSpent.name} value={`${fmt(stats.maxSpent.val)} R$`} />
                )}
                {stats.maxPlaytime && stats.maxPlaytime.val > 0 && (
                  <TopRow label="Most Played" name={stats.maxPlaytime.name} value={fmtDuration(stats.maxPlaytime.val)} />
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </>
  )
}

function GridCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p className="font-mono text-xs font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}

function FeatureRow({
  icon, label, count, total, destructive,
}: {
  icon: React.ReactNode; label: string; count: number; total: number; destructive?: boolean
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className={destructive ? "text-destructive" : "text-muted-foreground"}>{icon}</span>
      <span className="flex-1 text-xs">{label}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{count}/{total}</span>
      <div className="w-12">
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${destructive ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className={`w-7 text-right text-xs font-medium tabular-nums ${destructive ? "text-destructive" : ""}`}>
        {pct}%
      </span>
    </div>
  )
}

function TopRow({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="flex-1 truncate font-mono font-medium">{name}</span>
      <span className="shrink-0 font-mono tabular-nums text-primary">{value}</span>
    </div>
  )
}
