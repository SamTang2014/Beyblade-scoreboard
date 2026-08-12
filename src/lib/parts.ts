/**
 * 零件資料庫嘅解析。
 *
 * 資料嚟自一張第三方維護嘅公開 Google Sheet（gviz CSV）—— 唔係我哋控制嘅，
 * 所以呢度全部嘢都要當佢隨時會變：欄位對位一律用 header 文字認，唔用死位置，
 * 咁 sheet 加減一兩欄都唔會靜靜哋讀錯欄。認唔到必要欄就 return null，
 * 由上層當「拉唔到資料」處理（照用 cache），好過出一版空白畫面。
 *
 * 純函數，唔掂 DOM 同 fetch —— 嗰啲喺 partsData.ts。
 */

export interface BladeRow {
  /** 型號，例 UX-15-01 */
  id: string
  name: string
  /** attack | stamina | defense | balance | special，可以係空 */
  type: string
  /** X | S+ | S | ... | E，未評係 '-' 或者空 */
  tier: string
  ratchet: string
  bit: string
  assist: string
  source: string
  img: string
  /** 建議配置，sheet 入面本身可能有換行 —— 出畫面要保留。 */
  combo: string
}

export interface PartRow {
  name: string
  kind: 'ratchet' | 'bit' | 'assist'
  tier: string
  img: string
}

/** 解 CSV 做二維陣列。要食到：引號欄、引號內嵌逗號、內嵌換行、"" 轉義、CRLF。 */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]

    if (quoted) {
      // 引號入面除咗 "" 之外乜都係內容 —— 包括逗號同換行。
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += c
      }
      continue
    }

    if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && raw[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }

  // 最後一行冇換行結尾都要收貨；但成份 CSV 尾嗰個換行唔應該開多一行空 row。
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/** 認 header：邊一欄嘅標題係咁起頭。搵唔到係 -1。 */
function colOf(header: string[], prefix: string): number {
  return header.findIndex((h) => h.trim().startsWith(prefix))
}

function cell(row: string[], col: number): string {
  return (row[col] ?? '').trim()
}

/** database tab → BladeRow[]。必要欄 header 搵唔到就 return null（俾上層當 fetch 失敗）。 */
export function parseBlades(rows: string[][]): BladeRow[] | null {
  const header = rows[0]
  if (header === undefined) return null

  // 用 startsWith 唔用全等，因為 sheet 度 assist 嗰欄個標題本身係斷嘅
  // （`原裝輔助戰刃 (Assist Blade`，冇閂括號）。順便啲前綴要揀到唔會撞：
  // `原裝固鎖` 唔會撞 `固鎖階級`，`階級` 唔會撞 `固鎖階級`／`軸心階級`。
  const cols = {
    id: colOf(header, '型號'),
    name: colOf(header, '中文名稱'),
    type: colOf(header, '類型'),
    tier: colOf(header, '階級'),
    ratchet: colOf(header, '原裝固鎖'),
    bit: colOf(header, '原裝軸心'),
    assist: colOf(header, '原裝輔助戰刃'),
    source: colOf(header, '來源產品'),
    img: colOf(header, '圖片網址'),
    combo: colOf(header, '建議配置'),
  }
  if (Object.values(cols).some((i) => i < 0)) return null

  const out: BladeRow[] = []
  for (const row of rows.slice(1)) {
    const id = cell(row, cols.id)
    // sheet 有幾十行留白嘅 placeholder（型號空、階級係 `-`），唔剷走就會出一堆空卡。
    if (id === '') continue
    out.push({
      id,
      name: cell(row, cols.name),
      type: cell(row, cols.type),
      tier: cell(row, cols.tier),
      ratchet: cell(row, cols.ratchet),
      bit: cell(row, cols.bit),
      assist: cell(row, cols.assist),
      source: cell(row, cols.source),
      img: cell(row, cols.img),
      combo: cell(row, cols.combo),
    })
  }
  return out
}

const KINDS = new Set<PartRow['kind']>(['ratchet', 'bit', 'assist'])

function asKind(v: string): PartRow['kind'] | null {
  const k = v.toLowerCase() as PartRow['kind']
  return KINDS.has(k) ? k : null
}

/** 零件圖鑑 tab → PartRow[]。同上。 */
export function parseParts(rows: string[][]): PartRow[] | null {
  const header = rows[0]
  if (header === undefined) return null

  const cols = {
    name: colOf(header, '原裝固鎖、軸心'),
    kind: colOf(header, '分類'),
    img: colOf(header, '圖片網址'),
    tier: colOf(header, '階級'),
  }
  if (Object.values(cols).some((i) => i < 0)) return null

  const out: PartRow[] = []
  for (const row of rows.slice(1)) {
    const name = cell(row, cols.name)
    const kind = asKind(cell(row, cols.kind))
    // 呢個 tab 除咗三種零件之外仲有啲其他分類嘅行，唔係我哋要嘅嘢。
    if (name === '' || kind === null) continue
    out.push({ name, kind, tier: cell(row, cols.tier), img: cell(row, cols.img) })
  }
  return out
}

/* ── 搜尋同篩選 ─────────────────────────────────────────── */

export type KindFilter = 'all' | 'blade' | 'ratchet' | 'bit' | 'assist'
export type TypeFilter = 'all' | 'attack' | 'defense' | 'stamina' | 'balance'
export type GradeFilter = 'all' | 'X' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'unrated'

export interface PartsFilter {
  kind: KindFilter
  type: TypeFilter
  grade: GradeFilter
}

const GRADES = new Set<Exclude<GradeFilter, 'all' | 'unrated'>>(['X', 'S', 'A', 'B', 'C', 'D', 'E'])

/**
 * tier 字串 → 級別字頭。'' 同 '-' 係 'unrated'；'S+'→'S'。
 *
 * 淨係睇字頭，因為 sheet 度啲級數係 S+/S/A+/A 咁分 —— 用戶揀「S」係想見晒
 * 成個 S 檔，唔係淨要冇加號嗰啲。認唔到嘅字一律當未評，好過憑空多一個級。
 */
export function gradeOf(tier: string): Exclude<GradeFilter, 'all'> {
  const head = tier.trim().charAt(0).toUpperCase() as Exclude<GradeFilter, 'all' | 'unrated'>
  return GRADES.has(head) ? head : 'unrated'
}

function gradeOk(tier: string, f: PartsFilter): boolean {
  return f.grade === 'all' || gradeOf(tier) === f.grade
}

function hit(needle: string, fields: string[]): boolean {
  return needle === '' || fields.some((v) => v.toLowerCase().includes(needle))
}

export function searchBlades(blades: BladeRow[], query: string, f: PartsFilter): BladeRow[] {
  if (f.kind !== 'all' && f.kind !== 'blade') return []

  const q = query.trim().toLowerCase()
  return blades.filter(
    (b) =>
      (f.type === 'all' || b.type === f.type) &&
      gradeOk(b.tier, f) &&
      hit(q, [b.id, b.name, b.ratchet, b.bit, b.assist]),
  )
}

export function searchParts(parts: PartRow[], query: string, f: PartsFilter): PartRow[] {
  // 揀咗類型（攻擊／防禦…）即係話緊「我搵緊戰刃」—— 零件根本冇類型，
  // 照出返啲零件就等於偷偷 OR 咗個條件落去。
  if (f.kind === 'blade' || f.type !== 'all') return []

  const q = query.trim().toLowerCase()
  return parts.filter(
    (p) => (f.kind === 'all' || p.kind === f.kind) && gradeOk(p.tier, f) && hit(q, [p.name]),
  )
}
