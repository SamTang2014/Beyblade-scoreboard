import { describe, expect, it } from 'vitest'
import { generateBracket } from './bracket'
import {
  advanceOptions,
  assignLatecomers,
  avoidSamePool,
  buildPoolSchedule,
  drawPools,
  poolLabel,
  poolOptions,
  poolSeedOrder,
  poolSizes,
  poolStandings,
  poolsOf,
} from './pools'
import { matchKey } from './rules'
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

describe('逐組排名', () => {
  /** 一場打到 4 分，指定邊個贏。 */
  function won(aId: string, bId: string, winnerId: string, round: number): Match {
    return {
      id: matchKey(aId, bId),
      stage: 'group',
      round,
      order: 1,
      aId,
      bId,
      aFrom: null,
      bFrom: null,
      rounds: [
        { winnerId, finish: 'xtreme' },
        { winnerId, finish: 'spin' },
      ],
    }
  }

  const roster: Player[] = [
    { id: 'a1', name: 'A1', seat: 0, pool: 1 },
    { id: 'a2', name: 'A2', seat: 1, pool: 1 },
    { id: 'b1', name: 'B1', seat: 2, pool: 2 },
    { id: 'b2', name: 'B2', seat: 3, pool: 2 },
  ]

  it('逐組獨立計，B 組打完唔會郁到 A 組嘅名次', () => {
    const tables = poolStandings(roster, [won('a1', 'a2', 'a1', 1), won('b1', 'b2', 'b2', 1)], 2)
    expect(tables).toHaveLength(2)
    expect(tables[0]!.rows.map((r) => r.playerId)).toEqual(['a1', 'a2'])
    expect(tables[1]!.rows.map((r) => r.playerId)).toEqual(['b2', 'b1'])
    // A 組個表淨係得 A 組嘅人。
    expect(tables[0]!.rows).toHaveLength(2)
  })

  it('組號由 1 起計', () => {
    expect(poolStandings(roster, [], 2).map((t) => t.pool)).toEqual([1, 2])
  })
})

