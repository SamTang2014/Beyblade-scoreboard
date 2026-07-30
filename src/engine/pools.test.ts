import { describe, expect, it } from 'vitest'
import {
  advanceOptions,
  assignLatecomers,
  buildPoolSchedule,
  drawPools,
  poolLabel,
  poolOptions,
  poolSizes,
  poolsOf,
} from './pools'
import type { Match, Player } from './types'

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `選手${i + 1}`,
    seat: i,
    pool: null,
  }))
}

/** 定死嘅假 rng：每次都揀最後一個，即係完全唔洗牌。 */
const noShuffle = () => 0.999999

describe('揀得幾多組', () => {
  it('每組最少 2 個人', () => {
    expect(poolOptions(3)).toEqual([])
    expect(poolOptions(4)).toEqual([2])
    expect(poolOptions(6)).toEqual([2, 3])
    expect(poolOptions(12)).toEqual([2, 3, 4, 5, 6])
  })
})

describe('每組幾多人', () => {
  it('夾得啱就人人一樣', () => {
    expect(poolSizes(12, 3)).toEqual([4, 4, 4])
  })

  it('夾唔啱就早啲嘅組多一個', () => {
    expect(poolSizes(13, 3)).toEqual([5, 4, 4])
    expect(poolSizes(14, 3)).toEqual([5, 5, 4])
  })

  it('加埋一定等於總人數', () => {
    for (let n = 4; n <= 30; n++) {
      for (const k of poolOptions(n)) {
        expect(poolSizes(n, k).reduce((a, b) => a + b, 0)).toBe(n)
      }
    }
  })
})

describe('每組出得幾多個', () => {
  it('最多就係最細嗰組嘅人數', () => {
    expect(advanceOptions(12, 3)).toEqual([1, 2, 3]) // 4 人一組
    expect(advanceOptions(13, 4)).toEqual([1, 2, 3]) // 4/3/3/3
    expect(advanceOptions(9, 4)).toEqual([1, 2]) // 3/2/2/2
    expect(advanceOptions(4, 2)).toEqual([1, 2]) // 2/2
  })
})

describe('組別個名', () => {
  it('1 = A、2 = B、3 = C', () => {
    expect(poolLabel(1)).toBe('A')
    expect(poolLabel(2)).toBe('B')
    expect(poolLabel(3)).toBe('C')
  })
})

describe('抽組', () => {
  it('組人數啱', () => {
    const drawn = drawPools(players(13), 3, noShuffle)
    const sizes = [1, 2, 3].map((k) => drawn.filter((p) => p.pool === k).length)
    expect(sizes.sort((a, b) => b - a)).toEqual([5, 4, 4])
  })

  it('每個人啱啱一組，冇人漏', () => {
    const drawn = drawPools(players(11), 4, noShuffle)
    expect(drawn.every((p) => p.pool !== null && p.pool >= 1 && p.pool <= 4)).toBe(true)
    expect(drawn).toHaveLength(11)
  })

  it('同一個假 rng 出同一個結果', () => {
    const a = drawPools(players(9), 3, noShuffle).map((p) => p.pool)
    const b = drawPools(players(9), 3, noShuffle).map((p) => p.pool)
    expect(a).toEqual(b)
  })

  it('唔同 rng 出唔同結果', () => {
    const a = drawPools(players(9), 3, noShuffle).map((p) => p.pool)
    const b = drawPools(players(9), 3, () => 0).map((p) => p.pool)
    expect(a).not.toEqual(b)
  })

  it('唔會郁到原本個陣列', () => {
    const base = players(6)
    drawPools(base, 2, noShuffle)
    expect(base.every((p) => p.pool === null)).toBe(true)
  })
})

describe('遲到加人', () => {
  it('入人最少嗰組', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 0, pool: 1 },
      { id: 'b', name: '阿華', seat: 1, pool: 1 },
      { id: 'c', name: '阿強', seat: 2, pool: 2 },
      { id: 'd', name: '阿 May', seat: 3, pool: null },
    ]
    expect(assignLatecomers(roster, 2).find((p) => p.id === 'd')!.pool).toBe(2)
  })

  it('打和就入組號細嗰個', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 0, pool: 1 },
      { id: 'b', name: '阿強', seat: 1, pool: 2 },
      { id: 'c', name: '阿 May', seat: 2, pool: null },
    ]
    expect(assignLatecomers(roster, 2).find((p) => p.id === 'c')!.pool).toBe(1)
  })

  it('一次過加幾個，逐個派，唔會全部塞落同一組', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 0, pool: 1 },
      { id: 'b', name: '阿強', seat: 1, pool: 2 },
      { id: 'c', name: '新仔', seat: 2, pool: null },
      { id: 'd', name: '新女', seat: 3, pool: null },
    ]
    const after = assignLatecomers(roster, 2)
    expect(after.find((p) => p.id === 'c')!.pool).toBe(1)
    expect(after.find((p) => p.id === 'd')!.pool).toBe(2)
  })

  it('已經有組嘅一個都唔郁', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 0, pool: 2 },
      { id: 'b', name: '阿 May', seat: 1, pool: null },
    ]
    expect(assignLatecomers(roster, 2).find((p) => p.id === 'a')!.pool).toBe(2)
  })
})

