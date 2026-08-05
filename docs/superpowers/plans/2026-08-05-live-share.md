# 即時分享 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主辦喺自己 Google Drive 開一張 private sheet 做 database，派兩條 link 出去 —— 一條可以入分、一條淨係睇，實時跳。

**Architecture:** 一段 Apps Script deploy 成 Web App，以主辦身份執行，所以掂得到嗰張從未 share 過嘅 sheet。客戶端分四層純 module（payload 編碼、JSON 分段、傳輸、佔位狀態機），全部餵得假嘢入去測試；React 層淨係接線同計時器。一場賽事只有一個「入分位」，坐緊位嗰部機先寫得到嘢 —— 所以冇衝突要合併。

**Tech Stack:** TypeScript（strict）、React 19、Vite、Vitest、Google Apps Script（ES5-ish，`var` 同 `function`）。

## Global Constraints

- 全部介面文字、註釋、commit message 一律用**廣東話口語**，唔用書面語。
- **POST 一定要用 `text/plain`**。用 `application/json` 會觸發 CORS preflight，而 Apps Script 唔識答 `OPTIONS` —— 個請求會靜靜雞失敗。
- **JSON 一定要分段**，每段最多 40,000 字元。Google 一格上限 50,000，20 人賽事會超；超咗唔報錯，係靜靜雞截斷。
- **入分永遠唔會等網絡。** 寫 localStorage 即刻生效，同步喺背後做。呢個係 README 第一句嘅承諾。
- **心跳同觀眾 poll 嘅背景行為係相反嘅**：觀眾 `document.hidden` 就完全停 poll；坐緊入分位嗰部機 `document.hidden` 要**照續期**。呢個最易寫錯。
- 個位有效期 **5 分鐘**，每 **60 秒**心跳一次。
- 主辦（本機有 `live` 設定嗰部）**隨時**收得返個位；入分 link 要等過期。
- 舊檔冇 `live` 一律當 `null`（同 `headToHead` 一樣嘅處理）。
- 每個 task 做完 `npm test` 同 `npm run typecheck` 都要綠先可以 commit；掂到 UI 嘅再行 `npm run build`。

## File Structure

| 檔案 | 責任 |
|---|---|
| `apps-script/Code.gs` | 段 script。**唔喺 `src/` 入面**，唔會 build 入個 bundle |
| `src/live/payload.ts` | link payload 編碼解碼、script 網址砌同拆 |
| `src/live/chunks.ts` | JSON 分段／重組。**唯一**知道 40,000 呢個數嘅地方 |
| `src/live/remote.ts` | 同段 script 講嘢。純傳輸，冇 state、冇 timer、冇 React |
| `src/live/seat.ts` | 佔位狀態機。純 reducer，冇 timer —— 所以測得到 |
| `src/live/sync.ts` | React hook：接線 timer、推送隊列、poll |
| `src/ui/Share.tsx` | 設定頁 `#/t/<id>/share` |
| `src/ui/Live.tsx` | link 入口 `#/live/<payload>`，拉資料再分流 |

**點解分咁多個細 module：** 段 `Code.gs` 冇得寫自動測試（跑喺 Google 個 runtime）。所以凡係邏輯都要推落客戶端嘅 TS 度，令段 script 薄到「一睇就知啱唔啱」。`seat.ts` 特登唔掂 timer，就係為咗全部規則都測得到。

---

## 期一：觀眾 link

做完呢半就已經行得通 —— 主辦推、觀眾實時睇。可以喺 Task 6 之後停低試真。

### Task 1: `payload.ts` —— link 編碼同 script 網址

**Files:**
- Create: `src/live/payload.ts`
- Test: `src/live/payload.test.ts`

**Interfaces:**
- Produces:
  - `interface LivePayload { s: string; k: string }`
  - `encodePayload(p: LivePayload): string`
  - `decodePayload(raw: string): LivePayload | null`
  - `scriptUrl(scriptId: string): string`
  - `parseScriptId(input: string): string | null`

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/live/payload.test.ts`：

```ts
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
```

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/live/payload.test.ts`
Expected: FAIL —— `Failed to resolve import "./payload"`

- [ ] **Step 3: 實作**

`src/live/payload.ts`：

```ts
/**
 * 分享 link 入面嗰橛嘢。
 *
 * 只放 script id（`AKfycb…` 嗰橛）唔放成條網址 —— 慳返約 40 字元，
 * 條 link 短啲，send 落 WhatsApp 冇咁易斷行。
 */
export interface LivePayload {
  /** Apps Script deployment id。 */
  s: string
  /** edit 定 view token。段 script 睇呢個決定你做到咩。 */
  k: string
}

const PREFIX = 'https://script.google.com/macros/s/'

/** base64url —— 擺得入 URL，冇 `+` `/` `=`。 */
function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string | null {
  try {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function encodePayload(p: LivePayload): string {
  return toBase64Url(JSON.stringify(p))
}

/** 條 link 係人 copy 嚟 copy 去嘅，爛咗好平常 —— 爛就返 null，唔好掟錯。 */
export function decodePayload(raw: string): LivePayload | null {
  const json = fromBase64Url(raw)
  if (json === null) return null
  try {
    const v: unknown = JSON.parse(json)
    if (typeof v !== 'object' || v === null) return null
    const { s, k } = v as Record<string, unknown>
    if (typeof s !== 'string' || s === '') return null
    if (typeof k !== 'string' || k === '') return null
    return { s, k }
  } catch {
    return null
  }
}

export function scriptUrl(scriptId: string): string {
  return `${PREFIX}${scriptId}/exec`
}

/**
 * 主辦貼咩入嚟都收：成條網址、帶住 query 嘅網址、前後有空格、或者淨係個 id。
 *
 * 貼錯嘢係設定流程最易出事嗰步，所以呢度寬鬆啲 —— 但唔似嘢就要老實返 null，
 * 唔好靜靜雞收咗個爛 id，等到「開始直播」先報一個唔知乜嘢錯。
 */
export function parseScriptId(input: string): string | null {
  const s = input.trim()
  if (s === '') return null

  if (s.startsWith(PREFIX)) {
    const rest = s.slice(PREFIX.length)
    const id = rest.split('/')[0] ?? ''
    return /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null
  }

  // 淨係貼個 id。要夠長先當佢係，唔係 'hello' 都會當啱。
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null
}
```

- [ ] **Step 4: 行測試，確認全綠**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/live/payload.ts src/live/payload.test.ts
git commit -m "分享 link 嘅 payload 編碼解碼，同埋 script 網址點拆"
```

---

### Task 2: `chunks.ts` —— JSON 分段

**Files:**
- Create: `src/live/chunks.ts`
- Test: `src/live/chunks.test.ts`

**Interfaces:**
- Produces:
  - `CHUNK_SIZE: 40000`
  - `splitJson(json: string): string[]`
  - `joinChunks(chunks: string[]): string`

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/live/chunks.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { CHUNK_SIZE, joinChunks, splitJson } from './chunks'

const big = (n: number) => 'x'.repeat(n)

describe('JSON 分段', () => {
  it('細過一格上限就一段', () => {
    expect(splitJson('{"a":1}')).toEqual(['{"a":1}'])
    expect(splitJson(big(CHUNK_SIZE))).toHaveLength(1)
  })

  it('多一個字就變兩段', () => {
    const out = splitJson(big(CHUNK_SIZE + 1))
    expect(out).toHaveLength(2)
    expect(out[0]).toHaveLength(CHUNK_SIZE)
    expect(out[1]).toHaveLength(1)
  })

  it('接返埋一模一樣', () => {
    for (const n of [0, 1, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, CHUNK_SIZE * 3 + 7]) {
      const json = big(n)
      expect(joinChunks(splitJson(json))).toBe(json)
    }
  })

  it('冇一段會超過一格上限', () => {
    // 120 KB —— 大約 60 人嘅賽事，遠超實際會用到嘅。
    for (const c of splitJson(big(120_000))) {
      expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })

  it('真嘅 JSON 分完接返返都 parse 到', () => {
    const obj = { players: Array.from({ length: 3000 }, (_, i) => ({ id: `p${i}`, name: `選手${i}` })) }
    const json = JSON.stringify(obj)
    expect(json.length).toBeGreaterThan(CHUNK_SIZE)
    expect(JSON.parse(joinChunks(splitJson(json)))).toEqual(obj)
  })

  it('中文字唔會喺分段位斷開變亂碼', () => {
    // 一格一格咁切字串（唔係切 byte），所以 code unit 唔會爆開。
    const json = JSON.stringify({ n: '陀螺'.repeat(30_000) })
    expect(JSON.parse(joinChunks(splitJson(json)))).toEqual({ n: '陀螺'.repeat(30_000) })
  })

  it('冇嘢就接返吉字串', () => {
    expect(joinChunks([])).toBe('')
  })
})
```

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/live/chunks.test.ts`
Expected: FAIL —— resolve 唔到 `./chunks`

- [ ] **Step 3: 實作**

`src/live/chunks.ts`：

```ts
/**
 * 一格 Google Sheet 最多入到 50,000 個字元。留返啲位，用 40,000。
 *
 * **唔分段會出大事：** 實測 16 人單循環打完係 38.7 KB，20 人（190 場）就超過
 * 50,000。超咗 Google 唔會報錯，佢係**靜靜雞截斷** —— 你以為存咗，
 * 其實成半場賽事冇咗，要到下次讀返出嚟先發現。
 *
 * 呢度係全個 app 唯一知道呢個數嘅地方。
 */
export const CHUNK_SIZE = 40_000

/** 一格一格咁切（唔係切 byte），所以中文字唔會喺分段位爆開。 */
export function splitJson(json: string): string[] {
  if (json.length <= CHUNK_SIZE) return [json]
  const out: string[] = []
  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    out.push(json.slice(i, i + CHUNK_SIZE))
  }
  return out
}

export function joinChunks(chunks: string[]): string {
  return chunks.join('')
}
```

- [ ] **Step 4: 行測試，確認全綠**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/live/chunks.ts src/live/chunks.test.ts
git commit -m "JSON 分段：一格 4 萬字，唔分就會俾 Google 靜靜雞截斷"
```

---

### Task 3: `apps-script/Code.gs` —— 段 script

呢個 task 冇自動測試（跑喺 Google 個 runtime，vitest 掂唔到）。所以段 code 要**薄同笨** —— 一睇就知啱唔啱。

**Files:**
- Create: `apps-script/Code.gs`
- Create: `apps-script/README.md`

**Interfaces:**
- Produces: HTTP 合約（`remote.ts` 要照住嚟寫）

  GET `?k=<token>&since=<n>&fresh=1`
  → `{ok:true, role:'edit'|'view', v:<n>, t?:<Tournament>}` / `{ok:false, err:'bad-token'}`

  POST（`text/plain` 入面一段 JSON）
  → `{k, who, t}` → `{ok:true, v}` / `{ok:false, err:'not-holder', holder, until}` / `{ok:false, err:'read-only'}`
  → `{action:'claim', k, who, force}` → `{ok:true, until}` / `{ok:false, err:'held', until}`
  → `{action:'release', k, who}` → `{ok:true}`
  → `{action:'init', edit, view, t}` → `{ok:true, v:1}` / `{ok:false, err:'already-init'}`

- [ ] **Step 1: 寫段 script**

`apps-script/Code.gs`：

