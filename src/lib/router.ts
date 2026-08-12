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
  /** id 係 null 就係由主頁入嚟嘅全局零件版 —— 唔使有場賽事都查到零件。 */
  | { name: 'parts'; id: string | null }
  /** 砌隊版同樣唔綁賽事 —— 選手賽前自己砌，同邊場波無關。 */
  | { name: 'team' }

const SUB: Record<
  string,
  'setup' | 'schedule' | 'table' | 'matrix' | 'bracket' | 'board' | 'parts'
> = {
  setup: 'setup',
  schedule: 'schedule',
  table: 'table',
  matrix: 'matrix',
  bracket: 'bracket',
  board: 'board',
  parts: 'parts',
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'parts') return { name: 'parts', id: null }
  if (parts[0] === 'team') return { name: 'team' }
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
