import { describe, expect, it } from 'vitest'
import {
  buildTiebreak,
  nextTiebreak,
  nextTiebreakFor,
  applyRankTiebreaks,
  rankTieStates,
  poolSeedOrder,
  poolStandings,
  rankByTiebreak,
  tiedAtCut,
  tieStates,
  tiesPending,
} from './pools'
import { computeStandings } from './standings'
import { matchKey } from './rules'
import type { FinishType, Match, Player } from './types'

/**
 * 並列加賽。
 *
 * 起因：三個人循環互相贏、每場都 4–0，四條排名規則一條都分唔開，
 * 但只有兩個出線位。之前個 app 靜靜雞照排序攞頭兩個 —— 而排序最後
 * fallback 係個名，即係「邊個出線」變成睇個名點串。
 */

function pooled(names: string[], pool: number): Player[] {
  return names.map((name, i) => ({ id: name, name, seat: i, pool }))
}

/** 一場打完嘅比賽。預設 4–0。 */
function played(
  winner: string,
  loser: string,
  id: string,
  stage: 'group' | 'tiebreak' = 'group',
  loserPoints = 0,
): Match {
  const rounds: { winnerId: string; finish: FinishType }[] = []
  for (let i = 0; i < loserPoints; i++) rounds.push({ winnerId: loser, finish: 'spin' })
  rounds.push({ winnerId: winner, finish: 'xtreme' }, { winnerId: winner, finish: 'spin' })
  return {
    id,
    stage,
    round: 1,
    order: 1,
    aId: winner,
    bId: loser,
    aFrom: null,
    bFrom: null,
    rounds,
  }
}

function group(winner: string, loser: string, loserPoints = 0): Match {
  return played(winner, loser, matchKey(winner, loser), 'group', loserPoints)
}

// A 贏 B、B 贏 C、C 贏 A —— 三個循環，全部 4–0，全部贏埋 D。
const ABC = pooled(['A', 'B', 'C', 'D'], 3)
const CYCLE: Match[] = [
  group('A', 'B'),
  group('B', 'C'),
  group('C', 'A'),
  group('A', 'D'),
  group('B', 'D'),
  group('C', 'D'),
]

/** 冇組別嘅選手 —— 單循環同大循環都係咁。 */
function flat(names: string[]): Player[] {
  return names.map((name, i) => ({ id: name, name, seat: i, pool: null }))
}

const FOUR = flat(['A', 'B', 'C', 'D'])

/**
 * 同 CYCLE 一樣嘅結果，但啲人冇組別。
 * A／B／C 全部 2 勝 1 負、8 分、失 4 分、2 次極限 —— 主鏈四樣全同，並列第 1。
 * D 三場全輸，第 4。
 */
const TOP3: Match[] = [
  group('A', 'B'),
  group('B', 'C'),
  group('C', 'A'),
  group('A', 'D'),
  group('B', 'D'),
  group('C', 'D'),
]

/** 同 TOP3 一樣，但最後一場仲未打 —— 用嚟測「循環未打完唔好出聲」。 */
const TOP3_MIDWAY: Match[] = TOP3.map((m, i) =>
  i === TOP3.length - 1 ? { ...m, rounds: [] } : m,
)

describe('三個人打成一個循環', () => {
  it('小組排名表照顯示三個人並列第 1', () => {
    const rows = computeStandings(ABC, CYCLE)
    for (const name of ['A', 'B', 'C']) {
      const r = rows.find((x) => x.name === name)!
      expect([r.rank, r.wins, r.pointsFor, r.pointsAgainst, r.tied]).toEqual([1, 2, 8, 4, true])
    }
  })

  it('出 2 個位 → 認得出三個人爭兩個位', () => {
    const rows = computeStandings(ABC, CYCLE)
    expect(tiedAtCut(rows, 2)).toEqual({ ids: ['A', 'B', 'C'], slots: 2 })
  })

  it('出 3 個位 → 三個都入到，唔使加賽', () => {
    expect(tiedAtCut(computeStandings(ABC, CYCLE), 3)).toBeNull()
  })

  it('出 1 個位 → 三個爭一個位，一樣要加賽', () => {
    expect(tiedAtCut(computeStandings(ABC, CYCLE), 1)).toEqual({ ids: ['A', 'B', 'C'], slots: 1 })
  })

  it('分得開就唔會叫人打加賽', () => {
    const clear = [group('A', 'B'), group('A', 'C'), group('B', 'C'), group('A', 'D'), group('B', 'D'), group('C', 'D')]
    expect(tiedAtCut(computeStandings(ABC, clear), 2)).toBeNull()
  })
})

