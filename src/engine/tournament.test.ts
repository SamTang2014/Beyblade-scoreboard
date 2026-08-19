import { describe, expect, it } from 'vitest'
import {
  addTiebreak,
  buildCut,
  canStart,
  cutOptions,
  groupStageComplete,
  hasBracket,
  hasStandings,
  nextPlayable,
  standingsTies,
  startTournament,
} from './tournament'
import { bracketMatches, groupMatches } from './schedule'
import { poolsOf } from './pools'
import { propagate } from './bracket'
import { matchStatus, matchWinnerId } from './rules'
import type { Match, Player, Tournament, TournamentMode } from './types'

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `選手${i + 1}`,
    seat: i,
    pool: null,
  }))
}

function tournament(
  mode: TournamentMode,
  n: number,
  cutSize: number | null = null,
  poolCount: number | null = null,
  advancePerPool: number | null = null,
): Tournament {
  return {
    id: 't1',
    name: '測試',
    createdAt: 0,
    updatedAt: 0,
    mode,
    cutSize,
    poolCount,
    advancePerPool,
    players: players(n),
    matches: [],
  }
}

const rng = () => 0.42

/** 逐場打，指定邊個贏（by index into the ready list）。 */
function playThrough(matches: Match[], pickWinner: (m: Match) => string): Match[] {
  let cur = propagate(matches)
  for (let guard = 0; guard < 200; guard++) {
    const next = cur.find((m) => matchStatus(m) === 'pending')
    if (next === undefined) break
    const winnerId = pickWinner(next)
    cur = propagate(
      cur.map((m) =>
        m.id === next.id
          ? { ...m, rounds: Array.from({ length: 4 }, () => ({ winnerId, finish: 'spin' as const })) }
          : m,
      ),
    )
  }
  return cur
}

describe('開波', () => {
  it('單循環：全部係循環階段', () => {
    const ms = startTournament(tournament('roundRobin', 5), rng).matches
    expect(ms).toHaveLength(10)
    expect(ms.every((m) => m.stage === 'group')).toBe(true)
  })

  it('純淘汰：全部係淘汰階段，人數 − 1 場', () => {
    const ms = startTournament(tournament('knockout', 8), rng).matches
    expect(ms).toHaveLength(7)
    expect(ms.every((m) => m.stage === 'bracket')).toBe(true)
  })

  it('純淘汰：每個人都入到籤表', () => {
    const t = tournament('knockout', 6)
    const ms = startTournament(t, rng).matches
    const inBracket = new Set(
      ms.flatMap((m) => [m.aId, m.bId]).filter((x): x is string => x !== null),
    )
    // 首兩輪加埋就見齊所有人（輪空嗰啲喺第二輪出現）。
    expect(inBracket.size).toBe(6)
  })

  it('循環 + 淘汰：開波嗰陣只排循環，籤表要等成績', () => {
    const ms = startTournament(tournament('groupThenKnockout', 6, 4), rng).matches
    expect(ms.every((m) => m.stage === 'group')).toBe(true)
    expect(bracketMatches(ms)).toHaveLength(0)
  })
})

describe('可唔可以開波', () => {
  it('少過 2 個人一定唔得', () => {
    for (const mode of [
      'roundRobin',
      'knockout',
      'groupThenKnockout',
      'poolsThenKnockout',
    ] as TournamentMode[]) {
      expect(canStart(tournament(mode, 1, 4, 2, 2))).toBe(false)
    }
  })

  it('大循環 + 淘汰要有合理嘅入圍人數', () => {
    expect(canStart(tournament('groupThenKnockout', 6, null))).toBe(false)
    expect(canStart(tournament('groupThenKnockout', 6, 8))).toBe(false) // 多過總人數
    expect(canStart(tournament('groupThenKnockout', 6, 4))).toBe(true)
  })

  it('小組賽要有合理嘅組數同出線人數', () => {
    expect(canStart(tournament('poolsThenKnockout', 12, null, null, null))).toBe(false)
    expect(canStart(tournament('poolsThenKnockout', 12, null, 7, 2))).toBe(false) // 冇 7 組呢個選項
    expect(canStart(tournament('poolsThenKnockout', 9, null, 4, 3))).toBe(false) // 最細組得 2 人
    expect(canStart(tournament('poolsThenKnockout', 12, null, 3, 2))).toBe(true)
  })

  it('另外兩個模式唔理入圍人數', () => {
    expect(canStart(tournament('roundRobin', 3))).toBe(true)
    expect(canStart(tournament('knockout', 3))).toBe(true)
  })

  it('入圍人數選項唔會多過總人數', () => {
    expect(cutOptions(3)).toEqual([2])
    expect(cutOptions(8)).toEqual([2, 4, 8])
    expect(cutOptions(20)).toEqual([2, 4, 8, 16])
  })
})

