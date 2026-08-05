import { describe, expect, it } from 'vitest'
import { nextDelay, POLL_MS } from './usePoll'

describe('斷網退避', () => {
  it('冇 fail 過就係正常節奏', () => {
    expect(nextDelay(0)).toBe(POLL_MS)
  })

  it('連續 fail 就愈等愈耐', () => {
    expect(nextDelay(1)).toBeGreaterThan(POLL_MS)
    expect(nextDelay(2)).toBeGreaterThan(nextDelay(1))
    expect(nextDelay(3)).toBeGreaterThan(nextDelay(2))
  })

  it('但唔會等到天荒地老 —— 封頂 30 秒', () => {
    for (const n of [5, 10, 100]) {
      expect(nextDelay(n)).toBeLessThanOrEqual(30_000)
    }
    expect(nextDelay(100)).toBe(30_000)
  })
})