describe('排加賽', () => {
  it('三個人 = 3 場，兩兩對打一次', () => {
    const ms = buildTiebreak(3, ['A', 'B', 'C'], 1)
    expect(ms).toHaveLength(3)
    expect(ms.every((m) => m.stage === 'tiebreak')).toBe(true)
    const pairs = ms.map((m) => [m.aId, m.bId].sort().join('+')).sort()
    expect(pairs).toEqual(['A+B', 'A+C', 'B+C'])
  })

  it('場次 id 唔會同循環賽或者淘汰賽撞', () => {
    const ids = buildTiebreak(3, ['A', 'B', 'C'], 1).map((m) => m.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids.every((id) => !id.includes('__') && !/^b\d/.test(id))).toBe(true)
  })

  it('第 2 次加賽同第 1 次唔會撞 id', () => {
    const one = buildTiebreak(3, ['A', 'B', 'C'], 1).map((m) => m.id)
    const two = buildTiebreak(3, ['A', 'B', 'C'], 2).map((m) => m.id)
    expect(one.some((id) => two.includes(id))).toBe(false)
  })

  it('未打加賽之前砌唔到籤表', () => {
    expect(tiesPending(ABC, CYCLE, 3, 2)).toBe(true)
    expect(nextTiebreak(ABC, CYCLE, 3, 2)).toHaveLength(3)
  })
})

describe('加賽點計', () => {
  /** 加賽：贏家、輸家、輸家攞幾多分。 */
  function tb(results: [string, string, number?][], attempt = 1): Match[] {
    return results.map(([w, l, pts], i) =>
      played(w, l, `tb3r${attempt}m${i + 1}`, 'tiebreak', pts ?? 0),
    )
  }

  it('加賽分到勝場 → 照勝場出線（你個例子：A 贏晒、B 贏 C、C 全輸）', () => {
    const all = [...CYCLE, ...tb([['A', 'B'], ['A', 'C'], ['B', 'C']])]
    const [state] = tieStates(ABC, all, 3, 2)
    expect(state!.played).toBe(true)
    expect(state!.resolved).toBe(true)
    expect(state!.results.map((r) => r.id)).toEqual(['A', 'B', 'C'])
    expect(tiesPending(ABC, all, 3, 2)).toBe(false)
  })

  it('加賽又打成循環但分差分得開 → 睇分差', () => {
    // A 贏 B 4–3、B 贏 C 4–0、C 贏 A 4–1
    // 分差：A = (4−3)+(1−4) = −2；B = (3−4)+(4−0) = +3；C = (0−4)+(4−1) = −1
    const all = [...CYCLE, ...tb([['A', 'B', 3], ['B', 'C', 0], ['C', 'A', 1]])]
    const [state] = tieStates(ABC, all, 3, 2)
    expect(state!.resolved).toBe(true)
    expect(state!.results.map((r) => r.id)).toEqual(['B', 'C', 'A'])
  })

  it('加賽又循環又全部 4–0 → 分差都一樣，拆唔掂，要再打', () => {
    const all = [...CYCLE, ...tb([['A', 'B'], ['B', 'C'], ['C', 'A']])]
    const [state] = tieStates(ABC, all, 3, 2)
    expect(state!.played).toBe(true)
    expect(state!.resolved).toBe(false)
    expect(tiesPending(ABC, all, 3, 2)).toBe(true)
    // 排第 2 次
    const more = nextTiebreak(ABC, all, 3, 2)
    expect(more).toHaveLength(3)
    expect(more.every((m) => m.round === 2)).toBe(true)
  })

  it('加賽打到一半唔會當佢有結果，亦都唔會再排多一次', () => {
    // 三場都排咗，但淨係打咗第一場。
    const fresh = buildTiebreak(3, ['A', 'B', 'C'], 1)
    const half = [
      ...CYCLE,
      played('A', 'B', fresh[0]!.id, 'tiebreak'),
      ...fresh.slice(1),
    ]
    const [state] = tieStates(ABC, half, 3, 2)
    expect(state!.played).toBe(false)
    expect(state!.resolved).toBe(false)
    expect(nextTiebreak(ABC, half, 3, 2)).toHaveLength(0)
  })

  it('第 2 次加賽拆得掂就算數', () => {
    const all = [
      ...CYCLE,
      ...tb([['A', 'B'], ['B', 'C'], ['C', 'A']], 1),
      ...tb([['A', 'B'], ['A', 'C'], ['B', 'C']], 2),
    ]
    const [state] = tieStates(ABC, all, 3, 2)
    expect(state!.attempt).toBe(2)
    expect(state!.resolved).toBe(true)
    expect(state!.results.map((r) => r.id)).toEqual(['A', 'B', 'C'])
  })
})

