import { describe, expect, it } from 'vitest'
import {
  byesInRound,
  circleFrame,
  generateSchedule,
  inPlayOrder,
  isPureCircleSchedule,
  mergeSchedule,
  totalMatches,
  totalRounds,
} from './schedule'
import { matchKey } from './rules'
import type { Match, Player } from './types'

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `選手${i + 1}`,
    seat: i,
  }))
}

/** 一輪入面嘅配對，唔理藍紅邊同次序。 */
function pairsInRound(matches: Match[], round: number): string[] {
  return matches
    .filter((m) => m.round === round)
    .map((m) => matchKey(m.aId, m.bId))
    .sort()
}

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 21]

describe('圓周法排程', () => {
  it('4 人排出嚟同手寫圓周法一模一樣', () => {
    const s = generateSchedule(players(4))
    expect(pairsInRound(s, 1)).toEqual(['p1__p4', 'p2__p3'])
    expect(pairsInRound(s, 2)).toEqual(['p1__p3', 'p2__p4'])
    expect(pairsInRound(s, 3)).toEqual(['p1__p2', 'p3__p4'])
  })

  it('少過 2 個人排唔到賽程', () => {
    expect(generateSchedule([])).toEqual([])
    expect(generateSchedule(players(1))).toEqual([])
  })

  it.each(SIZES)('%i 人：總場數係 n(n-1)/2', (n) => {
    expect(generateSchedule(players(n))).toHaveLength(totalMatches(n))
    expect(totalMatches(n)).toBe((n * (n - 1)) / 2)
  })

  it.each(SIZES)('%i 人：每對人啱啱撞一次，一次都唔少一次都唔多', (n) => {
    const s = generateSchedule(players(n))
    const seen = s.map((m) => matchKey(m.aId, m.bId))
    expect(new Set(seen).size).toBe(seen.length) // 冇重複

    const expected: string[] = []
    const ps = players(n)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) expected.push(matchKey(ps[i]!.id, ps[j]!.id))
    }
    expect([...seen].sort()).toEqual(expected.sort())
  })

  it.each(SIZES)('%i 人：同一輪入面冇人要打兩場', (n) => {
    const s = generateSchedule(players(n))
    const rounds = new Set(s.map((m) => m.round))
    for (const r of rounds) {
      const ids = s.filter((m) => m.round === r).flatMap((m) => [m.aId, m.bId])
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it.each(SIZES)('%i 人：輪數啱（雙數 n-1，單數 n）', (n) => {
    const s = generateSchedule(players(n))
    expect(Math.max(...s.map((m) => m.round))).toBe(totalRounds(n))
  })

  it.each([3, 5, 7, 9, 11, 21])('%i 人（單數）：每個人啱啱輪空一次', (n) => {
    const ps = players(n)
    const s = generateSchedule(ps)
    const byeCount = new Map<string, number>(ps.map((p) => [p.id, 0]))

    for (let r = 1; r <= totalRounds(n); r++) {
      const byes = byesInRound(s, ps, r)
      expect(byes).toHaveLength(1)
      byeCount.set(byes[0]!.id, byeCount.get(byes[0]!.id)! + 1)
    }

    for (const p of ps) expect(byeCount.get(p.id)).toBe(1)
  })

  it.each([4, 6, 8, 10, 12])('%i 人（雙數）：冇人輪空', (n) => {
    const ps = players(n)
    const s = generateSchedule(ps)
    for (let r = 1; r <= totalRounds(n); r++) {
      expect(byesInRound(s, ps, r)).toEqual([])
    }
  })

  it.each([4, 5, 6, 7, 8, 10])('%i 人：冇人成日都係同一邊', (n) => {
    const s = generateSchedule(players(n))
    for (const p of players(n)) {
      const asBlue = s.filter((m) => m.aId === p.id).length
      const asRed = s.filter((m) => m.bId === p.id).length
      expect(asBlue).toBeGreaterThan(0)
      expect(asRed).toBeGreaterThan(0)
    }
  })

  it.each(SIZES)('%i 人：藍紅邊分得平，人人相差唔多過 1 場', (n) => {
    const s = generateSchedule(players(n))
    for (const p of players(n)) {
      const asBlue = s.filter((m) => m.aId === p.id).length
      const asRed = s.filter((m) => m.bId === p.id).length
      expect(Math.abs(asBlue - asRed)).toBeLessThanOrEqual(1)
    }
  })

  it('每輪入面嘅場次次序由 1 開始連續', () => {
    const s = generateSchedule(players(7))
    for (let r = 1; r <= totalRounds(7); r++) {
      const orders = s.filter((m) => m.round === r).map((m) => m.order).sort((a, b) => a - b)
      expect(orders).toEqual(orders.map((_, i) => i + 1))
    }
  })

  it('場次 id 只睇對戰雙方，同輪次次序無關', () => {
    const a = generateSchedule(players(6))
    const b = generateSchedule([...players(6)].reverse())
    expect(new Set(a.map((m) => m.id))).toEqual(new Set(b.map((m) => m.id)))
  })
})

describe('轉盤畫面', () => {
  it('第一輪就係原本個圈', () => {
    const { ring } = circleFrame(players(4), 1)
    expect(ring.map((p) => p?.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('第一個位釘死，其餘順時針轉', () => {
    const { ring } = circleFrame(players(4), 2)
    expect(ring.map((p) => p?.id)).toEqual(['p1', 'p4', 'p2', 'p3'])
  })

  it('單數人數會有一個輪空位', () => {
    const { ring } = circleFrame(players(5), 1)
    expect(ring).toHaveLength(6)
    expect(ring.filter((p) => p === null)).toHaveLength(1)
  })

  it('轉盤上面對住嘅位就係賽程入面嘅配對', () => {
    const ps = players(6)
    const s = generateSchedule(ps)
    for (let r = 1; r <= totalRounds(6); r++) {
      const { ring, chords } = circleFrame(ps, r)
      const fromRing = chords
        .map((c) => [ring[c.from], ring[c.to]] as const)
        .filter(([x, y]) => x && y)
        .map(([x, y]) => matchKey(x!.id, y!.id))
        .sort()
      expect(fromRing).toEqual(pairsInRound(s, r))
    }
  })
})

describe('中途加人', () => {
  const base = players(4)
  const baseSchedule = generateSchedule(base)

  /** 打完頭兩場，扮到一半。 */
  function halfPlayed(): Match[] {
    const s = baseSchedule.map((m) => ({ ...m, rounds: [...m.rounds] }))
    s[0]!.rounds = [
      { winnerId: s[0]!.aId, finish: 'burst' },
      { winnerId: s[0]!.aId, finish: 'over' },
    ]
    s[1]!.rounds = [{ winnerId: s[1]!.bId, finish: 'xtreme' }]
    return s
  }

  it('已排嘅場次原封不動，連入咗嘅分都喺返度', () => {
    const before = halfPlayed()
    const after = mergeSchedule(before, [...base, { id: 'p5', name: '新仔', seat: 4 }])

    for (const old of before) {
      const found = after.find((m) => m.id === old.id)
      expect(found).toBeDefined()
      expect(found!.round).toBe(old.round)
      expect(found!.order).toBe(old.order)
      expect(found!.aId).toBe(old.aId)
      expect(found!.bId).toBe(old.bId)
      expect(found!.rounds).toEqual(old.rounds)
    }
  })

  it('新人只補未有過嘅配對，一場都唔多', () => {
    const after = mergeSchedule(halfPlayed(), [...base, { id: 'p5', name: '新仔', seat: 4 }])
    expect(after).toHaveLength(totalMatches(5))

    const fresh = after.filter((m) => !baseSchedule.some((o) => o.id === m.id))
    expect(fresh).toHaveLength(4)
    for (const m of fresh) expect([m.aId, m.bId]).toContain('p5')
  })

  it('新場次全部排喺舊場次後面', () => {
    const before = halfPlayed()
    const after = mergeSchedule(before, [...base, { id: 'p5', name: '新仔', seat: 4 }])
    const lastOldRound = Math.max(...before.map((m) => m.round))
    const fresh = after.filter((m) => !before.some((o) => o.id === m.id))
    for (const m of fresh) expect(m.round).toBeGreaterThan(lastOldRound)
  })

  it('補完之後同一輪仍然冇人打兩場', () => {
    const after = mergeSchedule(halfPlayed(), [
      ...base,
      { id: 'p5', name: '新仔', seat: 4 },
      { id: 'p6', name: '新女', seat: 5 },
    ])
    expect(after).toHaveLength(totalMatches(6))
    for (const r of new Set(after.map((m) => m.round))) {
      const ids = after.filter((m) => m.round === r).flatMap((m) => [m.aId, m.bId])
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('一次過加兩個人，兩個人之間嗰場都會排到', () => {
    const after = mergeSchedule(baseSchedule, [
      ...base,
      { id: 'p5', name: '新仔', seat: 4 },
      { id: 'p6', name: '新女', seat: 5 },
    ])
    expect(after.some((m) => m.id === matchKey('p5', 'p6'))).toBe(true)
  })

  it('冇加到人就乜都唔郁', () => {
    const before = halfPlayed()
    expect(mergeSchedule(before, base)).toEqual(before)
  })

  it('刪走一個選手，佢嘅場次一齊消失，其餘不變', () => {
    const before = halfPlayed()
    const after = mergeSchedule(before, base.slice(0, 3))
    expect(after).toHaveLength(totalMatches(3))
    expect(after.some((m) => m.aId === 'p4' || m.bId === 'p4')).toBe(false)
  })

  it('由零開始 merge 等同直接排', () => {
    expect(mergeSchedule([], base)).toEqual(baseSchedule)
  })
})

describe('係咪乾淨嘅圓周法排程', () => {
  it('啱啱排完就係', () => {
    for (const n of SIZES) {
      const ps = players(n)
      expect(isPureCircleSchedule(generateSchedule(ps), ps)).toBe(true)
    }
  })

  it('中途加咗人就唔再係 —— 轉盤同賽程會對唔上，所以要收起', () => {
    const base = players(4)
    const ps = [...base, { id: 'p5', name: '新仔', seat: 4 }]
    const merged = mergeSchedule(generateSchedule(base), ps)
    expect(isPureCircleSchedule(merged, ps)).toBe(false)
  })

  it('場次少咗都唔算', () => {
    const ps = players(5)
    expect(isPureCircleSchedule(generateSchedule(ps).slice(1), ps)).toBe(false)
  })

  it('同一批配對但輪次唔啱都唔算', () => {
    const ps = players(4)
    const shifted = generateSchedule(ps).map((m) => ({ ...m, round: 1 }))
    expect(isPureCircleSchedule(shifted, ps)).toBe(false)
  })
})

describe('賽程次序', () => {
  it('先按輪次，再按輪入面次序', () => {
    const s = inPlayOrder([...generateSchedule(players(6))].reverse())
    for (let i = 1; i < s.length; i++) {
      const prev = s[i - 1]!
      const cur = s[i]!
      expect(prev.round < cur.round || (prev.round === cur.round && prev.order < cur.order)).toBe(true)
    }
  })
})
