import type { BladeRow, PartRow } from './parts'

/**
 * 砌隊嘅純邏輯：一隊三／四隻陀螺，同一隊入面唔准重複用同一件零件。
 *
 * 「唔准重複」係比賽規則，唔係我哋定嘅。做法係喺揀盤度預防（用咗嘅撳唔到），
 * 唔係砌完先驗 —— 所以呢度唔會有 validate()，得一個 takenKeys 俾揀盤問
 * 「呢件俾唔俾揀」。
 *
 * 純函數，唔掂 DOM、唔掂 storage —— 呢個功能刻意唔存底。
 */

export interface Combo {
  blade: BladeRow | null
  ratchet: PartRow | null
  bit: PartRow | null
  /** null = 冇裝輔助戰刃。輔助係可留空嘅，唔算未砌齊。 */
  assist: PartRow | null
}

export type TeamSize = 3 | 4

export interface Team {
  name: string
  size: TeamSize
  /** 長度永遠等於 size。 */
  combos: Combo[]
}

export type Slot = 'blade' | 'ratchet' | 'bit' | 'assist'

function emptyCombo(): Combo {
  return { blade: null, ratchet: null, bit: null, assist: null }
}

export function emptyTeam(size: TeamSize): Team {
  return { name: '', size, combos: Array.from({ length: size }, emptyCombo) }
}

/** 3→4 補隻空嘅落尾；4→3 斬走最尾嗰隻（連入面砌咗嘅嘢）。 */
export function resizeTeam(team: Team, size: TeamSize): Team {
  const combos = team.combos.slice(0, size)
  while (combos.length < size) combos.push(emptyCombo())
  return { ...team, size, combos }
}

/*
  顏色版嘅括號先剝得。呢個字集係實測張 sheet 啲名砌出嚟嘅 ——
  唔用「淨係一兩個字就剝」呢招，因為「蒼穹龍騎士(左)」嘅左轉版
  係另一隻刃，剝咗就會當佢同右轉版撞，明明擺得埋一齊。
*/
const COLORS = new Set('綠紅藍黑黃紫白金青粉銀橙灰')
const COLOR_PAREN = /[(（]([^()（）]{1,2})[)）]$/

/**
 * 戰刃嘅「本體名」——唔同顏色版／金屬塗層版／聯乘版當同一件零件，
 * 因為佢哋物理上就係同一塊刃，同隊擺兩塊犯規。
 *
 * 兩步：斬走第一個空格之後嘅所有嘢（`魔導神杖 金屬塗層:燦金` → `魔導神杖`），
 * 再剝結尾嘅顏色括號（`魔導神杖(綠)` → `魔導神杖`）。
 */
export function bladeIdentity(name: string): string {
  const head = name.trim().split(' ')[0] ?? ''
  const m = COLOR_PAREN.exec(head)
  if (m === null) return head
  const inside = m[1] ?? ''
  return [...inside].every((c) => COLORS.has(c)) ? head.slice(0, m.index) : head
}

/**
 * 呢個格入面，邊啲嘢已經俾隊入面其他陀螺用咗。
 *
 * key：戰刃用本體名，其他零件用零件名。value：第幾隻用咗（0 起計，
 * 揀盤要出「第 N 隻用咗」）。`except` 嗰隻係改緊嗰隻自己，唔計 ——
 * 唔係你會見到自己揀咗嘅嘢變咗灰，撳唔返。
 */
export function takenKeys(team: Team, slot: Slot, except: number): Map<string, number> {
  const out = new Map<string, number>()
  for (const [i, combo] of team.combos.entries()) {
    if (i === except) continue
    const picked = combo[slot]
    if (picked === null) continue
    const key = slot === 'blade' ? bladeIdentity(picked.name) : picked.name
    // 撞咗就留返最早嗰隻 —— 講「第 1 隻用咗」好過講「第 3 隻」。
    if (!out.has(key)) out.set(key, i)
  }
  return out
}

/** 輔助戰刃唔計 —— 好多配置本身就係唔裝輔助。 */
export function isComplete(team: Team): boolean {
  return team.combos.every((c) => c.blade !== null && c.ratchet !== null && c.bit !== null)
}

const NUMERALS = ['①', '②', '③', '④']

const SITE = 'https://samtang2014.github.io/Beyblade-scoreboard/'

/**
 * 出俾人睇嘅輔助戰刃寫法。張 sheet 啲輔助本身個名已經係「輔助A」「輔助B」——
 * 硬加個 label 就會變「輔助 輔助A」。個名自己講得明就唔使我哋再講一次。
 */
export function assistLabel(name: string): string {
  return name.startsWith('輔助') ? name : `輔助 ${name}`
}

/**
 * 純文字版嘅隊伍，俾人 copy 落 WhatsApp／Discord 貼。
 *
 * 格式係釘死嘅（測試對全文）—— 呢串嘢會俾人 copy 嚟 copy 去，
 * 隨手改格式就會令舊帖同新帖對唔上。
 */
export function teamText(team: Team): string {
  const lines: string[] = []
  const name = team.name.trim()
  if (name !== '') lines.push(`《${name}》`)
  lines.push(`格式：${team.size === 3 ? '3on3' : '4隻禁1'}`)

  for (const [i, c] of team.combos.entries()) {
    const parts = [
      `${NUMERALS[i] ?? '·'} ${c.blade?.name ?? '？'} ${c.blade?.id ?? ''}`.trim(),
      c.ratchet?.name ?? '？',
      c.bit?.name ?? '？',
    ]
    if (c.assist !== null) parts.push(assistLabel(c.assist.name))
    lines.push(parts.join('｜'))
  }

  lines.push('——用「陀螺計分板」零件圖鑑砌')
  lines.push(SITE)
  return lines.join('\n')
}
