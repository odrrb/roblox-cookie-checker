import { NextRequest, NextResponse } from "next/server"

const COOKIE_NAME = ".ROBLOSECURITY"
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

const MAX_RETRIES = 2
const BASE_DELAY_MS = 600

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function robloxFetch(
  url: string,
  cookie: string,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const res = await fetch(url, {
        headers: { Cookie: cookie, "User-Agent": UA },
        redirect: "follow",
        signal: ctrl.signal,
        cache: "no-store",
      })
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < retries) {
          const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10)
          const delayMs = !isNaN(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200
          await sleep(Math.min(delayMs, 8_000))
          continue
        }
      }
      return res
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr ?? new Error("robloxFetch failed")
}

async function jsonOrNull<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

interface Paginated<T> {
  data: T[]
  nextPageCursor?: string | null
}

interface TransactionItem {
  name: string
  type: string
  game: string
  amount: number
  created: string
}

interface RawTransaction {
  id: number
  transactionType: string
  created: string
  isPending: boolean
  agent?: { id: number; type: string; name: string } | null
  details?: { id: number; name: string; type: string } | null
  currency?: { amount: number; type: string } | null
}

async function fetchRAP(userId: number, cookie: string): Promise<number | null> {
  let total = 0
  let cursor: string | null = null
  for (let i = 0; i < 10; i++) {
    const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100${cursor ? `&cursor=${cursor}` : ""}`
    try {
      const res = await robloxFetch(url, cookie, 1)
      if (!res.ok) break
      const d = await jsonOrNull<Paginated<{ recentAveragePrice?: number }>>(res)
      if (!d?.data) break
      for (const item of d.data) total += item.recentAveragePrice ?? 0
      cursor = d.nextPageCursor ?? null
      if (!cursor) break
    } catch {
      break
    }
  }
  return total
}

async function fetchTransactions(userId: number, cookie: string): Promise<TransactionItem[]> {
  const txns: TransactionItem[] = []
  let cursor: string | null = null
  for (let i = 0; i < 20; i++) {
    const url = `https://economy.roblox.com/v2/users/${userId}/transactions?transactionType=Purchase&limit=100&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ""}`
    try {
      const res = await robloxFetch(url, cookie, 1)
      if (!res.ok) break
      const d = await jsonOrNull<Paginated<RawTransaction>>(res)
      if (!d?.data) break
      for (const t of d.data) {
        txns.push({
          name: t.details?.name ?? "Unknown",
          type: t.details?.type ?? "Unknown",
          game: t.agent?.name ?? "Unknown",
          amount: Math.abs(t.currency?.amount ?? 0),
          created: t.created,
        })
      }
      cursor = d.nextPageCursor ?? null
      if (!cursor) break
    } catch {
      break
    }
  }
  return txns
}

interface DailyScreentime { daysAgo: number; minutesPlayed: number }

interface ScreenTimeResult {
  weekly: DailyScreentime[]
  totalWeeklyMinutes: number
  perExperience: { universeId: number; weeklyMinutes: number }[]
}

async function fetchScreenTime(userId: number, cookie: string): Promise<ScreenTimeResult | null> {
  const result: ScreenTimeResult = { weekly: [], totalWeeklyMinutes: 0, perExperience: [] }
  const [weeklyRes, topRes] = await Promise.allSettled([
    robloxFetch(
      `https://apis.roblox.com/parental-controls-api/v1/parental-controls/get-weekly-screentime?userId=${userId}`,
      cookie, 1,
    ),
    robloxFetch(
      `https://apis.roblox.com/parental-controls-api/v1/parental-controls/get-top-weekly-screentime-by-universe?userId=${userId}`,
      cookie, 1,
    ),
  ])
  if (weeklyRes.status === "fulfilled" && weeklyRes.value.ok) {
    const d = await jsonOrNull<{ dailyScreentimes: DailyScreentime[] }>(weeklyRes.value)
    if (d?.dailyScreentimes) {
      result.weekly = d.dailyScreentimes
      result.totalWeeklyMinutes = d.dailyScreentimes.reduce((s, e) => s + e.minutesPlayed, 0)
    }
  }
  if (topRes.status === "fulfilled" && topRes.value.ok) {
    const d = await jsonOrNull<{
      universeWeeklyScreentimes: { universeId: number; weeklyMinutes: number }[]
    }>(topRes.value)
    if (d?.universeWeeklyScreentimes) result.perExperience = d.universeWeeklyScreentimes
  }
  if (result.weekly.length === 0 && result.perExperience.length === 0) return null
  return result
}

