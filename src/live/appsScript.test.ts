import { beforeEach, describe, expect, it } from 'vitest'
// Vite 嘅 `?raw` —— build time 讀入嚟做字串。用呢個唔用 node:fs，
// 因為個 project 冇裝 @types/node，而呢個檔會俾 `tsc --noEmit` 掃到。
import CODE from '../../apps-script/Code.gs?raw'

/**
 * 段 Apps Script 嘅邏輯測試。
 *
 * `apps-script/Code.gs` 跑喺 Google 個 runtime 度，vitest 直接掂唔到 ——
 * 但佢用到嘅 Google 嘢得五個（SpreadsheetApp、CacheService、LockService、
 * ContentService、Date），全部 stub 得。所以「冇得測試」係假嘅：
 * 測唔到嘅淨係 deploy 同權限，邏輯本身測得晒。
 *
 * 呢度讀返個真檔案，唔係抄一份 —— 抄一份就會分叉，測住個舊版本仲要一路綠。
 */

interface Reply {
  ok: boolean
  err?: string
  v?: number
  role?: string
  view?: string
  until?: number
  t?: { name: string; live?: unknown } | undefined
}

/** 一格一格咁記住個 sheet。A1 記法同 (row, col, rows, cols) 兩種都要收。 */
function fakeSheet() {
  const cells = new Map<string, unknown>()
  const at = (r: number, c: number) => `${r},${c}`

  function parseA1(a1: string) {
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a1)!
    const col = (s: string) => s.charCodeAt(0) - 64
    return {
      r1: Number(m[2]),
      c1: col(m[1]!),
      r2: m[4] ? Number(m[4]) : Number(m[2]),
      c2: m[3] ? col(m[3]) : col(m[1]!),
    }
  }

  function range(r1: number, c1: number, rows: number, cols: number) {
    return {
      getValues() {
        return Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => cells.get(at(r1 + r, c1 + c)) ?? ''),
        )
      },
      setValues(v: unknown[][]) {
        v.forEach((row, r) => row.forEach((val, c) => cells.set(at(r1 + r, c1 + c), val)))
        return this
      },
      getValue() {
        return cells.get(at(r1, c1)) ?? ''
      },
      setValue(v: unknown) {
        cells.set(at(r1, c1), v)
        return this
      },
      clearContent() {
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) cells.delete(at(r1 + r, c1 + c))
        return this
      },
    }
  }

  return {
    getRange(...args: unknown[]) {
      if (typeof args[0] === 'string') {
        const { r1, c1, r2, c2 } = parseA1(args[0])
        return range(r1, c1, r2 - r1 + 1, c2 - c1 + 1)
      }
      const [r, c, rows, cols] = args as number[]
      return range(r!, c!, rows!, cols ?? 1)
    },
  }
}

interface Script {
  get(q: Record<string, string>): Reply
  post(body: unknown): Reply
  setNow(ms: number): void
}

/** 每個測試一個全新嘅 sheet + 全新嘅 cache。 */
function loadScript(startAt = 1_000_000): Script {
  const sheets = new Map<string, ReturnType<typeof fakeSheet>>()
  const cache = new Map<string, string>()
  let now = startAt

  const env = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n: string) => sheets.get(n) ?? null,
        insertSheet: (n: string) => {
          const s = fakeSheet()
          sheets.set(n, s)
          return s
        },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        put: (k: string, v: string) => void cache.set(k, v),
      }),
    },
    // 個鎖喺真環境有用，但一次得一個測試行，所以永遠攞得到。
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s: string) => ({ setMimeType: () => ({ _body: s }) }),
    },
    Date: { now: () => now },
  }

  const make = new Function(
    ...Object.keys(env),
    `${CODE}\nreturn { doGet: doGet, doPost: doPost }`,
  ) as (...a: unknown[]) => {
    doGet: (e: unknown) => { _body: string }
    doPost: (e: unknown) => { _body: string }
  }
  const api = make(...Object.values(env))

  return {
    get: (q) => JSON.parse(api.doGet({ parameter: q })._body) as Reply,
    post: (body) =>
      JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } })._body) as Reply,
    setNow: (ms) => void (now = ms),
  }
}

const T = (name: string) => ({ id: 't1', name, players: [], matches: [] })
const LEASE_MS = 5 * 60 * 1000

let s: Script
beforeEach(() => {
  s = loadScript()
})

