import { describe, expect, it } from 'vitest'
import {
  bracketChampion,
  bracketRoundName,
  bracketRounds,
  bracketSize,
  byeCount,
  clearDownstream,
  downstreamOf,
  downstreamWithScores,
  drawOrder,
  generateBracket,
  propagate,
  seedSlots,
  totalBracketRounds,
} from './bracket'
import { matchStatus, matchWinnerId } from './rules'
import type { Match, Player } from './types'

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `選手${i + 1}`,
    seat: i,
    pool: null,
  }))
}

const ids = (n: number) => players(n).map((p) => p.id)

/** 叫某一邊贏，4 分。 */
function win(matches: Match[], matchId: string, side: 'a' | 'b'): Match[] {
  return propagate(
    matches.map((m) => {
      if (m.id !== matchId) return m
      const winnerId = side === 'a' ? m.aId : m.bId
      if (winnerId === null) throw new Error(`${matchId} 仲未夠人打`)
      return {
        ...m,
        rounds: Array.from({ length: 4 }, () => ({ winnerId, finish: 'spin' as const })),
      }
    }),
  )
}

/** 由頭打到尾，永遠藍邊贏。 */
function playAll(matches: Match[]): Match[] {
  let cur = propagate(matches)
  for (let guard = 0; guard < 100; guard++) {
    const next = cur.find((m) => matchStatus(m) === 'pending')
    if (next === undefined) break
    cur = win(cur, next.id, 'a')
  }
  return cur
}

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 20]

describe('籤表大細', () => {
  it('大過等於人數嘅最細 2 次方', () => {
    expect([2, 3, 4, 5, 8, 9, 16].map(bracketSize)).toEqual([2, 4, 4, 8, 8, 16, 16])
  })

  it('輪空數目 = 籤表大細 − 人數', () => {
    for (const n of SIZES) expect(byeCount(n)).toBe(bracketSize(n) - n)
  })

  it('輪數 = log2(籤表大細)', () => {
    expect([2, 4, 8, 16].map(bracketRounds)).toEqual([1, 2, 3, 4])
    expect(bracketRounds(5)).toBe(3)
    expect(bracketRounds(1)).toBe(0)
  })
})

