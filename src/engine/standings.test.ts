import { describe, expect, it } from 'vitest'
import { completedCount, computeStandings, isTournamentComplete } from './standings'
import { matchKey, xtremeInMatch, xtremeWins } from './rules'
import type { FinishType, Match, Player, RoundResult } from './types'

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

/**
 * 逐 round 砌一場，測極限次數同精準分數嗰陣用。
 * `['a:xtreme', 'b:spin', 'a:spin']` = a 極限、b 轉贏、a 轉贏。
 */
function rounds(aId: string, bId: string, spec: string[]): Match {
  const rs: RoundResult[] = spec.map((s) => {
    const [side, finish] = s.split(':')
    return { winnerId: side === 'a' ? aId : bId, finish: finish as FinishType }
  })
  return {
    id: matchKey(aId, bId),
    stage: 'group',
    round: 1,
    order: 1,
    aId,
    bId,
    aFrom: null,
    bFrom: null,
    rounds: rs,
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

  it('第 2 條：同勝場就比極限勝出次數，總得分高都冇用', () => {
    // p1 同 p2 都係 1 勝 1 負。p2 總得分高（7 對 4），但 p1 有一次極限。
    // 新規則極限行先：p1 排前。
    const rows = computeStandings(players(4), [
      rounds('p1', 'p3', ['a:xtreme', 'b:spin', 'a:spin']), // p1 4-1，一次極限
      rounds('p4', 'p1', ['a:spin', 'a:spin', 'a:spin', 'a:spin']), // p1 0-4
      rounds('p2', 'p4', ['a:spin', 'a:spin', 'a:spin', 'a:spin']), // p2 4-0，冇極限
      rounds('p3', 'p2', ['b:spin', 'b:spin', 'a:spin', 'a:spin', 'b:spin', 'a:spin', 'a:spin']), // p2 3-4 輸
    ])

    const p1 = rows.find((r) => r.playerId === 'p1')!
    const p2 = rows.find((r) => r.playerId === 'p2')!
    expect(p1.wins).toBe(p2.wins)
    expect(p2.pointsFor).toBeGreaterThan(p1.pointsFor)
    expect(p1.xtremeWins).toBe(1)
    expect(p2.xtremeWins).toBe(0)
    expect(p1.rank).toBeLessThan(p2.rank)
  })

  it('第 3 條：同勝場同極限就比總得分，對賽成績唔再蓋過佢', () => {
    // p1 同 p2 都係 2 勝 1 負，p1 贏咗 p2，但 p2 總得分高過 p1。
    // 舊規則 p1 排前（贏過你）；新規則 p2 排前（打得靚啲）。
    const ms = [
      played('p1', 'p2', 'p1', 3),
      played('p1', 'p3', 'p1', 3),
      played('p4', 'p1', 'p4', 0),
      played('p2', 'p3', 'p2', 0),
      played('p2', 'p4', 'p2', 0),
      played('p3', 'p4', 'p3', 0),
    ]

    const rows = computeStandings(players(4), ms)
    const p1 = rows.find((r) => r.playerId === 'p1')!
    const p2 = rows.find((r) => r.playerId === 'p2')!
    expect(p1.wins).toBe(2)
    expect(p2.wins).toBe(2)
    expect(p2.pointsFor).toBeGreaterThan(p1.pointsFor)
    expect(order(rows).slice(0, 2)).toEqual(['p2', 'p1'])

    // 開咗選項都一樣 —— 得分已經分到高低，根本輪唔到對賽成績。
    expect(order(computeStandings(players(4), ms, true)).slice(0, 2)).toEqual(['p2', 'p1'])
  })

  it('三個人打圈、同勝場，一樣係直接比總得分', () => {
    // 三個人打圈（p1 贏 p2、p2 贏 p3、p3 贏 p1），對賽成績本來就分唔到高低。
    const rows = computeStandings(players(3), [
      played('p1', 'p2', 'p1', 0), // p1 +4 / p2 +0
      played('p2', 'p3', 'p2', 1), // p2 +4 / p3 +1
      played('p3', 'p1', 'p3', 2), // p3 +4 / p1 +2
    ])
    expect(rows.every((r) => r.wins === 1)).toBe(true)
    expect(order(rows)).toEqual(['p1', 'p3', 'p2']) // 總得分 6 / 5 / 4
    expect(rows.map((r) => r.pointsFor)).toEqual([6, 5, 4])
  })

  it('第 4 條：同勝場、同極限、同總得分、又未打過對方，就比得失分差', () => {
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

  it('第 2 條（補）：連得分分差都一樣，一樣係極限分先後', () => {
    // p1 同 p2 都係贏一場 4-1、輸一場 1-4，但 p1 靠極限攞分。
    const rows = computeStandings(players(4), [
      rounds('p1', 'p3', ['a:xtreme', 'b:spin', 'a:spin']), // p1 4-1，一次極限
      rounds('p4', 'p1', ['a:xtreme', 'b:spin', 'a:spin']), // p1 1-4
      rounds('p2', 'p3', ['a:spin', 'a:spin', 'b:spin', 'a:spin', 'a:spin']), // p2 4-1，冇極限
      rounds('p4', 'p2', ['a:spin', 'a:spin', 'b:spin', 'a:spin', 'a:spin']), // p2 1-4
    ])

    const p1 = rows.find((r) => r.playerId === 'p1')!
    const p2 = rows.find((r) => r.playerId === 'p2')!
    expect([p1.wins, p1.pointsFor, p1.diff]).toEqual([p2.wins, p2.pointsFor, p2.diff])
    expect(p1.xtremeWins).toBe(1)
    expect(p2.xtremeWins).toBe(0)
    // p4 兩場全贏，佢喺最前 —— 呢度只關心 p1 同 p2 之間邊個排前。
    expect(p1.rank).toBeLessThan(p2.rank)
    expect(p1.tied).toBe(false)
    expect(p2.tied).toBe(false)
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

describe('對賽成績（小循環）', () => {
  /**
   * 三個人並列嘅時候拆唔拆得開，睇個組有冇其他人。
   *
   * 三個人自己一組打成回圈：佢哋之間嘅場次**就係**全部場次，所以內部數字
   * 一定等於整體數字 —— 主鏈已經全同，內部就實全同，點拆都拆唔開。
   * 要拆得開，個組一定要大過並列嗰班人（下面用 5 個人，p4／p5 食走個差額）。
   */

  it('兩個人並列：閂咗就並列，開咗就贏過對方嗰個排前', () => {
    // p2 贏 p3 4-1、p4 贏 p2 4-1、p3 贏 p1 4-1。
    // p2 同 p3 都係 1 勝 1 負、5 分、失 5 分、分差 0、1 次極限。
    const ms = [
      rounds('p2', 'p3', ['b:spin', 'a:xtreme', 'a:spin']), // p2 4-1，p2 一次極限
      rounds('p4', 'p2', ['b:spin', 'a:xtreme', 'a:spin']), // p4 4-1
      rounds('p3', 'p1', ['b:spin', 'a:xtreme', 'a:spin']), // p3 4-1，p3 一次極限
    ]

    const off = computeStandings(players(4), ms)
    const p2off = off.find((r) => r.playerId === 'p2')!
    const p3off = off.find((r) => r.playerId === 'p3')!
    expect([p2off.wins, p2off.pointsFor, p2off.diff, p2off.xtremeWins]).toEqual([
      p3off.wins,
      p3off.pointsFor,
      p3off.diff,
      p3off.xtremeWins,
    ])
    expect(p2off.rank).toBe(p3off.rank)
    expect(p2off.tied).toBe(true)
    expect(p3off.tied).toBe(true)

    const on = computeStandings(players(4), ms, true)
    const p2on = on.find((r) => r.playerId === 'p2')!
    const p3on = on.find((r) => r.playerId === 'p3')!
    expect(p2on.rank).toBeLessThan(p3on.rank)
    expect(p2on.tied).toBe(false)
    expect(p3on.tied).toBe(false)
  })

  it('兩個人並列但未打過對方：開咗都仲係並列', () => {
    const rows = computeStandings(
      players(4),
      [
        played('p1', 'p2', 'p1', 0),
        played('p1', 'p3', 'p1', 0),
        played('p2', 'p4', 'p2', 1),
        played('p3', 'p4', 'p3', 1),
        // p2 vs p3 未打
      ],
      true,
    )
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4])
    expect(rows.map((r) => r.tied)).toEqual([false, true, true, false])
  })

  /**
   * 5 個人一組。p1／p2／p3 三個主鏈四樣全同（2 勝 2 負、10 分、失 10 分、
   * 分差 0、1 次極限），而佢哋之間打成回圈。p4 全輸、p5 全贏，食走個差額。
   *
   * 佢哋之間嗰三場（m1／m2／m3）計出嚟：
   *   內部勝場   p1 1、p2 1、p3 1      ← 拆唔開
   *   內部分差   p1 +2、p2 −1、p3 −1   ← 拆到 p1
   *   內部極限   p2 1、p3 0            ← 再拆到 p2 同 p3
   *
   * 一個 fixture 同時試到小循環第 2 層同第 3 層。
   */
  const FIVE: Match[] = [
    // p1／p2／p3 之間嘅回圈
    rounds('p1', 'p2', ['a:spin', 'a:spin', 'a:spin', 'a:spin']), // p1 4-0
    rounds('p2', 'p3', ['b:spin', 'a:xtreme', 'a:spin']), // p2 4-1，p2 一次極限
    rounds('p3', 'p1', ['b:spin', 'b:spin', 'a:spin', 'a:spin', 'a:spin', 'a:spin']), // p3 4-2
    // 三個都贏 p4
    rounds('p1', 'p4', ['b:spin', 'b:spin', 'a:xtreme', 'a:spin']), // p1 4-2，p1 一次極限
    rounds('p2', 'p4', ['b:spin', 'a:spin', 'a:spin', 'a:spin', 'a:spin']), // p2 4-1
    rounds('p3', 'p4', ['a:xtreme', 'a:spin']), // p3 4-0，p3 一次極限
    // 三個都輸俾 p5
    rounds('p1', 'p5', ['b:spin', 'b:spin', 'b:spin', 'b:spin']), // p5 4-0
    rounds('p2', 'p5', ['a:spin', 'a:spin', 'b:spin', 'b:spin', 'b:spin', 'b:spin']), // p5 4-2
    rounds('p3', 'p5', ['a:spin', 'b:spin', 'b:spin', 'b:spin', 'b:spin']), // p5 4-1
    rounds('p4', 'p5', ['b:spin', 'b:spin', 'b:spin', 'b:spin']), // p5 4-0
  ]

  it('三個人主鏈四樣全同：閂咗三個一齊並列', () => {
    const rows = computeStandings(players(5), FIVE)
    const three = ['p1', 'p2', 'p3'].map((id) => rows.find((r) => r.playerId === id)!)
    for (const r of three) {
      expect([r.wins, r.pointsFor, r.pointsAgainst, r.diff, r.xtremeWins]).toEqual([2, 10, 10, 0, 1])
      expect(r.tied).toBe(true)
    }
    expect(new Set(three.map((r) => r.rank)).size).toBe(1)
  })

  it('開咗：內部分差拆到 p1，內部極限再拆到 p2 同 p3', () => {
    const rows = computeStandings(players(5), FIVE, true)
    const of = (id: string) => rows.find((r) => r.playerId === id)!
    // p5 四場全勝排最前，跟住先到呢三個。
    expect(of('p1').rank).toBeLessThan(of('p2').rank)
    expect(of('p2').rank).toBeLessThan(of('p3').rank)
    for (const id of ['p1', 'p2', 'p3']) expect(of(id).tied).toBe(false)
  })

  it('三個人自己一組打成回圈：內部同整體一模一樣，開咗都拆唔開', () => {
    const cycle = [
      rounds('p1', 'p2', ['b:spin', 'a:xtreme', 'a:spin']), // p1 4-1
      rounds('p2', 'p3', ['b:spin', 'a:xtreme', 'a:spin']), // p2 4-1
      rounds('p3', 'p1', ['b:spin', 'a:xtreme', 'a:spin']), // p3 4-1
    ]
    for (const headToHead of [false, true]) {
      const rows = computeStandings(players(3), cycle, headToHead)
      expect(rows.every((r) => r.rank === 1)).toBe(true)
      expect(rows.every((r) => r.tied)).toBe(true)
    }
  })

  it('小循環淨係計並列嗰班人之間嘅場次', () => {
    // p1 贏 p2、p2 贏 p3、p3 贏 p1，三個都贏 p4 —— 但 p3 贏 p4 嗰場俾人攞咗 2 分，
    // 所以 p3 分差細過另外兩個，主鏈已經拆咗佢出嚟。並列嘅只有 p1 同 p2，
    // 小循環就只會翻佢哋之間嗰一場，唔關 p3、p4 事。
    const ms = [
      played('p1', 'p2', 'p1', 0),
      played('p2', 'p3', 'p2', 0),
      played('p3', 'p1', 'p3', 0),
      played('p1', 'p4', 'p1', 0),
      played('p2', 'p4', 'p2', 0),
      played('p3', 'p4', 'p3', 2),
    ]

    const off = computeStandings(players(4), ms)
    const p1off = off.find((r) => r.playerId === 'p1')!
    const p2off = off.find((r) => r.playerId === 'p2')!
    expect(p1off.rank).toBe(p2off.rank)
    expect(p1off.tied).toBe(true)

    const on = computeStandings(players(4), ms, true)
    const rank = (id: string) => on.find((r) => r.playerId === id)!.rank
    expect(rank('p1')).toBeLessThan(rank('p2')) // p1 贏過 p2
    expect(rank('p2')).toBeLessThan(rank('p3')) // p3 分差細，主鏈已經輸咗
  })
})

/**
 * 入分版名下面嗰個 ⚡ 同排名表嗰欄一定要係同一個數。
 *
 * 入分版唔會叫 computeStandings（佢淨係有一場），佢叫 xtremeWins 餵成批小組場次。
 * 兩條路要行到同一個答案，否則同一個標籤喺兩個畫面出兩個數。
 */
describe('入分版同排名表出同一個數', () => {
  it('xtremeWins 餵晒小組場次 = 排名表嗰欄', () => {
    const ms = [
      rounds('p1', 'p2', ['a:xtreme', 'b:spin', 'a:spin']),
      rounds('p3', 'p1', ['a:xtreme', 'b:spin', 'a:spin']),
      rounds('p2', 'p3', ['a:burst', 'b:xtreme', 'a:burst']),
      rounds('p1', 'p4', ['a:xtreme', 'a:xtreme']),
    ]
    const rows = computeStandings(players(4), ms)
    for (const r of rows) {
      expect(xtremeWins(ms, r.playerId)).toBe(r.xtremeWins)
    }
  })

  it('打緊嗰場兩邊都唔計，淡色嗰個 +N 要靠 xtremeInMatch', () => {
    const live = rounds('p1', 'p2', ['a:xtreme']) // a 3 分，未夠 4
    const rows = computeStandings(players(2), [live])
    expect(rows.find((r) => r.playerId === 'p1')!.xtremeWins).toBe(0)
    expect(xtremeWins([live], 'p1')).toBe(0)
    expect(xtremeInMatch(live, 'p1')).toBe(1)
  })

  it('呢場一打完，主數就食咗佢', () => {
    const done = rounds('p1', 'p2', ['a:xtreme', 'a:spin']) // a 4，打完
    expect(computeStandings(players(2), [done]).find((r) => r.playerId === 'p1')!.xtremeWins).toBe(1)
    expect(xtremeWins([done], 'p1')).toBe(1)
  })
})
