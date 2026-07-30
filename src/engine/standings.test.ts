import { describe, expect, it } from 'vitest'
import { completedCount, computeStandings, isTournamentComplete } from './standings'
import { matchKey } from './rules'
import type { Match, Player, RoundResult } from './types'

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `選手${i + 1}`,
    seat: i,
    pool: null,
  }))
}

/** 一場打完嘅對戰：贏家 4 分，輸家 `loserPts` 分（0-3）。 */
function played(aId: string, bId: string, winnerId: string, loserPts: number): Match {
  const loserId = winnerId === aId ? bId : aId
  const rounds: RoundResult[] = []
  for (let i = 0; i < loserPts; i++) rounds.push({ winnerId: loserId, finish: 'spin' })
  for (let i = 0; i < 4; i++) rounds.push({ winnerId, finish: 'spin' })
  return {
    id: matchKey(aId, bId),
    stage: 'group',
    round: 1,
    order: 1,
    aId,
    bId,
    aFrom: null,
    bFrom: null,
    rounds,
  }
}

/** 打緊但未完。 */
function inProgress(aId: string, bId: string, leaderId: string, pts: number): Match {
  const rounds: RoundResult[] = []
  for (let i = 0; i < pts; i++) rounds.push({ winnerId: leaderId, finish: 'spin' })
  return {
    id: matchKey(aId, bId),
    stage: 'group',
    round: 1,
    order: 1,
    aId,
    bId,
    aFrom: null,
    bFrom: null,
    rounds,
  }
}

const order = (rows: { playerId: string }[]) => rows.map((r) => r.playerId)

describe('排名規則', () => {
  it('第 1 條：贏得多排前', () => {
    const rows = computeStandings(players(3), [
      played('p1', 'p2', 'p1', 0),
      played('p1', 'p3', 'p1', 0),
      played('p2', 'p3', 'p2', 0),
    ])
    expect(order(rows)).toEqual(['p1', 'p2', 'p3'])
    expect(rows[0]!.wins).toBe(2)
    expect(rows[0]!.losses).toBe(0)
    expect(rows[2]!.wins).toBe(0)
    expect(rows[2]!.losses).toBe(2)
  })

  it('第 2 條：啱啱兩個人同勝場，對賽成績蓋過總得分', () => {
    // p1 同 p2 都係 2 勝 1 負，但 p2 總得分高過 p1。
    // 因為 p1 當初贏咗 p2，所以 p1 要排喺 p2 前面。
    const rows = computeStandings(players(4), [
      played('p1', 'p2', 'p1', 3),
      played('p1', 'p3', 'p1', 3),
      played('p4', 'p1', 'p4', 0),
      played('p2', 'p3', 'p2', 0),
      played('p2', 'p4', 'p2', 0),
      played('p3', 'p4', 'p3', 0),
    ])

    const p1 = rows.find((r) => r.playerId === 'p1')!
    const p2 = rows.find((r) => r.playerId === 'p2')!
    expect(p1.wins).toBe(2)
    expect(p2.wins).toBe(2)
    expect(p2.pointsFor).toBeGreaterThan(p1.pointsFor) // p2 分多啲
    expect(order(rows).slice(0, 2)).toEqual(['p1', 'p2']) // 但 p1 贏過佢

    expect(p1.rank).toBe(1)
    expect(p2.rank).toBe(2)
    expect(p1.tied).toBe(false)
    expect(p2.tied).toBe(false)
  })

  it('第 2 條唔適用：三個人同勝場就跳去比總得分', () => {
    // 三個人打圈（p1 贏 p2、p2 贏 p3、p3 贏 p1），對賽成績分唔到高低。
    const rows = computeStandings(players(3), [
      played('p1', 'p2', 'p1', 0), // p1 +4 / p2 +0
      played('p2', 'p3', 'p2', 1), // p2 +4 / p3 +1
      played('p3', 'p1', 'p3', 2), // p3 +4 / p1 +2
    ])
    expect(rows.every((r) => r.wins === 1)).toBe(true)
    expect(order(rows)).toEqual(['p1', 'p3', 'p2']) // 總得分 6 / 5 / 4
    expect(rows.map((r) => r.pointsFor)).toEqual([6, 5, 4])
  })

  it('第 4 條：同勝場、同總得分、又未打過對方，就比得失分差', () => {
    const rows = computeStandings(players(4), [
      played('p1', 'p3', 'p1', 0), // p1 4-0
      played('p1', 'p4', 'p1', 2), // p1 4-2 → pf 8, pa 2
      played('p2', 'p3', 'p2', 3), // p2 4-3
      played('p2', 'p4', 'p2', 0), // p2 4-0 → pf 8, pa 3
      // p1 vs p2 未打
    ])
    const p1 = rows.find((r) => r.playerId === 'p1')!
    const p2 = rows.find((r) => r.playerId === 'p2')!
    expect(p1.pointsFor).toBe(p2.pointsFor)
    expect(p1.diff).toBeGreaterThan(p2.diff)
    expect(order(rows).slice(0, 2)).toEqual(['p1', 'p2'])
  })

  it('第 5 條：真係分唔開就並列，共用同一個名次', () => {
    // p2 同 p3 樣樣一樣，而且未打過對方。
    const rows = computeStandings(players(4), [
      played('p1', 'p2', 'p1', 0),
      played('p1', 'p3', 'p1', 0),
      played('p2', 'p4', 'p2', 1),
      played('p3', 'p4', 'p3', 1),
      // p2 vs p3 未打
    ])
    expect(order(rows)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4]) // 競賽式排名，跳過第 3
    expect(rows.map((r) => r.tied)).toEqual([false, true, true, false])
  })

  it('一場都未打，全部人並列第一', () => {
    const rows = computeStandings(players(4), [])
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 1, 1])
    expect(rows.every((r) => r.tied)).toBe(true)
    expect(rows.every((r) => r.played === 0)).toBe(true)
  })
})

