import { describe, expect, it } from 'vitest'
import { decodePayload, encodePayload, parseScriptId, scriptUrl } from './payload'

describe('link payload', () => {
  it('編完解返出嚟一模一樣', () => {
    const p = { s: 'AKfycbx1_2-3abc', k: 'edit-9f3a2b' }
    expect(decodePayload(encodePayload(p))).toEqual(p)
  })

  it('編出嚟嘅嘢擺得入 URL —— 冇 + / =', () => {
    const out = encodePayload({ s: 'AKfycbx1_2-3abc', k: 'edit-9f3a2b' })
    expect(out).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('餵垃圾入去唔會炸，返 null', () => {
    for (const junk of ['', '!!!', 'YWJj', 'eyJhIjoxfQ', '%%%%']) {
      expect(decodePayload(junk)).toBeNull()
    }
  })

  it('少咗 field 都當唔啱', () => {
    const half = encodePayload({ s: 'abc', k: '' } as never)
    expect(decodePayload(half)).toBeNull()
  })
})

describe('script 網址', () => {
  it('由 id 砌返成條', () => {
    expect(scriptUrl('AKfycbx1')).toBe('https://script.google.com/macros/s/AKfycbx1/exec')
  })

  it('由成條網址拆返個 id', () => {
    expect(parseScriptId('https://script.google.com/macros/s/AKfycbx1/exec')).toBe('AKfycbx1')
    // 主辦好可能連問號後面嗰橛一齊 copy
    expect(parseScriptId('https://script.google.com/macros/s/AKfycbx1/exec?usp=sharing')).toBe(
      'AKfycbx1',
    )
    // 前後有空格
    expect(parseScriptId('  https://script.google.com/macros/s/AKfycbx1/exec  ')).toBe('AKfycbx1')
  })

  it('淨係貼個 id 都收', () => {
    expect(parseScriptId('AKfycbx1_2-3abc')).toBe('AKfycbx1_2-3abc')
  })

  it('唔似嘢就返 null', () => {
    for (const junk of ['', 'https://google.com', 'hello world', 'https://script.google.com/']) {
      expect(parseScriptId(junk)).toBeNull()
    }
  })
})

describe('唔好淨係靠長度猜', () => {
  /**
   * 有 prefix 就已經有證據，唔應該再要求個 id 幾長。
   * 之前條 regex 兩個 case 共用 `{10,}`，結果連合法嘅短 id 都拒絕咗。
   */
  it('成條網址就算個 id 好短都收', () => {
    expect(parseScriptId('https://script.google.com/macros/s/abc/exec')).toBe('abc')
  })

  it('但淨係貼個短 id 就唔收 —— 冇證據，個樣又唔似', () => {
    expect(parseScriptId('abc')).toBeNull()
  })

  it('真嘅 deployment id 長成咁，兩種貼法都收', () => {
    const real = 'AKfycbx' + 'A1b2C3d4E5'.repeat(5)
    expect(parseScriptId(real)).toBe(real)
    expect(parseScriptId(`https://script.google.com/macros/s/${real}/exec`)).toBe(real)
  })
})
