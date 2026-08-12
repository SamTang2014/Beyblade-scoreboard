import { useCallback, useEffect, useRef, useState } from 'react'
import { parseBlades, parseCsv, parseParts, type BladeRow, type PartRow } from './parts'

/**
 * 零件資料庫嘅拉取同快取。
 *
 * 資料源係一張第三方嘅公開 Google Sheet，即場拉 —— 唔做 build 時快照，
 * 因為張 sheet 成日更新，快照即刻就過時。代價係開版要等網絡，所以行
 * stale-while-revalidate：有 cache 就即刻出畫面，同時背後拉新嘅。
 *
 * 拉唔到唔算災難 —— 手上有幾日前嘅資料一樣查得，畫面標明幾舊就得。
 */

const SHEET_ID = '1TBHOpcsv25bBfWERq14CBIy4P1G7j-qpPhmclx_nTWI'
const BASE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`

// 戰刃嗰個 tab 攞到 gid，用 gid 穩陣啲（改咗 tab 名都仲拉到）；
// 零件圖鑑嗰個 gid 攞唔到，唯有用 tab 名 —— owner 改名呢邊就會斷。
const BLADES_URL = `${BASE}&gid=101080139`
const PARTS_URL = `${BASE}&sheet=${encodeURIComponent('零件圖鑑')}`

const KEY = 'beyblade-scoreboard/parts-cache'

export interface PartsData {
  /** 幾時拉嘅（epoch ms）—— 用嚟同用戶講手上呢份幾舊。 */
  at: number
  blades: BladeRow[]
  parts: PartRow[]
}

function isStringy(v: unknown, keys: string[]): boolean {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return keys.every((k) => typeof o[k] === 'string')
}

/**
 * cache 入面啲嘢舊版寫落、或者俾人手改過都有可能 —— 認唔出就當冇，
 * 好過將一堆 undefined 派落去 render。
 */
function isPartsData(v: unknown): v is PartsData {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o['at'] !== 'number' || !Number.isFinite(o['at'])) return false
  if (!Array.isArray(o['blades']) || !Array.isArray(o['parts'])) return false
  return (
    o['blades'].every((b) => isStringy(b, ['id', 'name', 'tier'])) &&
    o['parts'].every((p) => isStringy(p, ['name', 'kind', 'tier']))
  )
}

export function readCache(): PartsData | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isPartsData(parsed) ? parsed : null
  } catch {
    // 壞 JSON、無痕視窗、封鎖咗 storage —— 一律當冇 cache，照去拉。
    return null
  }
}

export function writeCache(d: PartsData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // 爆 quota 或者存唔到 —— 呢份資料唔係用戶嘅嘢，唔值得為咗佢炸個版。
  }
}

async function grab(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`攞唔到零件資料（${res.status}）`)
  return await res.text()
}

/** 兩個 tab 一齊拉；任何一邊拉唔到／欄名對唔上都當成拉唔到。 */
export async function fetchPartsData(now: number): Promise<PartsData> {
  const [bladeCsv, partCsv] = await Promise.all([grab(BLADES_URL), grab(PARTS_URL)])
  const blades = parseBlades(parseCsv(bladeCsv))
  const parts = parseParts(parseCsv(partCsv))
  // 一邊有一邊冇會出半個資料庫，用戶會以為隻零件冇咗 —— 寧願話拉唔到。
  if (blades === null || parts === null) throw new Error('零件資料嘅欄位對唔上')
  return { at: now, blades, parts }
}

export type PartsState = 'loading' | 'fresh' | 'stale' | 'error'

export function usePartsData(): { data: PartsData | null; state: PartsState; retry: () => void } {
  const [data, setData] = useState<PartsData | null>(() => readCache())
  const [state, setState] = useState<PartsState>('loading')
  const [attempt, setAttempt] = useState(0)

  // 拉失敗嗰陣要知手上有冇嘢（有就係 stale，冇就係 error）。effect 唔跟住
  // data 重跑，所以 closure 入面嗰個 data 會係舊嘅 —— 要用 ref 攞現貨。
  const latest = useRef(data)
  latest.current = data

  useEffect(() => {
    let live = true
    setState('loading')

    fetchPartsData(Date.now())
      .then((fresh) => {
        if (!live) return
        writeCache(fresh)
        setData(fresh)
        setState('fresh')
      })
      .catch(() => {
        if (!live) return
        setState(latest.current === null ? 'error' : 'stale')
      })

    // 撳咗返主頁先拉完就唔好再 setState —— React 會嘈，而且個版已經冇咗。
    return () => {
      live = false
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { data, state, retry }
}
