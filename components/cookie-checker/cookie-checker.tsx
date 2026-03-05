"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  FunnelIcon,
  UploadSimpleIcon,
  FileTextIcon,
} from "@phosphor-icons/react"

import type { CookieEntry, FilterMode, SortCol, SortDir } from "./types"
import {
  DEFAULT_CONCURRENCY,
  CONCURRENCY_OPTIONS,
  fmt,
  matchesFilter,
  parseCookieLines,
  sortVal,
} from "./helpers"
import { DetailDialog } from "./detail-dialog"
import { StatsDialog } from "./stats-dialog"

const ROW_HEIGHT = 40
const GRID_COLS = "grid-cols-[48px_56px_1fr_100px_100px_64px_100px]"

export function CookieChecker() {
  const [rawInput, setRawInput] = React.useState("")
  const [inputMode, setInputMode] = React.useState<"paste" | "file">("file")
  const [concurrency, setConcurrency] = React.useState(DEFAULT_CONCURRENCY)
  const [entries, setEntries] = React.useState<CookieEntry[]>([])
  const [checking, setChecking] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [sortCol, setSortCol] = React.useState<SortCol>("index")
  const [sortDir, setSortDir] = React.useState<SortDir>("asc")
  const [filter, setFilter] = React.useState<FilterMode>("all")
  const [showStats, setShowStats] = React.useState(false)
  const [checkDurationMs, setCheckDurationMs] = React.useState<number | null>(null)
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const abortRef = React.useRef(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const tableContainerRef = React.useRef<HTMLDivElement>(null)

  const lines = React.useMemo(() => parseCookieLines(rawInput), [rawInput])
  const selected = entries.find((e) => e.id === selectedId) ?? null

  const summary = React.useMemo(() => {
    let valid = 0
    let invalid = 0
    for (const e of entries) {
      if (e.status === "done" && e.result?.valid) valid++
      else if (e.status === "done" || e.status === "error") invalid++
    }
    return { total: entries.length, valid, invalid, checked: valid + invalid }
  }, [entries])

  const filtered = React.useMemo(() => {
    const arr = entries
      .map((e, i) => ({ entry: e, idx: i }))
      .filter(({ entry }) => matchesFilter(entry, filter))

    arr.sort((a, b) => {
      const av = sortVal(a.entry, sortCol, a.idx)
      const bv = sortVal(b.entry, sortCol, b.idx)
      let cmp: number
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv
      else cmp = String(av).localeCompare(String(bv))
      return sortDir === "asc" ? cmp : -cmp
    })
    return arr
  }, [entries, sortCol, sortDir, filter])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortCol(col)
      setSortDir("asc")
    }
  }

  const updateEntry = React.useCallback((id: number, patch: Partial<CookieEntry>) => {
    setEntries((prev) => {
      const next = [...prev]
      const idx = next.findIndex((e) => e.id === id)
      if (idx !== -1) next[idx] = { ...next[idx], ...patch }
      return next
    })
  }, [])

  async function handleCheckAll() {
    const vals = parseCookieLines(rawInput)
    if (!vals.length) return

    abortRef.current = false
    const init: CookieEntry[] = vals.map((v, i) => ({
      id: i,
      value: v,
      status: "pending",
      result: null,
      error: null,
    }))

    setEntries(init)
    setChecking(true)
    setSelectedId(null)
    setCheckDurationMs(null)

    const t0 = performance.now()
    let cursor = 0

    async function worker() {
      while (cursor < init.length && !abortRef.current) {
        const i = cursor++
        updateEntry(i, { status: "checking" })
        try {
          const res = await fetch("/api/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cookieValue: init[i].value }),
          })
          const data = await res.json()
          updateEntry(i, {
            status: data.error ? "error" : "done",
            result: data.error ? null : data,
            error: data.error ?? null,
          })
        } catch (err) {
          updateEntry(i, {
            status: "error",
            error: err instanceof Error ? err.message : "Error",
          })
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, init.length) }, () => worker()),
    )
    setCheckDurationMs(Math.round(performance.now() - t0))
    setChecking(false)
  }

  function loadFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") setRawInput(reader.result.trim())
    }
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

  function handleClear() {
    setEntries([])
    setSelectedId(null)
    setFilter("all")
    abortRef.current = true
    setChecking(false)
  }

  const hasResults = entries.length > 0

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          {/* Input */}
          <Card>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>
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
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                      dragging
                        ? "border-primary bg-primary/5"
                        : fileName
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                    }`}
                  >
                    {fileName ? (
                      <>
                        <FileTextIcon className="size-6 text-primary" />
                        <div>
                          <p className="text-xs font-medium">{fileName}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {lines.length} cookie{lines.length !== 1 ? "s" : ""} detected
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <UploadSimpleIcon className="size-6 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium">
                            Drop your file here or <span className="text-primary">browse</span>
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            .txt, .cookie, .cookies
                          </p>
                        </div>
                      </>
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={inputMode === "paste" ? "default" : "outline"}
                      size="xs"
                      onClick={() => setInputMode(inputMode === "paste" ? "file" : "paste")}
                      type="button"
                    >
                      <ClipboardTextIcon data-icon="inline-start" />
                      {inputMode === "paste" ? "Hide paste" : "Or paste manually"}
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
                        <TrashIcon data-icon="inline-start" /> Remove file
                      </Button>
                    )}
                  </div>
                  {inputMode === "paste" && (
                    <Textarea
                      placeholder={
                        "_|WARNING:...|_COOKIE1\n_|WARNING:...|_COOKIE2\n_|WARNING:...|_COOKIE3"
                      }
                      value={rawInput}
                      onChange={(e) => setRawInput(e.target.value)}
                      className="min-h-24 font-mono text-[11px]"
                    />
                  )}
                  {inputMode === "paste" && lines.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {lines.length} cookie{lines.length !== 1 ? "s" : ""} detected
                    </p>
                  )}
                </Field>
                <Field>
                  <FieldLabel>Concurrency</FieldLabel>
                  <div className="flex items-center gap-1">
                    {CONCURRENCY_OPTIONS.map((n) => (
                      <Button
                        key={n}
                        variant={concurrency === n ? "default" : "outline"}
                        size="xs"
                        type="button"
                        disabled={checking}
                        onClick={() => setConcurrency(n)}
                        className="tabular-nums"
                      >
                        {n}
                      </Button>
                    ))}
                    <ConcurrencyInput
                      concurrency={concurrency}
                      setConcurrency={setConcurrency}
                      disabled={checking}
                    />
                  </div>
                </Field>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCheckAll}
                    disabled={checking || !lines.length}
                    className="flex-1"
                  >
                    {checking ? (
                      <SpinnerIcon className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <PlayIcon data-icon="inline-start" />
                    )}
                    {checking ? "Checking..." : `Check All (${lines.length})`}
                  </Button>
                  {checking && (
                    <Button variant="outline" onClick={() => (abortRef.current = true)}>
                      Stop
                    </Button>
                  )}
                  {hasResults && !checking && (
                    <Button variant="outline" onClick={handleClear}>
                      <TrashIcon data-icon="inline-start" /> Clear
                    </Button>
                  )}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Progress + Filters */}
          {hasResults && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs">
              <span className="font-medium tabular-nums">
                {summary.checked}/{summary.total}
              </span>
              {summary.valid > 0 && <Badge variant="default">{summary.valid} valid</Badge>}
              {summary.invalid > 0 && (
                <Badge variant="destructive">{summary.invalid} invalid</Badge>
              )}
              {checking && (
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(summary.checked / summary.total) * 100}%` }}
                  />
                </div>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <FunnelIcon className="size-3.5 text-muted-foreground" />
                <FilterButtons filter={filter} setFilter={setFilter} summary={summary} />
                {!checking && summary.checked > 0 && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setShowStats(true)}
                    className="ml-1"
                  >
                    <ChartBarIcon data-icon="inline-start" /> Statistics
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Virtualized Table */}
          {hasResults && (
            <Card className="flex-1">
              <CardContent className="p-0">
                {/* Header */}
                <div
                  className={`grid ${GRID_COLS} border-b px-4 text-xs text-muted-foreground`}
                >
                  <ColHeader col="index" label="#" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="status" label="Valid" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="username" label="Username" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="robux" label="Robux" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="rap" label="RAP" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="card" label="Card" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                  <ColHeader col="spent" label="Spent" toggle={toggleSort} sortCol={sortCol} sortDir={sortDir} />
                </div>

                {/* Rows */}
                <div
                  ref={tableContainerRef}
                  className="max-h-[600px] overflow-y-auto"
                >
                  {filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-xs text-muted-foreground">
                        {filter !== "all"
                          ? `No ${filter} cookies to show`
                          : "No results yet"}
                      </p>
                    </div>
                  ) : (
                    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                      {virtualizer.getVirtualItems().map((virtualRow) => {
                        const { entry, idx } = filtered[virtualRow.index]
                        return (
                          <VirtualRow
                            key={entry.id}
                            entry={entry}
                            idx={idx}
                            isSelected={selectedId === entry.id}
                            onSelect={setSelectedId}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: ROW_HEIGHT,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>

                {filtered.length > 0 && (
                  <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
                    Showing {filtered.length} of {entries.length} cookies
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {selected && selected.result?.valid && (
        <DetailDialog entry={selected} onClose={() => setSelectedId(null)} />
      )}
      {showStats && (
        <StatsDialog
          entries={entries}
          checkDurationMs={checkDurationMs}
          onClose={() => setShowStats(false)}
        />
      )}
    </div>
  )
}

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "valid", label: "Valid" },
  { value: "invalid", label: "Invalid" },
  { value: "pending", label: "Pending" },
]

function FilterButtons({
  filter,
  setFilter,
  summary,
}: {
  filter: FilterMode
  setFilter: (f: FilterMode) => void
  summary: { total: number; valid: number; invalid: number; checked: number }
}) {
  function countFor(mode: FilterMode): number {
    switch (mode) {
      case "all":
        return summary.total
      case "valid":
        return summary.valid
      case "invalid":
        return summary.invalid
      case "pending":
        return summary.total - summary.checked
    }
  }

  return (
    <div className="flex gap-0.5">
      {FILTER_OPTIONS.map(({ value, label }) => {
        const count = countFor(value)
        if (value !== "all" && count === 0) return null
        return (
          <Button
            key={value}
            variant={filter === value ? "default" : "ghost"}
            size="xs"
            onClick={() => setFilter(value)}
            className="tabular-nums"
          >
            {label}
            <span className="ml-1 opacity-60">{count}</span>
          </Button>
        )
      })}
    </div>
  )
}

const VirtualRow = React.memo(function VirtualRow({
  entry,
  idx,
  isSelected,
  onSelect,
  style,
}: {
  entry: CookieEntry
  idx: number
  isSelected: boolean
  onSelect: (id: number) => void
  style: React.CSSProperties
}) {
  const v = entry.result?.valid
  const u = entry.result?.user

  return (
    <div
      role="row"
      style={style}
      onClick={() => entry.status === "done" && onSelect(entry.id)}
      className={`grid ${GRID_COLS} cursor-pointer items-center border-b border-dashed px-4 text-xs transition-colors ${
        isSelected ? "bg-muted/60" : "hover:bg-muted/30"
      }`}
    >
      <span className="tabular-nums text-muted-foreground">{idx + 1}</span>
      <span>
        <StatusIcon status={entry.status} valid={entry.result?.valid} />
      </span>
      <span className="truncate font-mono">{v && u ? u.name : "—"}</span>
      <span className="font-mono tabular-nums">{v ? fmt(entry.result!.robux) : "—"}</span>
      <span className="font-mono tabular-nums">{v ? fmt(entry.result!.rap) : "—"}</span>
      <span>{v ? <CardBadge linked={entry.result!.hasLinkedCard} /> : "—"}</span>
      <span className="font-mono tabular-nums">{v ? fmt(entry.result!.totalSpent) : "—"}</span>
    </div>
  )
})

function ColHeader({
  col,
  label,
  sortCol,
  sortDir,
  toggle,
}: {
  col: SortCol
  label: string
  sortCol: SortCol
  sortDir: SortDir
  toggle: (c: SortCol) => void
}) {
  const Icon =
    sortCol !== col ? (
      <CaretUpDownIcon className="size-3 opacity-40" />
    ) : sortDir === "asc" ? (
      <SortAscendingIcon className="size-3" />
    ) : (
      <SortDescendingIcon className="size-3" />
    )

  return (
    <button
      className="flex cursor-pointer select-none items-center gap-1 py-2.5 font-medium"
      onClick={() => toggle(col)}
    >
      {label} {Icon}
    </button>
  )
}

function StatusIcon({ status, valid }: { status: CookieEntry["status"]; valid?: boolean }) {
  if (status === "pending") return <span className="text-muted-foreground">—</span>
  if (status === "checking")
    return <SpinnerIcon className="size-3.5 animate-spin text-muted-foreground" />
  if (status === "error") return <XCircleIcon className="size-4 text-destructive" />
  if (valid) return <CheckCircleIcon className="size-4 text-primary" weight="fill" />
  return <XCircleIcon className="size-4 text-destructive" weight="fill" />
}

function CardBadge({ linked }: { linked: boolean | null | undefined }) {
  if (linked == null) return <span className="text-muted-foreground">—</span>
  if (linked) return <span className="text-[10px] font-medium text-primary">Yes</span>
  return <span className="text-[10px] font-medium text-muted-foreground">No</span>
}

function ConcurrencyInput({
  concurrency,
  setConcurrency,
  disabled,
}: {
  concurrency: number
  setConcurrency: (n: number) => void
  disabled: boolean
}) {
  const isPreset = CONCURRENCY_OPTIONS.includes(concurrency as typeof CONCURRENCY_OPTIONS[number])
  const [draft, setDraft] = React.useState("")
  const [focused, setFocused] = React.useState(false)

  React.useEffect(() => {
    if (!focused) setDraft(isPreset ? "" : String(concurrency))
  }, [concurrency, isPreset, focused])

  function commit() {
    setFocused(false)
    const v = parseInt(draft, 10)
    if (!isNaN(v) && v >= 1 && v <= 50) {
      setConcurrency(v)
    } else {
      setDraft(isPreset ? "" : String(concurrency))
      if (draft === "") setConcurrency(DEFAULT_CONCURRENCY)
    }
  }

  return (
    <Input
      type="number"
      min={1}
      max={50}
      placeholder="Custom"
      value={draft}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit() }}
      className="h-6 w-18 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  )
}
