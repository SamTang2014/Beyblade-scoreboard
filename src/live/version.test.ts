import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetVersion, knownVersion, rememberVersion } from './version'

class FakeStorage {
  private data = new Map<string, string>()
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, v) }
  removeItem(k: string) { this.data.delete(k) }
  clear() { this.data.clear() }
  key() { return null }
  get length() { return this.data.size }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new FakeStorage())
})

describe('記住遠端版本', () => {
  /**
   * ⚠ 呢個係一個真 bug 嘅修補，唔係「有就好啲」。
   *
   * 冇咗佢，`version` 每次 mount 都由 null 開始 —— 第一次 poll 一定攞成份
   * 遠端返嚟然後 adopt，唔理佢係咪比本機舊。
   *
   * 實際出事嘅情形：主辦喺開賽設定揀「認真」→ 開始直播（推上去嗰份
   * `matches: []`，因為仲未排賽程）→ 加人 → 排賽程 → 俾人搶咗入分位
   * （所以推唔上去）→ reload 一次 → poll 攞返個舊 snapshot → **成個賽程冇咗**，
   * 個入分版變返「仲未排賽程」。
   */
  it('冇記過就係 null', () => {
    expect(knownVersion('t1')).toBeNull()
  })

  it('記完攞返出嚟', () => {
    rememberVersion('t1', 7)
    expect(knownVersion('t1')).toBe(7)
  })

  it('逐場賽事各自記', () => {
    rememberVersion('t1', 7)
    rememberVersion('t2', 3)
    expect(knownVersion('t1')).toBe(7)
    expect(knownVersion('t2')).toBe(3)
  })

  it('記得低嘅嘢 reload 之後仲喺度', () => {
    rememberVersion('t1', 12)
    // 同一個 localStorage，扮 reload = 重新讀。
    expect(knownVersion('t1')).toBe(12)
  })

  it('唔記得返（換咗場、或者條 link 死咗）', () => {
    rememberVersion('t1', 7)
    forgetVersion('t1')
    expect(knownVersion('t1')).toBeNull()
  })

  it('存咗爛嘢就當冇記過', () => {
    localStorage.setItem('beyblade-scoreboard/v/t1', 'not a number')
    expect(knownVersion('t1')).toBeNull()
  })

  it('storage 用唔到都唔會炸', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('無痕視窗') },
      setItem() { throw new Error('無痕視窗') },
      removeItem() { throw new Error('無痕視窗') },
    })
    expect(knownVersion('t1')).toBeNull()
    expect(() => rememberVersion('t1', 1)).not.toThrow()
    expect(() => forgetVersion('t1')).not.toThrow()
  })
})

/**
 * 個 bug 嘅核心：`version` 由 `null` 開始 = 「我乜都唔知」= 第一次 poll
 * 一定攞成份遠端返嚟蓋走本機。
 *
 * 記住咗之後，poll 會用 `since=<記住嗰個>` 去問 —— 遠端冇行前過就唔會
 * 派任何資料落嚟，本機嘅嘢自然唔會俾一份舊嘢蓋走。
 */
describe('點解要記住（reload 之後嘅行為）', () => {
  it('reload 之前記咗 5，reload 之後就唔會由 null 問起', () => {
    rememberVersion('t1', 5)

    // 扮 reload：新一次 mount 由 storage 讀返
    const onMount = knownVersion('t1')
    expect(onMount).toBe(5)

    // 即係會 `get(5)`，唔係 `get(null)` —— 遠端仲係 5 就乜都唔會派落嚟。
    expect(onMount).not.toBeNull()
  })

  it('未 init 過嘅賽事係 null —— 第一次一定要攞成份', () => {
    expect(knownVersion('未開過直播')).toBeNull()
  })
})
