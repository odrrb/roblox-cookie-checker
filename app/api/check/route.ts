import { NextRequest, NextResponse } from "next/server"

const COOKIE_NAME = ".ROBLOSECURITY"
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

const MAX_RETRIES = 3
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

function sanitize(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/[\r\n\t]/g, "").trim()
}

export async function POST(request: NextRequest) {
  let body: { cookieValue: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const cookieValue = sanitize(body.cookieValue ?? "")
  if (!cookieValue) {
    return NextResponse.json({ error: "Missing cookie value" }, { status: 400 })
  }

  const cookie = `${COOKIE_NAME}=${cookieValue}`

  try {
    const authRes = await robloxFetch("https://users.roblox.com/v1/users/authenticated", cookie)

    if (authRes.status === 401 || authRes.status === 403) {
      return NextResponse.json({ valid: false })
    }
    if (authRes.status === 429) {
      return NextResponse.json(
        { error: "Rate limited – lower concurrency" },
        { status: 429 },
      )
    }
    if (authRes.status !== 200) {
      return NextResponse.json(
        { error: `Roblox returned ${authRes.status}` },
        { status: 502 },
      )
    }

    const auth = await jsonOrNull<{ id: number; name: string; displayName: string }>(authRes)
    if (!auth?.id) return NextResponse.json({ valid: false })

    const userId = auth.id

    const [currencyRes, userInfoRes, avatarRes] = await Promise.allSettled([
      robloxFetch("https://economy.roblox.com/v1/user/currency", cookie, 1),
      robloxFetch(`https://users.roblox.com/v1/users/${userId}`, cookie, 1),
      fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
        { headers: { "User-Agent": UA }, cache: "no-store" },
      ),
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

    return NextResponse.json({
      valid: true,
      user: { id: auth.id, name: auth.name, displayName: auth.displayName },
      robux: currency?.robux ?? null,
      created: userInfo?.created ?? null,
      isBanned: userInfo?.isBanned ?? null,
      hasVerifiedBadge: userInfo?.hasVerifiedBadge ?? null,
      avatarUrl,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const isTimeout = err instanceof DOMException && err.name === "AbortError"
    return NextResponse.json(
      { error: isTimeout ? "Request timed out" : message },
      { status: 502 },
    )
  }
}
