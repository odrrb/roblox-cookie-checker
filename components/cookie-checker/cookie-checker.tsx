"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  CookieIcon,
  ClipboardTextIcon,
  PlayIcon,
  SpinnerIcon,
  CheckCircleIcon,
  XCircleIcon,
  CaretUpDownIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  TrashIcon,
  ChartBarIcon,
  UploadSimpleIcon,
  FileTextIcon,
  WarningCircleIcon,
  ArrowLeftIcon,
  ListChecksIcon,
  HourglassIcon,
  ShieldWarningIcon,
} from "@phosphor-icons/react"

import type { CookieEntry, SortCol, SortDir } from "./types"
import {
  DEFAULT_CONCURRENCY,
  CONCURRENCY_OPTIONS,
  fmt,
  fmtDuration,
  parseCookieLines,
  sortVal,
  fmtElapsed,
} from "./helpers"
import { DetailDialog } from "./detail-dialog"
import { StatsDialog } from "./stats-dialog"

const ROW_HEIGHT = 36
const GRID_COLS = "grid-cols-[36px_44px_1fr_80px_80px_48px_80px_72px]"

type ViewState = "input" | "progress" | "results" | "table"

interface CheckLog {
  ts: number
  type: "info" | "warn" | "error"
  msg: string
}

export function CookieChecker() {
  const [rawInput, setRawInput] = React.useState("")
  const [inputMode, setInputMode] = React.useState<"paste" | "file">("file")
  const [concurrency, setConcurrency] = React.useState(DEFAULT_CONCURRENCY)
  const [entries, setEntries] = React.useState<CookieEntry[]>([])
  const [checking, setChecking] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [sortCol, setSortCol] = React.useState<SortCol>("index")
  const [sortDir, setSortDir] = React.useState<SortDir>("asc")
  
  const [showStats, setShowStats] = React.useState(false)
  const [checkDurationMs, setCheckDurationMs] = React.useState<number | null>(null)
  const [detailsDurationMs, setDetailsDurationMs] = React.useState<number | null>(null)
  const [pendingDetailsLoad, setPendingDetailsLoad] = React.useState(false)
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [view, setView] = React.useState<ViewState>("input")
  const [logs, setLogs] = React.useState<CheckLog[]>([])
  const [rateLimitHits, setRateLimitHits] = React.useState(0)
  const [errorCount, setErrorCount] = React.useState(0)
  const [retryCount, setRetryCount] = React.useState(0)
  const abortRef = React.useRef(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const tableContainerRef = React.useRef<HTMLDivElement>(null)
  const startTimeRef = React.useRef(0)
  const [elapsed, setElapsed] = React.useState(0)

  const lines = React.useMemo(() => parseCookieLines(rawInput), [rawInput])
  const selected = entries.find((e) => e.id === selectedId) ?? null

  const summary = React.useMemo(() => {
    let valid = 0
    let invalid = 0
    let errors = 0
    for (const e of entries) {
      if (e.status === "done" && e.result?.valid) valid++
      else if (e.status === "done" && !e.result?.valid) invalid++
      else if (e.status === "error") errors++
    }
    return { total: entries.length, valid, invalid, errors, checked: valid + invalid + errors }
  }, [entries])

  React.useEffect(() => {
    if (!checking) return
    const id = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 200)
    return () => clearInterval(id)
  }, [checking])

  React.useEffect(() => {
    if (pendingDetailsLoad) {
      setPendingDetailsLoad(false)
      loadAllDetails()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDetailsLoad])

  const filtered = React.useMemo(() => {
    const arr = entries
      .map((e, i) => ({ entry: e, idx: i }))
      .filter(({ entry }) => entry.status === "done" && entry.result?.valid === true)
    arr.sort((a, b) => {
      const av = sortVal(a.entry, sortCol, a.idx)
      const bv = sortVal(b.entry, sortCol, b.idx)
      let cmp: number
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv
      else cmp = String(av).localeCompare(String(bv))
      return sortDir === "asc" ? cmp : -cmp
    })
    return arr
  }, [entries, sortCol, sortDir])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortCol(col); setSortDir("asc") }
  }

  const updateEntry = React.useCallback((id: number, patch: Partial<CookieEntry>) => {
    setEntries((prev) => {
      const next = [...prev]
      const idx = next.findIndex((e) => e.id === id)
      if (idx !== -1) next[idx] = { ...next[idx], ...patch }
      return next
    })
  }, [])

  function addLog(type: CheckLog["type"], msg: string) {
    setLogs((prev) => [...prev.slice(-49), { ts: Date.now(), type, msg }])
  }

  async function handleCheckAll() {
    const vals = parseCookieLines(rawInput)
    if (!vals.length) return

    abortRef.current = false
    const init: CookieEntry[] = vals.map((v, i) => ({
      id: i, value: v, status: "pending", result: null, error: null,
    }))

    setEntries(init)
    setChecking(true)
    setSelectedId(null)
    setCheckDurationMs(null)
    setDetailsDurationMs(null)
    setView("progress")
    setLogs([])
    setRateLimitHits(0)
    setErrorCount(0)
    setRetryCount(0)
    startTimeRef.current = Date.now()
    setElapsed(0)

    let cursor = 0

    async function worker() {
      while (cursor < init.length && !abortRef.current) {
        const i = cursor++
        updateEntry(i, { status: "checking" })
        let lastError: string | null = null
        let success = false

        for (let attempt = 0; attempt < 3 && !abortRef.current; attempt++) {
          try {
            const res = await fetch("/api/check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cookieValue: init[i].value }),
            })
            if (res.status === 429) {
              setRateLimitHits((c) => c + 1)
              setRetryCount((c) => c + 1)
              addLog("warn", `#${i + 1}: Rate limited — backing off`)
              await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000))
              continue
            }
            if (res.status === 502 || res.status === 503) {
              setRetryCount((c) => c + 1)
              addLog("warn", `#${i + 1}: Server ${res.status} — retrying`)
              await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt) + Math.random() * 500))
              continue
            }
            const data = await res.json()
            updateEntry(i, {
              status: data.error ? "error" : "done",
              result: data.error ? null : data,
              error: data.error ?? null,
            })
            if (data.error) {
              setErrorCount((c) => c + 1)
              addLog("error", `#${i + 1}: ${data.error}`)
            }
            success = true
            break
          } catch (err) {
            lastError = err instanceof Error ? err.message : "Network error"
            setRetryCount((c) => c + 1)
            addLog("warn", `#${i + 1}: ${lastError}`)
            if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
          }
        }
        if (!success && !abortRef.current) {
          setErrorCount((c) => c + 1)
          addLog("error", `#${i + 1}: Failed after retries`)
          updateEntry(i, { status: "error", error: lastError ?? "Failed after retries" })
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, init.length) }, () => worker()))
    const dur = Math.round(Date.now() - startTimeRef.current)
    setCheckDurationMs(dur)
    setChecking(false)
    setElapsed(dur)
    addLog("info", "Done")
    setView("results")
    setPendingDetailsLoad(true)
  }

  function loadFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === "string") setRawInput(reader.result.trim()) }
    reader.readAsText(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  function handleReset() {
    setEntries([])
    setSelectedId(null)
    abortRef.current = true
    detailsAbortRef.current = true
    setChecking(false)
    setView("input")
    setLogs([])
    setRateLimitHits(0)
    setErrorCount(0)
    setRetryCount(0)
    setDetailsLoading(false)
    setDetailsDurationMs(null)
  }

  const [detailsLoading, setDetailsLoading] = React.useState(false)
  const [detailsProgress, setDetailsProgress] = React.useState({ done: 0, total: 0 })
  const detailsAbortRef = React.useRef(false)

  async function fetchEntryDetails(entry: CookieEntry) {
    if (!entry.result?.valid || entry.result.detailsLoaded || entry.detailStatus === "loading") return
    updateEntry(entry.id, { detailStatus: "loading" })
    try {
      const res = await fetch("/api/check/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookieValue: entry.value, userId: entry.result.user!.id }),
      })
      const data = await res.json()
      if (data.error) {
        updateEntry(entry.id, { detailStatus: "error" })
      } else {
        setEntries((prev) => {
          const next = [...prev]
          const idx = next.findIndex((e) => e.id === entry.id)
          if (idx !== -1) {
            next[idx] = { ...next[idx], result: { ...next[idx].result!, ...data }, detailStatus: "done" }
          }
          return next
        })
      }
    } catch {
      updateEntry(entry.id, { detailStatus: "error" })
    }
    setDetailsProgress((p) => ({ ...p, done: p.done + 1 }))
  }

  async function loadAllDetails() {
    const valid = entries.filter((e) => e.status === "done" && e.result?.valid && !e.result.detailsLoaded && e.detailStatus !== "loading")
    if (!valid.length) return
    detailsAbortRef.current = false
    setDetailsLoading(true)
    setDetailsProgress({ done: 0, total: valid.length })

    const detailsStart = Date.now()
    let cursor = 0
    async function worker() {
      while (cursor < valid.length && !detailsAbortRef.current) {
        const entry = valid[cursor++]
        await fetchEntryDetails(entry)
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, valid.length) }, () => worker()))
    setDetailsDurationMs(Date.now() - detailsStart)
    setDetailsLoading(false)
  }

  function handleSelectRow(entry: CookieEntry) {
    if (entry.status !== "done" || !entry.result?.valid) return
    setSelectedId(entry.id)
  }

  function openTable() {
    setView("table")
  }

  const pct = summary.total > 0 ? (summary.checked / summary.total) * 100 : 0
  const remaining = summary.total - summary.checked
  const eta = checking && summary.checked > 0 ? Math.round((elapsed / summary.checked) * remaining) : null

  const isWide = view === "table"

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className={`mx-auto flex w-full flex-1 flex-col items-center justify-center px-4 ${isWide ? "max-w-4xl py-6" : "max-w-md"}`}>

        {/* INPUT */}
        {view === "input" && (
          <Card className="w-full">
            <CardContent className="p-4">
              <FieldGroup>
                <Field>
                  <FieldLabel className="text-xs">
                    <CookieIcon className="size-3.5" /> Cookies
                  </FieldLabel>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.cookie,.cookies"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center gap-1.5 rounded-md border-2 border-dashed px-3 py-4 text-center transition-colors ${
                      dragging
                        ? "border-primary bg-primary/5"
                        : fileName
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                    }`}
                  >
                    {fileName ? (
                      <>
                        <FileTextIcon className="size-5 text-primary" />
                        <p className="text-xs font-medium">{fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {lines.length} cookie{lines.length !== 1 ? "s" : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <UploadSimpleIcon className="size-5 text-muted-foreground" />
                        <p className="text-xs font-medium">
                          Drop file or <span className="text-primary">browse</span>
                        </p>
                        <p className="text-xs text-muted-foreground">.txt, .cookie, .cookies</p>
                      </>
                    )}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant={inputMode === "paste" ? "default" : "outline"}
                      size="xs"
                      onClick={() => setInputMode(inputMode === "paste" ? "file" : "paste")}
                      type="button"
                    >
                      <ClipboardTextIcon data-icon="inline-start" />
                      {inputMode === "paste" ? "Hide" : "Paste"}
                    </Button>
                    {fileName && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setFileName(null)
                          setRawInput("")
                          if (fileInputRef.current) fileInputRef.current.value = ""
                        }}
                        type="button"
                      >
                        <TrashIcon data-icon="inline-start" /> Remove
                      </Button>
                    )}
                  </div>
                  {inputMode === "paste" && (
                    <Textarea
                      placeholder="_|WARNING:...|_COOKIE1&#10;_|WARNING:...|_COOKIE2"
                      value={rawInput}
                      onChange={(e) => setRawInput(e.target.value)}
                      className="min-h-20 font-mono text-xs"
                    />
                  )}
                  {inputMode === "paste" && lines.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {lines.length} cookie{lines.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </Field>
                <Field>
                  <FieldLabel className="text-xs">Concurrency</FieldLabel>
                  <div className="flex items-center gap-1">
                    {CONCURRENCY_OPTIONS.map((n) => (
                      <Button
                        key={n}
                        variant={concurrency === n ? "default" : "outline"}
                        size="xs"
                        type="button"
                        onClick={() => setConcurrency(n)}
                        className="tabular-nums"
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Button onClick={handleCheckAll} disabled={!lines.length} size="sm">
                  <PlayIcon data-icon="inline-start" />
                  Check ({lines.length})
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        )}

        {/* PROGRESS */}
        {view === "progress" && (
          <Card className="w-full">
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Checking…</span>
                  <span className="tabular-nums text-muted-foreground">{summary.checked}/{summary.total}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="tabular-nums">{fmtElapsed(elapsed)}</span>
                  {eta != null && eta > 0 && <span className="tabular-nums">~{fmtElapsed(eta)} left</span>}
                </div>
              </div>

              <div className="divide-y border-y -mx-4">
                <StatCell label="Valid" value={summary.valid} color="text-emerald-500" icon={<CheckCircleIcon className="size-3" weight="bold" />} />
                <StatCell label="Invalid" value={summary.invalid} color="text-destructive" icon={<XCircleIcon className="size-3" weight="bold" />} />
                <StatCell label="Errors" value={summary.errors} color="text-orange-500" icon={<ShieldWarningIcon className="size-3" weight="bold" />} />
                <StatCell label="Remaining" value={remaining} icon={<HourglassIcon className="size-3" weight="bold" />} />
              </div>

              {(rateLimitHits > 0 || retryCount > 0) && (
                <div className="flex flex-wrap gap-3 text-xs">
                  {rateLimitHits > 0 && (
                    <span className="flex items-center gap-1 text-amber-500">
                      <WarningCircleIcon className="size-3.5" />
                      {rateLimitHits} rate limit{rateLimitHits !== 1 ? "s" : ""}
                    </span>
                  )}
                  {retryCount > 0 && (
                    <span className="text-muted-foreground">{retryCount} retries</span>
                  )}
                </div>
              )}

              {logs.length > 0 && (
                <div className="max-h-24 overflow-y-auto rounded border bg-muted/30 p-1.5 font-mono text-[10px] leading-relaxed">
                  {logs.map((l, i) => (
                    <div
                      key={i}
                      className={l.type === "error" ? "text-destructive" : l.type === "warn" ? "text-amber-500" : "text-muted-foreground"}
                    >
                      {l.msg}
                    </div>
                  ))}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => { abortRef.current = true; setChecking(false); setView("results") }}
              >
                Stop
              </Button>
            </CardContent>
          </Card>
        )}

        {/* RESULTS */}
        {view === "results" && (
          <Card className="w-full">
            <CardContent className="p-4 pb-0">
              <p className="text-xs font-medium">Complete</p>
              <p className="text-xs text-muted-foreground">
                {summary.total} checked in {checkDurationMs != null ? fmtElapsed(checkDurationMs) : "—"}
              </p>
            </CardContent>

            <div className="divide-y border-y">
              <StatCell label="Valid" value={summary.valid} color="text-emerald-500" icon={<CheckCircleIcon className="size-3" weight="bold" />} />
              <StatCell label="Invalid" value={summary.invalid} color="text-destructive" icon={<XCircleIcon className="size-3" weight="bold" />} />
              <StatCell label="Errors" value={summary.errors} color="text-orange-500" icon={<ShieldWarningIcon className="size-3" weight="bold" />} />
              <StatCell
                label="Rate Limits"
                value={rateLimitHits}
                color={rateLimitHits > 0 ? "text-amber-500" : undefined}
                icon={<WarningCircleIcon className="size-3" weight="bold" />}
              />
            </div>

            {(detailsLoading || detailsDurationMs != null) && (
              <div className="border-t px-4 py-3">
                {detailsLoading ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <SpinnerIcon className="size-3 animate-spin" />
                        Loading details…
                      </span>
                      <span className="tabular-nums">{detailsProgress.done}/{detailsProgress.total}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: detailsProgress.total > 0 ? `${(detailsProgress.done / detailsProgress.total) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircleIcon className="size-3 text-emerald-500" weight="bold" />
                    Details loaded in {fmtElapsed(detailsDurationMs!)}
                  </p>
                )}
              </div>
            )}

            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap gap-1.5">
                {summary.valid > 0 && (
                  <Button size="sm" onClick={openTable}>
                    <ListChecksIcon data-icon="inline-start" />
                    Valid ({summary.valid})
                  </Button>
                )}
                {summary.checked > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setShowStats(true)}>
                    <ChartBarIcon data-icon="inline-start" />
                    Stats
                  </Button>
                )}
              </div>

              <div className="border-t pt-3">
                <Button variant="ghost" size="xs" onClick={handleReset}>
                  <ArrowLeftIcon data-icon="inline-start" /> New Check
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TABLE */}
        {view === "table" && (
          <div className="w-full space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <Button variant="ghost" size="xs" onClick={() => setView("results")}>
                <ArrowLeftIcon data-icon="inline-start" /> Back
              </Button>
              <span className="tabular-nums font-medium">{summary.valid} valid</span>
              {detailsDurationMs != null && (
                <span className="text-muted-foreground tabular-nums">details in {fmtElapsed(detailsDurationMs)}</span>
              )}
              <div className="ml-auto">
                <Button variant="outline" size="xs" onClick={() => setShowStats(true)}>
                  <ChartBarIcon data-icon="inline-start" /> Stats
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                {detailsLoading && (
                  <div className="border-b px-3 py-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <SpinnerIcon className="size-3 animate-spin" />
                        Loading details…
                      </span>
                      <span className="tabular-nums">{detailsProgress.done}/{detailsProgress.total}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: detailsProgress.total > 0 ? `${(detailsProgress.done / detailsProgress.total) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>
                )}
                <div className={`grid ${GRID_COLS} border-b px-3 text-xs text-muted-foreground`}>
                  <ColHeader col="index" label="#" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="status" label="Status" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="username" label="Username" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="robux" label="Robux" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="rap" label="RAP" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="card" label="Card" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="spent" label="Spent" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="playtime" label="Playtime" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                </div>

                <div ref={tableContainerRef} className="max-h-[500px] overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No valid cookies
                    </div>
                  ) : (
                    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                      {virtualizer.getVirtualItems().map((vr) => {
                        const { entry, idx } = filtered[vr.index]
                        return (
                          <VirtualRow
                            key={entry.id}
                            entry={entry}
                            idx={idx}
                            isSelected={selectedId === entry.id}
                            onSelect={handleSelectRow}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: ROW_HEIGHT,
                              transform: `translateY(${vr.start}px)`,
                            }}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>

                {filtered.length > 0 && (
                  <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                    {filtered.length} of {entries.length}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <footer className="py-2 text-center text-xs text-muted-foreground/40">
        v{process.env.APP_VERSION}
      </footer>

      {selected && selected.result?.valid && (
        <DetailDialog entry={selected} onClose={() => setSelectedId(null)} />
      )}
      {showStats && (
        <StatsDialog entries={entries} checkDurationMs={checkDurationMs} onClose={() => setShowStats(false)} />
      )}
    </div>
  )
}

function StatCell({ label, value, color, icon }: { label: string; value: number; color?: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className={`flex size-7 shrink-0 items-center justify-center rounded-full bg-muted ${color ?? "text-muted-foreground"}`}>
        {icon}
      </div>
      <span className="flex-1 text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm font-bold tabular-nums ${color ?? ""}`}>{value}</span>
    </div>
  )
}


function DetailVal({ entry, render }: { entry: CookieEntry; render: (r: NonNullable<CookieEntry["result"]>) => React.ReactNode }) {
  const r = entry.result
  if (!r?.valid) return <span className="text-muted-foreground">—</span>
  if (!r.detailsLoaded) {
    if (entry.detailStatus === "loading") return <SpinnerIcon className="size-3 animate-spin text-muted-foreground" />
    if (entry.detailStatus === "error") return <span className="text-destructive">err</span>
    return <span className="text-muted-foreground">…</span>
  }
  return <>{render(r)}</>
}

const VirtualRow = React.memo(function VirtualRow({
  entry, idx, isSelected, onSelect, style,
}: {
  entry: CookieEntry; idx: number; isSelected: boolean; onSelect: (entry: CookieEntry) => void; style: React.CSSProperties
}) {
  const v = entry.result?.valid
  const u = entry.result?.user

  return (
    <div
      role="row"
      style={style}
      onClick={() => entry.status === "done" && onSelect(entry)}
      className={`grid ${GRID_COLS} cursor-pointer items-center border-b border-dashed px-3 text-xs transition-colors ${
        isSelected ? "bg-muted/60" : "hover:bg-muted/30"
      }`}
    >
      <span className="tabular-nums text-muted-foreground">{idx + 1}</span>
      <span><StatusIcon status={entry.status} valid={entry.result?.valid} /></span>
      <span className="truncate font-mono">{v && u ? u.name : "—"}</span>
      <span className="font-mono tabular-nums">
        <DetailVal entry={entry} render={(r) => fmt(r.robux)} />
      </span>
      <span className="font-mono tabular-nums">
        <DetailVal entry={entry} render={(r) => fmt(r.rap)} />
      </span>
      <span>
        <DetailVal entry={entry} render={(r) => <CardBadge linked={r.hasLinkedCard} />} />
      </span>
      <span className="font-mono tabular-nums">
        <DetailVal entry={entry} render={(r) => fmt(r.totalSpent)} />
      </span>
      <span className="font-mono tabular-nums">
        <DetailVal entry={entry} render={(r) => r.totalPlaytimeMinutes != null ? fmtDuration(r.totalPlaytimeMinutes) : "—"} />
      </span>
    </div>
  )
})

function ColHeader({ col, label, sortCol, sortDir, toggle }: {
  col: SortCol; label: string; sortCol: SortCol; sortDir: SortDir; toggle: (c: SortCol) => void
}) {
  const Icon = sortCol !== col
    ? <CaretUpDownIcon className="size-3 opacity-40" />
    : sortDir === "asc"
      ? <SortAscendingIcon className="size-3" />
      : <SortDescendingIcon className="size-3" />

  return (
    <button className="flex cursor-pointer select-none items-center gap-0.5 py-2 font-medium" onClick={() => toggle(col)}>
      {label} {Icon}
    </button>
  )
}

function StatusIcon({ status, valid }: { status: CookieEntry["status"]; valid?: boolean }) {
  if (status === "pending") return <span className="text-muted-foreground">—</span>
  if (status === "checking") return <SpinnerIcon className="size-3.5 animate-spin text-muted-foreground" />
  if (status === "error") return <XCircleIcon className="size-3.5 text-destructive" />
  if (valid) return <CheckCircleIcon className="size-3.5 text-primary" weight="fill" />
  return <XCircleIcon className="size-3.5 text-destructive" weight="fill" />
}

function CardBadge({ linked }: { linked: boolean | null | undefined }) {
  if (linked == null) return <span className="text-muted-foreground">—</span>
  if (linked) return <span className="text-xs font-medium text-primary">Yes</span>
  return <span className="text-xs font-medium text-muted-foreground">No</span>
}