```javascript
/**
 * 陀螺計分板 —— 即時分享。
 *
 * 呢段嘢跑喺主辦自己嘅 Google 帳戶度（Execute as: Me），所以佢掂得到嗰張
 * 從來冇 share 過嘅 sheet。外面啲人淨係打得到呢段 script，永遠攞唔到張 sheet。
 *
 * ⚠ 呢段嘢冇自動測試 —— vitest 掂唔到 Google 個 runtime。所以寫得薄同笨啲，
 * 凡係諗得複雜嘅嘢都推咗去客戶端嘅 TypeScript。改之前睇 apps-script/README.md
 * 嗰份人手測試清單。
 */

var SHEET_NAME = 'data'
var CHUNK_SIZE = 40000
var LEASE_MS = 5 * 60 * 1000
var DATA_ROW = 7
var CACHE_KEY = 'meta'
var CACHE_TTL = 21600

// ── 張 sheet ────────────────────────────────────────────────

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName(SHEET_NAME)
  if (sh === null) {
    sh = ss.insertSheet(SHEET_NAME)
    // A 欄啲標籤要人睇得明 —— 主辦部機冇咗嘅時候，佢要自己開張 sheet
    // 抄返 B1 個 edit token 救返場賽事。呢個係唯一嘅救援路。
    sh.getRange('A1:A6').setValues([
      ['edit'],
      ['view'],
      ['version'],
      ['holder'],
      ['heldUntil'],
      ['chunks'],
    ])
    sh.getRange('A7').setValue('data 1')
  }
  return sh
}

function meta_(sh) {
  var v = sh.getRange('B1:B6').getValues()
  return {
    edit: String(v[0][0] || ''),
    view: String(v[1][0] || ''),
    version: Number(v[2][0] || 0),
    holder: String(v[3][0] || ''),
    until: Number(v[4][0] || 0),
    chunks: Number(v[5][0] || 0),
  }
}

function readData_(sh, chunks) {
  if (chunks < 1) return ''
  var rows = sh.getRange(DATA_ROW, 2, chunks, 1).getValues()
  var out = ''
  for (var i = 0; i < rows.length; i++) out += String(rows[i][0] || '')
  return out
}

function writeData_(sh, json) {
  var chunks = []
  for (var i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push([json.slice(i, i + CHUNK_SIZE)])
  }
  if (chunks.length === 0) chunks.push([''])

  // 舊資料如果長過新資料，要清走多出嗰幾行 —— 唔清就會接到舊嘢落尾。
  var old = Number(sh.getRange('B6').getValue() || 0)
  if (old > chunks.length) {
    sh.getRange(DATA_ROW + chunks.length, 1, old - chunks.length, 2).clearContent()
  }

  sh.getRange(DATA_ROW, 2, chunks.length, 1).setValues(chunks)
  var labels = []
  for (var j = 0; j < chunks.length; j++) labels.push(['data ' + (j + 1)])
  sh.getRange(DATA_ROW, 1, chunks.length, 1).setValues(labels)
  sh.getRange('B6').setValue(chunks.length)
}

// ── Cache ───────────────────────────────────────────────────
// 純粹慳延遲。所有寫入都經呢度，所以寫嗰陣順手更新就唔會落後。
// 唯一會過期嘅係有人手動改張 sheet —— 客戶端有個「重新同步」加 &fresh=1。

function cached_() {
  var raw = CacheService.getScriptCache().get(CACHE_KEY)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function putCache_(m) {
  CacheService.getScriptCache().put(
    CACHE_KEY,
    JSON.stringify({ edit: m.edit, view: m.view, version: m.version }),
    CACHE_TTL,
  )
}

function roleOf_(m, token) {
  if (token !== '' && token === m.edit) return 'edit'
  if (token !== '' && token === m.view) return 'view'
  return null
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

// ── GET ─────────────────────────────────────────────────────

function doGet(e) {
  var p = (e && e.parameter) || {}
  var token = String(p.k || '')
  var since = p.since === undefined ? -1 : Number(p.since)
  var fresh = String(p.fresh || '') === '1'

  // 快車道：版本冇變就唔使開張 sheet。300–500ms 變 ~50ms。
  if (!fresh) {
    var c = cached_()
    if (c !== null) {
      var role = roleOf_(c, token)
      if (role === null) return reply_({ ok: false, err: 'bad-token' })
      if (since === c.version) return reply_({ ok: true, role: role, v: c.version })
    }
  }

  var sh = sheet_()
  var m = meta_(sh)
  putCache_(m)

  var r = roleOf_(m, token)
  if (r === null) return reply_({ ok: false, err: 'bad-token' })
  if (since === m.version) return reply_({ ok: true, role: r, v: m.version })

  var json = readData_(sh, m.chunks)
  var t = null
  if (json !== '') {
    try {
      t = JSON.parse(json)
    } catch (err) {
      return reply_({ ok: false, err: 'bad-data' })
    }
  }
  return reply_({ ok: true, role: r, v: m.version, t: t })
}

// ── POST ────────────────────────────────────────────────────

function doPost(e) {
  var body
  try {
    body = JSON.parse(e.postData.contents)
  } catch (err) {
    return reply_({ ok: false, err: 'bad-body' })
  }

  // 一次得一個寫入。攞唔到鎖好過兩個人同時寫爛張 sheet。
  var lock = LockService.getScriptLock()
  if (!lock.tryLock(10000)) return reply_({ ok: false, err: 'busy' })

  try {
    var sh = sheet_()
    var m = meta_(sh)
    var action = String(body.action || 'push')

    if (action === 'init') return init_(sh, m, body)

    var role = roleOf_(m, String(body.k || ''))
    if (role === null) return reply_({ ok: false, err: 'bad-token' })
    if (role === 'view') return reply_({ ok: false, err: 'read-only' })

    if (action === 'claim') return claim_(sh, m, body)
    if (action === 'release') return release_(sh, m, body)
    return push_(sh, m, body)
  } finally {
    lock.releaseLock()
  }
}

/**
 * 第一次擺場賽事上嚟，或者換另一場。
 *
 * 張 sheet 未有 token 就接受（第一次）；已經有就要畀啱現有嘅 edit token
 * （即係「主辦想換場」）。所以 Apps Script 嗰輪設定一世做一次。
 */
function init_(sh, m, body) {
  if (m.edit !== '' && String(body.k || '') !== m.edit) {
    return reply_({ ok: false, err: 'already-init' })
  }
  var edit = String(body.edit || '')
  var view = String(body.view || '')
  if (edit === '' || view === '' || edit === view) {
    return reply_({ ok: false, err: 'bad-token' })
  }

  writeData_(sh, JSON.stringify(body.t))
  sh.getRange('B1:B5').setValues([[edit], [view], [1], [''], [0]])
  putCache_({ edit: edit, view: view, version: 1 })
  return reply_({ ok: true, v: 1 })
}

/** 攞入分位。`force` 淨係主辦部機會傳 —— 佢隨時收得返。 */
function claim_(sh, m, body) {
  var who = String(body.who || '')
  if (who === '') return reply_({ ok: false, err: 'bad-who' })

  var now = Date.now()
  var taken = m.holder !== '' && m.holder !== who && m.until > now
  if (taken && body.force !== true) {
    return reply_({ ok: false, err: 'held', until: m.until })
  }

  var until = now + LEASE_MS
  sh.getRange('B4:B5').setValues([[who], [until]])
  return reply_({ ok: true, until: until })
}

/** 主動讓位。收唔到都唔緊要 —— 個位過咗期一樣放。 */
function release_(sh, m, body) {
  if (m.holder === String(body.who || '')) {
    sh.getRange('B4:B5').setValues([[''], [0]])
  }
  return reply_({ ok: true })
}

/** 推一份新資料上嚟。要坐緊個位先寫得到。 */
function push_(sh, m, body) {
  var who = String(body.who || '')
  var now = Date.now()
  var held = m.holder !== '' && m.until > now
  if (held && m.holder !== who) {
    return reply_({ ok: false, err: 'not-holder', holder: m.holder, until: m.until })
  }

  var v = m.version + 1
  writeData_(sh, JSON.stringify(body.t))
  // 推嘢順手續期 —— 入分入得密就唔使等心跳。
  sh.getRange('B3:B5').setValues([[v], [who], [now + LEASE_MS]])
  putCache_({ edit: m.edit, view: m.view, version: v })
  return reply_({ ok: true, v: v })
}
```

- [ ] **Step 2: 寫人手測試清單**

`apps-script/README.md`：

```markdown
# 段 script

呢度嘅 `Code.gs` 貼落主辦自己張 Google Sheet 嘅 Apps Script 度。

## 點裝

1. 開一張新 Google Sheet（**唔好 share 俾任何人**）
2. Extensions → Apps Script
3. 貼晒 `Code.gs` 落去，蓋走原本嘅 `myFunction`
4. Deploy → New deployment → 類型揀 **Web app**
5. Execute as：**Me**
6. Who has access：**Anyone**
7. Deploy → 授權 → copy 條網址（`https://script.google.com/macros/s/…/exec`）
8. 貼返落個 app 嘅分享設定頁

**第 5 同第 6 步一定要行啱。** Execute as 揀錯，段 script 就掂唔到張 sheet；
Who has access 揀錯，觀眾撳條 link 會俾人叫佢登入。

## 人手測試清單

段 code 改完之後，重新 deploy（**New version**，唔係新 deployment）再行一次：

- [ ] 第一次 init：張新 sheet 自動生出 `data` tab，A 欄有標籤，B1／B2 有 token，B3 = 1
- [ ] 觀眾 link 開到，睇到分
- [ ] 觀眾 link 改條 URL 亂試（`k` 改成 edit token 以外嘅嘢）→ `bad-token`
- [ ] 用 view token POST → `read-only`
- [ ] 主辦入分 → 觀眾嗰邊 3 秒內見到
- [ ] 入分 link 開到，見到「入分位喺第二部機」，入分掣灰咗
- [ ] 主辦收返個位 → 入分 link 嗰部機即刻鎖
- [ ] 主辦熄咗 app 等 5 分鐘 → 入分 link 嗰部撳到「接手入分」
- [ ] 主辦部機熄屏 2 分鐘再開 → 個位仲喺佢度（心跳有跑）
- [ ] 20 人賽事打完（190 場）→ 張 sheet B6 應該 ≥ 2，拉返落嚟資料完整
- [ ] 手動改張 sheet B3（版本）→ 客戶端撳「重新同步」拉到新嘢
```

- [ ] **Step 3: 確認唔會 build 入 bundle**

Run: `npm run build && grep -rl "SpreadsheetApp" dist/ || echo "冇 leak，啱"`
Expected: `冇 leak，啱`（`apps-script/` 喺 `src/` 外面，Vite 唔會掃）

- [ ] **Step 4: Commit**

```bash
git add apps-script/
git commit -m "段 Apps Script：private sheet 做 database，token 判角色，一個入分位"
```

---

### Task 4: `Tournament.live` + 部機 id

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/storage/storage.ts`
- Create: `src/live/device.ts`
- Test: `src/storage/storage.test.ts`、`src/live/device.test.ts`
- Modify: `src/engine/tournament.test.ts`、`src/engine/pools.lifecycle.test.ts`（fixture 加 field）

**Interfaces:**
- Produces:
  - `Tournament.live: { scriptId: string; edit: string; view: string } | null`
  - `deviceId(): string`（全域，第一次叫嗰陣 generate）
  - `savedScriptId(): string | null` / `rememberScriptId(id: string): void`
  - `newToken(prefix: 'edit' | 'view'): string`

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/storage/storage.test.ts` 最尾加：

```ts
describe('直播設定', () => {
  it('新賽事冇直播', () => {
    expect(store().create('測試').live).toBeNull()
  })

  it('舊檔冇呢個 field 就當冇直播', () => {
    const t = parseTournament({
      id: 't1', name: '舊賽事', createdAt: 0, updatedAt: 0,
      mode: 'roundRobin', players: [], matches: [],
    })
    expect(t.live).toBeNull()
  })

  it('唔齊 field 嘅垃圾值一律當冇直播', () => {
    const base = {
      id: 't1', name: '賽事', createdAt: 0, updatedAt: 0,
      mode: 'roundRobin', players: [], matches: [],
    }
    expect(parseTournament({ ...base, live: 'yes' }).live).toBeNull()
    expect(parseTournament({ ...base, live: {} }).live).toBeNull()
    expect(parseTournament({ ...base, live: { scriptId: 'a' } }).live).toBeNull()
    expect(parseTournament({ ...base, live: { scriptId: 'a', edit: 'b' } }).live).toBeNull()
    expect(
      parseTournament({ ...base, live: { scriptId: 'a', edit: 'b', view: 'c' } }).live,
    ).toEqual({ scriptId: 'a', edit: 'b', view: 'c' })
  })

  it('匯出再匯入，直播設定保持住', () => {
    const s = store()
    const made = s.create('測試')
    s.save({ ...made, live: { scriptId: 'S1', edit: 'e1', view: 'v1' } })
    const back = parseExportFile(s.exportJson(made.id)).tournaments[0]!
    expect(back.live).toEqual({ scriptId: 'S1', edit: 'e1', view: 'v1' })
  })
})
```

`src/live/device.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { deviceId, newToken, rememberScriptId, savedScriptId } from './device'