describe('未打完嘅場次', () => {
  it('打緊嘅場次一分都唔計，排名唔會打到一半跳嚟跳去', () => {
    const before = computeStandings(players(2), [])
    const during = computeStandings(players(2), [inProgress('p1', 'p2', 'p1', 3)])
    expect(during).toEqual(before)
  })

  it('打完嗰刻先入數', () => {
    const rows = computeStandings(players(2), [played('p1', 'p2', 'p1', 3)])
    const p1 = rows.find((r) => r.playerId === 'p1')!
    expect(p1.played).toBe(1)
    expect(p1.wins).toBe(1)
    expect(p1.pointsFor).toBe(4)
    expect(p1.pointsAgainst).toBe(3)
    expect(p1.diff).toBe(1)
  })

  it('輪空／未輪到嘅人打咗 0 場', () => {
    const rows = computeStandings(players(3), [played('p1', 'p2', 'p1', 0)])
    expect(rows.find((r) => r.playerId === 'p3')!.played).toBe(0)
  })
})

describe('壞資料', () => {
  it('場次入面有唔存在嘅選手就跳過，唔會炸', () => {
    const rows = computeStandings(players(2), [
      played('p1', 'p2', 'p1', 0),
      played('p1', '路人甲', 'p1', 0),
    ])
    expect(rows.find((r) => r.playerId === 'p1')!.played).toBe(1)
    expect(rows).toHaveLength(2)
  })

  it('冇選手就冇排名', () => {
    expect(computeStandings([], [])).toEqual([])
  })
})

describe('賽事進度', () => {
  it('全部打完先算完', () => {
    const ms = [played('p1', 'p2', 'p1', 0), inProgress('p1', 'p3', 'p1', 2)]
    expect(isTournamentComplete(ms)).toBe(false)
    expect(completedCount(ms)).toBe(1)

    const done = [played('p1', 'p2', 'p1', 0), played('p1', 'p3', 'p1', 0)]
    expect(isTournamentComplete(done)).toBe(true)
    expect(completedCount(done)).toBe(2)
  })

  it('一場都冇就唔算完', () => {
    expect(isTournamentComplete([])).toBe(false)
  })
})