describe('逐組攞人', () => {
  it('按組號分開，組內按入座次序', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 2, pool: 1 },
      { id: 'b', name: '阿強', seat: 0, pool: 1 },
      { id: 'c', name: '阿華', seat: 1, pool: 2 },
    ]
    const pools = poolsOf(roster, 2)
    expect(pools[0]!.map((p) => p.id)).toEqual(['b', 'a'])
    expect(pools[1]!.map((p) => p.id)).toEqual(['c'])
  })

  it('未分組嘅唔會出現', () => {
    const roster: Player[] = [{ id: 'a', name: '阿明', seat: 0, pool: null }]
    expect(poolsOf(roster, 2)).toEqual([[], []])
  })
})

describe('逐組排賽程', () => {
  function drawn(n: number, k: number): Player[] {
    // 唔洗牌，所以 p1 → 第 1 組、p2 → 第 2 組…… 好對數。
    return drawPools(players(n), k, noShuffle)
  }

  it('冇跨組對戰', () => {
    const roster = drawn(12, 3)
    const poolOf = new Map(roster.map((p) => [p.id, p.pool]))
    const ms = buildPoolSchedule([], roster, 3)
    expect(ms.length).toBeGreaterThan(0)
    for (const m of ms) {
      expect(poolOf.get(m.aId!)).toBe(poolOf.get(m.bId!))
    }
  })

  it('每組場數 = n(n−1)/2', () => {
    const ms = buildPoolSchedule([], drawn(12, 3), 3)
    expect(ms).toHaveLength(3 * 6) // 每組 4 人 → 6 場
  })

  it('組人數唔平均都啱', () => {
    const ms = buildPoolSchedule([], drawn(13, 3), 3)
    expect(ms).toHaveLength(10 + 6 + 6) // 5 人組 10 場，兩個 4 人組各 6 場
  })

  it('同一輪冇人打兩場', () => {
    const ms = buildPoolSchedule([], drawn(13, 3), 3)
    for (const round of new Set(ms.map((m) => m.round))) {
      const seen = new Set<string>()
      for (const m of ms.filter((x) => x.round === round)) {
        expect(seen.has(m.aId!)).toBe(false)
        expect(seen.has(m.bId!)).toBe(false)
        seen.add(m.aId!)
        seen.add(m.bId!)
      }
    }
  })

  it('同一輪入面按組別 A→B→C 編次序，同組嘅連住一齊', () => {
    const roster = drawn(12, 3)
    const poolOf = new Map(roster.map((p) => [p.id, p.pool!]))
    const first = buildPoolSchedule([], roster, 3)
      .filter((m) => m.round === 1)
      .sort((x, y) => x.order - y.order)
    expect(first.map((m) => m.order)).toEqual([1, 2, 3, 4, 5, 6])
    expect(first.map((m) => poolOf.get(m.aId!))).toEqual([1, 1, 2, 2, 3, 3])
  })

  it('遲到加人：補返嗰組嘅新場次，打咗嘅一場都唔郁', () => {
    const roster = drawn(8, 2)
    const before = buildPoolSchedule([], roster, 2).map((m, i) =>
      i === 0 ? { ...m, rounds: [{ winnerId: m.aId!, finish: 'xtreme' as const }] } : m,
    )
    const withNew = assignLatecomers(
      [...roster, { id: 'late', name: '阿 May', seat: 8, pool: null }],
      2,
    )
    const after = buildPoolSchedule(before, withNew, 2)

    // 舊場次連分數原封不動。
    for (const old of before) {
      const same = after.find((m) => m.id === old.id)
      expect(same).toBeDefined()
      expect(same!.rounds).toEqual(old.rounds)
    }
    // 阿 May 補返同組其他 4 個人嘅場次。
    expect(after.filter((m) => m.aId === 'late' || m.bId === 'late')).toHaveLength(4)
  })

  it('除名之後，佢嘅場次一齊消失', () => {
    const roster = drawn(8, 2)
    const before = buildPoolSchedule([], roster, 2)
    const left = roster.filter((p) => p.id !== 'p1')
    const after = buildPoolSchedule(before, left, 2)
    expect(after.some((m) => m.aId === 'p1' || m.bId === 'p1')).toBe(false)
  })

  it('淘汰階段嘅場次原封不動擺返出去', () => {
    const roster = drawn(4, 2)
    const bracket: Match = {
      id: 'b1m1',
      stage: 'bracket',
      round: 1,
      order: 1,
      aId: 'p1',
      bId: 'p2',
      aFrom: null,
      bFrom: null,
      rounds: [],
    }
    const after = buildPoolSchedule([...buildPoolSchedule([], roster, 2), bracket], roster, 2)
    expect(after.filter((m) => m.stage === 'bracket')).toEqual([bracket])
  })
})