async function resolveUniverseNames(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (!ids.length) return map
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 50) {
    try {
      const uids = unique.slice(i, i + 50).join(",")
      const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${uids}`, {
        headers: { "User-Agent": UA },
        cache: "no-store",
      })
      if (res.ok) {
        const d = await jsonOrNull<{ data: { id: number; name: string }[] }>(res)
        if (d?.data) for (const g of d.data) map.set(g.id, g.name)
      }
    } catch { /* skip */ }
  }
  return map
}

function sanitize(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/[\r\n\t]/g, "").trim()
}

export async function POST(request: NextRequest) {
  let body: { cookieValue: string; userId: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const cookieValue = sanitize(body.cookieValue ?? "")
  const userId = body.userId
  if (!cookieValue || !userId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 })
  }

  const cookie = `${COOKIE_NAME}=${cookieValue}`

  try {
    const [
      currencyRes,
      userInfoRes,
      avatarRes,
      premiumRes,
      rapResult,
      txnsResult,
      creditRes,
      emailRes,
      birthdateRes,
      txnTotalsRes,
      paymentProfilesRes,
      screenTimeResult,
    ] = await Promise.allSettled([
      robloxFetch("https://economy.roblox.com/v1/user/currency", cookie, 1),
      robloxFetch(`https://users.roblox.com/v1/users/${userId}`, cookie, 1),
      fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
        { headers: { "User-Agent": UA }, cache: "no-store" },
      ),
      robloxFetch(`https://premiumfeatures.roblox.com/v1/users/${userId}/validate`, cookie, 1),
      fetchRAP(userId, cookie),
      fetchTransactions(userId, cookie),
      robloxFetch("https://billing.roblox.com/v1/credit", cookie, 1),
      robloxFetch("https://accountsettings.roblox.com/v1/email", cookie, 1),
      robloxFetch("https://accountinformation.roblox.com/v1/birthdate", cookie, 1),
      robloxFetch(
        `https://economy.roblox.com/v2/users/${userId}/transaction-totals?timeFrame=Year&transactionType=summary`,
        cookie, 1,
      ),
      robloxFetch("https://apis.roblox.com/payments-gateway/v1/payment-profiles", cookie, 1),
      fetchScreenTime(userId, cookie),
    ])

    const currency =
      currencyRes.status === "fulfilled" && currencyRes.value.ok
        ? await jsonOrNull<{ robux: number }>(currencyRes.value)
        : null

    interface UserInfo { created?: string; isBanned?: boolean; hasVerifiedBadge?: boolean }
    let userInfo: UserInfo | null = null
    if (userInfoRes.status === "fulfilled" && userInfoRes.value.ok) {
      userInfo = await jsonOrNull<UserInfo>(userInfoRes.value)
    }

    let avatarUrl: string | null = null
    if (avatarRes.status === "fulfilled" && avatarRes.value.ok) {
      const d = await jsonOrNull<{ data: { imageUrl: string }[] }>(avatarRes.value)
      avatarUrl = d?.data?.[0]?.imageUrl ?? null
    }

    let premium: boolean | null = null
    if (premiumRes.status === "fulfilled" && premiumRes.value.ok) {
      try {
        premium = (await premiumRes.value.text()).trim() === "true"
      } catch { /* ignore */ }
    }

    const transactions = txnsResult.status === "fulfilled" ? txnsResult.value : []
    const totalSpent = transactions.reduce((s, t) => s + t.amount, 0)

    const screenTime = screenTimeResult.status === "fulfilled" ? screenTimeResult.value : null
    const universeIds = screenTime?.perExperience.map((e) => e.universeId) ?? []
    const universeNameMap = universeIds.length > 0
      ? await resolveUniverseNames(universeIds)
      : new Map<number, string>()

    const playtime = (screenTime?.perExperience ?? [])
      .map((pe) => ({
        universeId: pe.universeId,
        gameName: universeNameMap.get(pe.universeId) ?? `Universe ${pe.universeId}`,
        weeklyMinutes: pe.weeklyMinutes,
      }))
      .sort((a, b) => b.weeklyMinutes - a.weeklyMinutes)

    const totalPlaytimeMinutes = playtime.reduce((s, e) => s + e.weeklyMinutes, 0)

    let creditBalance: number | null = null
    if (creditRes.status === "fulfilled" && creditRes.value.ok) {
      const d = await jsonOrNull<{ balance: number }>(creditRes.value)
      creditBalance = d?.balance ?? null
    }

    let emailVerified: boolean | null = null
    if (emailRes.status === "fulfilled" && emailRes.value.ok) {
      const d = await jsonOrNull<{ verified: boolean }>(emailRes.value)
      emailVerified = d?.verified ?? null
    }

    let birthdate: string | null = null
    if (birthdateRes.status === "fulfilled" && birthdateRes.value.ok) {
      const d = await jsonOrNull<{ birthMonth: number; birthDay: number; birthYear: number }>(birthdateRes.value)
      if (d) birthdate = `${d.birthMonth}/${d.birthDay}/${d.birthYear}`
    }

    let pendingRobux: number | null = null
    if (txnTotalsRes.status === "fulfilled" && txnTotalsRes.value.ok) {
      const d = await jsonOrNull<{ pendingRobuxTotal: number }>(txnTotalsRes.value)
      if (d) pendingRobux = d.pendingRobuxTotal
    }

    let hasLinkedCard: boolean | null = null
    if (paymentProfilesRes.status === "fulfilled") {
      const ppRes = paymentProfilesRes.value
      if (ppRes.ok) {
        const d = await jsonOrNull<unknown>(ppRes)
        if (Array.isArray(d)) {
          hasLinkedCard = d.length > 0
        } else if (d && typeof d === "object" && "data" in d && Array.isArray((d as { data: unknown[] }).data)) {
          hasLinkedCard = (d as { data: unknown[] }).data.length > 0
        } else {
          hasLinkedCard = d != null
        }
      }
    }

    return NextResponse.json({
      robux: currency?.robux ?? null,
      created: userInfo?.created ?? null,
      isBanned: userInfo?.isBanned ?? null,
      hasVerifiedBadge: userInfo?.hasVerifiedBadge ?? null,
      avatarUrl,
      premium,
      rap: rapResult.status === "fulfilled" ? rapResult.value : null,
      transactions,
      totalSpent,
      creditBalance,
      hasLinkedCard,
      emailVerified,
      birthdate,
      pendingRobux,
      screenTime,
      playtime,
      totalPlaytimeMinutes,
      detailsLoaded: true,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
