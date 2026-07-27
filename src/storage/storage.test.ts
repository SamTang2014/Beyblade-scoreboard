import { beforeEach, describe, expect, it } from 'vitest'
import {
  ImportError,
  StorageFullError,
  createStore,
  parseExportFile,
  type KeyValueStore,
} from './storage'
import type { Tournament } from '../engine/types'

class FakeKv implements KeyValueStore {
  private data = new Map<string, string>()
  full = false

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.full) throw new DOMException('quota', 'QuotaExceededError')
    this.data.set(key, value)
  }

  /** 扮有人手改壞咗 localStorage。 */
  poke(key: string, value: string): void {
    this.data.set(key, value)
  }
}

let kv: FakeKv
let clock: number
let counter: number

function store() {
  return createStore({
    kv,
    now: () => ++clock,
    newId: () => `id${++counter}`,
  })
}

beforeEach(() => {
  kv = new FakeKv()
  clock = 1000
  counter = 0
})

function withPlayers(t: Tournament): Tournament {
  return {
    ...t,
    players: [
      { id: 'a', name: '阿明', seat: 0 },
      { id: 'b', name: '阿強', seat: 1 },
    ],
    matches: [
      {
        id: 'a__b',
        round: 1,
        order: 1,
        aId: 'a',
        bId: 'b',
        rounds: [{ winnerId: 'a', finish: 'burst' }],
      },
    ],
  }
}

describe('賽事存取', () => {
  it('新開嘅賽事讀返出嚟一模一樣', () => {
    const s = store()
    const t = s.create('星期六陀螺仔聚會')
    expect(s.get(t.id)).toEqual(t)
    expect(s.list()).toHaveLength(1)
  })

  it('冇名就叫「未命名賽事」', () => {
    expect(store().create('   ').name).toBe('未命名賽事')
  })

  it('存返落去會更新 updatedAt', () => {
    const s = store()
    const t = s.create('測試')
    const saved = s.save(withPlayers(t))
    expect(saved.updatedAt).toBeGreaterThan(t.updatedAt)
    expect(s.get(t.id)!.players).toHaveLength(2)
  })

  it('存兩次唔會變兩個賽事', () => {
    const s = store()
    const t = s.create('測試')
    s.save(t)
    s.save(t)
    expect(s.list()).toHaveLength(1)
  })

  it('列表按最近改過嘅排前', () => {
    const s = store()
    const first = s.create('第一場')
    const second = s.create('第二場')
    expect(s.list().map((x) => x.id)).toEqual([second.id, first.id])

    s.save(first)
    expect(s.list().map((x) => x.id)).toEqual([first.id, second.id])
  })

  it('列表帶住人數同場數', () => {
    const s = store()
    s.save(withPlayers(s.create('測試')))
    expect(s.list()[0]).toMatchObject({ playerCount: 2, matchCount: 1 })
  })

  it('刪走一個唔會影響其他', () => {
    const s = store()
    const a = s.create('A')
    const b = s.create('B')
    s.remove(a.id)
    expect(s.get(a.id)).toBeNull()
    expect(s.get(b.id)).not.toBeNull()
  })

  it('搵唔到就返 null', () => {
    expect(store().get('唔存在')).toBeNull()
  })

  it('localStorage 爆咗會講明，唔會靜靜哋唔見咗', () => {
    const s = store()
    kv.full = true
    expect(() => s.create('測試')).toThrow(StorageFullError)
  })
})

describe('讀到爛資料', () => {
  it('完全唔係 JSON 就當一場都冇，唔會炸', () => {
    kv.poke('beyblade-scoreboard/v1', '{{{壞咗')
    expect(store().list()).toEqual([])
  })

  it('一場爛咗，其餘正常嘅照讀到', () => {
    const s = store()
    const good = s.save(withPlayers(s.create('好嘅')))
    const raw: unknown[] = JSON.parse(kv.getItem('beyblade-scoreboard/v1')!)
    raw.push({ id: 'bad', name: 123 })
    kv.poke('beyblade-scoreboard/v1', JSON.stringify(raw))

    const list = store().list()
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe(good.id)
  })
})

