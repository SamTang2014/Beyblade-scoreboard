import { describe, expect, it } from 'vitest'
import {
  buildTiebreak,
  nextTiebreak,
  poolSeedOrder,
  poolStandings,
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