describe('加賽唔會污染小組排名表', () => {
  it('打完加賽，小組排名表照樣係三個人並列 2 勝 1 負', () => {
    const all = [...CYCLE, ...tb2()]
    const rows = poolStandings(ABC, all, 3)[2]!.rows
    for (const name of ['A', 'B', 'C']) {
      const r = rows.find((x) => x.name === name)!
      expect([r.rank, r.wins, r.tied]).toEqual([1, 2, true])
    }
  })

  function tb2(): Match[] {
    return [
      played('A', 'B', 'tb3r1m1', 'tiebreak'),
      played('A', 'C', 'tb3r1m2', 'tiebreak'),
      played('B', 'C', 'tb3r1m3', 'tiebreak'),
    ]
  }

  it('但種子順序會跟加賽結果', () => {
    // 唔加賽嘅話，排序 fallback 落個名 → A、B 出線。
    // 加賽由 C 贏晒，所以 C 應該排第一。
    const cWins = [
      played('C', 'A', 'tb3r1m1', 'tiebreak'),
      played('C', 'B', 'tb3r1m2', 'tiebreak'),
      played('A', 'B', 'tb3r1m3', 'tiebreak'),
    ]
    const seeds = poolSeedOrder(ABC, [...CYCLE, ...cWins], 3, 2)
    expect(seeds).toContain('C')
    expect(seeds).toContain('A')
    expect(seeds).not.toContain('B')
  })
})

describe('加賽排名加埋極限次數', () => {
  /** 一場打完嘅加賽，贏家撳兩次「爆咗」攞夠 4 分 —— 一次極限都冇。 */
  function noX(winner: string, loser: string, id: string): Match {
    return {
      id,
      stage: 'tiebreak',
      round: 1,
      order: 1,
      aId: winner,
      bId: loser,
      aFrom: null,
      bFrom: null,
      rounds: [
        { winnerId: winner, finish: 'burst' },
        { winnerId: winner, finish: 'burst' },
      ],
    }
  }

  it('勝場同分差都一樣，靠極限次數拆得開', () => {
    // A 贏 B 4–0（極限 + 轉贏），B 贏 A 4–0（兩次爆咗）。
    // 勝場 1:1、分差 0:0，淨係極限次數唔同。
    const rows = rankByTiebreak(
      ['A', 'B'],
      [played('A', 'B', 'tb3r1m1', 'tiebreak'), noX('B', 'A', 'tb3r1m2')],
    )
    expect(rows.map((r) => r.wins)).toEqual([1, 1])
    expect(rows.map((r) => r.diff)).toEqual([0, 0])
    expect(rows.map((r) => r.id)).toEqual(['A', 'B'])
    expect(rows.map((r) => r.xtreme)).toEqual([1, 0])
  })

  it('線上線下靠極限分得開，就唔使再打多一次加賽', () => {
    // 加賽又打成循環、全部 4–0 —— 勝場同分差全部一樣，舊規則要再打過。
    // 而家 C 贏嗰場冇極限，所以 C 包尾，線上（頭 2 個）同線下分得開。
    const all = [
      ...CYCLE,
      played('A', 'B', 'tb3r1m1', 'tiebreak'), // A 4–0，1 次極限
      noX('C', 'A', 'tb3r1m2'), // C 4–0，0 次極限
      played('B', 'C', 'tb3r1m3', 'tiebreak'), // B 4–0，1 次極限
    ]
    const [state] = tieStates(ABC, all, 3, 2)
    expect(state!.played).toBe(true)
    expect(state!.results.map((r) => r.xtreme)).toEqual([1, 1, 0])
    expect(state!.results[2]!.id).toBe('C')
    expect(state!.resolved).toBe(true)
    expect(tiesPending(ABC, all, 3, 2)).toBe(false)
  })
})

