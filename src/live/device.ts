/**
 * 部機自己嘅嘢 —— 唔屬於任何一場賽事，所以擺喺自己嘅 localStorage key。
 *
 * 無痕視窗／封鎖咗 storage 嗰陣，讀寫會直接掟錯，所以全部包住 try。
 * 讀唔到就每次生一個新嘅 —— 咁樣個位會續唔到期，但唔會炸。
 */

const DEVICE_KEY = 'beyblade-scoreboard/device'
const SHEET_KEY = 'beyblade-scoreboard/sheet'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 存唔到就算 —— 唔值得為咗記個 id 而擋住主辦入分。
  }
}

function random(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

let cached: string | null = null

/** 呢部機嘅 id。段 script 用佢分邊部機坐緊入分位。 */
export function deviceId(): string {
  if (cached !== null) return cached
  const saved = read(DEVICE_KEY)
  if (saved !== null && saved !== '') {
    cached = saved
    return saved
  }
  const made = `dev-${random()}`
  write(DEVICE_KEY, made)
  cached = made
  return made
}

/**
 * 上次用嘅 sheet：條 script 網址 **同埋個 edit token**。
 *
 * 兩樣都要記。開第二場賽事嘅時候，個 app 要攞現有嘅 edit token 去認證，
 * 段 script 先肯換場 —— 新賽事本身 `live` 係 null，冇嘢攞得出嚟。
 * 淨係記 scriptId 嘅話，換場會永遠俾人答 already-init。
 */
export function savedSheet(): { scriptId: string; edit: string } | null {
  const raw = read(SHEET_KEY)
  if (raw === null || raw === '') return null
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const { scriptId, edit } = v as Record<string, unknown>
    if (typeof scriptId !== 'string' || scriptId === '') return null
    if (typeof edit !== 'string' || edit === '') return null
    return { scriptId, edit }
  } catch {
    return null
  }
}

export function rememberSheet(scriptId: string, edit: string): void {
  write(SHEET_KEY, JSON.stringify({ scriptId, edit }))
}

/** 有 prefix，主辦自己開張 sheet 望嗰陣一眼睇得出邊個係邊個。 */
export function newToken(prefix: 'edit' | 'view'): string {
  return `${prefix}-${random()}`
}
