import { describe, expect, it } from 'vitest'
import {
  FINISH_POINTS,
  MATCH_TARGET,
  matchKey,
  matchScore,
  matchStatus,
  matchWinnerId,
  pointsToWin,
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