describe('小組排名跟對戰分先後', () => {
  /**
   * A 贏 B、A 贏 C、B 贏 C、B 贏 D、C 贏 D、D 贏 A。
   *
   * A 同 B 都係 2 勝 1 負、8 分、失 4 分、分差 +4、2 次極限 ——
   * 勝場分差全同，輪到對戰：A 贏過 B，直接分得開，唔使加賽。
   */
  const TWO: Match[] = [
    group('A', 'B'),
    group('A', 'C'),
    group('B', 'C'),
    group('B', 'D'),
    group('C', 'D'),
    group('D', 'A'),
  ]

  it('兩個人爭一個位：對戰分得開，唔使加賽', () => {
    const rows = poolStandings(ABC, TWO, 3).find((t) => t.pool === 3)!.rows
    expect(rows.find((r) => r.name === 'A')!.rank).toBe(1)
    expect(rows.find((r) => r.name === 'B')!.rank).toBe(2)
    expect(tiesPending(ABC, TWO, 3, 1)).toBe(false)
  })

  it('三個人回圈：對戰一人一勝拆唔開，加賽照要打', () => {
    const rows = poolStandings(ABC, CYCLE, 3).find((t) => t.pool === 3)!.rows
    for (const name of ['A', 'B', 'C']) {
      expect(rows.find((r) => r.name === name)!.rank).toBe(1)
    }
    expect(tiesPending(ABC, CYCLE, 3, 2)).toBe(true)
  })

  it('poolSeedOrder 跟埋對戰結果', () => {
    expect(poolSeedOrder(ABC, TWO, 3, 2).sort()).toEqual(['A', 'B'])
  })
})

describe('TieState 抽象成一段並列', () => {
  it('小組賽出嚟嘅 state：key 係組號、kind 係 pool', () => {
    const [state] = tieStates(ABC, CYCLE, 3, 2)
    expect(state!.key).toBe(3)
    expect(state!.kind).toBe('pool')
    expect(state!.slots).toBe(2)
  })

  it('nextTiebreakFor 由 state 直接排下一批', () => {
    const first = nextTiebreakFor(tieStates(ABC, CYCLE, 3, 2))
    expect(first).toHaveLength(3)
    expect(first.every((m) => m.round === 1)).toBe(true)
    expect(first.every((m) => m.id.startsWith('tb3r1m'))).toBe(true)

    // 同 nextTiebreak 出一模一樣嘅嘢 —— 後者而家淨係一層殼。
    expect(nextTiebreak(ABC, CYCLE, 3, 2)).toEqual(first)
  })

  it('拆掂咗就唔會再排', () => {
    const all = [
      ...CYCLE,
      played('A', 'B', 'tb3r1m1', 'tiebreak'),
      played('A', 'C', 'tb3r1m2', 'tiebreak'),
      played('B', 'C', 'tb3r1m3', 'tiebreak'),
    ]
    expect(nextTiebreakFor(tieStates(ABC, all, 3, 2))).toHaveLength(0)
  })
})