class FakeStorage {
  private data = new Map<string, string>()
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, v) }
  removeItem(k: string) { this.data.delete(k) }
  clear() { this.data.clear() }
  key() { return null }
  get length() { return this.data.size }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new FakeStorage())
})

describe('部機 id', () => {
  it('同一部機每次叫都一樣', () => {
    expect(deviceId()).toBe(deviceId())
  })

  it('唔係吉', () => {
    expect(deviceId().length).toBeGreaterThan(5)
  })

  it('storage 用唔到都唔會炸', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('無痕視窗') },
      setItem() { throw new Error('無痕視窗') },
    })
    expect(deviceId().length).toBeGreaterThan(5)
  })
})

describe('記住 script 網址', () => {
  it('冇記過就係 null', () => {
    expect(savedScriptId()).toBeNull()
  })

  it('記完攞返出嚟', () => {
    rememberScriptId('AKfycbx1')
    expect(savedScriptId()).toBe('AKfycbx1')
  })
})

describe('token', () => {
  it('兩個 token 唔會撞', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newToken('edit')))
    expect(seen.size).toBe(200)
  })

  it('睇個 token 就知係邊種', () => {
    expect(newToken('edit').startsWith('edit-')).toBe(true)
    expect(newToken('view').startsWith('view-')).toBe(true)
  })
})
```

（`device.test.ts` 頂部要 `import { vi } from 'vitest'`。）

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/storage/storage.test.ts src/live/device.test.ts`
Expected: FAIL —— `live` 係 `undefined`、resolve 唔到 `./device`

- [ ] **Step 3: 改 type 同 storage**

`src/engine/types.ts`，`Tournament` 入面 `headToHead` 下面加：

```ts
  headToHead: boolean
  /**
   * 開咗直播先有。null = 冇分享。
   *
   * `scriptId` 係 Apps Script deployment id；兩個 token 係呢個 app 自己
   * generate、init 嗰陣寫咗落張 sheet 度。段 script 靠 token 判你係邊個。
   */
  live: { scriptId: string; edit: string; view: string } | null
```

`src/storage/storage.ts` `create()` 入面 `headToHead: false,` 下面加 `live: null,`。

`parseTournament` 嘅 return 入面 `headToHead: v.headToHead === true,` 下面加：

```ts
    // 舊檔冇呢個 field，或者唔齊 field，一律當冇直播 —— 半個設定連唔到人。
    live: parseLive(v.live),
```

`storage.ts` 最尾（`playerRef` 附近）加：

```ts
/** 三個 field 要齊先算數。淨係得一半就連唔到，當冇分享好過爆錯。 */
function parseLive(v: unknown): Tournament['live'] {
  if (!isObject(v)) return null
  const { scriptId, edit, view } = v
  if (typeof scriptId !== 'string' || scriptId === '') return null
  if (typeof edit !== 'string' || edit === '') return null
  if (typeof view !== 'string' || view === '') return null
  return { scriptId, edit, view }
}
```

- [ ] **Step 4: 寫 `device.ts`**

`src/live/device.ts`：

```ts
/**
 * 部機自己嘅嘢 —— 唔屬於任何一場賽事，所以擺喺自己嘅 localStorage key。
 *
 * 無痕視窗／封鎖咗 storage 嗰陣，讀寫會直接掟錯，所以全部包住 try。
 * 讀唔到就每次生一個新嘅 —— 咁樣個位會續唔到期，但唔會炸。
 */

const DEVICE_KEY = 'beyblade-scoreboard/device'
const SCRIPT_KEY = 'beyblade-scoreboard/script'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 存唔到就算 —— 唔值得為咗記個 id 而擋住主辦入分。
  }
}

function random(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

let cached: string | null = null

/** 呢部機嘅 id。段 script 用佢分邊部機坐緊入分位。 */
export function deviceId(): string {
  if (cached !== null) return cached
  const saved = read(DEVICE_KEY)
  if (saved !== null && saved !== '') {
    cached = saved
    return saved
  }
  const made = `dev-${random()}`
  write(DEVICE_KEY, made)
  cached = made
  return made
}

/**
 * 上次用嘅 script 網址。一個主辦一世得一條，所以設定頁預先填返，
 * 開第二場賽事唔使再撳一次 Apps Script。
 */
export function savedScriptId(): string | null {
  const v = read(SCRIPT_KEY)
  return v === null || v === '' ? null : v
}

export function rememberScriptId(id: string): void {
  write(SCRIPT_KEY, id)
}

/** 有 prefix，主辦自己開張 sheet 望嗰陣一眼睇得出邊個係邊個。 */
export function newToken(prefix: 'edit' | 'view'): string {
  return `${prefix}-${random()}`
}
```

- [ ] **Step 5: 補現有 fixture**

`src/engine/tournament.test.ts` 嘅 `tournament()` fixture、`src/engine/pools.lifecycle.test.ts` 嘅 `tour()` fixture，兩個都喺 `headToHead: false,` 下面加 `live: null,`。

同時 `grep -rn "headToHead: false" src --include=*.ts` 搵齊其他 fixture 一併補（`remote.test.ts` 嗰個 `T` 已經有）。

- [ ] **Step 6: 行測試，確認全綠**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/storage/storage.ts src/storage/storage.test.ts src/live/device.ts src/live/device.test.ts src/engine/tournament.test.ts src/engine/pools.lifecycle.test.ts
git commit -m "Tournament 加直播設定；部機 id 同 token 生成"
```

---

### Task 5: `remote.ts` —— 傳輸層

**Files:**
- Create: `src/live/remote.ts`
- Test: `src/live/remote.test.ts`

**Interfaces:**
- Consumes: Task 1 嘅 `scriptUrl`；Task 3 嘅 HTTP 合約；Task 4 嘅 `Tournament.live`
- Produces:

```ts
export type LiveErr =
  | 'bad-token' | 'read-only' | 'not-holder' | 'held' | 'already-init'
  | 'busy' | 'bad-data' | 'bad-body' | 'bad-who'
  | 'network' | 'bad-response'

export type GetResult =
  | { ok: true; role: 'edit' | 'view'; v: number; t: Tournament | null }
  | { ok: false; err: LiveErr }

export type PushResult =
  | { ok: true; v: number }
  | { ok: false; err: LiveErr; until?: number }

export type ClaimResult =
  | { ok: true; until: number }
  | { ok: false; err: LiveErr; until?: number }

export interface LiveClient {
  get(since: number | null, fresh?: boolean): Promise<GetResult>
  push(t: Tournament, who: string): Promise<PushResult>
  claim(who: string, force: boolean): Promise<ClaimResult>
  release(who: string): Promise<void>
  init(edit: string, view: string, t: Tournament): Promise<PushResult>
}

export function createClient(
  scriptId: string,
  token: string,
  fetchImpl?: typeof fetch,
): LiveClient
```

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/live/remote.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { createClient } from './remote'
import type { Tournament } from '../engine/types'

const T: Tournament = {
  id: 't1', name: '測試', createdAt: 0, updatedAt: 0,
  mode: 'roundRobin', cutSize: null, poolCount: null, advancePerPool: null,
  headToHead: false, live: null, players: [], matches: [],
}

/** 假 fetch：答一段 JSON，順手記低人哋點打佢。 */
function fakeFetch(body: unknown) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('拉資料', () => {
  it('拉到新版本', async () => {
    const f = fakeFetch({ ok: true, role: 'view', v: 7, t: T })
    const r = await createClient('S1', 'k1', f).get(null)
    expect(r).toEqual({ ok: true, role: 'view', v: 7, t: T })
  })

  it('版本冇變，t 係 null', async () => {
    const f = fakeFetch({ ok: true, role: 'edit', v: 7 })
    const r = await createClient('S1', 'k1', f).get(7)
    expect(r).toEqual({ ok: true, role: 'edit', v: 7, t: null })
  })

  it('條 URL 帶住 token、since、fresh', async () => {
    const f = fakeFetch({ ok: true, role: 'view', v: 1 })
    await createClient('S1', 'k1', f).get(3, true)
    const url = String(vi.mocked(f).mock.calls[0]![0])
    expect(url).toContain('/macros/s/S1/exec')
    expect(url).toContain('k=k1')
    expect(url).toContain('since=3')
    expect(url).toContain('fresh=1')
  })

  it('冇 since 就唔會塞個 since 落條 URL', async () => {
    const f = fakeFetch({ ok: true, role: 'view', v: 1 })
    await createClient('S1', 'k1', f).get(null)
    expect(String(vi.mocked(f).mock.calls[0]![0])).not.toContain('since=')
  })

  it('token 唔啱', async () => {
    const r = await createClient('S1', 'bad', fakeFetch({ ok: false, err: 'bad-token' })).get(null)
    expect(r).toEqual({ ok: false, err: 'bad-token' })
  })
})

describe('推資料', () => {
  it('推得成', async () => {
    const f = fakeFetch({ ok: true, v: 8 })
    expect(await createClient('S1', 'k1', f).push(T, 'dev1')).toEqual({ ok: true, v: 8 })
  })

  it('body 一定要係 text/plain —— 唔係會撞 CORS preflight', async () => {
    const f = fakeFetch({ ok: true, v: 8 })
    await createClient('S1', 'k1', f).push(T, 'dev1')
    const init = vi.mocked(f).mock.calls[0]![1]!
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
    expect(JSON.parse(String(init.body))).toEqual({ k: 'k1', who: 'dev1', t: T })
  })

  it('個位唔喺我度', async () => {
    const f = fakeFetch({ ok: false, err: 'not-holder', holder: 'dev2', until: 999 })
    expect(await createClient('S1', 'k1', f).push(T, 'dev1')).toEqual({
      ok: false, err: 'not-holder', until: 999,
    })
  })

  it('view token 寫唔到嘢', async () => {
    const f = fakeFetch({ ok: false, err: 'read-only' })
    expect(await createClient('S1', 'v1', f).push(T, 'dev1')).toEqual({
      ok: false, err: 'read-only',
    })
  })
})

describe('攞位', () => {
  it('攞到', async () => {
    const f = fakeFetch({ ok: true, until: 12345 })
    expect(await createClient('S1', 'k1', f).claim('dev1', false)).toEqual({
      ok: true, until: 12345,
    })
  })

  it('有人坐緊', async () => {
    const f = fakeFetch({ ok: false, err: 'held', until: 999 })
    expect(await createClient('S1', 'k1', f).claim('dev1', false)).toEqual({
      ok: false, err: 'held', until: 999,
    })
  })

  it('force 傳得上去', async () => {
    const f = fakeFetch({ ok: true, until: 1 })
    await createClient('S1', 'k1', f).claim('dev1', true)
    expect(JSON.parse(String(vi.mocked(f).mock.calls[0]![1]!.body))).toEqual({
      action: 'claim', k: 'k1', who: 'dev1', force: true,
    })
  })
})

describe('網絡爆咗', () => {
  it('fetch 掟錯 → network', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await createClient('S1', 'k1', f).get(null)).toEqual({ ok: false, err: 'network' })
  })

  it('HTTP 唔係 200 → network', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
    expect(await createClient('S1', 'k1', f).get(null)).toEqual({ ok: false, err: 'network' })
  })

  it('答返嚟唔係 JSON → bad-response', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('not json')
      },
    })) as unknown as typeof fetch
    expect(await createClient('S1', 'k1', f).get(null)).toEqual({ ok: false, err: 'bad-response' })
  })

  it('答返嚟係 JSON 但唔似嘢 → bad-response', async () => {
    // Apps Script 出錯嗰陣會答一版 HTML；fetch 一樣 ok，但 JSON 解唔出上面啲 field。
    const f = fakeFetch({ hello: 'world' })
    expect(await createClient('S1', 'k1', f).get(null)).toEqual({ ok: false, err: 'bad-response' })
  })
})
```

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/live/remote.test.ts`
Expected: FAIL —— resolve 唔到 `./remote`

- [ ] **Step 3: 實作**

`src/live/remote.ts`：

```ts
import { scriptUrl } from './payload'
import type { Tournament } from '../engine/types'

