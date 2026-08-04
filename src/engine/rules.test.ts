import { describe, expect, it } from 'vitest'
import {
  FINISH_POINTS,
  MATCH_TARGET,
  matchKey,
  matchScore,
  matchStatus,
  matchWinnerId,
  pointsToWin,
  scoredRounds,
  xtremeInMatch,
  xtremeWins,
} from './rules'
import type { FinishType, Match } from './types'

function match(rounds: { w: 'a' | 'b'; f: FinishType }[]): Match {
  return {
    id: 'p1__p2',
    stage: 'group',
    round: 1,
    order: 1,
    aId: 'p1',
    bId: 'p2',
    aFrom: null,
    bFrom: null,
    rounds: rounds.map((r) => ({ winnerId: r.w === 'a' ? 'p1' : 'p2', finish: r.f })),
  }
}

describe('Beyblade X 計分', () => {
  it('四種勝法嘅分數同官方一樣', () => {
    expect(FINISH_POINTS).toEqual({ spin: 1, over: 2, burst: 2, xtreme: 3 })
    expect(MATCH_TARGET).toBe(4)
  })

  it('總分係逐 round 加出嚟', () => {
    const m = match([
      { w: 'a', f: 'burst' }, // a 2
      { w: 'b', f: 'spin' }, // b 1
      { w: 'a', f: 'spin' }, // a 3
    ])
    expect(matchScore(m)).toEqual({ a: 3, b: 1 })
  })

  it('未夠 4 分冇贏家', () => {
    const m = match([{ w: 'a', f: 'xtreme' }])
    expect(matchScore(m)).toEqual({ a: 3, b: 0 })
    expect(matchWinnerId(m)).toBeNull()
    expect(matchStatus(m)).toBe('live')
  })

  it('一 round 都未打就係未開始', () => {
    const m = match([])
    expect(matchStatus(m)).toBe('pending')
    expect(matchWinnerId(m)).toBeNull()
  })

  it('夠 4 分就贏咗', () => {
    const m = match([
      { w: 'a', f: 'burst' },
      { w: 'a', f: 'over' },
    ])
    expect(matchScore(m)).toEqual({ a: 4, b: 0 })
    expect(matchWinnerId(m)).toBe('p1')
    expect(matchStatus(m)).toBe('done')
  })

  it('極限勝可以爆過 4 分', () => {
    const m = match([
      { w: 'a', f: 'xtreme' }, // 3
      { w: 'a', f: 'xtreme' }, // 6
    ])
    expect(matchScore(m)).toEqual({ a: 6, b: 0 })
    expect(matchWinnerId(m)).toBe('p1')
  })

  it('贏咗之後多出嚟嘅 round 唔會再計，唔會兩邊都夠 4 分', () => {
    const m = match([
      { w: 'a', f: 'burst' },
      { w: 'a', f: 'over' }, // a 到 4，打完
      { w: 'b', f: 'xtreme' },
      { w: 'b', f: 'xtreme' },
    ])
    expect(matchScore(m)).toEqual({ a: 4, b: 0 })
    expect(matchWinnerId(m)).toBe('p1')
  })

  it('唔屬於呢場嘅選手唔會加到分', () => {
    const m: Match = { ...match([]), rounds: [{ winnerId: '路人甲', finish: 'xtreme' }] }
    expect(matchScore(m)).toEqual({ a: 0, b: 0 })
  })

  it('仲爭幾多分', () => {
    const m = match([{ w: 'a', f: 'over' }])
    expect(pointsToWin(m, 'p1')).toBe(2)
    expect(pointsToWin(m, 'p2')).toBe(4)
  })

  it('贏咗就唔使再爭分', () => {
    const m = match([
      { w: 'a', f: 'xtreme' },
      { w: 'a', f: 'xtreme' },
    ])
    expect(pointsToWin(m, 'p1')).toBe(0)
  })
})

describe('場次 id', () => {
  it('調轉次序都係同一個 id', () => {
    expect(matchKey('p1', 'p2')).toBe(matchKey('p2', 'p1'))
  })

  it('唔同對人唔同 id', () => {
    expect(matchKey('p1', 'p2')).not.toBe(matchKey('p1', 'p3'))
  })
})

describe('極限勝出次數', () => {
  it('數自己以極限贏嗰啲 round', () => {
    const m = match([
      { w: 'a', f: 'xtreme' }, // a 3
      { w: 'b', f: 'spin' }, // b 1
      { w: 'a', f: 'spin' }, // a 4，打完
    ])
    expect(xtremeInMatch(m, 'p1')).toBe(1)
    expect(xtremeInMatch(m, 'p2')).toBe(0)
  })

  it('輸咗嗰場入面自己贏嘅極限照數', () => {
    const m = match([
      { w: 'b', f: 'xtreme' }, // b 3
      { w: 'a', f: 'xtreme' }, // a 3
      { w: 'b', f: 'spin' }, // b 4，b 贏
    ])
    expect(xtremeInMatch(m, 'p1')).toBe(1)
    expect(xtremeInMatch(m, 'p2')).toBe(1)
  })

  it('夠 4 分之後嗰啲 round 唔數，同 matchScore 同一條界線', () => {
    const m = match([
      { w: 'a', f: 'xtreme' }, // a 3
      { w: 'a', f: 'xtreme' }, // a 6，打完
      { w: 'a', f: 'xtreme' }, // 呢個唔應該存在，唔數
      { w: 'b', f: 'xtreme' }, // 同上
    ])
    expect(matchScore(m)).toEqual({ a: 6, b: 0 })
    expect(scoredRounds(m)).toHaveLength(2)
    expect(xtremeInMatch(m, 'p1')).toBe(2)
    expect(xtremeInMatch(m, 'p2')).toBe(0)
  })

  it('對手未定嘅場次乜都數唔到', () => {
    const m = { ...match([{ w: 'a', f: 'xtreme' as const }]), bId: null }
    expect(scoredRounds(m)).toEqual([])
    expect(xtremeInMatch(m, 'p1')).toBe(0)
  })

  it('xtremeWins 加埋多場，但未打完嘅場唔計', () => {
    const done = match([
      { w: 'a', f: 'xtreme' },
      { w: 'a', f: 'spin' }, // a 4，打完
    ])
    const live = match([{ w: 'a', f: 'xtreme' }]) // a 3，未夠 4

    expect(xtremeWins([done], 'p1')).toBe(1)
    expect(xtremeWins([live], 'p1')).toBe(0)
    expect(xtremeWins([done, live], 'p1')).toBe(1)
    // 打緊嗰場要靠 xtremeInMatch 先數到 —— 入分版嗰個 +N 就係咁嚟。
    expect(xtremeInMatch(live, 'p1')).toBe(1)
  })

  it('冇場次就係 0', () => {
    expect(xtremeWins([], 'p1')).toBe(0)
  })
})
