import { describe, expect, it } from 'vitest'
import { parseHash } from './router'

describe('route 解析', () => {
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

  it('唔似賽事嘅 hash 一律返主頁', () => {
    for (const h of ['', '#/', '#/wat', '#/t']) {
      expect(parseHash(h)).toEqual({ name: 'home' })
    }
  })
})