/**
 * 同段 Apps Script 講嘢。純傳輸 —— 冇 state、冇 timer、唔識 React。
 *
 * `fetchImpl` 係為咗測試接得到假嘢入嚟。
 */

export type LiveErr =
  | 'bad-token'
  | 'read-only'
  | 'not-holder'
  | 'held'
  | 'already-init'
  | 'busy'
  | 'bad-data'
  | 'bad-body'
  | 'bad-who'
  | 'network'
  | 'bad-response'

export type GetResult =
  | { ok: true; role: 'edit' | 'view'; v: number; t: Tournament | null }
  | { ok: false; err: LiveErr }

export type PushResult = { ok: true; v: number } | { ok: false; err: LiveErr; until?: number }

export type ClaimResult = { ok: true; until: number } | { ok: false; err: LiveErr; until?: number }

export interface LiveClient {
  get(since: number | null, fresh?: boolean): Promise<GetResult>
  push(t: Tournament, who: string): Promise<PushResult>
  claim(who: string, force: boolean): Promise<ClaimResult>
  release(who: string): Promise<void>
  init(edit: string, view: string, t: Tournament): Promise<PushResult>
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** 段 script 出錯嗰陣會答一版 HTML —— 所以收到嘢都要驗過先算數。 */
function errOf(v: Record<string, unknown>): LiveErr {
  return typeof v.err === 'string' ? (v.err as LiveErr) : 'bad-response'
}

export function createClient(
  scriptId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): LiveClient {
  const base = scriptUrl(scriptId)

  async function call(url: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
    let res: Response
    try {
      res = await fetchImpl(url, init)
    } catch {
      return null // 網絡爆咗
    }
    if (!res.ok) return null
    try {
      const body: unknown = await res.json()
      return isObject(body) ? body : {}
    } catch {
      return {} // 收到嘢但唔係 JSON
    }
  }

  /**
   * POST 一定要用 `text/plain`。
   *
   * 用 `application/json` 會令瀏覽器先射一個 `OPTIONS` preflight，
   * 而 Apps Script 唔識答 OPTIONS —— 個請求會靜靜雞失敗，
   * 而且喺 console 睇落好似 CORS 設定問題，查極都查唔到。
   */
  function post(body: unknown): RequestInit {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    }
  }

  return {
    async get(since, fresh = false) {
      const q = new URLSearchParams({ k: token })
      if (since !== null) q.set('since', String(since))
      if (fresh) q.set('fresh', '1')

      const body = await call(`${base}?${q.toString()}`)
      if (body === null) return { ok: false, err: 'network' }
      if (body.ok !== true) {
        return { ok: false, err: body.ok === false ? errOf(body) : 'bad-response' }
      }
      const role = body.role
      if (role !== 'edit' && role !== 'view') return { ok: false, err: 'bad-response' }
      if (typeof body.v !== 'number') return { ok: false, err: 'bad-response' }
      return { ok: true, role, v: body.v, t: (body.t as Tournament | undefined) ?? null }
    },

    async push(t, who) {
      const body = await call(base, post({ k: token, who, t }))
      if (body === null) return { ok: false, err: 'network' }
      if (body.ok === true && typeof body.v === 'number') return { ok: true, v: body.v }
      if (body.ok !== false) return { ok: false, err: 'bad-response' }
      return typeof body.until === 'number'
        ? { ok: false, err: errOf(body), until: body.until }
        : { ok: false, err: errOf(body) }
    },

    async claim(who, force) {
      const body = await call(base, post({ action: 'claim', k: token, who, force }))
      if (body === null) return { ok: false, err: 'network' }
      if (body.ok === true && typeof body.until === 'number') return { ok: true, until: body.until }
      if (body.ok !== false) return { ok: false, err: 'bad-response' }
      return typeof body.until === 'number'
        ? { ok: false, err: errOf(body), until: body.until }
        : { ok: false, err: errOf(body) }
    },

    async release(who) {
      // 收唔到都唔緊要 —— 個位過咗期一樣會放。
      await call(base, post({ action: 'release', k: token, who }))
    },

    async init(edit, view, t) {
      const body = await call(base, post({ action: 'init', k: token, edit, view, t }))
      if (body === null) return { ok: false, err: 'network' }
      if (body.ok === true && typeof body.v === 'number') return { ok: true, v: body.v }
      return { ok: false, err: body.ok === false ? errOf(body) : 'bad-response' }
    },
  }
}
```

- [ ] **Step 4: 行測試，確認全綠**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/live/remote.ts src/live/remote.test.ts
git commit -m "傳輸層：同段 script 講嘢，POST 用 text/plain 避開 CORS preflight"
```

---

### Task 6: 分享設定頁

**Files:**
- Create: `src/ui/Share.tsx`
- Modify: `src/lib/router.ts`（加 `share` route）
- Modify: `src/ui/App.tsx`（接線）
- Modify: `src/ui/components/TopBar.tsx`（加「分享」tab）
- Modify: `src/ui/styles/app.css`
- Test: `src/lib/router.test.ts`（如果冇就喺 `payload.test.ts` 隔籬新開）

**Interfaces:**
- Consumes: Task 1 嘅 `encodePayload` / `parseScriptId`；Task 4 嘅 `newToken` / `savedScriptId` / `rememberScriptId`；Task 5 嘅 `createClient`
- Produces: route `{ name: 'share'; id: string }`

- [ ] **Step 1: 加 route，寫住會 fail 嘅測試**

`src/lib/router.test.ts`（新檔）：

```ts
import { describe, expect, it } from 'vitest'
import { parseHash } from './router'

describe('分享頁同直播 link', () => {
  it('分享設定頁', () => {
    expect(parseHash('#/t/abc/share')).toEqual({ name: 'share', id: 'abc' })
  })

  it('直播 link', () => {
    expect(parseHash('#/live/eyJzIjoiUzEifQ')).toEqual({ name: 'live', payload: 'eyJzIjoiUzEifQ' })
  })

  it('直播 link 冇 payload 就返主頁', () => {
    expect(parseHash('#/live')).toEqual({ name: 'home' })
    expect(parseHash('#/live/')).toEqual({ name: 'home' })
  })

  it('唔認得嘅 sub 照去入分版（同以前一樣）', () => {
    expect(parseHash('#/t/abc/wat')).toEqual({ name: 'console', id: 'abc', matchId: null })
  })
})
```

`src/lib/router.ts` 改：

```ts
export type Route =
  | { name: 'home' }
  | { name: 'setup'; id: string }
  /** matchId 唔係 null 就係由賽程跳過嚟改嗰場，否則睇住第一場未打完嘅。 */
  | { name: 'console'; id: string; matchId: string | null }
  | { name: 'schedule'; id: string }
  | { name: 'table'; id: string }
  | { name: 'matrix'; id: string }
  | { name: 'bracket'; id: string }
  | { name: 'board'; id: string }
  | { name: 'share'; id: string }
  /** 由分享 link 入嚟。payload 未解碼 —— 解碼係 Live.tsx 嘅事。 */
  | { name: 'live'; payload: string }

const SUB: Record<
  string,
  'setup' | 'schedule' | 'table' | 'matrix' | 'bracket' | 'board' | 'share'
> = {
  setup: 'setup',
  schedule: 'schedule',
  table: 'table',
  matrix: 'matrix',
  bracket: 'bracket',
  board: 'board',
  share: 'share',
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)

  if (parts[0] === 'live') {
    const payload = parts[1]
    return payload === undefined ? { name: 'home' } : { name: 'live', payload }
  }

  if (parts[0] !== 't' || parts[1] === undefined) return { name: 'home' }
  // ……下面唔改
}
```

**先淨係寫個測試檔**，`router.ts` 留返 Step 3 先改。

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/lib/router.test.ts`
Expected: FAIL —— `share` 同 `live` route 都未認得

- [ ] **Step 3: 改 `router.ts`，行測試確認過**

照上面 Step 1 嗰段 `router.ts` 改，跟住：

Run: `npx vitest run src/lib/router.test.ts`
Expected: PASS

- [ ] **Step 4: 寫 `Share.tsx`**

`src/ui/Share.tsx`：

```tsx
import { useState } from 'react'
import { useTournament } from '../storage/browserStore'
import { createClient } from '../live/remote'
import { encodePayload, parseScriptId, scriptUrl } from '../live/payload'
import { newToken, rememberScriptId, savedScriptId } from '../live/device'
import { TopBar } from './components/TopBar'
import { NotFound } from './Setup'

/** 條完整 link，可以直接 send 俾人。 */
function linkFor(scriptId: string, token: string): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#/live/${encodePayload({ s: scriptId, k: token })}`
}

