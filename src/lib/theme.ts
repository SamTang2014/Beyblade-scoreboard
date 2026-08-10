/**
 * 場地燈光（深色／淺色主題）。
 *
 * 兩個主題喺呢個 app 有實際理由，唔係口味問題：比賽通常喺商場、模型店
 * 呢啲光猛地方舉行，主持人攞住部電話企喺度撳，淺色睇得清楚啲；夜場、
 * 或者部電視擺喺暗角落，就要熄燈。所以介面叫佢「場地燈光」唔叫「主題」。
 *
 * 純 function + 兩個 storage helper，唔掂 DOM —— 接線係 useTheme 嘅事。
 */

const KEY = 'beyblade-scoreboard/theme'

/** `auto` = 跟部機（系統設定）。 */
export type ThemePref = 'auto' | 'light' | 'dark'

export type Theme = 'light' | 'dark'

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === 'auto') return systemDark ? 'dark' : 'light'
  return pref
}

/*
  個偏好係**部機層面**嘅嘢，兩個地方要讀：App（落 class、聽部機日夜轉）
  同 ThemePicker（俾人揀）。兩邊各自 useState 就會各有各 state ——
  喺 picker 揀完，App 嗰份仲係舊嘅。所以擺喺 module 度做一份，
  用 useSyncExternalStore 訂閱。
*/
const listeners = new Set<() => void>()
let current: ThemePref | null = null

export function subscribePref(fn: () => void): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function getPref(): ThemePref {
  current ??= readPref()
  return current
}

export function setPref(p: ThemePref): void {
  current = p
  writePref(p)
  for (const fn of listeners) fn()
}

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    // 無痕視窗／封鎖咗 storage —— 跟部機就算，唔值得為咗記個主題而炸。
    return 'auto'
  }
}

export function writePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    // 記唔到就今次 session 用住先。
  }
}