describe('小組賽 + 淘汰', () => {
  function started(n: number, k: number, advance: number) {
    const t = tournament('poolsThenKnockout', n, null, k, advance)
    const r = startTournament(t, rng)
    return { ...t, players: r.players, matches: r.matches }
  }

  it('開波抽組：每個人都有組', () => {
    const t = started(12, 3, 2)
    expect(t.players.every((p) => p.pool !== null)).toBe(true)
  })

  it('開波只排小組賽，籤表要等成績', () => {
    const t = started(12, 3, 2)
    expect(t.matches.every((m) => m.stage === 'group')).toBe(true)
    expect(t.matches).toHaveLength(18)
  })

  /** 入咗一場分，之後就唔准重抽。 */
  function withOneResult(t: Tournament): Tournament {
    const first = t.matches[0]!
    return {
      ...t,
      matches: t.matches.map((m) =>
        m.id === first.id
          ? { ...m, rounds: [{ winnerId: m.aId!, finish: 'xtreme' as const }] }
          : m,
      ),
    }
  }

  it('開咗波之後補返新場次唔會重抽組', () => {
    const t = withOneResult(started(8, 2, 2))
    const before = new Map(t.players.map((p) => [p.id, p.pool]))
    const withLate = {
      ...t,
      players: [...t.players, { id: 'late', name: '阿 May', seat: 8, pool: null }],
    }
    const after = startTournament(withLate, rng)
    for (const p of after.players) {
      if (p.id === 'late') continue
      expect(p.pool).toBe(before.get(p.id))
    }
    expect(after.players.find((p) => p.id === 'late')!.pool).not.toBeNull()
  })

  it('入咗分就唔准重抽 —— 就算改咗組數都唔郁', () => {
    const t = withOneResult(started(8, 2, 2))
    const before = new Map(t.players.map((p) => [p.id, p.pool]))
    const after = startTournament({ ...t, poolCount: 4 }, rng)
    for (const p of after.players) expect(p.pool).toBe(before.get(p.id))
  })

  /**
   * 未入分之前改組數，一定要重抽。
   *
   * 本來呢度睇「有冇人已經有組」，抽完 2 組再改做 3 組就出事：人人都仲有組，
   * 於是行咗補遲到嗰條路，但冇人要補 —— 結果 C 組空咗、場次仲係 2 組嗰批 30 場，
   * 而開賽設定明明應承咗你 3 組 18 場。
   */
  it('未入分之前改組數會重抽，唔會留低空組', () => {
    const t = started(12, 2, 2)
    expect(poolsOf(t.players, 2).map((p) => p.length)).toEqual([6, 6])

    const after = startTournament({ ...t, poolCount: 3 }, rng)
    expect(poolsOf(after.players, 3).map((p) => p.length)).toEqual([4, 4, 4])
    // 3 組每組 4 個人 = 3 × 6 = 18 場，同開賽設定嘅預覽對得返。
    expect(groupMatches(after.matches)).toHaveLength(18)
  })

  it('未入分之前減組數一樣重抽啱', () => {
    const t = started(12, 3, 2)
    const after = startTournament({ ...t, poolCount: 2 }, rng)
    expect(poolsOf(after.players, 2).map((p) => p.length)).toEqual([6, 6])
    expect(groupMatches(after.matches)).toHaveLength(30)
  })

  it('打晒小組賽就砌到籤表，冠軍出到', () => {
    const t = started(8, 2, 2)
    const done = playThrough(t.matches, (m) =>
      Number(m.aId!.slice(1)) < Number(m.bId!.slice(1)) ? m.aId! : m.bId!,
    )
    const played = { ...t, matches: done }
    expect(groupStageComplete(played)).toBe(true)

    const withCut = buildCut(played)
    expect(groupMatches(withCut)).toHaveLength(groupMatches(done).length)
    expect(bracketMatches(withCut)).toHaveLength(3) // 4 個人入籤表

    const finished = playThrough(withCut, (m) => m.aId!)
    expect(bracketMatches(finished).every((m) => matchWinnerId(m) !== null)).toBe(true)
  })

  it('冇設定組數就乜都唔郁', () => {
    const t = started(8, 2, 2)
    expect(buildCut({ ...t, poolCount: null })).toEqual(t.matches)
  })

  it('有排名表', () => {
    expect(hasStandings('poolsThenKnockout')).toBe(true)
  })
})

