import { useEffect, useState } from 'react'

/**
 * Hash routing。用 hash 唔用 history API，因為 dist/ 係一堆靜態檔，
 * 直接 copy 上 UAT server 任何一個子目錄都跑到，唔使 server 配 rewrite。
 */

export type Route =
  | { name: 'home' }
  | { name: 'setup'; id: string }
  /** matchId 唔係 null 就係由賽程跳過嚟改嗰場，否則睇住第一場未打完嘅。 */
  | { name: 'console'; id: string; matchId: string | null }
  | { name: 'schedule'; id: string }
  | { name: 'table'; id: string }
  | { name: 'matrix'; id: string }
  | { name: 'bracket'; id: string }
  | { name: 'board'; id: string }
  /** 由分享 link 入嚟。payload 未解碼 —— 解碼係 Live.tsx 嘅事。 */
  | { name: 'live'; payload: string }

// 冇 `share` —— 分享設定收埋咗喺開賽設定（`setup`）入面，唔係獨立一頁。
// 「玩下」場完全見唔到，所以冇 tab、冇 route。
const SUB: Record<string, 'setup' | 'schedule' | 'table' | 'matrix' | 'bracket' | 'board'> = {
  setup: 'setup',
  schedule: 'schedule',
  table: 'table',
  matrix: 'matrix',
  bracket: 'bracket',
  board: 'board',
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)

  if (parts[0] === 'live') {
    const payload = parts[1]
    return payload === undefined ? { name: 'home' } : { name: 'live', payload }
  }

  if (parts[0] !== 't' || parts[1] === undefined) return { name: 'home' }

  const id = parts[1]
  const sub = parts[2]
  if (sub === undefined) return { name: 'console', id, matchId: null }
  if (sub === 'm') return { name: 'console', id, matchId: parts[3] ?? null }

  const name = SUB[sub]
  return name === undefined ? { name: 'console', id, matchId: null } : { name, id }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export function go(path: string): void {
  window.location.hash = path
}
