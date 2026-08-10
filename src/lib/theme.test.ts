import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readPref, resolveTheme, writePref, type ThemePref } from './theme'

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

describe('揀邊個主題', () => {
  it('跟部機：部機話暗就暗，話光就光', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })

  it('自己揀咗就唔理部機', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('記住個揀', () => {
  it('冇揀過就係跟部機', () => {
    expect(readPref()).toBe('auto')
  })

  it('揀完攞返出嚟', () => {
    for (const p of ['auto', 'light', 'dark'] as ThemePref[]) {
      writePref(p)
      expect(readPref()).toBe(p)
    }
  })

  /** 主題係部機嘅嘢，唔屬於任何一場賽事 —— 所以換場、匯入備份都唔應該影響佢。 */
  it('存喺自己嘅 key，唔會撈亂賽事資料', () => {
    writePref('dark')
    expect(localStorage.getItem('beyblade-scoreboard/theme')).toBe('dark')
    expect(localStorage.getItem('beyblade-scoreboard/v1')).toBeNull()
  })

  it('存咗爛嘢就當跟部機', () => {
    localStorage.setItem('beyblade-scoreboard/theme', '紫色')
    expect(readPref()).toBe('auto')
  })

  it('storage 用唔到都唔會炸', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('無痕視窗') },
      setItem() { throw new Error('無痕視窗') },
    })
    expect(readPref()).toBe('auto')
    expect(() => writePref('dark')).not.toThrow()
  })
})

/**
 * 個偏好放咗喺 module store，因為兩個地方要讀：App（落 class、聽部機日夜轉）
 * 同 ThemePicker（俾人揀）。各自 useState 就會各有各 state —— 喺 picker
 * 揀完，App 嗰份仲係舊嘅。
 */
describe('兩個地方共用同一份偏好', () => {
  it('setPref 之後，所有 getPref 都攞到新嗰個', async () => {
    const m = await import('./theme')
    m.setPref('dark')
    expect(m.getPref()).toBe('dark')
    m.setPref('light')
    expect(m.getPref()).toBe('light')
  })

  it('訂閱咗嘅人會收到通知', async () => {
    const m = await import('./theme')
    let calls = 0
    const off = m.subscribePref(() => calls++)
    m.setPref('dark')
    m.setPref('auto')
    expect(calls).toBe(2)

    off()
    m.setPref('light')
    expect(calls).toBe(2) // 退訂咗就唔會再收
  })
})