describe('循環打完轉淘汰', () => {
  function playedGroup(n: number, cut: number): Tournament {
    const t = tournament('groupThenKnockout', n, cut)
    const withSchedule = { ...t, matches: startTournament(t, rng).matches }
    // 種子細嘅永遠贏，令排名可預測。
    const done = playThrough(withSchedule.matches, (m) =>
      Number(m.aId!.slice(1)) < Number(m.bId!.slice(1)) ? m.aId! : m.bId!,
    )
    return { ...withSchedule, matches: done }
  }

  it('循環未打完就唔算完', () => {
    const t = tournament('groupThenKnockout', 4, 2)
    expect(groupStageComplete({ ...t, matches: startTournament(t, rng).matches })).toBe(false)
  })

  it('打完就算完', () => {
    expect(groupStageComplete(playedGroup(4, 2))).toBe(true)
  })

  it('砌籤表：循環場次一場唔少，加埋淘汰場次', () => {
    const t = playedGroup(6, 4)
    const after = buildCut(t)
    expect(groupMatches(after)).toHaveLength(groupMatches(t.matches).length)
    expect(bracketMatches(after)).toHaveLength(3) // 4 個人 → 2 場四強 + 決賽
  })

  it('種子跟排名：第 1 名對最後一個入圍嘅', () => {
    const t = playedGroup(4, 4)
    const bracket = bracketMatches(buildCut(t))
    const first = bracket.filter((m) => m.round === 1)
    // p1 全勝排第一、p4 全敗排第四，兩個首圈就撞。
    expect(first.some((m) => [m.aId, m.bId].sort().join() === ['p1', 'p4'].sort().join())).toBe(true)
    expect(first.some((m) => [m.aId, m.bId].sort().join() === ['p2', 'p3'].sort().join())).toBe(true)
  })

  it('冇設定入圍人數就乜都唔郁', () => {
    const t = playedGroup(4, 2)
    expect(buildCut({ ...t, cutSize: null })).toEqual(t.matches)
  })

  it('砌完就有籤表', () => {
    const t = playedGroup(4, 2)
    expect(hasBracket(t)).toBe(false)
    expect(hasBracket({ ...t, matches: buildCut(t) })).toBe(true)
  })

  it('由頭打到尾，淘汰階段有冠軍', () => {
    const t = playedGroup(6, 4)
    const withCut = buildCut(t)
    const done = playThrough(withCut, (m) => m.aId!)
    expect(bracketMatches(done).every((m) => matchWinnerId(m) !== null)).toBe(true)
  })
})

