import { describe, expect, it } from 'vitest'
import { addTiebreak, buildCut, groupStageComplete, hasBracket, startTournament } from './tournament'
import { advanceOptions, poolOptions, poolSeedOrder, poolStandings, poolsOf, tiesPending } from './pools'
import { bracketMatches, groupMatches } from './schedule'
import { bracketChampion, propagate } from './bracket'
import { matchWinnerId } from './rules'
import { parseTournament } from '../storage/storage'
import type { Match, Player, Tournament } from './types'

/**
 * 一場小組賽由頭到尾嘅生命週期。
 *
 * 單元測試逐個 function 驗得好齊，但今次做落去出事嘅三個 bug 全部唔喺任何一個
 * function 入面 —— 佢哋喺兩個階段之間嗰條縫：改咗組數再排、除名到組冇人、
 * 砌咗籤表之後先加人。所以呢度特登唔逐個 function 驗，而係砌一場真賽事行到尾。
 */

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `選手${i}`,
    seat: i,
    pool: null,
  }))
}

function tour(over: Partial<Tournament> = {}): Tournament {
  return {
    id: 't',
    name: '測試',
    createdAt: 0,
    updatedAt: 0,
    mode: 'poolsThenKnockout',
    cutSize: null,
    poolCount: 3,
    advancePerPool: 2,
    players: players(12),
    matches: [],
    ...over,
  }
}

/** 定死嘅假 rng —— 唔用 Math.random，測試先重複到。 */
function rngFrom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function start(t: Tournament, seed = 7): Tournament {
  const r = startTournament(t, rngFrom(seed))
  return { ...t, players: r.players, matches: r.matches }
}

/** 每場藍邊 4–0 贏。已經有分嘅唔郁。 */
function winAll(ms: Match[]): Match[] {
  return ms.map((m) =>
    m.aId === null || m.bId === null || m.rounds.length > 0
      ? m
      : {
          ...m,
          rounds: [
            { winnerId: m.aId, finish: 'xtreme' as const },
            { winnerId: m.aId, finish: 'burst' as const },
          ],
        },
  )
}

/** 由頭打到尾，包埋淘汰階段一場接一場推進。 */
function playToEnd(t: Tournament): Tournament {
  let cur = t
  for (let guard = 0; guard < 200; guard++) {
    const next = cur.matches.find(
      (m) => m.aId !== null && m.bId !== null && matchWinnerId(m) === null,
    )
    if (next === undefined) return cur
    // 次序原封不動 —— 重排嘅話會遮住排序上面嘅問題。
    cur = {
      ...cur,
      matches: propagate(
        cur.matches.map((m) => (m.id === next.id ? winAll([m])[0]! : m)),
      ),
    }
  }
  throw new Error('打唔完 —— 可能推進卡死咗')
}

/**
 * 出線線上面分唔開就排加賽，打完再睇 —— 打到分得開為止。
 *
 * 呢度每場都係藍邊贏，所以加賽一次就分到（排頭嗰個贏晒）。真實比賽可能要打多次，
 * 所以照樣行個迴圈，順便驗證迴圈真係會停。
 */
function settleTies(t: Tournament, poolCount: number, advancePerPool: number): Tournament {
  let cur = t
  for (let guard = 0; guard < 5; guard++) {
    if (!tiesPending(cur.players, cur.matches, poolCount, advancePerPool)) return cur
    const added = addTiebreak(cur)
    if (added === cur.matches) throw new Error('拆唔掂又排唔到加賽 —— 卡死咗')
    cur = { ...cur, matches: winAll(added) }
  }
  throw new Error('加賽打咗 5 次都拆唔掂')
}

/** 學 Setup.tsx 除名：連佢打過嘅場次一齊剷。 */
function remove(t: Tournament, ids: string[]): Tournament {
  return {
    ...t,
    players: t.players.filter((p) => !ids.includes(p.id)),
    matches: t.matches.filter((m) => !ids.includes(m.aId ?? '') && !ids.includes(m.bId ?? '')),
  }
}

