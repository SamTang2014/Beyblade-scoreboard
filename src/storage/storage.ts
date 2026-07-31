import type {
  FinishType,
  Match,
  Player,
  RoundResult,
  Tournament,
  TournamentMode,
} from '../engine/types'

/**
 * 賽事全部存喺瀏覽器嘅 localStorage。冇後端，所以呢度就係唯一一份資料。
 * 清除瀏覽器資料 / 無痕視窗 / 換機 / 換 browser 都會冇晒，
 * 所以匯出匯入唔係額外功能，係必需品。
 */

const KEY = 'beyblade-scoreboard/v1'
const EXPORT_APP = 'beyblade-scoreboard'
const EXPORT_VERSION = 1

/** 只係讀寫字串，方便測試時用假 storage 頂上。 */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface StoreOptions {
  kv: KeyValueStore
  now?: () => number
  newId?: () => string
}

export interface TournamentSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  playerCount: number
  matchCount: number
}

/** 存唔到（多數係 localStorage 爆咗）。 */
export class StorageFullError extends Error {
  constructor() {
    super('存唔到落瀏覽器，可能係空間爆咗。撳「down 低備份」保住而家啲資料先。')
    this.name = 'StorageFullError'
  }
}

/** 匯入嘅檔案唔啱格式。message 會直接show俾用戶睇，所以要講明邊度唔啱。 */
export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

export interface ExportFile {
  app: typeof EXPORT_APP
  version: number
  exportedAt: number
  tournaments: Tournament[]
}

const FINISHES: FinishType[] = ['spin', 'over', 'burst', 'xtreme']

function defaultNewId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function createStore({ kv, now = Date.now, newId = defaultNewId }: StoreOptions) {
  function readAll(): Tournament[] {
    const raw = kv.getItem(KEY)
    if (raw === null) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      // 讀嘅時候寬鬆啲：一筆爛咗唔好拖冧其餘嘅賽事。
      return parsed.flatMap((t) => {
        try {
          return [parseTournament(t)]
        } catch {
          return []
        }
      })
    } catch {
      return []
    }
  }

  function writeAll(list: Tournament[]): void {
    try {
      kv.setItem(KEY, JSON.stringify(list))
    } catch {
      throw new StorageFullError()
    }
  }

  return {
    list(): TournamentSummary[] {
      return readAll()
        .map((t) => ({
          id: t.id,
          name: t.name,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          playerCount: t.players.length,
          matchCount: t.matches.length,
        }))
        .sort((x, y) => y.updatedAt - x.updatedAt)
    },

    get(id: string): Tournament | null {
      return readAll().find((t) => t.id === id) ?? null
    },

    /** 有就更新，冇就新增。updatedAt 由呢度話事。 */
    save(t: Tournament): Tournament {
      const saved: Tournament = { ...t, updatedAt: now() }
      const list = readAll()
      const i = list.findIndex((x) => x.id === saved.id)
      if (i === -1) list.push(saved)
      else list[i] = saved
      writeAll(list)
      return saved
    },

    remove(id: string): void {
      writeAll(readAll().filter((t) => t.id !== id))
    },

    create(name: string): Tournament {
      const stamp = now()
      const t: Tournament = {
        id: newId(),
        name: name.trim() || '未命名賽事',
        createdAt: stamp,
        updatedAt: stamp,
        mode: 'roundRobin',
        cutSize: null,
        poolCount: null,
        advancePerPool: null,
        players: [],
        matches: [],
      }
      const list = readAll()
      list.push(t)
      writeAll(list)
      return t
    },

    /** 一個賽事，或者淨低嘅全部。 */
    exportJson(id?: string): string {
      const all = readAll()
      const tournaments = id === undefined ? all : all.filter((t) => t.id === id)
      const file: ExportFile = {
        app: EXPORT_APP,
        version: EXPORT_VERSION,
        exportedAt: now(),
        tournaments,
      }
      return JSON.stringify(file, null, 2)
    },

    /**
     * 匯入。id 撞咗嘅話會當成新賽事加入，唔會蓋走本身嗰個 ——
     * 匯入永遠唔會整失資料。
     */
    importJson(text: string): Tournament[] {
      const file = parseExportFile(text)
      const list = readAll()
      const taken = new Set(list.map((t) => t.id))
      const added: Tournament[] = []

      for (const t of file.tournaments) {
        const copy: Tournament = taken.has(t.id)
          ? { ...t, id: newId(), name: `${t.name}（匯入）`, updatedAt: now() }
          : t
        taken.add(copy.id)
        list.push(copy)
        added.push(copy)
      }

      writeAll(list)
      return added
    },
  }
}

export type Store = ReturnType<typeof createStore>

// ── 驗證 ──────────────────────────────────────────────────────────
// 匯入嘅檔案係外面嚟嘅，一律當唔信得過。錯要講明邊度錯。

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') throw new ImportError(`${where} 唔見咗或者唔係文字。`)
  return v
}

/**
 * 容許吉字串。
 *
 * 讀嘅時候一定要接受寫得入去嘅嘢：介面容許賽事名吉（成個 app 都有
 * 「未命名賽事」呢個 fallback），如果 parser 反過嚟當佢係壞資料，
 * 用戶一 select-all 刪走個名，成場賽事連分數就會俾 readAll() 靜靜哋丟走。
 */
function text(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new ImportError(`${where} 唔係文字。`)
  return v
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ImportError(`${where} 唔係數字。`)
  return v
}

function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new ImportError(`${where} 唔係一個列表。`)
  return v
}