describe('交叉種子', () => {
  /** 砌一批選手，pool 跟住個 id 前綴（a → 1、b → 2、c → 3、d → 4）。 */
  function pooled(spec: string[]): Player[] {
    return spec.map((id, i) => ({
      id,
      name: id.toUpperCase(),
      seat: i,
      pool: id.charCodeAt(0) - 96,
    }))
  }

  /**
   * 砌一批「已經打完」嘅小組場次，令組內名次同 id 尾嗰個數字對得返
   * （a1 排 A 組第 1、a2 排第 2…）。
   */
  function played(roster: Player[]): Match[] {
    const out: Match[] = []
    const byPool = new Map<number, Player[]>()
    for (const p of roster) {
      const list = byPool.get(p.pool!) ?? []
      list.push(p)
      byPool.set(p.pool!, list)
    }
    for (const list of byPool.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const x = list[i]!
          const y = list[j]!
          // 排前面嗰個（尾數細）贏。
          out.push({
            id: matchKey(x.id, y.id),
            stage: 'group',
            round: 1,
            order: 1,
            aId: x.id,
            bId: y.id,
            aFrom: null,
            bFrom: null,
            rounds: [
              { winnerId: x.id, finish: 'xtreme' },
              { winnerId: x.id, finish: 'spin' },
            ],
          })
        }
      }
    }
    return out
  }

  /** 首圈有幾多場係同組內戰。 */
  function samePoolFirstRound(seeds: string[], poolOf: Map<string, number>): number {
    return generateBracket(seeds)
      .filter((m) => m.round === 1)
      .filter((m) => poolOf.get(m.aId!) === poolOf.get(m.bId!)).length
  }

  function run(ids: string[], poolCount: number, advance: number) {
    const roster = pooled(ids)
    const seeds = poolSeedOrder(roster, played(roster), poolCount, advance)
    const poolOf = new Map(roster.map((p) => [p.id, p.pool!]))
    return { seeds, poolOf, clashes: samePoolFirstRound(seeds, poolOf) }
  }

  it('2 組出 2 個：A1 對 B2、B1 對 A2', () => {
    const { seeds } = run(['a1', 'a2', 'b1', 'b2'], 2, 2)
    const first = generateBracket(seeds).filter((m) => m.round === 1)
    const pairs = first.map((m) => [m.aId, m.bId].sort().join('+')).sort()
    expect(pairs).toEqual(['a1+b2', 'a2+b1'])
  })

  it('3 組出 2 個：首圈零同組內戰', () => {
    expect(run(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'], 3, 2).clashes).toBe(0)
  })

  it('4 組出 2 個：首圈零同組內戰', () => {
    const ids = ['a', 'b', 'c', 'd'].flatMap((g) => [1, 2, 3].map((n) => `${g}${n}`))
    expect(run(ids, 4, 2).clashes).toBe(0)
  })

  it('2–6 組 × 每組出 1／2／3：逐個組合首圈都係零同組內戰', () => {
    // 上限跟 `poolOptions` 開得出嘅最多組數（6），唔係求其揀個數。
    for (const k of [2, 3, 4, 5, 6]) {
      for (const advance of [1, 2, 3]) {
        // 每組砌 3 個人，咁樣出 1／2／3 個都夠。
        const ids = ['a', 'b', 'c', 'd', 'e', 'f']
          .slice(0, k)
          .flatMap((g) => [1, 2, 3].map((n) => `${g}${n}`))
        expect(run(ids, k, advance).clashes, `${k} 組出 ${advance} 個`).toBe(0)
      }
    }
  })

  it('修補 pass 唔會搞亂梯次：各組第 1 名全部排喺各組第 2 名之前', () => {
    const { seeds } = run(['a1', 'a2', 'b1', 'b2', 'c1', 'c2'], 3, 2)
    const place = (id: string) => Number(id.slice(1))
    const firstTier = seeds.slice(0, 3).map(place)
    const secondTier = seeds.slice(3).map(place)
    expect(firstTier.every((p) => p === 1)).toBe(true)
    expect(secondTier.every((p) => p === 2)).toBe(true)
  })

  it('入圍人數 = 組數 × 每組出幾多個', () => {
    const ids = ['a', 'b', 'c'].flatMap((g) => [1, 2, 3].map((n) => `${g}${n}`))
    expect(run(ids, 3, 2).seeds).toHaveLength(6)
  })

  /**
   * 直接督 `avoidSamePool`，逼佢行「揀咗個候選、發現唔合格、換返轉頭」條路。
   *
   * 由 `poolSeedOrder` 出嘅真實組合入面，撞到組嗰陣**第一個**同梯次候選就已經合格，
   * 所以「換返轉頭」嗰段一直冇跑過。呢度手砌一副種子逼佢跑：
   * 換返轉頭寫錯次序嘅話，個陣列會多咗一個人、少咗一個人，係靜靜雞爛嘅。
   */
  describe('修補 pass 揀錯候選要換返轉頭', () => {
    // 8 個位，位序 [1,8,4,5,2,7,3,6] → 首圈四對：(1,8)、(4,5)、(2,7)、(3,6)。
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']
    // s1／s5／s8 全部第 1 組 —— 咁 (1,8) 一開波就撞，而且第一個候選 s5 換極都仲係撞。
    const pools = new Map<string, number>([
      ['s1', 1],
      ['s2', 2],
      ['s3', 3],
      ['s4', 4],
      ['s5', 1],
      ['s6', 2],
      ['s7', 3],
      ['s8', 1],
    ])
    const poolOf = new Map<string, number | null>(pools)
    // 種子 1–4 上梯次、5–8 下梯次，所以 s8 淨係換得 s5／s6／s7。
    const tierOf = new Map<string, number>(
      seeds.map((id, i): [string, number] => [id, i < 4 ? 0 : 1]),
    )

    it('第一個候選唔合格就退返貨，再試下一個', () => {
      // (1,8) 撞組 → keep=1、move=8，同梯次候選由細到大係 5、6、7。
      // c=5：s5 上到第 8 位一樣係第 1 組，(1,8) 照撞 → 唔合格，換返轉頭。
      // c=6：換完 (1,8) 係 s1 對 s6、(3,6) 係 s3 對 s8，兩對都清 → 成事。
      // s8 落咗第 6 位而唔係第 5 位，就係「c=5 試過而且退咗貨」嘅憑據。
      expect(avoidSamePool(seeds, poolOf, tierOf)).toEqual([
        's1',
        's2',
        's3',
        's4',
        's5',
        's8',
        's7',
        's6',
      ])
    })

    it('換返轉頭唔會整散個陣列：出嚟仲係原本嗰批人，冇多冇少', () => {
      const out = avoidSamePool(seeds, poolOf, tierOf)
      expect([...out].sort()).toEqual([...seeds].sort())
      expect(new Set(out).size).toBe(seeds.length)
    })

    it('梯次冇走位', () => {
      const out = avoidSamePool(seeds, poolOf, tierOf)
      expect(out.slice(0, 4).every((id) => tierOf.get(id) === 0)).toBe(true)
      expect(out.slice(4).every((id) => tierOf.get(id) === 1)).toBe(true)
    })

    it('收工之後首圈零同組內戰', () => {
      expect(samePoolFirstRound(avoidSamePool(seeds, poolOf, tierOf), pools)).toBe(0)
    })

    it('唔會郁到原本個 seeds 陣列', () => {
      const before = [...seeds]
      avoidSamePool(seeds, poolOf, tierOf)
      expect(seeds).toEqual(before)
    })
  })
})