describe('唔分組嘅並列（rankTieStates）', () => {
  it('循環未打完就返吉，就算而家全部人並列', () => {
    expect(rankTieStates(FOUR, [], null)).toEqual([])
    expect(rankTieStates(FOUR, TOP3_MIDWAY, null)).toEqual([])
  })

  it('一段都冇並列就返吉', () => {
    // A 贏晒、B 贏 C 同 D、C 贏 D、D 全輸 —— 勝場 3/2/1/0。
    const clear = [
      group('A', 'B'),
      group('A', 'C'),
      group('A', 'D'),
      group('B', 'C'),
      group('B', 'D'),
      group('C', 'D'),
    ]
    expect(rankTieStates(FOUR, clear, null)).toEqual([])
  })

  it('單循環：三個人並列第 1 → 一個 state，key 係 1、冇出線線', () => {
    const [s] = rankTieStates(FOUR, TOP3, null)
    expect(s!.key).toBe(1)
    expect(s!.kind).toBe('rank')
    expect(s!.slots).toBeNull()
    expect([...s!.ids].sort()).toEqual(['A', 'B', 'C'])
    expect(s!.attempt).toBe(0)
  })

  it('單循環：兩段並列 → 兩個 state，key 分別係並列嗰個名次', () => {
    // A 贏 C、A 贏 D、B 贏 C、B 贏 D；A 同 B 未打過，C 同 D 都未打過。
    // → A／B 並列第 1（2 勝、8 分、失 0 分、2 次極限），C／D 並列第 3。
    const ms = [group('A', 'C'), group('A', 'D'), group('B', 'C'), group('B', 'D')]
    const states = rankTieStates(FOUR, ms, null)
    expect(states.map((s) => s.key)).toEqual([1, 3])
    expect([...states[0]!.ids].sort()).toEqual(['A', 'B'])
    expect([...states[1]!.ids].sort()).toEqual(['C', 'D'])
  })

  it('兩段並列各自有自己嘅命名空間，加賽 id 唔會撞', () => {
    const ms = [group('A', 'C'), group('A', 'D'), group('B', 'C'), group('B', 'D')]
    const more = nextTiebreakFor(rankTieStates(FOUR, ms, null))
    // 兩段各 2 個人 = 各 1 場。
    expect(more.map((m) => m.id).sort()).toEqual(['tb1r1m1', 'tb3r1m1'])
  })

  it('單循環：包尾嗰段並列都要出 state', () => {
    // A 贏晒 3 場；B、C、D 之間打成回圈，全部 4-0 → B/C/D 並列第 2。
    const ms = [
      group('A', 'B'),
      group('A', 'C'),
      group('A', 'D'),
      group('B', 'C'),
      group('C', 'D'),
      group('D', 'B'),
    ]
    const states = rankTieStates(FOUR, ms, null)
    expect(states).toHaveLength(1)
    expect(states[0]!.key).toBe(2)
    expect([...states[0]!.ids].sort()).toEqual(['B', 'C', 'D'])
  })

  it('單循環冇出線線：加賽拆到頭嗰個但後面兩個一樣，唔算拆掂', () => {
    // 加賽又打成回圈，但贏嘅場數唔同分：A 贏 B 4-0、C 贏 A 4-2、B 贏 C 4-1。
    // 內部分差 A +2、B −1、C −1；勝場同極限次數三個都一樣。
    const tb = [
      played('A', 'B', 'tb1r1m1', 'tiebreak', 0),
      played('C', 'A', 'tb1r1m2', 'tiebreak', 2),
      played('B', 'C', 'tb1r1m3', 'tiebreak', 1),
    ]
    const [s] = rankTieStates(FOUR, [...TOP3, ...tb], null)
    expect(s!.results.map((r) => r.id)).toEqual(['A', 'B', 'C'])
    expect(s!.results.map((r) => r.diff)).toEqual([2, -1, -1])
    expect(s!.resolved).toBe(false)
  })

  it('大循環有出線線：同一批加賽，線上線下分得開就算拆掂', () => {
    const tb = [
      played('A', 'B', 'tb1r1m1', 'tiebreak', 0),
      played('C', 'A', 'tb1r1m2', 'tiebreak', 2),
      played('B', 'C', 'tb1r1m3', 'tiebreak', 1),
    ]
    const [s] = rankTieStates(FOUR, [...TOP3, ...tb], 1)
    expect(s!.slots).toBe(1)
    expect(s!.resolved).toBe(true)
  })

  it('一路分唔開就一路排得落去，三輪都唔會撞 id', () => {
    /** 加賽又打成回圈、全部 4-0 —— 勝場、分差、極限全部一樣，實拆唔掂。 */
    const round = (attempt: number): Match[] => [
      played('A', 'B', `tb1r${attempt}m1`, 'tiebreak'),
      played('B', 'C', `tb1r${attempt}m2`, 'tiebreak'),
      played('C', 'A', `tb1r${attempt}m3`, 'tiebreak'),
    ]

    let all: Match[] = [...TOP3, ...round(1)]
    for (const next of [2, 3]) {
      const states = rankTieStates(FOUR, all, null)
      expect(states[0]!.attempt).toBe(next - 1)
      expect(states[0]!.resolved).toBe(false)

      const more = nextTiebreakFor(states)
      expect(more).toHaveLength(3)
      expect(more.every((m) => m.round === next)).toBe(true)
      expect(more.map((m) => m.id).sort()).toEqual(round(next).map((m) => m.id).sort())
      all = [...all, ...round(next)]
    }

    const ids = all.filter((m) => m.stage === 'tiebreak').map((m) => m.id)
    expect(new Set(ids).size).toBe(9)
  })

  it('大循環：出線線上下分得開就返吉', () => {
    const clear = [
      group('A', 'B'),
      group('A', 'C'),
      group('A', 'D'),
      group('B', 'C'),
      group('B', 'D'),
      group('C', 'D'),
    ]
    expect(rankTieStates(FOUR, clear, 2)).toEqual([])
  })

  it('大循環：頭 2 名入籤表，三個並列第 1 → 三個爭 2 個位', () => {
    const [s] = rankTieStates(FOUR, TOP3, 2)
    expect(s!.kind).toBe('rank')
    expect(s!.key).toBe(1)
    expect(s!.slots).toBe(2)
    expect([...s!.ids].sort()).toEqual(['A', 'B', 'C'])
  })

  it('大循環：並列嗰班全部喺線之上就唔使拆', () => {
    expect(rankTieStates(FOUR, TOP3, 3)).toEqual([])
  })

  it('大循環：循環未打完就返吉', () => {
    expect(rankTieStates(FOUR, TOP3_MIDWAY, 2)).toEqual([])
  })
})