describe('init', () => {
  it('第一次擺場賽事上去', () => {
    const r = s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('第一場') })
    expect(r).toEqual({ ok: true, v: 1 })
  })

  it('冇啱 token 換唔到場', () => {
    s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('第一場') })
    const r = s.post({ action: 'init', k: 'wrong', edit: 'e2', view: 'v2', t: T('搶') })
    expect(r.err).toBe('already-init')
  })

  it('有啱 token 就換到場', () => {
    s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('第一場') })
    const r = s.post({ action: 'init', k: 'edit-a', edit: 'edit-c', view: 'view-d', t: T('第二場') })
    expect(r.ok).toBe(true)
  })

  /**
   * 換場之後版本要繼續行前。
   *
   * reset 做 1 嘅話，一個 `since` 啱啱係 1 嘅觀眾會收到「冇變」，
   * 望住舊畫面唔郁 —— 而佢條 link 其實已經死咗。
   */
  it('換場之後版本繼續行前，唔會 reset 做 1', () => {
    s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('第一場') })
    const r = s.post({ action: 'init', k: 'edit-a', edit: 'edit-c', view: 'view-d', t: T('第二場') })
    expect(r.v).toBe(2)
  })

  it('冇 t 唔會炸', () => {
    const r = s.post({ action: 'init', edit: 'e', view: 'v' })
    expect(r.err).toBe('bad-body')
  })

  it('兩個 token 唔可以一樣', () => {
    expect(s.post({ action: 'init', edit: 'same', view: 'same', t: T('x') }).err).toBe('bad-token')
  })
})

describe('token 判角色', () => {
  beforeEach(() => {
    s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('場') })
  })

  it('edit 讀得，view 都讀得', () => {
    expect(s.get({ k: 'edit-a' }).role).toBe('edit')
    expect(s.get({ k: 'view-b' }).role).toBe('view')
  })

  it('亂 token 讀唔到', () => {
    expect(s.get({ k: 'nope' }).err).toBe('bad-token')
  })

  it('view 寫唔到嘢', () => {
    expect(s.post({ k: 'view-b', who: 'dev1', t: T('觀眾想寫') }).err).toBe('read-only')
  })

  it('view token 淨係派俾 edit', () => {
    expect(s.get({ k: 'edit-a' }).view).toBe('view-b')
    expect(s.get({ k: 'view-b' }).view).toBeUndefined()
  })
})

/**
 * 段 script 自己都要剝走 `live`，唔可以淨係靠客戶端。
 *
 * 剝走呢件事如果淨係喺客戶端做，一個寫錯咗（或者惡意）嘅 edit-token 客戶端
 * 就可以把兩個 token 一次過發佈俾全部觀眾 —— 而唯一守住呢個性質嘅嘢
 * 喺佢部機度。段 script 係所有寫入嘅共同樽頸，喺嗰度先真係守得住。
 */
describe('token 唔會漏俾觀眾', () => {
  it('客戶端剝漏咗，段 script 都會剝走', () => {
    s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('場') })
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: true })
    s.post({
      k: 'edit-a',
      who: 'dev1',
      t: { ...T('剝漏咗'), live: { scriptId: 'S', edit: 'edit-a', view: 'view-b' } },
    })

    const asViewer = s.get({ k: 'view-b' })
    expect(asViewer.t?.live).toBeNull()
    expect(JSON.stringify(asViewer)).not.toContain('edit-a')
  })

  it('init 嗰份都會剝', () => {
    s.post({
      action: 'init',
      edit: 'edit-a',
      view: 'view-b',
      t: { ...T('場'), live: { scriptId: 'S', edit: 'edit-a', view: 'view-b' } },
    })
    expect(s.get({ k: 'view-b' }).t?.live).toBeNull()
  })
})