export function Share({ id }: { id: string }) {
  const { tournament, update } = useTournament(id)
  const [url, setUrl] = useState(() => {
    const saved = savedScriptId()
    return saved === null ? '' : scriptUrl(saved)
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (tournament === null) return <NotFound />

  const live = tournament.live

  async function start(): Promise<void> {
    const scriptId = parseScriptId(url)
    if (scriptId === null) {
      setErr('條網址唔似 Apps Script 個 deployment 網址。應該係 https://script.google.com/macros/s/…/exec 咁樣。')
      return
    }

    setBusy(true)
    setErr(null)
    const edit = newToken('edit')
    const view = newToken('view')
    // 已經開過就用返舊 edit token 做認證，段 script 先肯換場。
    const auth = tournament!.live?.edit ?? edit
    const r = await createClient(scriptId, auth).init(edit, view, tournament!)
    setBusy(false)

    if (!r.ok) {
      setErr(
        r.err === 'network'
          ? '連唔到段 script。檢查下條網址啱唔啱、部機有冇網絡。'
          : r.err === 'already-init'
            ? '張 sheet 已經俾第二場賽事用緊。要換場就喺原本嗰部機度改，或者開多張新 sheet。'
            : `段 script 唔收：${r.err}`,
      )
      return
    }

    rememberScriptId(scriptId)
    update((t) => ({ ...t, live: { scriptId, edit, view } }))
  }

  return (
    <>
      <TopBar id={id} name={tournament.name || '未命名賽事'} current="share" mode={tournament.mode} />
      <div className="page stack">
        {live === null ? (
          <SetupSteps url={url} onUrl={setUrl} busy={busy} err={err} onStart={start} />
        ) : (
          <Links
            edit={linkFor(live.scriptId, live.edit)}
            view={linkFor(live.scriptId, live.view)}
          />
        )}
      </div>
    </>
  )
}

const CODE_HINT = 'apps-script/Code.gs'

function SetupSteps({
  url,
  onUrl,
  busy,
  err,
  onStart,
}: {
  url: string
  onUrl: (v: string) => void
  busy: boolean
  err: string | null
  onStart: () => void
}) {
  return (
    <>
      <div className="field">
        <span className="field__label">點開直播</span>
        <ol className="steps">
          <li>開一張新 Google Sheet。<b>唔好 share 俾任何人</b> —— 個 app 唔使佢 share 都讀到。</li>
          <li>Extensions → Apps Script</li>
          <li>貼晒 <code>{CODE_HINT}</code> 落去，蓋走原本嗰個 <code>myFunction</code></li>
          <li>Deploy → New deployment → 揀 <b>Web app</b></li>
          <li>Execute as：<b>Me</b>　·　Who has access：<b>Anyone</b></li>
          <li>Deploy → 授權 → copy 條網址，貼落下面</li>
        </ol>
        <p className="note">
          <span>·</span>
          <span>
            第 5 步兩個掣都要揀啱。Execute as 揀錯，段 script 掂唔到你張 sheet；
            Who has access 揀錯，人哋撳條 link 會俾佢叫登入。
          </span>
        </p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="scripturl">段 script 條網址</label>
        <input
          id="scripturl"
          className="input chamfer-sm"
          value={url}
          placeholder="https://script.google.com/macros/s/…/exec"
          onChange={(e) => onUrl(e.target.value)}
        />
      </div>

      {err !== null && (
        <p className="note note--bad" role="alert">
          <span>⚠</span>
          <span>{err}</span>
        </p>
      )}

      <button className="btn btn--primary btn--big chamfer" disabled={busy} onClick={onStart}>
        {busy ? '搞緊…' : '開始直播'}
      </button>
    </>
  )
}

function Links({ edit, view }: { edit: string; view: string }) {
  return (
    <>
      <LinkRow
        label="入分 link"
        hint="收到呢條嘅人可以入分、改設定。同一時間得一個人入到分。"
        url={edit}
      />
      <LinkRow label="觀眾 link" hint="淨係睇得到，撳唔到任何嘢。" url={view} />
      <p className="note">
        <span>·</span>
        <span>
          呢兩條 link 儲返落自己度（send 俾自己都得）。就算部機爆咗、換咗機，
          有返條入分 link 就接得返成場賽事。
        </span>
      </p>
    </>
  )
}

function LinkRow({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="btnrow">
        <input className="input chamfer-sm" readOnly value={url} style={{ flex: 1 }} />
        <button
          className="btn chamfer-sm"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? 'copy 咗' : 'copy'}
        </button>
      </div>
      <p className="note">
        <span>·</span>
        <span>{hint}</span>
      </p>
    </div>
  )
}
```

- [ ] **Step 5: 接線 App、TopBar、CSS**

`src/ui/App.tsx` 頂部 `import { Share } from './Share'`，跟住喺 `board` 嗰行後面加：

```tsx
      {route.name === 'share' && <Share key={route.id} id={route.id} />}
```

（`live` route 喺 Task 7 先接。）

`src/ui/components/TopBar.tsx`：`TabName` 嗰個 `Extract` 加 `'share'`，`TABS` 最尾加 `{ name: 'share', label: '分享' }`，`tabsFor` 入面純淘汰嗰行改成 `return tab.name === 'console' || tab.name === 'board' || tab.name === 'share'`（純淘汰都分享得）。

`src/ui/styles/app.css` 最尾加：

```css
/* 分享設定頁嘅逐步指引。 */
.steps {
  margin: var(--sp-3) 0 0;
  padding-left: 1.4em;
  color: var(--ink-soft);
  font-size: var(--step--1);
  line-height: 1.7;
}

.steps b {
  color: var(--ink);
}

.steps code {
  padding: 0.1em 0.35em;
  background: var(--floor-sunk);
  font-size: 0.9em;
}
```

- [ ] **Step 6: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/ui/Share.tsx src/lib/router.ts src/lib/router.test.ts src/ui/App.tsx src/ui/components/TopBar.tsx src/ui/styles/app.css
git commit -m "分享設定頁：貼段 script 網址、開直播、出兩條 link"
```

---

### Task 7: 觀眾 link —— 拉資料同 poll

做完呢個 task，**期一完成**：主辦推、觀眾實時睇。

**Files:**
- Create: `src/live/usePoll.ts`
- Create: `src/ui/Live.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/Board.tsx`（接受直接餵 tournament）
- Modify: `src/live/sync.ts` 未存在 —— 呢個 task 唔使佢
- Test: `src/live/usePoll.test.ts`

**Interfaces:**
- Consumes: Task 5 嘅 `createClient`、Task 1 嘅 `decodePayload`
- Produces:
  - `nextDelay(fails: number): number`
  - `usePoll(client, opts): { t, v, state, refresh }`
  - `<Live payload={...} />`

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/live/usePoll.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { nextDelay, POLL_MS } from './usePoll'

describe('斷網退避', () => {
  it('冇 fail 過就係正常節奏', () => {
    expect(nextDelay(0)).toBe(POLL_MS)
  })

  it('連續 fail 就愈等愈耐', () => {
    expect(nextDelay(1)).toBeGreaterThan(POLL_MS)
    expect(nextDelay(2)).toBeGreaterThan(nextDelay(1))
    expect(nextDelay(3)).toBeGreaterThan(nextDelay(2))
  })

  it('但唔會等到天荒地老 —— 封頂 30 秒', () => {
    for (const n of [5, 10, 100]) {
      expect(nextDelay(n)).toBeLessThanOrEqual(30_000)
    }
    expect(nextDelay(100)).toBe(30_000)
  })
})
```

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/live/usePoll.test.ts`
Expected: FAIL —— resolve 唔到 `./usePoll`

- [ ] **Step 3: 寫 `usePoll.ts`**

`src/live/usePoll.ts`：

```ts
import { useEffect, useRef, useState } from 'react'
import type { LiveClient } from './remote'
import type { Tournament } from '../engine/types'

/**
 * 隔幾耐拉一次。
 *
 * 3 秒 —— 觀眾睇到嘅分會慢主辦大約 1–4 秒（一次 Google 來回大約 0.2–1 秒）。
 * 再密啲對體感冇乜分別，但就多咗一倍請求。
 */
export const POLL_MS = 3_000

const MAX_MS = 30_000

/** 連續失敗就愈等愈耐，封頂 30 秒 —— 場地 wifi 斷咗都唔好狂打。 */
export function nextDelay(fails: number): number {
  if (fails <= 0) return POLL_MS
  return Math.min(MAX_MS, POLL_MS * 2 ** fails)
}

export type PollState = 'loading' | 'live' | 'offline' | 'bad-token' | 'error'

/**
 * 一路拉，拉到有新版本就交出嚟。
 *
 * **個 tab 收埋就完全停。** 冇人睇緊嘅嘢唔值得繼續拉。
 * （⚠ 坐緊入分位嗰部機唔係咁 —— 佢收埋 tab 都要照續期。呢個分別喺 seat.ts。）
 */
export function usePoll(
  client: LiveClient,
  onData: (t: Tournament, v: number) => void,
): { state: PollState; refresh: () => void } {
  const [state, setState] = useState<PollState>('loading')
  const version = useRef<number | null>(null)
  const fails = useRef(0)
  const timer = useRef<number | null>(null)
  const stopped = useRef(false)
  const cb = useRef(onData)
  cb.current = onData

  useEffect(() => {
    stopped.current = false

    async function tick(fresh = false): Promise<void> {
      if (stopped.current) return
      if (document.hidden) {
        schedule(POLL_MS)
        return
      }

      const r = await client.get(version.current, fresh)
      if (stopped.current) return

      if (!r.ok) {
        if (r.err === 'bad-token') {
          setState('bad-token')
          return // 唔使再試 —— 條 link 錯咗，等幾耐都唔會啱
        }
        fails.current += 1
        setState(r.err === 'network' ? 'offline' : 'error')
        schedule(nextDelay(fails.current))
        return
      }

      fails.current = 0
      setState('live')
      if (r.t !== null) {
        version.current = r.v
        cb.current(r.t, r.v)
      } else {
        version.current = r.v
      }
      schedule(POLL_MS)
    }

    function schedule(ms: number): void {
      if (stopped.current) return
      timer.current = window.setTimeout(() => void tick(), ms)
    }

    void tick()

    // 切返出嚟即刻拉一次，唔使等下一個週期。
    const onVisible = (): void => {
      if (!document.hidden) {
        if (timer.current !== null) clearTimeout(timer.current)
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped.current = true
      if (timer.current !== null) clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [client])

  return {
    state,
    refresh: () => {
      version.current = null // 迫佢攞返成份
      if (timer.current !== null) clearTimeout(timer.current)
      void (async () => {
        const r = await client.get(null, true)
        if (r.ok && r.t !== null) {
          version.current = r.v
          cb.current(r.t, r.v)
          setState('live')
        }
      })()
    },
  }
}
```

- [ ] **Step 4: 寫 `Live.tsx`（觀眾模式）**

`src/ui/Live.tsx`：

```tsx
import { useMemo, useState } from 'react'
import { decodePayload } from '../live/payload'
import { createClient } from '../live/remote'
import { usePoll } from '../live/usePoll'
import { Board } from './Board'
import type { Tournament } from '../engine/types'

/**
 * 由分享 link 入嚟。
 *
 * 觀眾模式嘅資料**淨係喺記憶體** —— 唔會寫落佢部機嘅 localStorage，
 * 唔會污染佢自己嗰個賽事列表。佢淨係嚟睇場波，唔係要收藏。
 */
export function Live({ payload }: { payload: string }) {
  const parsed = useMemo(() => decodePayload(payload), [payload])
  const [t, setT] = useState<Tournament | null>(null)

  const client = useMemo(
    () => (parsed === null ? null : createClient(parsed.s, parsed.k)),
    [parsed],
  )

  if (parsed === null || client === null) return <BadLink />
  return <LiveBoard client={client} t={t} onData={setT} />
}

function LiveBoard({
  client,
  t,
  onData,
}: {
  client: ReturnType<typeof createClient>
  t: Tournament | null
  onData: (t: Tournament) => void
}) {
  const { state } = usePoll(client, (next) => onData(next))

  if (state === 'bad-token') return <BadLink />
  if (t === null) return <Waiting state={state} />

  return (
    <>
      <Board tournament={t} live />
      {state !== 'live' && (
        <p className="note note--bad livebar" role="status">
          <span>⚠</span>
          <span>{state === 'offline' ? '連唔到，重試緊…' : '出咗啲問題，重試緊…'}</span>
        </p>
      )}
    </>
  )
}

function Waiting({ state }: { state: string }) {
  return (
    <div className="page stack">
      <p className="empty">{state === 'offline' ? '連唔到，重試緊…' : '拉緊場賽事…'}</p>
    </div>
  )
}

function BadLink() {
  return (
    <div className="page stack">
      <p className="empty">
        呢條 link 唔啱，或者主辦已經換咗場賽事。搵返個主辦攞條新嘅。
      </p>
      <a className="btn chamfer" href="#/">
        返主頁
      </a>
    </div>
  )
}
```

- [ ] **Step 5: `Board.tsx` 接受直接餵 tournament**

`src/ui/Board.tsx` 而家係 `{ id }` 自己去 store 攞。改成兩種都收：

```tsx
export function Board({
  id,
  tournament: given,
  live = false,
}: {
  id?: string
  /** 直播模式直接餵住份資料入嚟 —— 唔會經 localStorage。 */
  tournament?: Tournament
  /** 直播模式：唔出「返主頁」嗰啲本機導覽。 */
  live?: boolean
}) {
  const fromStore = useTournament(id ?? '')
  const tournament = given ?? fromStore.tournament
  if (tournament === null || tournament === undefined) return <NotFound />
  // ……下面唔改，但凡係用 `id` 砌 href 嗰啲，`live` 為真就唔好出
```

**注意**：`useTournament` 係 hook，唔可以喺條件式後面叫 —— 所以要照叫，`id` 冇就餵吉字串（`store.get('')` 返 null，冇 side effect）。

CSS 加：

```css
/* 直播模式嘅狀態橫額，浮喺底唔阻住個表。 */
.livebar {
  position: fixed;
  left: var(--sp-4);
  right: var(--sp-4);
  bottom: var(--sp-4);
  z-index: 20;
}
```

- [ ] **Step 6: 接線 App**

`src/ui/App.tsx` 加 `import { Live } from './Live'`，跟住：

```tsx
      {route.name === 'live' && <Live key={route.payload} payload={route.payload} />}
```

- [ ] **Step 7: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 8: 人手行一次（要真 deployment）**

跟 `apps-script/README.md` 裝一次，跟住：

1. 主辦開一場賽事 → 分享頁 → 貼網址 → 開始直播
2. copy 觀眾 link，喺另一個瀏覽器（或者無痕視窗）開
3. 主辦入一場分 → 觀眾嗰邊 3 秒內見到
4. 觀眾嗰個 tab 切走 30 秒再切返 → 即刻追返最新
5. 主辦熄咗 wifi → 觀眾見到「連唔到，重試緊」→ 開返 wifi → 自動接返
6. 觀眾條 link 改亂個 token → 見到「呢條 link 唔啱」

- [ ] **Step 9: Commit**

```bash
git add src/live/usePoll.ts src/live/usePoll.test.ts src/ui/Live.tsx src/ui/Board.tsx src/ui/App.tsx src/ui/styles/app.css
git commit -m "觀眾 link：拉資料、poll、收埋 tab 就停"
```

---

## 期二：入分 link

### Task 8: `seat.ts` —— 佔位狀態機

純 reducer，**唔掂 timer** —— 所以全部規則測得到。

**Files:**
- Create: `src/live/seat.ts`
- Test: `src/live/seat.test.ts`

**Interfaces:**
- Consumes: Task 5 嘅 `ClaimResult` / `PushResult`
- Produces:

```ts
export const LEASE_MS = 5 * 60 * 1000
export const HEARTBEAT_MS = 60 * 1000

export type Seat =
  | { kind: 'none' }
  | { kind: 'mine'; until: number }
  | { kind: 'theirs'; until: number }
  | { kind: 'lost' }

export function afterClaim(r: ClaimResult): Seat
export function afterPush(cur: Seat, r: PushResult): Seat
export function canEdit(s: Seat, now: number): boolean
export function dueForHeartbeat(s: Seat, lastBeat: number, now: number): boolean
export function seatLabel(s: Seat, now: number): string
```

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/live/seat.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  afterClaim, afterPush, canEdit, dueForHeartbeat, HEARTBEAT_MS, LEASE_MS, seatLabel,
} from './seat'