describe('而家應該打邊場', () => {
  it('跳過對手未定嘅場次', () => {
    const ms = startTournament(tournament('knockout', 4), rng).matches
    const next = nextPlayable(ms)
    expect(next).not.toBeNull()
    expect(next!.round).toBe(1) // 決賽對手未定，唔會揀到
    expect(next!.aId).not.toBeNull()
    expect(next!.bId).not.toBeNull()
  })

  it('全部打完就冇下一場', () => {
    const done = playThrough(startTournament(tournament('knockout', 4), rng).matches, (m) => m.aId!)
    expect(nextPlayable(done)).toBeNull()
  })

  it('一場都冇就返 null', () => {
    expect(nextPlayable([])).toBeNull()
  })
})

describe('邊個模式有排名表', () => {
  it('純淘汰冇 —— 淘汰賽分唔到第 3 名', () => {
    expect(hasStandings('knockout')).toBe(false)
    expect(hasStandings('roundRobin')).toBe(true)
    expect(hasStandings('groupThenKnockout')).toBe(true)
  })
})

/** 幫全部未打嘅加賽場次入分，贏家由 id 查表。 */
function playTiebreaks(t: Tournament, winners: Record<string, string>): Tournament {
  return {
    ...t,
    matches: t.matches.map((m) =>
      m.stage === 'tiebreak' && m.rounds.length === 0 && winners[m.id] !== undefined
        ? {
            ...m,
            rounds: Array.from({ length: 4 }, () => ({
              winnerId: winners[m.id]!,
              finish: 'spin' as const,
            })),
          }
        : m,
    ),
  }
}

/** 排完賽程再逐場打完，贏家由場次 id 查表（循環階段 id = 雙方 id 排序後駁埋）。 */
function playGroupStage(
  mode: TournamentMode,
  cutSize: number | null,
  winners: Record<string, string>,
): Tournament {
  const base = tournament(mode, 4, cutSize)
  const started = startTournament(base, rng)
  return {
    ...base,
    players: started.players,
    matches: playThrough(started.matches, (m) => winners[m.id]!),
  }
}

describe('三個模式都搵到並列', () => {
  /**
   * p1 贏 p2、p1 贏 p3、p4 贏 p1、p2 贏 p3、p2 贏 p4、p3 贏 p4。
   * → p1／p2 都係 2 勝 1 負、分差 +4；p3／p4 都係 1 勝 2 負、分差 −4。
   *   勝場分差孖住，但單循環人人打過人人 —— 對戰（p1 贏過 p2、p3 贏過 p4）
   *   直接拆到，唔使加賽。
   */
  const TWO_TIES: Record<string, string> = {
    p1__p2: 'p1',
    p1__p3: 'p1',
    p1__p4: 'p4',
    p2__p3: 'p2',
    p2__p4: 'p2',
    p3__p4: 'p3',
  }

  it('純淘汰冇排名表，一律返吉', () => {
    expect(standingsTies(tournament('knockout', 4))).toEqual([])
  })

  it('單循環未打完唔出聲', () => {
    expect(standingsTies(tournament('roundRobin', 4))).toEqual([])
  })

  it('大循環未揀入籤人數就返吉', () => {
    expect(standingsTies(tournament('groupThenKnockout', 4, null))).toEqual([])
  })

  it('單循環：孖住並列但打過對方 —— 對戰直接拆咗，唔使加賽', () => {
    expect(standingsTies(playGroupStage('roundRobin', null, TWO_TIES))).toEqual([])
  })

  /**
   * p1 贏晒 3 場；p2／p3／p4 打成回圈 → 三個並列第 2。
   * 三個人先至砌得出「加賽又打成回圈」，兩個人嘅加賽一定有贏家。
   */
  const THREE_WAY: Record<string, string> = {
    p1__p2: 'p1',
    p1__p3: 'p1',
    p1__p4: 'p1',
    p2__p3: 'p2',
    p3__p4: 'p3',
    p2__p4: 'p4',
  }

  it('單循環：一路分唔開就一路排得落去，唔設上限', () => {
    let t = playGroupStage('roundRobin', null, THREE_WAY)
    expect(standingsTies(t)).toHaveLength(1)
    expect(standingsTies(t)[0]!.ids).toHaveLength(3)

    for (const attempt of [1, 2, 3]) {
      t = { ...t, matches: addTiebreak(t) }
      const s = standingsTies(t)[0]!
      expect(s.attempt).toBe(attempt)
      expect(s.matches).toHaveLength(3)

      // 加賽又打成回圈、全部 4-0 → 勝場、分差、極限全部一樣，實拆唔掂。
      t = playTiebreaks(t, {
        [`tb2r${attempt}m1`]: 'p2', // p2 贏 p3
        [`tb2r${attempt}m2`]: 'p4', // p4 贏 p2
        [`tb2r${attempt}m3`]: 'p3', // p3 贏 p4
      })
      expect(standingsTies(t)[0]!.resolved).toBe(false)
    }

    const tbIds = t.matches.filter((m) => m.stage === 'tiebreak').map((m) => m.id)
    expect(new Set(tbIds).size).toBe(9) // 三輪 × 三場，一個都冇撞
  })

  it('單循環：排到加賽 → 打完就拆掂 → 唔會再排', () => {
    // 三個人打成回圈，對戰一人一勝拆唔開 —— 呢種先真係要加賽。
    const t = playGroupStage('roundRobin', null, THREE_WAY)
    const before = t.matches.length

    const withTb = { ...t, matches: addTiebreak(t) }
    expect(withTb.matches).toHaveLength(before + 3) // 三個人 = 3 場
    expect(standingsTies(withTb).every((s) => !s.resolved)).toBe(true)

    // p2 兩勝、p3 一勝、p4 零勝 —— 加賽排到晒先後。
    const done = playTiebreaks(withTb, { tb2r1m1: 'p2', tb2r1m2: 'p2', tb2r1m3: 'p3' })
    expect(standingsTies(done).every((s) => s.resolved)).toBe(true)
    expect(addTiebreak(done)).toEqual(done.matches) // 冇嘢要再排
  })
})