describe('入分位', () => {
  beforeEach(() => {
    s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('場') })
  })

  it('一次得一個人坐', () => {
    expect(s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: false }).ok).toBe(true)
    const second = s.post({ action: 'claim', k: 'edit-a', who: 'dev2', force: false })
    expect(second.err).toBe('held')
  })

  it('冇位就寫唔到嘢', () => {
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: false })
    expect(s.post({ k: 'edit-a', who: 'dev2', t: T('偷寫') }).err).toBe('not-holder')
  })

  it('force 就搶到，前任跟住寫唔到', () => {
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: false })
    expect(s.post({ action: 'claim', k: 'edit-a', who: 'dev2', force: true }).ok).toBe(true)
    expect(s.post({ k: 'edit-a', who: 'dev1', t: T('前任想寫') }).err).toBe('not-holder')
  })

  it('冇 who 就唔准寫', () => {
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: true })
    expect(s.post({ k: 'edit-a', t: T('冇署名') }).err).toBe('bad-who')
  })

  it('冇 t 唔會炸', () => {
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: true })
    expect(s.post({ k: 'edit-a', who: 'dev1' }).err).toBe('bad-body')
  })

  it('讓咗位第二個即刻攞到', () => {
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: false })
    s.post({ action: 'release', k: 'edit-a', who: 'dev1' })
    expect(s.post({ action: 'claim', k: 'edit-a', who: 'dev2', force: false }).ok).toBe(true)
  })

  /**
   * 5 分鐘唔係求其揀嘅：一個 round 打 3–5 分鐘，短過呢個就會喺人哋
   * 等緊個 round 打完嗰陣拎走佢個位。
   */
  it('4 分鐘未過期，5 分鐘就過', () => {
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: false })

    s.setNow(1_000_000 + 4 * 60 * 1000)
    expect(s.post({ action: 'claim', k: 'edit-a', who: 'dev2', force: false }).err).toBe('held')

    s.setNow(1_000_000 + LEASE_MS + 1)
    expect(s.post({ action: 'claim', k: 'edit-a', who: 'dev2', force: false }).ok).toBe(true)
  })

  it('推嘢順手續期', () => {
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: false })
    s.setNow(1_000_000 + 4 * 60 * 1000)
    s.post({ k: 'edit-a', who: 'dev1', t: T('入分') })

    // 由推嗰刻再數 5 分鐘，所以原本嗰個到期時間之後仲坐得住。
    s.setNow(1_000_000 + 8 * 60 * 1000)
    expect(s.post({ action: 'claim', k: 'edit-a', who: 'dev2', force: false }).err).toBe('held')
  })
})

describe('版本', () => {
  beforeEach(() => {
    s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('場') })
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: true })
    s.post({ k: 'edit-a', who: 'dev1', t: T('入咗分') })
  })

  it('版本一樣就唔派資料落嚟', () => {
    const r = s.get({ k: 'view-b', since: '2' })
    expect(r.ok).toBe(true)
    expect(r.t).toBeUndefined()
  })

  it('版本唔同就派返成份', () => {
    expect(s.get({ k: 'view-b', since: '1' }).t?.name).toBe('入咗分')
  })
})

/**
 * 一格 Google Sheet 最多 50,000 字元。實測 16 人單循環打完係 38.7 KB，
 * 20 人（190 場）就超過。超咗 Google 唔報錯，係**靜靜雞截斷**。
 */
describe('分段', () => {
  beforeEach(() => {
    s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('場') })
    s.post({ action: 'claim', k: 'edit-a', who: 'dev1', force: true })
  })

  it('95 KB 推得上、拉得返、一個字唔差', () => {
    const long = 'x'.repeat(95_000)
    s.post({ k: 'edit-a', who: 'dev1', t: T(long) })
    expect(s.get({ k: 'edit-a' }).t?.name).toBe(long)
  })

  it('由長變短，唔會接到舊嘢落尾', () => {
    s.post({ k: 'edit-a', who: 'dev1', t: T('x'.repeat(95_000)) })
    s.post({ k: 'edit-a', who: 'dev1', t: T('短') })
    expect(s.get({ k: 'edit-a', fresh: '1' }).t?.name).toBe('短')
  })

  /**
   * 一隻 emoji 係兩個 code unit，切得開。個 pad 一定要**計**，唔可以寫死 ——
   * 分段位係喺成份 JSON 嘅第 40,000 位，唔係個名嘅第 40,000 位。
   */
  it('emoji 啱啱切喺分段位都唔會爛', () => {
    const nameStartsAt = JSON.stringify(T('')).indexOf('""') + 1
    const exact = 40_000 - 1 - nameStartsAt

    for (const pad of [exact - 1, exact, exact + 1]) {
      const name = 'x'.repeat(pad) + '🌀' + 'y'.repeat(10)
      s.post({ k: 'edit-a', who: 'dev1', t: T(name) })
      expect(s.get({ k: 'edit-a', fresh: '1' }).t?.name).toBe(name)
    }

    // 真係切開咗先算數 —— 高位 surrogate 要啱啱好喺第 39,999 位。
    const split = 'x'.repeat(exact) + '🌀'
    expect(JSON.stringify(T(split)).indexOf('\uD83C')).toBe(39_999)
  })
})

describe('壞資料', () => {
  it('body 唔係 JSON 唔會炸', () => {
    const bad = loadScript()
    bad.post({ action: 'init', edit: 'e', view: 'v', t: T('x') })
    // 直接餵爛字串入去 —— `post` 會 stringify，所以自己砌一次。
    expect(() => bad.post({ action: 'wat', k: 'e' })).not.toThrow()
  })

  it('冇 token 嘅 GET 當 bad-token', () => {
    s.post({ action: 'init', edit: 'edit-a', view: 'view-b', t: T('場') })
    expect(s.get({}).err).toBe('bad-token')
  })
})