const NOW = 1_000_000

describe('攞位之後', () => {
  it('攞到就係我嘅', () => {
    expect(afterClaim({ ok: true, until: NOW + LEASE_MS })).toEqual({
      kind: 'mine', until: NOW + LEASE_MS,
    })
  })

  it('有人坐緊', () => {
    expect(afterClaim({ ok: false, err: 'held', until: NOW + 1000 })).toEqual({
      kind: 'theirs', until: NOW + 1000,
    })
  })

  it('網絡爆咗當冇位 —— 唔好扮自己坐緊', () => {
    expect(afterClaim({ ok: false, err: 'network' })).toEqual({ kind: 'none' })
  })
})

describe('推完之後', () => {
  it('推得成就順手續咗期', () => {
    const s = afterPush({ kind: 'mine', until: NOW }, { ok: true, v: 5 })
    expect(s.kind).toBe('mine')
  })

  it('俾人收咗位 → lost', () => {
    expect(afterPush({ kind: 'mine', until: NOW }, { ok: false, err: 'not-holder', until: 9 })).toEqual({
      kind: 'lost',
    })
  })

  it('網絡爆咗唔算跌位 —— 個位好可能仲喺我度', () => {
    const cur = { kind: 'mine', until: NOW + LEASE_MS } as const
    expect(afterPush(cur, { ok: false, err: 'network' })).toEqual(cur)
  })

  it('view token 寫唔到 —— 唔關個位事', () => {
    const cur = { kind: 'none' } as const
    expect(afterPush(cur, { ok: false, err: 'read-only' })).toEqual(cur)
  })
})

describe('入唔入到分', () => {
  it('個位喺我度而且未過期', () => {
    expect(canEdit({ kind: 'mine', until: NOW + 1000 }, NOW)).toBe(true)
  })

  it('過咗期就唔准 —— 段 script 一樣會拒絕，前端唔好扮做得到', () => {
    expect(canEdit({ kind: 'mine', until: NOW - 1 }, NOW)).toBe(false)
  })

  it('人哋嘅位、冇位、跌咗位，全部唔准', () => {
    expect(canEdit({ kind: 'theirs', until: NOW + 1000 }, NOW)).toBe(false)
    expect(canEdit({ kind: 'none' }, NOW)).toBe(false)
    expect(canEdit({ kind: 'lost' }, NOW)).toBe(false)
  })
})

describe('心跳', () => {
  it('夠鐘就要續', () => {
    const mine = { kind: 'mine', until: NOW + LEASE_MS } as const
    expect(dueForHeartbeat(mine, NOW - HEARTBEAT_MS - 1, NOW)).toBe(true)
  })

  it('未夠鐘就唔使', () => {
    const mine = { kind: 'mine', until: NOW + LEASE_MS } as const
    expect(dueForHeartbeat(mine, NOW - 1000, NOW)).toBe(false)
  })

  it('唔係我嘅位就唔使續', () => {
    expect(dueForHeartbeat({ kind: 'theirs', until: NOW + LEASE_MS }, 0, NOW)).toBe(false)
    expect(dueForHeartbeat({ kind: 'none' }, 0, NOW)).toBe(false)
  })

  it('有效期係心跳嘅 5 倍 —— 熄屏俾瀏覽器 throttle 都跌唔到位', () => {
    // 一個 round 打 3–5 分鐘，主辦部電話好大機會熄咗屏。
    // 瀏覽器背景 timer 大約每分鐘一次，所以 5 分鐘有效期食得起。
    expect(LEASE_MS / HEARTBEAT_MS).toBe(5)
  })
})

describe('狀態文字', () => {
  it('每個狀態都有句人話', () => {
    const now = NOW
    expect(seatLabel({ kind: 'mine', until: now + 1000 }, now)).toContain('入分')
    expect(seatLabel({ kind: 'theirs', until: now + 1000 }, now)).toContain('第二部機')
    expect(seatLabel({ kind: 'lost' }, now)).toContain('收返')
    expect(seatLabel({ kind: 'none' }, now)).not.toBe('')
  })
})
```

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/live/seat.test.ts`
Expected: FAIL —— resolve 唔到 `./seat`

- [ ] **Step 3: 實作**

`src/live/seat.ts`：

```ts
import type { ClaimResult, PushResult } from './remote'

/**
 * 入分位。一場賽事同一時間只有一部機坐得到，坐緊嗰部先寫得到嘢。
 *
 * 所以「兩個人同時改同一場賽事」呢件事根本唔會發生 —— 冇衝突要合併。
 *
 * 純 reducer，唔掂 timer、唔掂 fetch —— 所以全部規則測得到。
 * 接線係 sync.ts 嘅事。
 */

/**
 * 個位坐得幾耐。
 *
 * **5 分鐘唔係求其揀嘅。** 一個 round 打 3–5 分鐘，即係入分嗰個人本來就會
 * 有幾分鐘乜都唔撳 —— 短過呢個就會喺人哋等緊個 round 打完嗰陣拎走佢個位。
 * 而且主辦部電話喺個 round 打緊嗰陣好大機會熄咗屏，瀏覽器會 throttle
 * 背景 timer 到大約每分鐘一次。5 分鐘配每分鐘心跳，熄屏兩分鐘都唔會跌位。
 */
export const LEASE_MS = 5 * 60 * 1000

export const HEARTBEAT_MS = 60 * 1000

export type Seat =
  /** 未攞過，或者攞唔到（網絡爆咗）。 */
  | { kind: 'none' }
  | { kind: 'mine'; until: number }
  | { kind: 'theirs'; until: number }
  /** 本來係我嘅，俾人收咗。 */
  | { kind: 'lost' }

export function afterClaim(r: ClaimResult): Seat {
  if (r.ok) return { kind: 'mine', until: r.until }
  if (r.err === 'held') return { kind: 'theirs', until: r.until ?? 0 }
  // 網絡爆咗／段 script 出事 —— 唔知邊個坐緊，唔好扮自己坐緊。
  return { kind: 'none' }
}

export function afterPush(cur: Seat, r: PushResult): Seat {
  if (r.ok) {
    // 段 script 推嘢嗰陣順手續期，所以本機都推返。
    return { kind: 'mine', until: Date.now() + LEASE_MS }
  }
  if (r.err === 'not-holder') return { kind: 'lost' }
  // network / read-only / 其他 —— 個位好可能仲喺我度，唔好亂改狀態。
  return cur
}

/**
 * 過咗期就當冇位。
 *
 * 段 script 一樣會拒絕，所以前端唔好扮做得到 —— 唔係主辦入完一堆分
 * 先發現原來全部推唔上去。
 */
export function canEdit(s: Seat, now: number): boolean {
  return s.kind === 'mine' && s.until > now
}

export function dueForHeartbeat(s: Seat, lastBeat: number, now: number): boolean {
  if (s.kind !== 'mine') return false
  return now - lastBeat >= HEARTBEAT_MS
}

export function seatLabel(s: Seat, now: number): string {
  switch (s.kind) {
    case 'mine':
      return s.until > now ? '你入緊分' : '個位過咗期，撳返「接手入分」'
    case 'theirs':
      return '入分位而家喺第二部機'
    case 'lost':
      return '主辦收返咗入分位'
    case 'none':
      return '未接手入分'
  }
}
```

- [ ] **Step 4: 行測試，確認全綠**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/live/seat.ts src/live/seat.test.ts
git commit -m "佔位狀態機：純 reducer，5 分鐘有效期配 1 分鐘心跳"
```

---

### Task 9: `sync.ts` —— 推送隊列同心跳

**Files:**
- Create: `src/live/queue.ts`
- Create: `src/live/sync.ts`
- Test: `src/live/queue.test.ts`

**Interfaces:**
- Consumes: Task 8 嘅 `Seat` 系列；Task 5 嘅 `LiveClient`
- Produces:
  - `createQueue(client, who): { push(t): void; pending(): number; drain(): Promise<void> }`
  - `useLiveSync(tournament, live, update): { seat, sync, claim, release, pending }`

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/live/queue.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { createQueue } from './queue'
import type { LiveClient, PushResult } from './remote'
import type { Tournament } from '../engine/types'

function tour(name: string): Tournament {
  return {
    id: 't1', name, createdAt: 0, updatedAt: 0,
    mode: 'roundRobin', cutSize: null, poolCount: null, advancePerPool: null,
    headToHead: false, live: null, players: [], matches: [],
  }
}

function client(results: PushResult[]): { c: LiveClient; sent: Tournament[] } {
  const sent: Tournament[] = []
  let i = 0
  const c = {
    async push(t: Tournament) {
      sent.push(t)
      return results[Math.min(i++, results.length - 1)]!
    },
  } as unknown as LiveClient
  return { c, sent }
}

describe('推送隊列', () => {
  it('推一次就推一次', async () => {
    const { c, sent } = client([{ ok: true, v: 1 }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    await q.drain()
    expect(sent.map((t) => t.name)).toEqual(['A'])
    expect(q.pending()).toBe(0)
  })

  /**
   * 連續入三次分，唔應該推三次 —— 最新嗰份已經包含晒之前嘅嘢。
   * 呢個唔止係慳流量：主辦入分入得好密，唔合併就會排一條長龍。
   */
  it('連續幾個改動只推最新嗰份', async () => {
    const { c, sent } = client([{ ok: true, v: 1 }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    q.push(tour('B'))
    q.push(tour('C'))
    await q.drain()
    expect(sent.map((t) => t.name)).toEqual(['C'])
  })

  it('網絡爆咗就留喺隊度，重連再推', async () => {
    const { c, sent } = client([{ ok: false, err: 'network' }, { ok: true, v: 2 }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    await q.drain()
    expect(q.pending()).toBe(1) // 仲喺度

    await q.drain()
    expect(sent.map((t) => t.name)).toEqual(['A', 'A'])
    expect(q.pending()).toBe(0)
  })

  it('跌咗位就唔好死撞 —— 停低等人處理', async () => {
    const { c, sent } = client([{ ok: false, err: 'not-holder' }])
    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    await q.drain()
    await q.drain()
    // 試多次都冇用，段 script 一樣拒絕。
    expect(sent).toHaveLength(1)
    expect(q.pending()).toBe(1)
  })

  it('每次推都出返個結果俾人跟進', async () => {
    const seen: PushResult[] = []
    const { c } = client([{ ok: false, err: 'not-holder' }])
    const q = createQueue(c, 'dev1', (r) => seen.push(r))
    q.push(tour('A'))
    await q.drain()
    expect(seen).toEqual([{ ok: false, err: 'not-holder' }])
  })

  it('同一時間只准一個請求喺途中', async () => {
    let inFlight = 0
    let maxSeen = 0
    const c = {
      async push() {
        inFlight += 1
        maxSeen = Math.max(maxSeen, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight -= 1
        return { ok: true as const, v: 1 }
      },
    } as unknown as LiveClient

    const q = createQueue(c, 'dev1')
    q.push(tour('A'))
    const a = q.drain()
    q.push(tour('B'))
    const b = q.drain()
    await Promise.all([a, b])
    expect(maxSeen).toBe(1)
  })
})
```

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/live/queue.test.ts`
Expected: FAIL —— resolve 唔到 `./queue`

- [ ] **Step 3: 寫 `queue.ts`**

`src/live/queue.ts`：

```ts
import type { LiveClient, PushResult } from './remote'
import type { Tournament } from '../engine/types'

