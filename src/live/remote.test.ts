import { describe, expect, it, vi } from 'vitest'
import { createClient } from './remote'
import type { Tournament } from '../engine/types'

const T: Tournament = {
  id: 't1', name: '測試', createdAt: 0, updatedAt: 0,
  mode: 'roundRobin', cutSize: null, poolCount: null, advancePerPool: null,
  headToHead: false, live: null, players: [], matches: [],
}

/** 假 fetch：答一段 JSON，順手記低人哋點打佢。 */
function fakeFetch(body: unknown) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('拉資料', () => {
  it('拉到新版本', async () => {
    const f = fakeFetch({ ok: true, role: 'view', v: 7, t: T })
    const r = await createClient('S1', 'k1', f).get(null)
    expect(r).toEqual({ ok: true, role: 'view', v: 7, t: T })
  })

  it('版本冇變，t 係 null', async () => {
    const f = fakeFetch({ ok: true, role: 'edit', v: 7 })
    const r = await createClient('S1', 'k1', f).get(7)
    expect(r).toEqual({ ok: true, role: 'edit', v: 7, t: null })
  })

  it('條 URL 帶住 token、since、fresh', async () => {
    const f = fakeFetch({ ok: true, role: 'view', v: 1 })
    await createClient('S1', 'k1', f).get(3, true)
    const url = String(vi.mocked(f).mock.calls[0]![0])
    expect(url).toContain('/macros/s/S1/exec')
    expect(url).toContain('k=k1')
    expect(url).toContain('since=3')
    expect(url).toContain('fresh=1')
  })

  it('冇 since 就唔會塞個 since 落條 URL', async () => {
    const f = fakeFetch({ ok: true, role: 'view', v: 1 })
    await createClient('S1', 'k1', f).get(null)
    expect(String(vi.mocked(f).mock.calls[0]![0])).not.toContain('since=')
  })

  it('token 唔啱', async () => {
    const r = await createClient('S1', 'bad', fakeFetch({ ok: false, err: 'bad-token' })).get(null)
    expect(r).toEqual({ ok: false, err: 'bad-token' })
  })

  /** 入分 link 嗰部機要靠呢個先派得出觀眾 link。段 script 淨係派俾 edit。 */
  it('edit 收到 view token，view 收唔到', async () => {
    const asEdit = await createClient('S1', 'e', fakeFetch({
      ok: true, role: 'edit', v: 1, t: T, view: 'view-b',
    })).get(null)
    expect(asEdit.ok && asEdit.view).toBe('view-b')

    const asView = await createClient('S1', 'v', fakeFetch({
      ok: true, role: 'view', v: 1, t: T,
    })).get(null)
    expect(asView.ok && asView.view).toBeUndefined()
  })
})

describe('推資料', () => {
  it('推得成', async () => {
    const f = fakeFetch({ ok: true, v: 8 })
    expect(await createClient('S1', 'k1', f).push(T, 'dev1')).toEqual({ ok: true, v: 8 })
  })

  it('body 一定要係 text/plain —— 唔係會撞 CORS preflight', async () => {
    const f = fakeFetch({ ok: true, v: 8 })
    await createClient('S1', 'k1', f).push(T, 'dev1')
    const init = vi.mocked(f).mock.calls[0]![1]!
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
    expect(JSON.parse(String(init.body))).toEqual({ k: 'k1', who: 'dev1', t: T })
  })

  it('個位唔喺我度', async () => {
    const f = fakeFetch({ ok: false, err: 'not-holder', holder: 'dev2', until: 999 })
    expect(await createClient('S1', 'k1', f).push(T, 'dev1')).toEqual({
      ok: false, err: 'not-holder', until: 999,
    })
  })

  it('view token 寫唔到嘢', async () => {
    const f = fakeFetch({ ok: false, err: 'read-only' })
    expect(await createClient('S1', 'v1', f).push(T, 'dev1')).toEqual({
      ok: false, err: 'read-only',
    })
  })
})

describe('攞位', () => {
  it('攞到', async () => {
    const f = fakeFetch({ ok: true, until: 12345 })
    expect(await createClient('S1', 'k1', f).claim('dev1', false)).toEqual({
      ok: true, until: 12345,
    })
  })

  it('有人坐緊', async () => {
    const f = fakeFetch({ ok: false, err: 'held', until: 999 })
    expect(await createClient('S1', 'k1', f).claim('dev1', false)).toEqual({
      ok: false, err: 'held', until: 999,
    })
  })

  it('force 傳得上去', async () => {
    const f = fakeFetch({ ok: true, until: 1 })
    await createClient('S1', 'k1', f).claim('dev1', true)
    expect(JSON.parse(String(vi.mocked(f).mock.calls[0]![1]!.body))).toEqual({
      action: 'claim', k: 'k1', who: 'dev1', force: true,
    })
  })
})

describe('網絡爆咗', () => {
  it('fetch 掟錯 → network', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await createClient('S1', 'k1', f).get(null)).toEqual({ ok: false, err: 'network' })
  })

  it('HTTP 唔係 200 → network', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
    expect(await createClient('S1', 'k1', f).get(null)).toEqual({ ok: false, err: 'network' })
  })

  it('答返嚟唔係 JSON → bad-response', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('not json')
      },
    })) as unknown as typeof fetch
    expect(await createClient('S1', 'k1', f).get(null)).toEqual({ ok: false, err: 'bad-response' })
  })

  it('答返嚟係 JSON 但唔似嘢 → bad-response', async () => {
    // Apps Script 出錯嗰陣會答一版 HTML；fetch 一樣 ok，但 JSON 解唔出上面啲 field。
    const f = fakeFetch({ hello: 'world' })
    expect(await createClient('S1', 'k1', f).get(null)).toEqual({ ok: false, err: 'bad-response' })
  })
})