export function parseTournament(v: unknown): Tournament {
  if (!isObject(v)) throw new ImportError('賽事資料唔係一個物件。')

  const players: Player[] = arr(v.players, '選手名單').map((p, i) => {
    if (!isObject(p)) throw new ImportError(`第 ${i + 1} 個選手唔係一個物件。`)
    return {
      id: str(p.id, `第 ${i + 1} 個選手嘅 id`),
      name: str(p.name, `第 ${i + 1} 個選手個名`),
      seat: num(p.seat, `第 ${i + 1} 個選手嘅位置`),
      // 舊檔冇 pool，一律當未分組。
      pool: positiveInt(p.pool),
    }
  })

  const known = new Set(players.map((p) => p.id))
  if (known.size !== players.length) throw new ImportError('有選手嘅 id 撞咗。')

  const matches: Match[] = arr(v.matches, '賽程').map((m, i) => {
    if (!isObject(m)) throw new ImportError(`第 ${i + 1} 場唔係一個物件。`)

    // 淘汰階段開賽時對手可以未定，所以 null 係合法值。
    const aId = playerRef(m.aId, known, `第 ${i + 1} 場嘅藍邊選手`)
    const bId = playerRef(m.bId, known, `第 ${i + 1} 場嘅紅邊選手`)

    const rounds: RoundResult[] = arr(m.rounds, `第 ${i + 1} 場嘅 round`).map((r, j) => {
      if (!isObject(r)) throw new ImportError(`第 ${i + 1} 場第 ${j + 1} round 唔係一個物件。`)
      const finish = r.finish
      if (typeof finish !== 'string' || !FINISHES.includes(finish as FinishType)) {
        throw new ImportError(`第 ${i + 1} 場第 ${j + 1} round 嘅勝法「${String(finish)}」唔認得。`)
      }
      const winnerId = str(r.winnerId, `第 ${i + 1} 場第 ${j + 1} round 嘅贏家`)
      if (winnerId !== aId && winnerId !== bId) {
        throw new ImportError(`第 ${i + 1} 場第 ${j + 1} round 嘅贏家唔係嗰場嘅選手。`)
      }
      return { winnerId, finish: finish as FinishType }
    })

    return {
      id: str(m.id, `第 ${i + 1} 場嘅 id`),
      // 舊檔案冇 stage，一律當循環賽。
      stage: m.stage === 'bracket' || m.stage === 'tiebreak' ? m.stage : 'group',
      round: num(m.round, `第 ${i + 1} 場嘅輪次`),
      order: num(m.order, `第 ${i + 1} 場嘅次序`),
      aId,
      bId,
      aFrom: optionalStr(m.aFrom),
      bFrom: optionalStr(m.bFrom),
      rounds,
    }
  })

  // 場次之間嘅指針要指到真嘢，唔係之後 propagate 會靜靜哋填唔到人。
  const matchIds = new Set(matches.map((m) => m.id))
  for (const [i, m] of matches.entries()) {
    for (const from of [m.aFrom, m.bFrom]) {
      if (from !== null && !matchIds.has(from)) {
        throw new ImportError(`第 ${i + 1} 場等緊一場唔存在嘅對戰（${from}）。`)
      }
    }
  }

  const poolCount = positiveInt(v.poolCount)
  const advancePerPool = positiveInt(v.advancePerPool)

  // 組別超出咗組數就當未分組 —— 下次排賽程會塞佢入人最少嗰組，
  // 好過排出一場指住一個唔存在嘅組嘅比賽。
  const grouped =
    poolCount === null
      ? players.map((p) => (p.pool === null ? p : { ...p, pool: null }))
      : players.map((p) => (p.pool !== null && p.pool > poolCount ? { ...p, pool: null } : p))

  return {
    id: str(v.id, '賽事 id'),
    name: text(v.name, '賽事名'),
    createdAt: num(v.createdAt, '建立時間'),
    updatedAt: num(v.updatedAt, '更新時間'),
    // 舊檔案冇 mode，一律當單循環 —— 之前存嘅賽事唔會爛。
    mode: parseMode(v.mode),
    cutSize: typeof v.cutSize === 'number' && Number.isFinite(v.cutSize) ? v.cutSize : null,
    poolCount,
    advancePerPool,
    players: grouped,
    matches,
  }
}

const MODES: TournamentMode[] = [
  'roundRobin',
  'knockout',
  'groupThenKnockout',
  'poolsThenKnockout',
]

function parseMode(v: unknown): TournamentMode {
  if (v === undefined || v === null) return 'roundRobin'
  if (typeof v === 'string' && MODES.includes(v as TournamentMode)) return v as TournamentMode
  throw new ImportError(`賽制「${String(v)}」唔認得。`)
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

/** 1 起計嘅正整數，唔係就當冇。舊檔、爛值都行呢條路。 */
function positiveInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null
}

/** 選手 id，或者 null（淘汰賽對手未定）。填咗就一定要喺名單度。 */
function playerRef(v: unknown, known: Set<string>, where: string): string | null {
  if (v === undefined || v === null) return null
  const id = str(v, where)
  if (!known.has(id)) throw new ImportError(`${where}唔喺名單度。`)
  return id
}

export function parseExportFile(text: string): ExportFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('呢個唔係一個 JSON 檔，入唔到。')
  }

  if (!isObject(raw)) throw new ImportError('檔案內容唔係一個物件。')
  if (raw.app !== EXPORT_APP) {
    throw new ImportError('呢個唔係陀螺計分板嘅備份檔。')
  }
  const version = num(raw.version, '檔案版本')
  if (version > EXPORT_VERSION) {
    throw new ImportError(`呢個備份係新版本（v${version}）整嘅，而家個版本讀唔到。`)
  }

  const tournaments = arr(raw.tournaments, '賽事列表').map(parseTournament)
  if (tournaments.length === 0) throw new ImportError('個備份檔入面一場賽事都冇。')

  return {
    app: EXPORT_APP,
    version,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    tournaments,
  }
}