describe('每個介面做得出嘅組合都行到尾', () => {
  const combos: [number, number, number][] = []
  for (let n = 4; n <= 26; n++) {
    for (const k of poolOptions(n)) {
      for (const a of advanceOptions(n, k)) combos.push([n, k, a])
    }
  }

  it(`${combos.length} 個組合：冇跨組對戰、場數啱、首圈冇同組內戰、出到冠軍`, () => {
    const bad: string[] = []

    for (const [n, k, a] of combos) {
      const t = start(tour({ players: players(n), poolCount: k, advancePerPool: a }))
      const poolOf = new Map(t.players.map((p) => [p.id, p.pool]))
      const tag = `${n} 人 ${k} 組出 ${a} 個`

      if (groupMatches(t.matches).some((m) => poolOf.get(m.aId!) !== poolOf.get(m.bId!))) {
        bad.push(`${tag}：有跨組對戰`)
      }

      const sizes = poolsOf(t.players, k).map((p) => p.length)
      const want = sizes.reduce((s, x) => s + (x * (x - 1)) / 2, 0)
      if (groupMatches(t.matches).length !== want) {
        bad.push(`${tag}：場數 ${groupMatches(t.matches).length} ≠ ${want}`)
      }

      const played = settleTies({ ...t, matches: winAll(t.matches) }, k, a)
      if (!groupStageComplete(played)) bad.push(`${tag}：小組賽打唔完`)

      const withCut = { ...played, matches: buildCut(played) }
      if (bracketMatches(withCut.matches).length === 0) bad.push(`${tag}：砌唔到籤表`)
      const clash = bracketMatches(withCut.matches)
        .filter((m) => m.round === 1)
        .filter((m) => m.aId && m.bId && poolOf.get(m.aId) === poolOf.get(m.bId)).length
      if (clash > 0) bad.push(`${tag}：首圈有 ${clash} 場同組內戰`)

      if (bracketChampion(playToEnd(withCut).matches) === null) bad.push(`${tag}：冇冠軍`)
    }

    expect(bad).toEqual([])
  })
})

describe('未入分之前改設定', () => {
  it('改組數會重抽，唔會留低空組', () => {
    for (const [from, to] of [
      [2, 3],
      [3, 2],
      [2, 6],
      [6, 2],
      [4, 5],
    ] as const) {
      const t = start(tour({ poolCount: from, advancePerPool: 1 }))
      const sizes = poolsOf(start({ ...t, poolCount: to }).players, to).map((p) => p.length)
      expect(sizes.every((s) => s >= 2), `${from} 組改 ${to} 組出咗空組：${sizes}`).toBe(true)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(12)
    }
  })
})

describe('入咗分之後', () => {
  /** 打咗頭幾場嘅賽事。 */
  function scored(t: Tournament, howMany: number): Tournament {
    return {
      ...t,
      matches: winAll(t.matches.slice(0, howMany)).concat(t.matches.slice(howMany)),
    }
  }

  it('改組數一個人都唔會郁', () => {
    const t = scored(start(tour({ poolCount: 3 })), 1)
    const before = new Map(t.players.map((p) => [p.id, p.pool]))
    for (const p of start({ ...t, poolCount: 6 }).players) {
      expect(p.pool).toBe(before.get(p.id))
    }
  })

  it('加人：入最細組，舊成績一場都唔郁', () => {
    const t = scored(start(tour({ poolCount: 3 })), 2)
    const after = start({
      ...t,
      players: [...t.players, { id: 'late', name: '阿May', seat: 99, pool: null }],
    })
    for (const old of t.matches) {
      const same = after.matches.find((m) => m.id === old.id)
      expect(same, `${old.id} 唔見咗`).toBeDefined()
      expect(same!.rounds).toEqual(old.rounds)
    }
    expect(after.players.find((p) => p.id === 'late')!.pool).not.toBeNull()
    expect(after.matches.filter((m) => m.aId === 'late' || m.bId === 'late')).toHaveLength(4)
  })

  it('砌咗籤表之後加人，籤表唔會俾人劏走', () => {
    const played = playToEnd(start(tour({ players: players(8), poolCount: 2, advancePerPool: 2 })))
    const withCut = { ...played, matches: buildCut(played) }
    const before = bracketMatches(withCut.matches).length
    expect(before).toBeGreaterThan(0)
    const after = start({
      ...withCut,
      players: [...withCut.players, { id: 'late', name: '阿May', seat: 99, pool: null }],
    })
    expect(bracketMatches(after.matches)).toHaveLength(before)
  })
})

