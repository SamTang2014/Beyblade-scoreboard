import { describe, expect, it } from 'vitest'
import { createQueue } from './queue'
import type { LiveClient, PushResult } from './remote'
import type { Tournament } from '../engine/types'

function tour(name: string): Tournament {
  return {
    id: 't1', name, createdAt: 0, updatedAt: 0,
    mode: 'roundRobin', cutSize: null, poolCount: null, advancePerPool: null,
    headToHead: false, live: null, players: [], matches: [],
  }
}

function client(results: PushResult[]): { c: LiveClient; sent: Tournament[] } {
  const sent: Tournament[] = []
  let i = 0
  const c = {
    async push(t: Tournament) {
      sent.push(t)
      return results[Math.min(i++, results.length - 1)]!
    },
  } as unknown as LiveClient
  return { c, sent }
}

describe('推送隊列', () => {
  it('推一次就推一次', async () => {
    const { c, sent } = client([{ ok: true, v: 1 }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    await q.drain()
    expect(sent.map((t) => t.name)).toEqual(['A'])
    expect(q.pending()).toBe(0)
  })

  /**
   * 連續入三次分，唔應該推三次 —— 最新嗰份已經包含晒之前嘅嘢。
   * 呢個唔止係慳流量：主辦入分入得好密，唔合併就會排一條長龍。
   */
  it('連續幾個改動只推最新嗰份', async () => {
    const { c, sent } = client([{ ok: true, v: 1 }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    q.push(tour('B'))
    q.push(tour('C'))
    await q.drain()
    expect(sent.map((t) => t.name)).toEqual(['C'])
  })

  it('網絡爆咗就留喺隊度，重連再推', async () => {
    const { c, sent } = client([{ ok: false, err: 'network' }, { ok: true, v: 2 }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    await q.drain()
    expect(q.pending()).toBe(1) // 仲喺度

    await q.drain()
    expect(sent.map((t) => t.name)).toEqual(['A', 'A'])
    expect(q.pending()).toBe(0)
  })

  it('跌咗位就唔好死撞 —— 停低等人處理', async () => {
    const { c, sent } = client([{ ok: false, err: 'not-holder' }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    await q.drain()
    await q.drain()
    // 試多次都冇用，段 script 一樣拒絕。
    expect(sent).toHaveLength(1)
    expect(q.pending()).toBe(1)
  })

  /**
   * bad-token = 張 sheet 換咗場（舊 token 死咗）。死撞冇用，
   * 而且唔停低嘅話個狀態會一路顯示「同步緊」，講緊大話。
   */
  it('條 link 死咗都唔好死撞', async () => {
    const { c, sent } = client([{ ok: false, err: 'bad-token' }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    await q.drain()
    await q.drain()
    expect(sent).toHaveLength(1)
  })

  it('攞返個位就解除死撞保護', async () => {
    const { c, sent } = client([{ ok: false, err: 'not-holder' }, { ok: true, v: 3 }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    await q.drain()
    q.unblock()
    await q.drain()
    expect(sent).toHaveLength(2)
    expect(q.pending()).toBe(0)
  })

  it('每次推都出返個結果俾人跟進', async () => {
    const seen: PushResult[] = []
    const { c } = client([{ ok: false, err: 'not-holder' }])
    const q = createQueue(c, 'dev1', (r) => seen.push(r))
    q.push(tour('A'))
    await q.drain()
    expect(seen).toEqual([{ ok: false, err: 'not-holder' }])
  })

  it('同一時間只准一個請求喺途中', async () => {
    let inFlight = 0
    let maxSeen = 0
    const c = {
      async push() {
        inFlight += 1
        maxSeen = Math.max(maxSeen, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight -= 1
        return { ok: true as const, v: 1 }
      },
    } as unknown as LiveClient

    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    const a = q.drain()
    q.push(tour('B'))
    const b = q.drain()
    await Promise.all([a, b])
    expect(maxSeen).toBe(1)
  })

  /** 推緊嗰陣又有新改動入隊 —— 唔可以連新嗰個一齊清走。 */
  it('推緊嗰陣入嘅新改動唔會俾人清走', async () => {
    let resolvePush: ((r: PushResult) => void) | null = null
    const c = {
      push: () => new Promise<PushResult>((res) => { resolvePush = res }),
    } as unknown as LiveClient

    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    const inFlight = q.drain()
    q.push(tour('B')) // 推緊 A 嗰陣入咗 B
    resolvePush!({ ok: true, v: 1 })
    await inFlight

    expect(q.pending()).toBe(1) // B 仲喺度
  })
})