/**
 * 推送隊列。
 *
 * **入分永遠唔會等網絡** —— 呢個係 README 第一句嘅承諾。所以 `push` 係
 * 同步嘅、即刻返，真正嘅網絡活動喺背後做。
 *
 * 隊入面最多得一份嘢：最新嗰份已經包含晒之前所有改動，所以推最新就夠。
 * 主辦入分入得密嗰陣，唔合併就會排一條長龍。
 */
export function createQueue(
  client: LiveClient,
  who: string,
  onResult?: (r: PushResult) => void,
) {
  let waiting: Tournament | null = null
  let busy = false
  /** 跌咗位就唔好死撞 —— 段 script 一樣會拒絕，等人處理咗先。 */
  let blocked = false

  async function drain(): Promise<void> {
    if (busy || blocked) return
    const t = waiting
    if (t === null) return

    busy = true
    try {
      const r = await client.push(t, who)
      onResult?.(r)
      if (r.ok) {
        // 推期間可能又有新改動入咗隊 —— 咁就唔好清走佢。
        if (waiting === t) waiting = null
      } else if (r.err === 'not-holder' || r.err === 'read-only') {
        blocked = true
      }
      // network 之類：留喺隊度，下次再推。
    } finally {
      busy = false
    }
  }

  return {
    push(t: Tournament): void {
      waiting = t
    },
    pending(): number {
      return waiting === null ? 0 : 1
    },
    /** 攞返個位之後叫，解除死撞保護。 */
    unblock(): void {
      blocked = false
    },
    drain,
  }
}

export type PushQueue = ReturnType<typeof createQueue>
```

- [ ] **Step 4: 寫 `sync.ts`**

`src/live/sync.ts`：

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from './remote'
import { createQueue } from './queue'
import { afterClaim, afterPush, canEdit, dueForHeartbeat, HEARTBEAT_MS, type Seat } from './seat'
import { deviceId } from './device'
import type { Tournament } from '../engine/types'

/**
 * 接線：把佔位狀態機、推送隊列同 timer 駁埋一齊。
 *
 * ⚠ 呢度個 timer 同觀眾嗰個 poll **背景行為相反**：
 * 觀眾 `document.hidden` 就完全停；坐緊入分位嗰部機 hidden 都要照續期，
 * 因為一個 round 打 3–5 分鐘，主辦部電話好大機會熄咗屏。
 */
export function useLiveSync(tournament: Tournament | null): {
  seat: Seat
  pending: number
  claim: (force: boolean) => Promise<void>
  release: () => void
  onChanged: (t: Tournament) => void
} {
  const live = tournament?.live ?? null
  // 主辦同入分 link 用**同一個** edit token —— 佢哋喺段 script 眼中一模一樣。
  // 唯一分別係 `claim(force)` 嗰個 force，由叫嘅人決定（睇 Console.tsx 嘅 isHost）。
  const token = live?.edit ?? null
  const who = deviceId()

  const [seat, setSeat] = useState<Seat>({ kind: 'none' })
  const [pending, setPending] = useState(0)
  const lastBeat = useRef(0)

  const client = useMemo(
    () => (live === null || token === null ? null : createClient(live.scriptId, token)),
    [live?.scriptId, token],
  )

  const queue = useMemo(
    () =>
      client === null
        ? null
        : createQueue(client, who, (r) => {
            setSeat((cur) => afterPush(cur, r))
            if (r.ok) lastBeat.current = Date.now()
          }),
    [client, who],
  )

  const claim = useCallback(
    async (force: boolean) => {
      if (client === null) return
      const r = await client.claim(who, force)
      setSeat(afterClaim(r))
      if (r.ok) {
        lastBeat.current = Date.now()
        queue?.unblock()
        void queue?.drain()
      }
    },
    [client, who, queue],
  )

  const release = useCallback(() => {
    if (client === null) return
    void client.release(who)
    setSeat({ kind: 'none' })
  }, [client, who])

  const onChanged = useCallback(
    (t: Tournament) => {
      if (queue === null) return
      queue.push(t)
      setPending(queue.pending())
      void queue.drain().then(() => setPending(queue.pending()))
    },
    [queue],
  )

  // 心跳 + 補推。**唔理 document.hidden** —— 見上面。
  useEffect(() => {
    if (client === null || queue === null) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      if (dueForHeartbeat(seat, lastBeat.current, now)) {
        void client.claim(who, false).then((r) => {
          setSeat(afterClaim(r))
          if (r.ok) lastBeat.current = Date.now()
        })
      }
      if (queue.pending() > 0 && canEdit(seat, now)) {
        void queue.drain().then(() => setPending(queue.pending()))
      }
    }, HEARTBEAT_MS / 2)
    return () => clearInterval(timer)
  }, [client, queue, seat, who])

  // 離開之前讓返個位，等下一個人唔使等 5 分鐘。
  useEffect(() => {
    const bye = (): void => {
      if (client !== null && seat.kind === 'mine') void client.release(who)
    }
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [client, seat.kind, who])

  return { seat, pending, claim, release, onChanged }
}
```

