import { scriptUrl } from './payload'
import type { Tournament } from '../engine/types'

/**
 * 同段 Apps Script 講嘢。純傳輸 —— 冇 state、冇 timer、唔識 React。
 *
 * `fetchImpl` 係為咗測試接得到假嘢入嚟。
 */

export type LiveErr =
  | 'bad-token'
  | 'read-only'
  | 'not-holder'
  | 'held'
  | 'already-init'
  | 'busy'
  | 'bad-data'
  | 'bad-body'
  | 'bad-who'
  | 'network'
  | 'bad-response'

export type GetResult =
  /** `view` 淨係 edit token 收到 —— 佢要靠呢個先派得出觀眾 link。 */
  | { ok: true; role: 'edit' | 'view'; v: number; t: Tournament | null; view?: string }
  | { ok: false; err: LiveErr }

export type PushResult = { ok: true; v: number } | { ok: false; err: LiveErr; until?: number }

export type ClaimResult = { ok: true; until: number } | { ok: false; err: LiveErr; until?: number }

export interface LiveClient {
  get(since: number | null, fresh?: boolean): Promise<GetResult>
  push(t: Tournament, who: string): Promise<PushResult>
  claim(who: string, force: boolean): Promise<ClaimResult>
  release(who: string): Promise<void>
  init(edit: string, view: string, t: Tournament): Promise<PushResult>
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** 段 script 出錯嗰陣會答一版 HTML —— 所以收到嘢都要驗過先算數。 */
function errOf(v: Record<string, unknown>): LiveErr {
  return typeof v.err === 'string' ? (v.err as LiveErr) : 'bad-response'
}

export function createClient(
  scriptId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): LiveClient {
  const base = scriptUrl(scriptId)

  async function call(url: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
    let res: Response
    try {
      res = await fetchImpl(url, init)
    } catch {
      return null // 網絡爆咗
    }
    if (!res.ok) return null
    try {
      const body: unknown = await res.json()
      return isObject(body) ? body : {}
    } catch {
      return {} // 收到嘢但唔係 JSON
    }
  }

  /**
   * POST 一定要用 `text/plain`。
   *
   * 用 `application/json` 會令瀏覽器先射一個 `OPTIONS` preflight，
   * 而 Apps Script 唔識答 OPTIONS —— 個請求會靜靜雞失敗，
   * 而且喺 console 睇落好似 CORS 設定問題，查極都查唔到。
   */
  function post(body: unknown): RequestInit {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    }
  }

  return {
    async get(since, fresh = false) {
      const q = new URLSearchParams({ k: token })
      if (since !== null) q.set('since', String(since))
      if (fresh) q.set('fresh', '1')

      const body = await call(`${base}?${q.toString()}`)
      if (body === null) return { ok: false, err: 'network' }
      if (body.ok !== true) {
        return { ok: false, err: body.ok === false ? errOf(body) : 'bad-response' }
      }
      const role = body.role
      if (role !== 'edit' && role !== 'view') return { ok: false, err: 'bad-response' }
      if (typeof body.v !== 'number') return { ok: false, err: 'bad-response' }

      const out: GetResult = {
        ok: true,
        role,
        v: body.v,
        t: (body.t as Tournament | undefined) ?? null,
      }
      if (typeof body.view === 'string') out.view = body.view
      return out
    },

    async push(t, who) {
      const body = await call(base, post({ k: token, who, t }))
      if (body === null) return { ok: false, err: 'network' }
      if (body.ok === true && typeof body.v === 'number') return { ok: true, v: body.v }
      if (body.ok !== false) return { ok: false, err: 'bad-response' }
      return typeof body.until === 'number'
        ? { ok: false, err: errOf(body), until: body.until }
        : { ok: false, err: errOf(body) }
    },

    async claim(who, force) {
      const body = await call(base, post({ action: 'claim', k: token, who, force }))
      if (body === null) return { ok: false, err: 'network' }
      if (body.ok === true && typeof body.until === 'number') return { ok: true, until: body.until }
      if (body.ok !== false) return { ok: false, err: 'bad-response' }
      return typeof body.until === 'number'
        ? { ok: false, err: errOf(body), until: body.until }
        : { ok: false, err: errOf(body) }
    },

    async release(who) {
      // 收唔到都唔緊要 —— 個位過咗期一樣會放。
      await call(base, post({ action: 'release', k: token, who }))
    },

    async init(edit, view, t) {
      const body = await call(base, post({ action: 'init', k: token, edit, view, t }))
      if (body === null) return { ok: false, err: 'network' }
      if (body.ok === true && typeof body.v === 'number') return { ok: true, v: body.v }
      return { ok: false, err: body.ok === false ? errOf(body) : 'bad-response' }
    },
  }
}
