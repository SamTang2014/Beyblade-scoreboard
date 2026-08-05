import { describe, expect, it } from 'vitest'
import {
  afterClaim, afterPush, canEdit, dueForHeartbeat, HEARTBEAT_MS, LEASE_MS, seatLabel,
} from './seat'

const NOW = 1_000_000

describe('攞位之後', () => {
  it('攞到就係我嘅', () => {
    expect(afterClaim({ ok: true, until: NOW + LEASE_MS }, NOW)).toEqual({
      kind: 'mine', until: NOW + LEASE_MS,
    })
  })

  /**
   * 段 script 個鐘快咗／慢咗都唔會影響客戶端 —— 到期一律自己算。
   * 撈埋兩個鐘用嘅話，部機個鐘快 10 分鐘就會即刻「過咗期」，
   * 心跳成功都冇用，個介面一路鎖住。
   */
  it('唔理段 script 返嗰個 until，一律用自己個鐘', () => {
    expect(afterClaim({ ok: true, until: NOW + 999_999_999 }, NOW)).toEqual({
      kind: 'mine', until: NOW + LEASE_MS,
    })
  })

  it('有人坐緊', () => {
    expect(afterClaim({ ok: false, err: 'held', until: NOW + 1000 }, NOW)).toEqual({
      kind: 'theirs', until: NOW + 1000,
    })
  })

  it('網絡爆咗當冇位 —— 唔好扮自己坐緊', () => {
    expect(afterClaim({ ok: false, err: 'network' }, NOW)).toEqual({ kind: 'none' })
  })
})

describe('推完之後', () => {
  it('推得成就順手續咗期', () => {
    expect(afterPush({ kind: 'mine', until: NOW }, { ok: true, v: 5 }, NOW)).toEqual({
      kind: 'mine', until: NOW + LEASE_MS,
    })
  })

  it('俾人收咗位 → lost', () => {
    expect(
      afterPush({ kind: 'mine', until: NOW }, { ok: false, err: 'not-holder', until: 9 }, NOW),
    ).toEqual({ kind: 'lost' })
  })

  it('網絡爆咗唔算跌位 —— 個位好可能仲喺我度', () => {
    const cur = { kind: 'mine', until: NOW + LEASE_MS } as const
    expect(afterPush(cur, { ok: false, err: 'network' }, NOW)).toEqual(cur)
  })

  it('view token 寫唔到 —— 唔關個位事', () => {
    const cur = { kind: 'none' } as const
    expect(afterPush(cur, { ok: false, err: 'read-only' }, NOW)).toEqual(cur)
  })
})

describe('入唔入到分', () => {
  it('個位喺我度而且未過期', () => {
    expect(canEdit({ kind: 'mine', until: NOW + 1000 }, NOW)).toBe(true)
  })

  it('過咗期就唔准 —— 段 script 一樣會拒絕，前端唔好扮做得到', () => {
    expect(canEdit({ kind: 'mine', until: NOW - 1 }, NOW)).toBe(false)
  })

  it('人哋嘅位、冇位、跌咗位，全部唔准', () => {
    expect(canEdit({ kind: 'theirs', until: NOW + 1000 }, NOW)).toBe(false)
    expect(canEdit({ kind: 'none' }, NOW)).toBe(false)
    expect(canEdit({ kind: 'lost' }, NOW)).toBe(false)
  })
})

describe('心跳', () => {
  it('夠鐘就要續', () => {
    const mine = { kind: 'mine', until: NOW + LEASE_MS } as const
    expect(dueForHeartbeat(mine, NOW - HEARTBEAT_MS - 1, NOW)).toBe(true)
  })

  it('未夠鐘就唔使', () => {
    const mine = { kind: 'mine', until: NOW + LEASE_MS } as const
    expect(dueForHeartbeat(mine, NOW - 1000, NOW)).toBe(false)
  })

  it('唔係我嘅位就唔使續', () => {
    expect(dueForHeartbeat({ kind: 'theirs', until: NOW + LEASE_MS }, 0, NOW)).toBe(false)
    expect(dueForHeartbeat({ kind: 'none' }, 0, NOW)).toBe(false)
  })

  /**
   * 一個 round 打 3–5 分鐘，主辦部電話好大機會熄咗屏。
   *
   * ⚠ 熄屏唔止係 throttle —— iOS Safari 係**直接暫停晒 JS**，一個 timer 都唔跑。
   * 所以個位捱唔捱得過熄屏，靠嘅係有效期本身夠長，唔係靠心跳照跑。
   */
  it('有效期係心跳嘅 5 倍 —— 食得起一段真實嘅暫停', () => {
    expect(LEASE_MS / HEARTBEAT_MS).toBe(5)
  })
})

describe('狀態文字', () => {
  it('每個狀態都有句人話', () => {
    expect(seatLabel({ kind: 'mine', until: NOW + 1000 }, NOW)).toBe('你入緊分')
    expect(seatLabel({ kind: 'theirs', until: NOW + 1000 }, NOW)).toContain('第二部機')
    expect(seatLabel({ kind: 'lost' }, NOW)).toContain('收返')
    expect(seatLabel({ kind: 'none' }, NOW)).not.toBe('')
  })

  it('個位過咗期會叫你撳返接手 —— 唔好扮住仲入緊分', () => {
    expect(seatLabel({ kind: 'mine', until: NOW - 1 }, NOW)).toContain('過咗期')
  })

  it('四個狀態嘅文字兩兩唔同', () => {
    const all = [
      seatLabel({ kind: 'mine', until: NOW + 1000 }, NOW),
      seatLabel({ kind: 'theirs', until: NOW + 1000 }, NOW),
      seatLabel({ kind: 'lost' }, NOW),
      seatLabel({ kind: 'none' }, NOW),
    ]
    expect(new Set(all).size).toBe(4)
  })
})