describe('種子位序', () => {
  it('8 個位排到 1,8,4,5,2,7,3,6', () => {
    expect(seedSlots(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it('每個種子號啱啱出現一次', () => {
    for (const size of [2, 4, 8, 16, 32]) {
      const slots = seedSlots(size)
      expect(slots).toHaveLength(size)
      expect([...slots].sort((a, b) => a - b)).toEqual(
        Array.from({ length: size }, (_, i) => i + 1),
      )
    }
  })

  it('相鄰兩個位加埋等於 size+1 —— 即係強對弱', () => {
    for (const size of [4, 8, 16]) {
      const slots = seedSlots(size)
      for (let i = 0; i < size; i += 2) {
        expect(slots[i]! + slots[i + 1]!).toBe(size + 1)
      }
    }
  })
})

describe('砌籤表', () => {
  it('少過 2 個人砌唔到', () => {
    expect(generateBracket([])).toEqual([])
    expect(generateBracket(['p1'])).toEqual([])
  })

  it.each(SIZES)('%i 人：總場數 = 人數 − 1', (n) => {
    // 單淘汰每場淘汰一個人，要淘汰 n-1 個先剩返冠軍。
    expect(generateBracket(ids(n))).toHaveLength(n - 1)
  })

  it.each(SIZES)('%i 人：每個人首圈最多出現一次', (n) => {
    const b = generateBracket(ids(n))
    const first = b.filter((m) => m.round === 1).flatMap((m) => [m.aId, m.bId]).filter(Boolean)
    expect(new Set(first).size).toBe(first.length)
  })

  it.each(SIZES)('%i 人：輪空嗰啲人首圈唔會有場次，直接喺第二輪出現', (n) => {
    const b = generateBracket(ids(n))
    const firstRoundPlayers = new Set(
      b.filter((m) => m.round === 1).flatMap((m) => [m.aId, m.bId]).filter(Boolean),
    )
    const seeded = b
      .filter((m) => m.round === 2)
      .flatMap((m) => [m.aId, m.bId])
      .filter((x): x is string => x !== null)

    expect(firstRoundPlayers.size).toBe(n - byeCount(n))
    expect(seeded).toHaveLength(byeCount(n))
    for (const id of seeded) expect(firstRoundPlayers.has(id)).toBe(false)
  })

  it.each(SIZES)('%i 人：冇一場係「對住空氣」', (n) => {
    for (const m of generateBracket(ids(n))) {
      const aKnown = m.aId !== null || m.aFrom !== null
      const bKnown = m.bId !== null || m.bFrom !== null
      expect(aKnown && bKnown).toBe(true)
    }
  })

  it.each(SIZES)('%i 人：每場都有唯一 id', (n) => {
    const b = generateBracket(ids(n))
    expect(new Set(b.map((m) => m.id)).size).toBe(b.length)
  })

  it.each(SIZES)('%i 人：所有 aFrom/bFrom 都指到真實存在嘅場次', (n) => {
    const b = generateBracket(ids(n))
    const known = new Set(b.map((m) => m.id))
    for (const m of b) {
      if (m.aFrom !== null) expect(known.has(m.aFrom)).toBe(true)
      if (m.bFrom !== null) expect(known.has(m.bFrom)).toBe(true)
    }
  })

  it('1 號同 2 號種子只會喺決賽相遇', () => {
    for (const n of [4, 8, 16]) {
      let b = generateBracket(ids(n))
      // 種子細嗰個永遠贏。
      for (let guard = 0; guard < 100; guard++) {
        const next = b.find((m) => matchStatus(m) === 'pending')
        if (next === undefined) break
        const seedOf = (id: string) => Number(id.slice(1))
        b = win(b, next.id, seedOf(next.aId!) < seedOf(next.bId!) ? 'a' : 'b')
      }
      const last = Math.max(...b.map((m) => m.round))
      const final = b.find((m) => m.round === last)!
      expect([final.aId, final.bId].sort()).toEqual(['p1', 'p2'])
      expect(bracketChampion(b)).toBe('p1')
    }
  })
})

describe('隨機抽籤', () => {
  it('人冇多冇少', () => {
    const order = drawOrder(players(8), () => 0.5)
    expect([...order].sort()).toEqual([...ids(8)].sort())
  })

  it('餵同一個 rng 出同一個結果', () => {
    let seed = 0
    const rng = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    const a = drawOrder(players(8), rng)
    seed = 0
    const b = drawOrder(players(8), rng)
    expect(a).toEqual(b)
  })

  it('唔會改到傳入嘅陣列', () => {
    const ps = players(6)
    const before = ps.map((p) => p.id)
    drawOrder(ps, () => 0.7)
    expect(ps.map((p) => p.id)).toEqual(before)
  })
})

describe('贏家自動推進', () => {
  it('首圈打完，第二輪就填到人', () => {
    const b = generateBracket(ids(4))
    const r1 = b.filter((m) => m.round === 1)
    expect(b.find((m) => m.round === 2)!.aId).toBeNull()

    const after = win(b, r1[0]!.id, 'a')
    const final = after.find((m) => m.round === 2)!
    expect(final.aId).toBe(r1[0]!.aId)
    expect(final.bId).toBeNull() // 另一邊仲未打
    expect(matchStatus(final)).toBe('waiting')
  })

  it('兩邊都打完，決賽就開得', () => {
    const b = generateBracket(ids(4))
    const r1 = b.filter((m) => m.round === 1)
    let after = win(b, r1[0]!.id, 'a')
    after = win(after, r1[1]!.id, 'b')
    expect(matchStatus(after.find((m) => m.round === 2)!)).toBe('pending')
  })

  it.each(SIZES)('%i 人：由頭打到尾，一定有一個冠軍', (n) => {
    const done = playAll(generateBracket(ids(n)))
    expect(done.every((m) => matchWinnerId(m) !== null)).toBe(true)
    expect(bracketChampion(done)).not.toBeNull()
  })

  it('叫幾多次 propagate 結果都一樣', () => {
    const once = playAll(generateBracket(ids(8)))
    expect(propagate(once)).toEqual(once)
  })
})

describe('改上游會連累下游', () => {
  it('搵得齊所有受影響嘅場次', () => {
    const b = generateBracket(ids(8))
    const r1m1 = b.find((m) => m.round === 1 && m.order === 1)!
    const affected = downstreamOf(b, r1m1.id)
    // 8 人籤表：首圈某場影響到佢嘅四強同決賽。
    expect(affected).toHaveLength(2)
    expect(affected.some((id) => id.startsWith('b2'))).toBe(true)
    expect(affected.some((id) => id.startsWith('b3'))).toBe(true)
  })

  it('決賽冇下游', () => {
    const b = generateBracket(ids(8))
    const final = b.find((m) => m.round === 3)!
    expect(downstreamOf(b, final.id)).toEqual([])
  })

  it('淨係報已經入咗分嗰啲下游', () => {
    const b = playAll(generateBracket(ids(4)))
    const r1m1 = b.find((m) => m.round === 1 && m.order === 1)!
    const withScores = downstreamWithScores(b, r1m1.id)
    expect(withScores).toHaveLength(1) // 決賽
    expect(withScores[0]!.rounds.length).toBeGreaterThan(0)
  })

  it('清下游：分清走晒，參賽者重新計，被改嗰場唔郁', () => {
    const b = playAll(generateBracket(ids(4)))
    const r1m1 = b.find((m) => m.round === 1 && m.order === 1)!
    const cleared = clearDownstream(b, r1m1.id)

    const finalAfter = cleared.find((m) => m.round === 2)!
    expect(finalAfter.rounds).toEqual([])
    expect(matchWinnerId(finalAfter)).toBeNull()
    // 首圈兩場都仲有結果，所以決賽兩邊仍然填到人。
    expect(finalAfter.aId).not.toBeNull()
    expect(finalAfter.bId).not.toBeNull()

    const sameMatch = cleared.find((m) => m.id === r1m1.id)!
    expect(sameMatch.rounds).toEqual(r1m1.rounds)
  })

  it('改咗首圈贏家，決賽個對手真係跟住變', () => {
    let b = generateBracket(ids(4))
    const r1m1 = b.find((m) => m.round === 1 && m.order === 1)!
    const r1m2 = b.find((m) => m.round === 1 && m.order === 2)!

    b = win(b, r1m1.id, 'a')
    b = win(b, r1m2.id, 'a')
    const before = b.find((m) => m.round === 2)!.aId

    // 撤銷首圈第一場，改做紅邊贏。
    b = propagate(b.map((m) => (m.id === r1m1.id ? { ...m, rounds: [] } : m)))
    b = win(b, r1m1.id, 'b')

    const after = b.find((m) => m.round === 2)!.aId
    expect(after).not.toBe(before)
    expect(after).toBe(r1m1.bId)
  })
})

describe('階段名', () => {
  it('由尾數返轉頭', () => {
    expect(bracketRoundName(3, 3)).toBe('決賽')
    expect(bracketRoundName(2, 3)).toBe('四強')
    expect(bracketRoundName(1, 3)).toBe('八強')
    expect(bracketRoundName(1, 1)).toBe('決賽')
    expect(bracketRoundName(1, 4)).toBe('十六強')
  })

  it('數到總輪數', () => {
    expect(totalBracketRounds(generateBracket(ids(8)))).toBe(3)
    expect(totalBracketRounds(generateBracket(ids(5)))).toBe(3)
    expect(totalBracketRounds([])).toBe(0)
  })
})