describe('除名到組唔夠人', () => {
  it('某組剩 1 個：種子少咗一個，但籤表照砌得出冠軍', () => {
    const t = start(tour({ players: players(9), poolCount: 3, advancePerPool: 2 }))
    const a = poolsOf(t.players, 3)[0]!
    const cut = remove({ ...t, matches: winAll(t.matches) }, [a[0]!.id, a[1]!.id])
    expect(groupStageComplete(cut)).toBe(true)
    const settled = settleTies(cut, 3, 2)
    expect(poolSeedOrder(settled.players, settled.matches, 3, 2)).toHaveLength(5)
    expect(
      bracketChampion(playToEnd({ ...settled, matches: buildCut(settled) }).matches),
    ).not.toBeNull()
  })

  it('某組剩 0 個：排名版出一張空表，唔會炸', () => {
    const t = start(tour({ players: players(6), poolCount: 3, advancePerPool: 1 }))
    const a = poolsOf(t.players, 3)[0]!
    const cut = remove(
      { ...t, matches: winAll(t.matches) },
      a.map((p) => p.id),
    )
    expect(poolStandings(cut.players, cut.matches, 3).map((x) => x.rows.length)).toEqual([0, 2, 2])
    const settled = settleTies(cut, 3, 1)
    expect(
      bracketChampion(playToEnd({ ...settled, matches: buildCut(settled) }).matches),
    ).not.toBeNull()
  })
})

describe('籤表', () => {
  it('每個階段 hasBracket / groupStageComplete 都答啱', () => {
    const t = start(tour())
    expect([groupStageComplete(t), hasBracket(t)]).toEqual([false, false])

    const played = { ...t, matches: winAll(t.matches) }
    expect([groupStageComplete(played), hasBracket(played)]).toEqual([true, false])

    const withCut = { ...played, matches: buildCut(played) }
    expect([groupStageComplete(withCut), hasBracket(withCut)]).toEqual([true, true])
  })

  it('重複撳「砌籤表」唔會砌多份', () => {
    const t = start(tour())
    const done = { ...t, matches: winAll(t.matches) }
    const once = buildCut(done)
    const twice = buildCut({ ...done, matches: once })
    expect(bracketMatches(twice)).toHaveLength(bracketMatches(once).length)
    expect(groupMatches(twice)).toHaveLength(groupMatches(once).length)
  })
})

describe('存檔來回', () => {
  it('組別、成績、籤表全部返到嚟', () => {
    const t = playToEnd(start(tour()))
    const withCut = playToEnd({ ...t, matches: buildCut(t) })
    const back = parseTournament(JSON.parse(JSON.stringify(withCut)))
    expect(back.players.map((p) => p.pool)).toEqual(withCut.players.map((p) => p.pool))
    expect([back.poolCount, back.advancePerPool]).toEqual([3, 2])
    expect(back.matches).toHaveLength(withCut.matches.length)
    expect(bracketChampion(back.matches)).toBe(bracketChampion(withCut.matches))
  })

  it('poolCount 係 null 就清走殘留組別', () => {
    const t = start(tour())
    const asRoundRobin = {
      ...t,
      mode: 'roundRobin' as const,
      poolCount: null,
      advancePerPool: null,
    }
    const back = parseTournament(JSON.parse(JSON.stringify(asRoundRobin)))
    expect(back.players.every((p) => p.pool === null)).toBe(true)
  })
})