describe('大循環出線線並列', () => {
  /**
   * p1 贏晒 3 場；p2／p3／p4 打成回圈。
   * → p1 第 1，p2／p3／p4 三個並列第 2。頭 2 名入籤表 = 三個爭最後一個位。
   */
  const CUT_TIE: Record<string, string> = {
    p1__p2: 'p1',
    p1__p3: 'p1',
    p1__p4: 'p1',
    p2__p3: 'p2',
    p3__p4: 'p3',
    p2__p4: 'p4',
  }

  const atTheCut = () => playGroupStage('groupThenKnockout', 2, CUT_TIE)

  it('三個爭最後一個入籤表位 → 砌唔到籤表', () => {
    const t = atTheCut()
    const [s] = standingsTies(t)
    expect(s!.kind).toBe('rank')
    expect(s!.key).toBe(2)
    expect(s!.slots).toBe(1)
    expect(s!.ids).toHaveLength(3)
    // 呢度本來乜 check 都冇，會靜靜雞按個名攞頭 2 個。
    expect(buildCut(t)).toEqual(t.matches)
  })

  it('打完加賽就砌到，而且種子跟加賽次序唔係跟個名', () => {
    const t = atTheCut()
    const withTb = { ...t, matches: addTiebreak(t) }
    // 三個人 = 3 場：m1 = p2 對 p3、m2 = p2 對 p4、m3 = p3 對 p4。
    // p4 贏晒兩場做加賽第一 —— 佢個名排最後，所以拎到佢就證明唔係靠個名。
    const done = playTiebreaks(withTb, { tb2r1m1: 'p2', tb2r1m2: 'p4', tb2r1m3: 'p4' })
    expect(standingsTies(done)[0]!.resolved).toBe(true)

    const bracket = bracketMatches(buildCut(done))
    expect(bracket.length).toBeGreaterThan(0)
    const inBracket = new Set(
      bracket.flatMap((m) => [m.aId, m.bId]).filter((x): x is string => x !== null),
    )
    expect(inBracket).toEqual(new Set(['p1', 'p4']))
  })
})