describe('加賽次序套返落排名表（applyRankTiebreaks）', () => {
  /** 打完嘅加賽，指定邊個贏邊個。全部 4-0。 */
  function tbFor(key: number, order: [string, string][]): Match[] {
    return order.map(([w, l], i) => played(w, l, `tb${key}r1m${i + 1}`, 'tiebreak'))
  }

  it('拆掂咗嘅段：按加賽次序重排，並列解開', () => {
    // 加賽：A 贏晒、B 贏 C、C 全輸 → A、B、C
    const all = [...TOP3, ...tbFor(1, [['A', 'B'], ['A', 'C'], ['B', 'C']])]
    const states = rankTieStates(FOUR, all, null)
    expect(states[0]!.resolved).toBe(true)

    const rows = applyRankTiebreaks(computeStandings(FOUR, all), states)
    expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(rows.every((r) => !r.tied)).toBe(true)
  })

  it('拆唔掂嘅段：原封不動，仲係並列', () => {
    // 加賽又打成回圈、全部 4-0 → 勝場、分差、極限全部一樣。
    const all = [...TOP3, ...tbFor(1, [['A', 'B'], ['B', 'C'], ['C', 'A']])]
    const states = rankTieStates(FOUR, all, null)
    expect(states[0]!.resolved).toBe(false)

    const raw = computeStandings(FOUR, all)
    expect(applyRankTiebreaks(raw, states)).toEqual(raw)
  })

  it('未排過加賽，張表原封不動', () => {
    const raw = computeStandings(FOUR, TOP3)
    expect(applyRankTiebreaks(raw, rankTieStates(FOUR, TOP3, null))).toEqual(raw)
  })

  it('重排唔會影響後面嗰啲人嘅名次', () => {
    // A、B 並列第 1（未打過對方），C、D 並列第 3。加賽 A 贏 B、C 贏 D。
    const ms = [group('A', 'C'), group('A', 'D'), group('B', 'C'), group('B', 'D')]
    const all = [...ms, ...tbFor(1, [['A', 'B']]), ...tbFor(3, [['C', 'D']])]
    const states = rankTieStates(FOUR, all, null)
    const rows = applyRankTiebreaks(computeStandings(FOUR, all), states)

    expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(rows.every((r) => !r.tied)).toBe(true)
  })

  it('一段拆掂一段未：拆掂嗰段重排，另一段唔郁', () => {
    // A、B 並列第 1、C、D 並列第 3。淨係第 1 位嗰段打咗加賽。
    const ms = [group('A', 'C'), group('A', 'D'), group('B', 'C'), group('B', 'D')]
    const all = [...ms, ...tbFor(1, [['B', 'A']])]
    const states = rankTieStates(FOUR, all, null)
    const rows = applyRankTiebreaks(computeStandings(FOUR, all), states)

    expect(rows.map((r) => r.name)).toEqual(['B', 'A', 'C', 'D'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 3])
    expect(rows.map((r) => r.tied)).toEqual([false, false, true, true])
  })

  it('唔會改到入面嗰啲 row（唔 mutate 輸入）', () => {
    const all = [...TOP3, ...tbFor(1, [['A', 'B'], ['A', 'C'], ['B', 'C']])]
    const raw = computeStandings(FOUR, all)
    const snapshot = JSON.parse(JSON.stringify(raw))
    applyRankTiebreaks(raw, rankTieStates(FOUR, all, null))
    expect(raw).toEqual(snapshot)
  })

  it('加賽場次一分都唔會入到排名表', () => {
    const all = [...TOP3, ...tbFor(1, [['A', 'B'], ['A', 'C'], ['B', 'C']])]
    expect(computeStandings(FOUR, all)).toEqual(computeStandings(FOUR, TOP3))
  })
})