- [ ] **Step 5: 行測試同 typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/live/queue.ts src/live/queue.test.ts src/live/sync.ts
git commit -m "推送隊列同心跳：入分唔等網絡，熄咗屏都照續期"
```

---

### Task 10: 入分 link 接線

**Files:**
- Modify: `src/ui/Live.tsx`（加入分模式）
- Modify: `src/storage/browserStore.ts`（`useTournament` 加同步 hook）
- Modify: `src/ui/components/TopBar.tsx`（出同步狀態）
- Modify: `src/ui/styles/app.css`

**Interfaces:**
- Consumes: Task 9 嘅 `useLiveSync`；Task 8 嘅 `canEdit` / `seatLabel`
- Produces: 冇新 API

- [ ] **Step 1: `browserStore` 每次改動通知出去**

`src/storage/browserStore.ts` 嘅 `useTournament` 加一個可選 callback：

```ts
export function useTournament(id: string, onSaved?: (t: Tournament) => void) {
  const [tournament, setTournament] = useState<Tournament | null>(() => store.get(id))
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(tournament)
  latest.current = tournament
  const notify = useRef(onSaved)
  notify.current = onSaved

  const update = useCallback((change: (t: Tournament) => Tournament) => {
    const current = latest.current
    if (current === null) return
    try {
      const saved = store.save(change(current))
      latest.current = saved
      setTournament(saved)
      setError(null)
      // 存咗落 localStorage 先至通知 —— 同步失敗都唔會整跌本機資料。
      notify.current?.(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : '存唔到落瀏覽器。')
    }
  }, [])

  /** 由遠端拉到新版本，直接覆蓋本機。唔會反過嚟推上去。 */
  const adopt = useCallback((t: Tournament) => {
    const saved = store.save(t)
    latest.current = saved
    setTournament(saved)
  }, [])

  return { tournament, update, adopt, error }
}
```

- [ ] **Step 2: `Live.tsx` 加入分模式**

`src/ui/Live.tsx` 改成先拉一次，再按 `role` 分流：

```tsx
export function Live({ payload }: { payload: string }) {
  const parsed = useMemo(() => decodePayload(payload), [payload])
  const [state, setState] = useState<'loading' | 'bad' | 'view' | 'edit'>('loading')
  const [first, setFirst] = useState<Tournament | null>(null)

  useEffect(() => {
    if (parsed === null) {
      setState('bad')
      return
    }
    let dead = false
    void createClient(parsed.s, parsed.k)
      .get(null)
      .then((r) => {
        if (dead) return
        if (!r.ok || r.t === null) {
          setState('bad')
          return
        }
        setFirst(r.t)
        if (r.role === 'view') {
          setState('view')
          return
        }
        // 入分模式：存落佢自己部機，之後佢就係一個主辦。
        // 用返嗰場賽事本身個 id —— 遠端嗰份係權威，本機嗰份只係 cache。
        store.save({ ...r.t, live: { ...r.t.live!, edit: parsed.k } })
        setState('edit')
      })
    return () => {
      dead = true
    }
  }, [parsed])

  if (state === 'bad') return <BadLink />
  if (state === 'loading' || first === null) return <Waiting state="loading" />
  if (state === 'edit') {
    // 交返俾正常嘅賽事畫面，佢自己會 useLiveSync。
    location.replace(`#/t/${first.id}`)
    return <Waiting state="loading" />
  }
  return <LiveBoard client={createClient(parsed!.s, parsed!.k)} t={first} onData={setFirst} />
}
```

**注意**：`r.t.live` 由段 script 拉返嚟，入面嗰個 `edit` 係主辦嗰個 token —— 同 `parsed.k` 一樣。寫成 `{ ...r.t.live!, edit: parsed.k }` 係為咗萬一將來加多啲 token 都唔會錯。

- [ ] **Step 3: TopBar 出同步狀態**

`src/ui/components/TopBar.tsx` 加可選 props：

```tsx
export function TopBar({
  id,
  name,
  current,
  mode = 'roundRobin',
  sync,
}: {
  id: string
  name: string
  current: Route['name']
  mode?: TournamentMode
  /** 開咗直播先有。 */
  sync?: { label: string; bad: boolean }
}) {
```

喺 `topbar__spacer` 後面加：

```tsx
      {sync !== undefined && (
        <span className={`syncdot${sync.bad ? ' syncdot--bad' : ''}`} title={sync.label}>
          <span aria-hidden="true">●</span>
          <span className="syncdot__text">{sync.label}</span>
        </span>
      )}
```

CSS：

```css
/* 直播同步狀態。細粒，唔好搶咗啲 tab 嘅位。 */
.syncdot {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  color: var(--ink-soft);
  font-size: var(--step--2);
  font-variation-settings: 'wdth' 90, 'wght' 650;
  white-space: nowrap;
}

.syncdot--bad {
  color: var(--red);
}

/* 窄screen 淨係留粒點，唔出字。 */
@media (max-width: 40rem) {
  .syncdot__text {
    display: none;
  }
}
```

- [ ] **Step 4: Console 用 `canEdit` 鎖入分掣**

`src/ui/Console.tsx` 嘅 `ConsoleBody` 加 `useLiveSync`，兩個 `<Side>` 嘅 `locked` 改成：

```tsx
            locked={winnerId !== null || needsConfirm || !editable}
```

其中：

```tsx
  const { seat, claim } = useLiveSync(tournament)
  const editable = tournament.live === null || canEdit(seat, Date.now())
  /*
    邊部先算主辦？—— **記唔記得呢個 scriptId**。
    主辦喺分享頁貼網址嗰陣 `rememberScriptId` 記低咗；入分 link 嗰部機
    冇經過嗰一步，所以永遠唔會等於。

    唔可以用「本機有冇呢場賽事」做準 —— 入分 link 嗰部機第一次開之後
    都會存落 localStorage，兩邊就分唔開。
  */
  const isHost =
    tournament.live !== null && savedScriptId() === tournament.live.scriptId
```

`src/ui/Console.tsx` 頂部要 import `useLiveSync`（`../live/sync`）、`canEdit` / `seatLabel`（`../live/seat`）、`savedScriptId`（`../live/device`）。

冇開直播（`live === null`）就永遠 editable —— 唔好因為加咗分享而整壞單機用法。

坐唔到位嗰陣喺 arena 上面出一條：

```tsx
        {tournament.live !== null && !editable && (
          <p className="note note--bad" role="status">
            <span>⚠</span>
            <span>{seatLabel(seat, Date.now())}</span>
            <button className="btn btn--tight" onClick={() => void claim(isHost)}>
              {isHost ? '收返入分位' : '接手入分'}
            </button>
          </p>
        )}
```

`isHost` = 呢部機係咪本機開嗰場（`store.get(id) !== null` 而且係佢自己開嘅）。**簡單做法**：`live.edit` 同本機存住嗰份一樣就當係 host —— 但入分 link 嗰部機存完之後都一樣。所以改用另一個準：**部機記唔記得呢個 scriptId**（`savedScriptId() === live.scriptId`）。主辦設定嗰陣記過，入分 link 嗰部冇。

- [ ] **Step 5: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 6: 人手行一次**

1. 主辦開直播，copy 入分 link，喺第二部機（或者無痕視窗）開
2. 第二部機見到「入分位而家喺第二部機」，入分掣灰
3. 主辦熄咗個 tab → 等 5 分鐘 → 第二部機撳「接手入分」→ 入到分
4. 主辦開返 → 撳「收返入分位」→ 即刻攞返，第二部機下一次心跳見到「主辦收返咗入分位」
5. 主辦熄屏 2 分鐘再開 → 個位仲喺佢度
6. 主辦熄 wifi → 入分照樣即刻生效，TopBar 出「離線（N 個改動未推）」→ 開返 wifi → 自動補推
7. 觀眾 link 全程睇到最新

- [ ] **Step 7: Commit**

```bash
git add src/ui/Live.tsx src/storage/browserStore.ts src/ui/components/TopBar.tsx src/ui/Console.tsx src/ui/styles/app.css
git commit -m "入分 link：接手入分、主辦收得返位、同步狀態"
```

---

### Task 11: 救援路 + 分岔處理

**Files:**
- Modify: `src/ui/Share.tsx`
- Create: `src/live/diverge.ts`
- Test: `src/live/diverge.test.ts`

**Interfaces:**
- Produces: `describeDiverge(localPending: number, remoteVersion: number, myVersion: number): string`

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/live/diverge.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { describeDiverge } from './diverge'

describe('分岔嘅描述', () => {
  it('講得出兩邊各自有幾多嘢', () => {
    const s = describeDiverge(2, 12, 8)
    expect(s).toContain('2')
    expect(s).toContain('4') // 12 − 8
  })

  it('遠端冇行前過就唔算分岔', () => {
    expect(describeDiverge(2, 8, 8)).toBe('')
  })

  it('本機冇嘢未推就唔算分岔', () => {
    expect(describeDiverge(0, 12, 8)).toBe('')
  })
})
```

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/live/diverge.test.ts`
Expected: FAIL —— resolve 唔到 `./diverge`

- [ ] **Step 3: 實作**

`src/live/diverge.ts`：

```ts
/**
 * 兩邊都行前咗嘅時候講句人話。
 *
 * **唔自動合併。** 計分表唔應該靜靜雞幫你 merge 兩個人嘅比賽結果 ——
 * 攤出嚟俾人揀，佢先知自己揀緊咩。醜樣，但誠實。
 */
export function describeDiverge(
  localPending: number,
  remoteVersion: number,
  myVersion: number,
): string {
  const ahead = remoteVersion - myVersion
  if (localPending <= 0 || ahead <= 0) return ''
  return `你離線嗰陣，另一部機推咗 ${ahead} 次改動上去。你部機仲有 ${localPending} 個改動未推。`
}
```

- [ ] **Step 4: `Share.tsx` 加救援入口**

`src/ui/Share.tsx` 加一個獨立 component（唔好塞落 `SetupSteps` —— 佢冇呢啲 state）：

```tsx
/**
 * 主辦部機冇咗嘅救援路。
 *
 * 兩個 token 就寫喺張 sheet B1／B2，而張 sheet 喺主辦自己個 Drive ——
 * 所以主辦冇可能被永久鎖喺外面。呢個係「token 擺喺張 sheet 度」呢個決定
 * 送嘅副產品。
 */
function Recover() {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go(): Promise<void> {
    const scriptId = parseScriptId(url)
    if (scriptId === null) {
      setErr('條網址唔似 Apps Script 個 deployment 網址。')
      return
    }
    if (token.trim() === '') {
      setErr('要貼埋張 sheet B1 格嗰個 edit token。')
      return
    }

    setBusy(true)
    setErr(null)
    const r = await createClient(scriptId, token.trim()).get(null)
    setBusy(false)

    if (!r.ok || r.t === null) {
      setErr(
        r.ok
          ? '張 sheet 上面冇賽事資料。'
          : r.err === 'bad-token'
            ? '個 token 唔啱。開返你張 sheet，B1 格嗰個先係 edit token。'
            : '連唔到段 script。檢查下條網址同網絡。',
      )
      return
    }

    rememberScriptId(scriptId)
    store.save(r.t)
    location.hash = `#/t/${r.t.id}`
  }

  return (
    <details className="recover">
      <summary>部機爆咗？用返舊嘅 sheet</summary>
      <p className="note">
        <span>·</span>
        <span>
          開返你張 sheet（喺你自己個 Drive 度），B1 格就係 edit token。
          連同段 script 條網址一齊貼落嚟，成場賽事就接得返。
        </span>
      </p>
      <div className="field">
        <label className="field__label" htmlFor="recoverurl">段 script 條網址</label>
        <input
          id="recoverurl"
          className="input chamfer-sm"
          value={url}
          placeholder="https://script.google.com/macros/s/…/exec"
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="recovertoken">edit token（張 sheet B1 格）</label>
        <input
          id="recovertoken"
          className="input chamfer-sm"
          value={token}
          placeholder="edit-…"
          onChange={(e) => setToken(e.target.value)}
        />
      </div>
      {err !== null && (
        <p className="note note--bad" role="alert">
          <span>⚠</span>
          <span>{err}</span>
        </p>
      )}
      <button className="btn chamfer" disabled={busy} onClick={() => void go()}>
        {busy ? '搞緊…' : '接返場賽事'}
      </button>
    </details>
  )
}
```

跟住喺 `Share` 個 return 入面、`{live === null ? … : …}` 後面加 `{live === null && <Recover />}` —— 已經開咗直播就唔使出呢個。

`Share.tsx` 頂部要加 `import { store } from '../storage/browserStore'`。

CSS：

```css
.recover summary {
  cursor: pointer;
  color: var(--ink-soft);
  font-size: var(--step--1);
  font-variation-settings: 'wdth' 90, 'wght' 650;
}
```

- [ ] **Step 5: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/live/diverge.ts src/live/diverge.test.ts src/ui/Share.tsx src/ui/styles/app.css
git commit -m "救援路：部機冇咗都接得返場賽事；兩邊行前咗就攤出嚟俾人揀"
```

---

### Task 12: Contract test + README

**Files:**
- Create: `src/live/contract.test.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: 寫 contract test**

`src/live/contract.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { createClient } from './remote'
import { newToken } from './device'
import type { Tournament } from '../engine/types'

/**
 * 打真嘅 Apps Script deployment。
 *
 * 段 `Code.gs` 冇得寫 unit test（跑喺 Google 個 runtime），所以呢個係
 * 唯一驗得到成個合約嘅嘢。改完段 script、重新 deploy 之後行：
 *
 *   LIVE_SCRIPT_ID=AKfycb… npm run test:live
 *
 * ⚠ 會清走張 sheet 上面嘅嘢。用一張專登開嚟測試嘅 sheet。
 */
const SCRIPT = process.env.LIVE_SCRIPT_ID ?? ''

const t = (name: string): Tournament => ({
  id: 'ct1', name, createdAt: 0, updatedAt: 0,
  mode: 'roundRobin', cutSize: null, poolCount: null, advancePerPool: null,
  headToHead: false, live: null, players: [], matches: [],
})

describe.skipIf(SCRIPT === '')('真 deployment 嘅合約', () => {
  const edit = newToken('edit')
  const view = newToken('view')

  it('行一轉：init → claim → push → get', async () => {
    const admin = createClient(SCRIPT, edit)

    const init = await admin.init(edit, view, t('合約測試'))
    expect(init.ok).toBe(true)

    expect((await admin.claim('devA', true)).ok).toBe(true)
    expect((await admin.push(t('入咗分'), 'devA')).ok).toBe(true)

    const got = await admin.get(null)
    expect(got.ok && got.t?.name).toBe('入咗分')
    expect(got.ok && got.role).toBe('edit')
  }, 60_000)

  it('第二部機攞唔到位，但主辦 force 就攞到', async () => {
    const admin = createClient(SCRIPT, edit)
    await admin.claim('devA', true)

    const other = await admin.claim('devB', false)
    expect(other.ok).toBe(false)
    expect(!other.ok && other.err).toBe('held')

    expect((await admin.claim('devB', true)).ok).toBe(true)
  }, 60_000)

  it('view token 寫唔到嘢', async () => {
    const watcher = createClient(SCRIPT, view)
    const r = await watcher.push(t('唔應該入到'), 'devC')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.err).toBe('read-only')
  }, 60_000)

  it('token 亂咁畀就拒絕', async () => {
    const r = await createClient(SCRIPT, 'nope').get(null)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.err).toBe('bad-token')
  }, 60_000)

  it('大過一格上限嘅資料都推得上、拉得返', async () => {
    const admin = createClient(SCRIPT, edit)
    await admin.claim('devA', true)
    const big = t('x'.repeat(60_000))
    expect((await admin.push(big, 'devA')).ok).toBe(true)
    const got = await admin.get(null)
    expect(got.ok && got.t?.name.length).toBe(60_000)
  }, 60_000)
})
```

- [ ] **Step 2: `package.json` 加指令**

```json
    "test:live": "vitest run src/live/contract.test.ts"
```

同時 `vite.config.ts` 個 `test.include` 要排除佢，唔好每次 `npm test` 都打真 server：

```ts
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/contract.test.ts'],
```

- [ ] **Step 3: README 加一節**

`README.md` 喺「部署」後面加：

```markdown
## 即時分享

主辦喺自己 Google Drive 開一張 **private sheet** 做 database，派兩條 link 出去：

| Link | 做到咩 |
|---|---|
| 入分 link | 入分、改設定。同一時間得一部機入到 |
| 觀眾 link | 淨係睇，實時跳 |

**張 sheet 由頭到尾冇 share 過。** 段 Apps Script 以主辦身份執行，所以掂得到；
外面啲人淨係打得到段 script，而段 script 睇 token 決定俾唔俾你做嘢。

裝法睇 `apps-script/README.md`。設定一次 3–5 分鐘，之後每場新賽事貼返同一條網址就得。

**點解唔用 Firebase：** 咁樣每一個用呢個 app 嘅人都食同一個 project 嘅額度，
要人管 dashboard、管升 plan，而且人哋啲資料喺第三者手。呢個方案每個主辦用自己
Google 帳戶嘅額度，個 app 仍然係一堆靜態檔。

段 script 改完之後要驗合約：

```
LIVE_SCRIPT_ID=AKfycb… npm run test:live
```
```

- [ ] **Step 4: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS，而且 `npm test` **唔應該**打真 server（contract test 要 skip 咗）

- [ ] **Step 5: Commit**

```bash
git add src/live/contract.test.ts package.json vite.config.ts README.md
git commit -m "Contract test 打真 deployment；README 講埋即時分享"
```

---

## 收尾檢查

- [ ] `npm test && npm run build` 全綠
- [ ] `npm test` 冇打真 server（冇設 `LIVE_SCRIPT_ID` 就 skip）
- [ ] **冇開直播嘅賽事一切照舊** —— 單機入分、匯出匯入、四個賽制全部冇變
- [ ] 舊備份（冇 `live` field）匯入唔會報錯
- [ ] 觀眾 link：實時跳、切走再切返即刻追上、斷網有提示、亂改 token 見到「條 link 唔啱」
- [ ] 入分 link：搶唔到位、等過期接到手、主辦收得返
- [ ] 主辦熄屏 2 分鐘唔會跌位
- [ ] 主辦離線入分照樣即刻生效，重連自動補推
- [ ] 20 人賽事（190 場）推得上、拉得返，張 sheet B6 ≥ 2
- [ ] 段 script 改完行過 `apps-script/README.md` 嗰份人手清單
