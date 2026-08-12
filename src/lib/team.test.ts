import { describe, expect, it } from 'vitest'
import { bladeIdentity, emptyTeam, isComplete, resizeTeam, takenKeys, teamText } from './team'
import type { BladeRow, PartRow } from './parts'

function blade(id: string, name: string): BladeRow {
  return { id, name, type: 'attack', tier: 'S', ratchet: '', bit: '', assist: '', source: '', img: '', combo: '' }
}
function part(name: string, kind: PartRow['kind']): PartRow {
  return { name, kind, tier: 'A', img: '' }
}

describe('bladeIdentity', () => {
  it('顏色版／金屬塗層／聯乘版都係同一件', () => {
    expect(bladeIdentity('魔導神杖')).toBe('魔導神杖')
    expect(bladeIdentity('魔導神杖 金屬塗層:燦金')).toBe('魔導神杖')
    expect(bladeIdentity('魔導神杖(綠)')).toBe('魔導神杖')
    expect(bladeIdentity('蒼穹龍騎士 金屬塗層:白色 日本職業足球聯盟版')).toBe('蒼穹龍騎士')
    expect(bladeIdentity('蒼龍爆刃 金屬塗層:珍珠白')).toBe('蒼龍爆刃')
  })
  it('(左) 係另一隻刃，唔剝', () => {
    expect(bladeIdentity('蒼穹龍騎士(左)')).toBe('蒼穹龍騎士(左)')
    expect(bladeIdentity('蒼穹龍騎士(黑)')).toBe('蒼穹龍騎士')
  })
  it('全形括號都認', () => {
    expect(bladeIdentity('魔導神杖（綠）')).toBe('魔導神杖')
  })
})

describe('takenKeys', () => {
  it('同名唔同型號嘅戰刃互斥；改緊嗰隻自己唔計', () => {
    const t = emptyTeam(3)
    t.combos[0]!.blade = blade('UX-03', '魔導神杖')
    t.combos[1]!.blade = blade('BXH-09', '魔導神杖 金屬塗層:燦金')
    const taken = takenKeys(t, 'blade', 2)
    expect(taken.get('魔導神杖')).toBe(0) // 最早嗰隻
    expect(takenKeys(t, 'blade', 0).get('魔導神杖')).toBe(1)
  })
  it('固鎖照名對；空格唔阻人', () => {
    const t = emptyTeam(3)
    t.combos[0]!.ratchet = part('9-60', 'ratchet')
    expect(takenKeys(t, 'ratchet', 1).get('9-60')).toBe(0)
    expect(takenKeys(t, 'assist', 1).size).toBe(0)
  })
})

describe('隊伍', () => {
  it('resizeTeam 4→3 斬走第 4 隻，3→4 補空隻', () => {
    const t4 = emptyTeam(4)
    t4.combos[3]!.blade = blade('UX-01', '蒼龍爆刃')
    const t3 = resizeTeam(t4, 3)
    expect(t3.combos).toHaveLength(3)
    expect(resizeTeam(t3, 4).combos[3]!.blade).toBeNull()
  })
  it('isComplete：每隻要齊 戰刃+固鎖+軸心，輔助可以冇', () => {
    const t = emptyTeam(3)
    expect(isComplete(t)).toBe(false)
    for (const c of t.combos) {
      c.blade = blade('X', '乜刃'); c.ratchet = part('1-60', 'ratchet'); c.bit = part('R', 'bit')
    }
    expect(isComplete(t)).toBe(true)
  })
})

describe('teamText', () => {
  it('齊隊有名有輔助 —— 對全文', () => {
    const t = emptyTeam(3)
    t.name = '爆旋小隊'
    t.combos[0] = { blade: blade('UX-15-01', '鮫鯊狂鱗'), ratchet: part('4-50', 'ratchet'), bit: part('UF', 'bit'), assist: null }
    t.combos[1] = { blade: blade('CX-07', '天馬爆擊'), ratchet: part('9-70', 'ratchet'), bit: part('T', 'bit'), assist: part('W', 'assist') }
    t.combos[2] = { blade: blade('UX-03', '魔導神杖'), ratchet: part('5-70', 'ratchet'), bit: part('DB', 'bit'), assist: null }
    expect(teamText(t)).toBe(
      '《爆旋小隊》\n格式：3on3\n① 鮫鯊狂鱗 UX-15-01｜4-50｜UF\n② 天馬爆擊 CX-07｜9-70｜T｜輔助 W\n③ 魔導神杖 UX-03｜5-70｜DB\n——用「陀螺計分板」零件圖鑑砌\nhttps://samtang2014.github.io/Beyblade-scoreboard/',
    )
  })
  it('輔助個名本身叫「輔助A」嗰陣，唔會出「輔助 輔助A」', () => {
    const t = emptyTeam(3)
    for (const c of t.combos) {
      c.blade = blade('X', '乜刃'); c.ratchet = part('1-60', 'ratchet'); c.bit = part('R', 'bit')
    }
    t.combos[0]!.assist = part('輔助A', 'assist')
    expect(teamText(t)).toContain('｜輔助A')
    expect(teamText(t)).not.toContain('輔助 輔助A')
  })

  it('冇隊名就冇《》行；4 隻出「格式：4隻禁1」同 ④', () => {
    const t = emptyTeam(4)
    for (const c of t.combos) {
      c.blade = blade('X', '乜刃'); c.ratchet = part('1-60', 'ratchet'); c.bit = part('R', 'bit')
    }
    const text = teamText(t)
    expect(text.startsWith('格式：4隻禁1\n')).toBe(true)
    expect(text).toContain('④')
  })
})
