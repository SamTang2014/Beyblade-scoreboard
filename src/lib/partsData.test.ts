import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPartsData, readCache, writeCache, type PartsData } from './partsData'

class FakeStorage {
  private data = new Map<string, string>()
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, v) }
  removeItem(k: string) { this.data.delete(k) }
  clear() { this.data.clear() }
  key() { return null }
  get length() { return this.data.size }
}

const KEY = 'beyblade-scoreboard/parts-cache'

const SAMPLE: PartsData = {
  at: 1_760_000_000_000,
  blades: [
    {
      id: 'UX-15-01', name: '鮫鯊狂鱗', type: 'attack', tier: 'S+',
      ratchet: '4-50', bit: 'UF', assist: '',
      source: 'UX-15 鮫鯊狂鱗改造組', img: 'https://i.ibb.co/x/a.png', combo: '固鎖：1-60',
    },
  ],
  parts: [{ name: '9-60', kind: 'ratchet', tier: 'S+', img: 'https://i.ibb.co/x/r.webp' }],
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new FakeStorage())
})

describe('快取', () => {
  it('冇存過就係 null', () => {
    expect(readCache()).toBeNull()
  })

  it('寫完讀返出嚟一模一樣', () => {
    writeCache(SAMPLE)
    expect(readCache()).toEqual(SAMPLE)
  })

  it('用自己嘅 key，唔會撈亂賽事資料', () => {
    writeCache(SAMPLE)
    expect(localStorage.getItem(KEY)).not.toBeNull()
    expect(localStorage.getItem('beyblade-scoreboard/v1')).toBeNull()
  })

  it('壞 JSON 當冇 cache', () => {
    localStorage.setItem(KEY, '{唔係 JSON')
    expect(readCache()).toBeNull()
  })

  it('唔似樣嘅內容當冇 cache', () => {
    for (const junk of ['null', '"文字"', '{}', '{"at":"舊","blades":[],"parts":[]}',
      '{"at":1,"blades":{},"parts":[]}', '{"at":1,"blades":[],"parts":null}',
      '{"at":1,"blades":[{"id":1}],"parts":[]}']) {
      localStorage.setItem(KEY, junk)
      expect(readCache(), junk).toBeNull()
    }
  })

  it('storage 用唔到都唔會炸', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('無痕視窗') },
      setItem() { throw new Error('儲存爆咗') },
    })
    expect(readCache()).toBeNull()
    expect(() => writeCache(SAMPLE)).not.toThrow()
  })
})

const BLADE_CSV = [
  '"型號 (ID)","中文名稱 (Name)","類型 (Type)","階級 (Tier)","原裝固鎖 (Ratchet)","原裝軸心 (Bit)","原裝輔助戰刃 (Assist Blade","來源產品 (Source)","圖片網址 (Img)","建議配置 (Combo)"',
  '"UX-15-01","鮫鯊狂鱗","attack","S+","4-50","UF","","UX-15 鮫鯊狂鱗改造組","https://i.ibb.co/x/a.png","固鎖：1-60"',
].join('\n')

const PART_CSV = [
  '"原裝固鎖、軸心","分類 (Category)","圖片網址 (Img)","階級 (Tier)"',
  '"9-60","ratchet","https://i.ibb.co/x/r.webp","S+"',
].join('\n')

/** 兩個 tab 由同一個 endpoint 出，靠 query string 分邊個係邊個。 */
function stubFetch(reply: (url: string) => { ok: boolean; status: number; body: string }) {
  const fetchStub = vi.fn(async (url: string) => {
    const r = reply(url)
    return { ok: r.ok, status: r.status, text: async () => r.body }
  })
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

describe('拉 sheet 資料', () => {
  it('兩個 tab 都拉到就解晒出嚟，順便印低幾時拉嘅', async () => {
    stubFetch((url) => ({
      ok: true, status: 200,
      body: url.includes('gid=') ? BLADE_CSV : PART_CSV,
    }))

    const data = await fetchPartsData(1_760_000_000_000)
    expect(data.at).toBe(1_760_000_000_000)
    expect(data.blades.map((b) => b.id)).toEqual(['UX-15-01'])
    expect(data.parts.map((p) => p.name)).toEqual(['9-60'])
  })

  it('兩個 tab 一齊拉，唔係排隊拉', async () => {
    const fetchStub = stubFetch((url) => ({
      ok: true, status: 200,
      body: url.includes('gid=') ? BLADE_CSV : PART_CSV,
    }))
    await fetchPartsData(1)
    expect(fetchStub).toHaveBeenCalledTimes(2)
    const urls = fetchStub.mock.calls.map((c) => c[0])
    expect(urls.some((u) => u.includes('gid=101080139'))).toBe(true)
    expect(urls.some((u) => u.includes(`sheet=${encodeURIComponent('零件圖鑑')}`))).toBe(true)
  })

  it('有一邊 404 就當拉唔到', async () => {
    stubFetch((url) =>
      url.includes('gid=')
        ? { ok: true, status: 200, body: BLADE_CSV }
        : { ok: false, status: 404, body: '' },
    )
    await expect(fetchPartsData(1)).rejects.toThrow()
  })

  it('欄名對唔上都當拉唔到（張 sheet 唔係我哋控制）', async () => {
    stubFetch((url) => ({
      ok: true, status: 200,
      body: url.includes('gid=') ? '"乜都唔係","x"\n"UX-01","蒼龍"' : PART_CSV,
    }))
    await expect(fetchPartsData(1)).rejects.toThrow()
  })
})
