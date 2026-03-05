export interface TransactionItem {
  name: string
  type: string
  amount: number
  created: string
}

export interface PlaytimeEntry {
  universeId: number
  gameName: string
  weeklyMinutes: number
}

export interface DailyScreentime {
  daysAgo: number
  minutesPlayed: number
}

export interface ScreenTimeResult {
  weekly: DailyScreentime[]
  totalWeeklyMinutes: number
  perExperience: { universeId: number; weeklyMinutes: number }[]
}

export interface AccountInfo {
  valid: boolean
  user?: { id: number; name: string; displayName: string }
  robux?: number | null
  premium?: boolean | null
  rap?: number | null
  transactions?: TransactionItem[]
  totalSpent?: number | null
  created?: string | null
  isBanned?: boolean | null
  hasVerifiedBadge?: boolean | null
  creditBalance?: number | null
  hasLinkedCard?: boolean | null
  emailVerified?: boolean | null
  birthdate?: string | null
  pendingRobux?: number | null
  avatarUrl?: string | null
  screenTime?: ScreenTimeResult | null
  playtime?: PlaytimeEntry[]
  totalPlaytimeMinutes?: number
}

export interface CookieEntry {
  id: number
  value: string
  status: "pending" | "checking" | "done" | "error"
  result: AccountInfo | null
  error: string | null
}

export interface SpendGroup {
  type: string
  items: TransactionItem[]
  total: number
}

export type SortCol = "index" | "status" | "username" | "robux" | "rap" | "card" | "spent"
export type SortDir = "asc" | "desc"
export type FilterMode = "all" | "valid" | "invalid" | "pending"
