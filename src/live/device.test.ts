import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deviceId, newToken, rememberSheet, savedSheet } from './device'

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

describe('部機 id', () => {
  it('同一部機每次叫都一樣', () => {
    expect(deviceId()).toBe(deviceId())
  })

  it('唔係吉', () => {
    expect(deviceId().length).toBeGreaterThan(5)
  })

  /**
   * ⚠ `deviceId` 有個 module-level cache，`beforeEach` 清唔到佢 ——
   * 唔 resetModules 就會攞返上一個測試 cache 咗嗰個，
   * 呢個測試會**白過**（根本冇行過掟錯嗰條路）。
   */
  it('storage 用唔到都唔會炸', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('無痕視窗') },
      setItem() { throw new Error('無痕視窗') },
    })
    const fresh = await import('./device')
    expect(fresh.deviceId().length).toBeGreaterThan(5)
  })
})

describe('記住張 sheet', () => {
  it('冇記過就係 null', () => {
    expect(savedSheet()).toBeNull()
  })

  it('記完攞返出嚟', () => {
    rememberSheet('AKfycbx1', 'edit-abc')
    expect(savedSheet()).toEqual({ scriptId: 'AKfycbx1', edit: 'edit-abc' })
  })

  /**
   * 一定要連 edit token 一齊記。
   *
   * 換場（同一張 sheet 擺第二場賽事）要拎現有嘅 edit token 去認證 ——
   * 新開嘅賽事 `live` 係 null，冇呢度記住嗰個就永遠 init 唔到，
   * 段 script 會一路答 already-init。
   */
  it('淨係記 scriptId 唔夠 —— 換場要用個 token 認證', () => {
    rememberSheet('AKfycbx1', 'edit-abc')
    expect(savedSheet()?.edit).toBe('edit-abc')
  })

  it('存咗爛嘢就當冇記過', () => {
    localStorage.setItem('beyblade-scoreboard/sheet', 'not json')
    expect(savedSheet()).toBeNull()
  })

  it('唔齊 field 都當冇記過', () => {
    localStorage.setItem('beyblade-scoreboard/sheet', JSON.stringify({ scriptId: 'a' }))
    expect(savedSheet()).toBeNull()
  })
})

describe('token', () => {
  it('兩個 token 唔會撞', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newToken('edit')))
    expect(seen.size).toBe(200)
  })

  it('睇個 token 就知係邊種', () => {
    expect(newToken('edit').startsWith('edit-')).toBe(true)
    expect(newToken('view').startsWith('view-')).toBe(true)
  })
})