describe('匯出匯入', () => {
  it('匯出再匯入，資料一模一樣', () => {
    const s = store()
    const t = s.save(withPlayers(s.create('原本嗰場')))
    const json = s.exportJson(t.id)

    const fresh = createStore({ kv: new FakeKv(), now: () => 5000, newId: () => 'new' })
    const [imported] = fresh.importJson(json)
    expect(imported).toEqual(t)
  })

  it('淨係匯出指定嗰場', () => {
    const s = store()
    const a = s.create('A')
    s.create('B')
    const file = parseExportFile(s.exportJson(a.id))
    expect(file.tournaments.map((t) => t.name)).toEqual(['A'])
  })

  it('唔指定就全部匯出', () => {
    const s = store()
    s.create('A')
    s.create('B')
    expect(parseExportFile(s.exportJson()).tournaments).toHaveLength(2)
  })

  it('匯入撞 id 會變新一場，唔會蓋走本身嗰場', () => {
    const s = store()
    const t = s.save(withPlayers(s.create('原本嗰場')))
    const json = s.exportJson(t.id)

    const [copy] = s.importJson(json)
    expect(copy!.id).not.toBe(t.id)
    expect(copy!.name).toBe('原本嗰場（匯入）')
    expect(s.get(t.id)!.name).toBe('原本嗰場') // 本身嗰個原封不動
    expect(s.list()).toHaveLength(2)
  })
})

describe('匯入壞檔案', () => {
  const bad = (text: string) => () => store().importJson(text)

  it('唔係 JSON', () => {
    expect(bad('唔係 json')).toThrow(/唔係一個 JSON 檔/)
  })

  it('第二個 app 嘅檔案', () => {
    expect(bad(JSON.stringify({ app: '第二個app', version: 1, tournaments: [] }))).toThrow(
      /唔係陀螺計分板嘅備份檔/,
    )
  })

  it('新版本嘅備份', () => {
    expect(
      bad(JSON.stringify({ app: 'beyblade-scoreboard', version: 99, tournaments: [] })),
    ).toThrow(/新版本/)
  })

  it('入面一場賽事都冇', () => {
    expect(
      bad(JSON.stringify({ app: 'beyblade-scoreboard', version: 1, tournaments: [] })),
    ).toThrow(/一場賽事都冇/)
  })

  it('勝法唔認得', () => {
    const s = store()
    const t = s.save(withPlayers(s.create('測試')))
    const file = JSON.parse(s.exportJson(t.id))
    file.tournaments[0].matches[0].rounds[0].finish = '火燒'
    expect(bad(JSON.stringify(file))).toThrow(/勝法「火燒」唔認得/)
  })

  it('場次入面有唔喺名單嘅選手', () => {
    const s = store()
    const t = s.save(withPlayers(s.create('測試')))
    const file = JSON.parse(s.exportJson(t.id))
    file.tournaments[0].matches[0].bId = '路人甲'
    expect(bad(JSON.stringify(file))).toThrow(/有選手唔喺名單度/)
  })

  it('round 嘅贏家唔係嗰場嘅人', () => {
    const s = store()
    const t = s.save(withPlayers(s.create('測試')))
    const file = JSON.parse(s.exportJson(t.id))
    file.tournaments[0].matches[0].rounds[0].winnerId = '路人甲'
    expect(bad(JSON.stringify(file))).toThrow(/贏家唔係嗰場嘅選手/)
  })

  it('選手 id 撞咗', () => {
    const s = store()
    const t = s.save(withPlayers(s.create('測試')))
    const file = JSON.parse(s.exportJson(t.id))
    file.tournaments[0].players[1].id = 'a'
    expect(bad(JSON.stringify(file))).toThrow(/id 撞咗/)
  })

  it('全部錯誤都係 ImportError，可以直接show俾用戶睇', () => {
    try {
      store().importJson('唔係 json')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError)
      expect((e as ImportError).message).toMatch(/。$/)
    }
  })

  it('匯入失敗唔會整走本身啲賽事', () => {
    const s = store()
    const t = s.create('本身嗰場')
    expect(() => s.importJson('壞檔案')).toThrow()
    expect(s.get(t.id)).not.toBeNull()
  })
})
