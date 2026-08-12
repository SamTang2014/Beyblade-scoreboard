import { describe, expect, it } from 'vitest'
import { parseBlades, parseCsv, parseParts } from './parts'

const BLADE_HEADER =
  '"型號 (ID)","中文名稱 (Name)","分類 (Category)","類型 (Type)","階級 (Tier)","購買建議 (Buy)","原裝固鎖 (Ratchet)","固鎖階級 (Ratchet Tier)","原裝軸心 (Bit)","軸心階級 (Bit Tier)","原裝輔助戰刃 (Assist Blade","來源產品 (Source)","圖片網址 (Img)","建議配置 (Combo)","2026/08/12 14:56",""'

describe('parseCsv', () => {
  it('引號欄、內嵌逗號、內嵌換行、"" 轉義都食到', () => {
    const raw = '"a","b,c","d\ne","f""g"\r\nplain,2,3,4\n'
    expect(parseCsv(raw)).toEqual([
      ['a', 'b,c', 'd\ne', 'f"g'],
      ['plain', '2', '3', '4'],
    ])
  })
})

describe('parseBlades', () => {
  it('齊欄嘅真實行解到晒每一欄', () => {
    const raw = [
      BLADE_HEADER,
      '"UX-15-01","鮫鯊狂鱗","blade","attack","S+","","4-50","","UF","","","UX-15 鮫鯊狂鱗改造組","https://i.ibb.co/x/a.png","固鎖：1-60 / 1-70, UF | 軸心：K / L","",""',
    ].join('\n')
    const out = parseBlades(parseCsv(raw))!
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      id: 'UX-15-01', name: '鮫鯊狂鱗', type: 'attack', tier: 'S+',
      ratchet: '4-50', bit: 'UF', assist: '',
      source: 'UX-15 鮫鯊狂鱗改造組', img: 'https://i.ibb.co/x/a.png',
      combo: '固鎖：1-60 / 1-70, UF | 軸心：K / L',
    })
  })

  it('建議配置有內嵌換行照解（CX-07 真實情況）', () => {
    const raw = [
      BLADE_HEADER,
      '"CX-07","天馬爆擊","blade","attack","S+","","","","Tr","","A","","https://i.ibb.co/x/b.png","固鎖：7-60, 輔助W\n冠軍配置：9-70, 輔助W, T","",""',
    ].join('\n')
    const out = parseBlades(parseCsv(raw))!
    expect(out[0]!.combo).toBe('固鎖：7-60, 輔助W\n冠軍配置：9-70, 輔助W, T')
    expect(out[0]!.assist).toBe('A')
    expect(out[0]!.ratchet).toBe('')
  })

  it('空型號嘅 placeholder 行剷走', () => {
    const raw = [BLADE_HEADER, '"","","","","-","","","","","","","","","","",""'].join('\n')
    expect(parseBlades(parseCsv(raw))).toEqual([])
  })

  it('必要欄唔見咗 return null', () => {
    const raw = '"型號 (ID)","中文名稱 (Name)"\n"UX-01","蒼龍爆刃"'
    expect(parseBlades(parseCsv(raw))).toBeNull()
  })
})

describe('parseParts', () => {
  const HEADER = '"原裝固鎖、軸心","分類 (Category)","圖片網址 (Img)","階級 (Tier)","","2026/05/22 0:45",""'
  it('ratchet/bit/assist 三種都解到，其他分類剷走', () => {
    const raw = [
      HEADER,
      '"0-60","ratchet","https://i.ibb.co/x/r.webp","A"',
      '"UF","bit","https://i.ibb.co/x/u.webp","S"',
      '"A","assist","https://i.ibb.co/x/s.webp","B"',
      '"junk","other","https://x","C"',
      '"","ratchet","https://x","A"',
    ].join('\n')
    expect(parseParts(parseCsv(raw))).toEqual([
      { name: '0-60', kind: 'ratchet', tier: 'A', img: 'https://i.ibb.co/x/r.webp' },
      { name: 'UF', kind: 'bit', tier: 'S', img: 'https://i.ibb.co/x/u.webp' },
      { name: 'A', kind: 'assist', tier: 'B', img: 'https://i.ibb.co/x/s.webp' },
    ])
  })
  it('必要欄唔見咗 return null', () => {
    expect(parseParts(parseCsv('"乜都唔係","x"\n"0-60","ratchet"'))).toBeNull()
  })
})
