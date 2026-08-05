import { describe, expect, it } from 'vitest'
import { parseHash } from './router'

describe('直播 link', () => {
  it('認得', () => {
    expect(parseHash('#/live/eyJzIjoiUzEifQ')).toEqual({ name: 'live', payload: 'eyJzIjoiUzEifQ' })
  })

  it('冇 payload 就返主頁', () => {
    expect(parseHash('#/live')).toEqual({ name: 'home' })
    expect(parseHash('#/live/')).toEqual({ name: 'home' })
  })
})

describe('現有 route 冇變', () => {
  it('入分版', () => {
    expect(parseHash('#/t/abc')).toEqual({ name: 'console', id: 'abc', matchId: null })
    expect(parseHash('#/t/abc/m/p1__p2')).toEqual({
      name: 'console', id: 'abc', matchId: 'p1__p2',
    })
  })

  it('其他 tab', () => {
    for (const sub of ['setup', 'schedule', 'table', 'matrix', 'bracket', 'board'] as const) {
      expect(parseHash(`#/t/abc/${sub}`)).toEqual({ name: sub, id: 'abc' })
    }
  })

  it('唔認得嘅 sub 照去入分版', () => {
    expect(parseHash('#/t/abc/wat')).toEqual({ name: 'console', id: 'abc', matchId: null })
  })

  /**
   * 分享設定唔係獨立一頁 —— 收埋咗喺開賽設定入面。
   * 「玩下」場完全見唔到，所以冇 tab、冇 route。
   */
  it('冇 share 呢一頁', () => {
    expect(parseHash('#/t/abc/share')).toEqual({ name: 'console', id: 'abc', matchId: null })
  })
})
