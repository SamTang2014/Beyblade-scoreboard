import { describe, expect, it } from 'vitest'
import {
  gradeOf,
  parseBlades,
  parseCsv,
  parseParts,
  searchBlades,
  searchParts,
  type BladeRow,
  type PartRow,
  type PartsFilter,
} from './parts'

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

const ALL: PartsFilter = { kind: 'all', type: 'all', grade: 'all' }

function blade(p: Partial<BladeRow>): BladeRow {
  return {
    id: '', name: '', type: '', tier: '',
    ratchet: '', bit: '', assist: '', source: '', img: '', combo: '',
    ...p,
  }
}

const BLADES: BladeRow[] = [
  blade({ id: 'UX-15-01', name: '鮫鯊狂鱗', type: 'attack', tier: 'S+', ratchet: '4-50', bit: 'UF' }),
  blade({ id: 'UX-03-01', name: '威颯神翼', type: 'stamina', tier: 'S', ratchet: '9-60', bit: 'LF' }),
  blade({ id: 'BX-21-01', name: '鋼鐵毒蠍', type: 'defense', tier: 'A', ratchet: '3-60', bit: 'B' }),
  blade({ id: 'CX-07-01', name: '天馬爆擊', type: 'attack', tier: '-', bit: 'Tr', assist: 'A' }),
]

const PARTS: PartRow[] = [
  { name: '9-60', kind: 'ratchet', tier: 'S+', img: '' },
  { name: '3-60', kind: 'ratchet', tier: 'A', img: '' },
  { name: 'UF', kind: 'bit', tier: 'S', img: '' },
  { name: 'A', kind: 'assist', tier: '', img: '' },
]

describe('gradeOf', () => {
  it('淨係睇字頭，未評嘅一律 unrated', () => {
    expect(gradeOf('S+')).toBe('S')
    expect(gradeOf('S')).toBe('S')
    expect(gradeOf('X')).toBe('X')
    expect(gradeOf('A+')).toBe('A')
    expect(gradeOf('-')).toBe('unrated')
    expect(gradeOf('')).toBe('unrated')
  })
})

describe('搜尋', () => {
  it('空 query 加全部「全部」就出晒', () => {
    expect(searchBlades(BLADES, '', ALL)).toHaveLength(4)
    expect(searchParts(PARTS, '', ALL)).toHaveLength(4)
  })

  it('搜 9-60 出埋原裝配 9-60 嗰隻戰刃，唔淨係嗰個固鎖', () => {
    expect(searchBlades(BLADES, '9-60', ALL).map((b) => b.id)).toEqual(['UX-03-01'])
    expect(searchParts(PARTS, '9-60', ALL).map((p) => p.name)).toEqual(['9-60'])
  })

  it('唔分大細寫', () => {
    expect(searchBlades(BLADES, 'ux-15', ALL).map((b) => b.id)).toEqual(['UX-15-01'])
    expect(searchParts(PARTS, 'uf', ALL).map((p) => p.name)).toEqual(['UF'])
  })

  it('前後空格唔算數', () => {
    expect(searchBlades(BLADES, '  鮫鯊  ', ALL).map((b) => b.id)).toEqual(['UX-15-01'])
  })

  it('戰刃嘅軸心同輔助戰刃都搜到', () => {
    expect(searchBlades(BLADES, 'tr', ALL).map((b) => b.id)).toEqual(['CX-07-01'])
  })
})

describe('篩選', () => {
  it('階級按字頭 match：揀 S 出 S 同 S+，唔出 A', () => {
    const f: PartsFilter = { ...ALL, grade: 'S' }
    expect(searchBlades(BLADES, '', f).map((b) => b.id)).toEqual(['UX-15-01', 'UX-03-01'])
    expect(searchParts(PARTS, '', f).map((p) => p.name)).toEqual(['9-60', 'UF'])
  })

  it('未評 = tier 係 - 或者空', () => {
    const f: PartsFilter = { ...ALL, grade: 'unrated' }
    expect(searchBlades(BLADES, '', f).map((b) => b.id)).toEqual(['CX-07-01'])
    expect(searchParts(PARTS, '', f).map((p) => p.name)).toEqual(['A'])
  })

  it('揀咗軸心：戰刃唔出，零件淨出軸心', () => {
    const f: PartsFilter = { ...ALL, kind: 'bit' }
    expect(searchBlades(BLADES, '', f)).toEqual([])
    expect(searchParts(PARTS, '', f).map((p) => p.name)).toEqual(['UF'])
  })

  it('揀咗戰刃：零件唔出', () => {
    const f: PartsFilter = { ...ALL, kind: 'blade' }
    expect(searchBlades(BLADES, '', f)).toHaveLength(4)
    expect(searchParts(PARTS, '', f)).toEqual([])
  })

  it('揀咗類型即係睇緊戰刃 —— 零件一律唔出', () => {
    const f: PartsFilter = { ...ALL, type: 'attack' }
    expect(searchBlades(BLADES, '', f).map((b) => b.id)).toEqual(['UX-15-01', 'CX-07-01'])
    expect(searchParts(PARTS, '', f)).toEqual([])
  })

  it('搜尋同篩選係 AND', () => {
    const f: PartsFilter = { ...ALL, type: 'attack', grade: 'S' }
    expect(searchBlades(BLADES, '', f).map((b) => b.id)).toEqual(['UX-15-01'])
  })

  it('次序照入嚟嗰個（sheet 次序）', () => {
    expect(searchBlades(BLADES, '', ALL).map((b) => b.id)).toEqual([
      'UX-15-01', 'UX-03-01', 'BX-21-01', 'CX-07-01',
    ])
  })
})
