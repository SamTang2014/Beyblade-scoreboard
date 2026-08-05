# 即時分享 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主辦喺自己 Google Drive 開一張 private sheet 做 database，派兩條 link 出去 —— 一條可以入分、一條淨係睇，實時跳。

**Architecture:** 一段 Apps Script deploy 成 Web App，以主辦身份執行，所以掂得到嗰張從未 share 過嘅 sheet。客戶端分四層純 module（payload 編碼、JSON 分段、傳輸、佔位狀態機），全部餵得假嘢入去測試；React 層淨係接線同計時器。一場賽事只有一個「入分位」，坐緊位嗰部機先寫得到嘢 —— 所以冇衝突要合併。

**Tech Stack:** TypeScript（strict）、React 19、Vite、Vitest、Google Apps Script（ES5-ish，`var` 同 `function`）。

## Global Constraints

- 全部介面文字、註釋、commit message 一律用**廣東話口語**，唔用書面語。
- **POST 一定要用 `text/plain`**。用 `application/json` 會觸發 CORS preflight，而 Apps Script 唔識答 `OPTIONS` —— 個請求會靜靜雞失敗。
- **JSON 一定要分段**，每段最多 40,000 字元。Google 一格上限 50,000，20 人賽事會超；超咗唔報錯，係靜靜雞截斷。**分段係段 script 做**（客戶端整份 JSON 推上去就算），所以呢個數只喺 `Code.gs` 出現一次。
- **入分永遠唔會等網絡。** 寫 localStorage 即刻生效，同步喺背後做。呢個係 README 第一句嘅承諾。
- **心跳同觀眾 poll 嘅背景行為係相反嘅**：觀眾 `document.hidden` 就完全停 poll；坐緊入分位嗰部機 `document.hidden` 要**照續期**。呢個最易寫錯。
  ⚠ 但唔好當「照續期」等於「熄屏都跌唔到位」—— **iOS Safari 熄屏係直接暫停晒 JS**，一個 timer 都唔跑。個位捱得過熄屏，靠嘅係 5 分鐘有效期本身夠長，唔係靠心跳。
- 個位有效期 **5 分鐘**，每 **60 秒**心跳一次。
- **到期時間一律用客戶端自己個鐘算**（`Date.now() + LEASE_MS`），段 script 返嘅 `until` 淨係做參考。撈埋兩個鐘用，部機個鐘快咗就會一路鎖住個介面但心跳其實成功緊。
- 主辦（本機有 `live` 設定嗰部）**隨時**收得返個位；入分 link 要等過期。
- 舊檔冇 `live` 一律當 `null`（同 `headToHead` 一樣嘅處理）。
- **推上去嗰份賽事資料，`live` 一定要係 `null`** —— `Tournament.live` 入面有兩個 token，原封不動推上去就會經 `doGet` 交俾觀眾，任何人讀一讀 JSON 就攞到入分權。
- 每個 task 做完 `npm test` 同 `npm run typecheck` 都要綠先可以 commit；掂到 UI 嘅再行 `npm run build`。

## File Structure

| 檔案 | 責任 |
|---|---|
| `apps-script/Code.gs` | 段 script。**唔喺 `src/` 入面**，唔會 build 入個 bundle |
| `src/live/payload.ts` | link payload 編碼解碼、script 網址砌同拆 |
| `src/live/remote.ts` | 同段 script 講嘢。純傳輸，冇 state、冇 timer、冇 React |
| `src/live/seat.ts` | 佔位狀態機。純 reducer，冇 timer —— 所以測得到 |
| `src/live/sync.ts` | React hook：接線 timer、推送隊列、poll |
| `src/ui/Share.tsx` | 設定頁 `#/t/<id>/share` |
| `src/ui/Live.tsx` | link 入口 `#/live/<payload>`，拉資料再分流 |

**點解分咁多個細 module：** 段 `Code.gs` 冇得寫自動測試（跑喺 Google 個 runtime）。所以凡係邏輯都要推落客戶端嘅 TS 度，令段 script 薄到「一睇就知啱唔啱」。`seat.ts` 特登唔掂 timer，就係為咗全部規則都測得到。

---

## 期一：觀眾 link

做完呢半就已經行得通 —— 主辦推、觀眾實時睇。可以喺 Task 5 之後停低試真。

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

### Task 2: `apps-script/Code.gs` —— 段 script

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
  // 一格一格咁切。CJK 字冇事（每個一格）；emoji 係兩格，理論上切得開，
  // 但 `a.slice(0,n) + a.slice(n)` 接返一定原樣，所以只要 Google 唔改動
  // 我哋寫落去嗰串嘢就冇問題。選手名有 emoji 嘅話值得留意呢一點。
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

  // 冇攞鎖 —— 讀嘢排住隊等寫入完成唔抵。代價：啱啱撞正有人寫緊嘅話，
  // 有機會讀到寫咗一半嘅 JSON，客戶端收到 'bad-data'。下一次 poll（3 秒後）
  // 就會啱返，所以唔值得為咗呢個令全部觀眾排隊。
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

  // ⚠ 張 sheet 上面嗰份賽事資料嘅 `live` 一定係 null（客戶端推之前剝走咗），
  // 所以呢度冇 token 漏得出去。edit token 嗰個要知 view token 先派得出
  // 觀眾 link，所以另外派 —— **淨係派俾 edit**。
  var out = { ok: true, role: r, v: m.version, t: t }
  if (r === 'edit') out.view = m.view
  return reply_(out)
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

  // 版本要繼續行前，唔可以 reset 做 1 —— 換場之後，一個 `since` 啱啱係 1 嘅
  // 觀眾會以為「冇變」，望住舊畫面唔郁。
  var v = m.version + 1
  writeData_(sh, JSON.stringify(body.t))
  sh.getRange('B1:B5').setValues([[edit], [view], [v], [''], [0]])
  putCache_({ edit: edit, view: view, version: v })
  return reply_({ ok: true, v: v })
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
  if (who === '') return reply_({ ok: false, err: 'bad-who' })
  // 冇 t 就唔好行落去 —— JSON.stringify(undefined) 返 undefined，
  // 落到 setValue 會掟錯，個 client 收到一版 HTML 錯誤頁，睇落似網絡問題。
  if (body.t === undefined || body.t === null) return reply_({ ok: false, err: 'bad-body' })

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

### Task 3: `Tournament.live` + 部機 id

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
  - `savedSheet(): { scriptId: string; edit: string } | null` / `rememberSheet(scriptId: string, edit: string): void`
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
    // 入分 link 嗰部機未必知 view token —— 吉 view 唔可以當「冇分享」，
    // 唔係佢會靜靜雞連唔到，入分入到爽但一分都推唔上去。
    expect(
      parseTournament({ ...base, live: { scriptId: 'a', edit: 'b', view: '' } }).live,
    ).toEqual({ scriptId: 'a', edit: 'b', view: '' })
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
import { deviceId, newToken, rememberSheet, savedSheet } from './device'

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

  /**
   * ⚠ `deviceId` 有個 module-level cache，`beforeEach` 清唔到佢 ——
   * 唔 resetModules 就會攞返上一個測試 cache 咗嗰個，
   * 呢個測試會**白過**（根本冇行過掟錯嗰條路）。
   */
  it('storage 用唔到都唔會炸', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('無痕視窗') },
      setItem() { throw new Error('無痕視窗') },
    })
    const fresh = await import('./device')
    expect(fresh.deviceId().length).toBeGreaterThan(5)
  })
})

describe('記住張 sheet', () => {
  it('冇記過就係 null', () => {
    expect(savedSheet()).toBeNull()
  })

  it('記完攞返出嚟', () => {
    rememberSheet('AKfycbx1', 'edit-abc')
    expect(savedSheet()).toEqual({ scriptId: 'AKfycbx1', edit: 'edit-abc' })
  })

  /**
   * 一定要連 edit token 一齊記。
   *
   * 換場（同一張 sheet 擺第二場賽事）要拎現有嘅 edit token 去認證 ——
   * 新開嘅賽事 `live` 係 null，冇呢度記住嗰個就永遠 init 唔到，
   * 段 script 會一路答 already-init。
   */
  it('淨係記 scriptId 唔夠 —— 換場要用個 token 認證', () => {
    rememberSheet('AKfycbx1', 'edit-abc')
    expect(savedSheet()?.edit).toBe('edit-abc')
  })

  it('存咗爛嘢就當冇記過', () => {
    localStorage.setItem('beyblade-scoreboard/sheet', 'not json')
    expect(savedSheet()).toBeNull()
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
/**
 * `scriptId` 同 `edit` 要有；`view` 可以係吉。
 *
 * 點解 `view` 唔強制：入分 link 嗰部機由條 link 砌返個 `live`，而條 link
 * 淨係帶住 edit token。段 script 會額外派返 view token，但唔應該為咗
 * 呢一個 field 缺失就當成「冇分享」—— 咁樣佢會靜靜雞連唔到，
 * 入分入到爽但一分都推唔上去。
 *
 * `view` 吉嘅後果淨係「派唔到觀眾 link」，唔影響入分。
 */
function parseLive(v: unknown): Tournament['live'] {
  if (!isObject(v)) return null
  const { scriptId, edit, view } = v
  if (typeof scriptId !== 'string' || scriptId === '') return null
  if (typeof edit !== 'string' || edit === '') return null
  if (typeof view !== 'string') return null
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
const SHEET_KEY = 'beyblade-scoreboard/sheet'

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
 * 上次用嘅 sheet：條 script 網址 **同埋個 edit token**。
 *
 * 兩樣都要記。開第二場賽事嘅時候，個 app 要攞現有嘅 edit token 去認證，
 * 段 script 先肯換場 —— 新賽事本身 `live` 係 null，冇嘢攞得出嚟。
 * 淨係記 scriptId 嘅話，換場會永遠俾人答 already-init。
 */
export function savedSheet(): { scriptId: string; edit: string } | null {
  const raw = read(SHEET_KEY)
  if (raw === null || raw === '') return null
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const { scriptId, edit } = v as Record<string, unknown>
    if (typeof scriptId !== 'string' || scriptId === '') return null
    if (typeof edit !== 'string' || edit === '') return null
    return { scriptId, edit }
  } catch {
    return null
  }
}

export function rememberSheet(scriptId: string, edit: string): void {
  write(SHEET_KEY, JSON.stringify({ scriptId, edit }))
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

### Task 4: `remote.ts` —— 傳輸層

**Files:**
- Create: `src/live/remote.ts`
- Test: `src/live/remote.test.ts`

**Interfaces:**
- Consumes: Task 1 嘅 `scriptUrl`；Task 2 嘅 HTTP 合約；Task 3 嘅 `Tournament.live`
- Produces:

```ts
export type LiveErr =
  | 'bad-token' | 'read-only' | 'not-holder' | 'held' | 'already-init'
  | 'busy' | 'bad-data' | 'bad-body' | 'bad-who'
  | 'network' | 'bad-response'

export type GetResult =
  /** `view` 淨係 edit token 收到 —— 佢要靠呢個先派得出觀眾 link。 */
  | { ok: true; role: 'edit' | 'view'; v: number; t: Tournament | null; view?: string }
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
  /** `view` 淨係 edit token 收到 —— 佢要靠呢個先派得出觀眾 link。 */
  | { ok: true; role: 'edit' | 'view'; v: number; t: Tournament | null; view?: string }
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
      const out: GetResult = {
        ok: true,
        role,
        v: body.v,
        t: (body.t as Tournament | undefined) ?? null,
      }
      if (typeof body.view === 'string') out.view = body.view
      return out
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

### Task 5: 分享設定頁

**Files:**
- Create: `src/ui/Share.tsx`
- Modify: `src/lib/router.ts`（加 `share` route）
- Modify: `src/ui/App.tsx`（接線）
- Modify: `src/ui/components/TopBar.tsx`（加「分享」tab）
- Modify: `src/ui/styles/app.css`
- Test: `src/lib/router.test.ts`（如果冇就喺 `payload.test.ts` 隔籬新開）

**Interfaces:**
- Consumes: Task 1 嘅 `encodePayload` / `parseScriptId`；Task 3 嘅 `newToken` / `savedSheet` / `rememberSheet`；Task 4 嘅 `createClient`
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
import { newToken, rememberSheet, savedSheet } from '../live/device'
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
    const saved = savedSheet()
    return saved === null ? '' : scriptUrl(saved.scriptId)
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

    /*
      認證用邊個 token？

      張 sheet 已經有 token 嘅話，段 script 要你畀返**現有嗰個** edit token 先肯換場。
      呢場賽事本身 `live` 係 null（啱啱先開），所以要由 `savedSheet()` 攞返 ——
      即係「上次用呢張 sheet 嗰陣個 token」。

      ⚠ 之前呢度寫成 `tournament.live?.edit ?? edit`，即係新賽事會攞住一個
      啱啱生出嚟嘅隨機 token 去認證 —— 同張 sheet 上面嗰個對唔上，
      段 script 永遠答 already-init，換場由頭到尾做唔到。
    */
    const prev = savedSheet()
    const reusing = prev !== null && prev.scriptId === scriptId

    if (reusing && tournament!.live === null) {
      const yes = confirm(
        '呢張 sheet 而家擺緊第二場賽事。換做呢場嘅話，舊嗰兩條 link 即刻會失效。要換？',
      )
      if (!yes) return
    }

    setBusy(true)
    setErr(null)
    const edit = newToken('edit')
    const view = newToken('view')
    const auth = tournament!.live?.edit ?? prev?.edit ?? edit
    // ⚠ 推之前一定要剝走 live —— 入面有兩個 token，推咗上去就會經 doGet
    // 交俾觀眾，任何人讀一讀 JSON 就攞到入分權。
    const r = await createClient(scriptId, auth).init(edit, view, { ...tournament!, live: null })
    setBusy(false)

    if (!r.ok) {
      setErr(
        r.err === 'network'
          ? '連唔到段 script。檢查下條網址啱唔啱、部機有冇網絡。'
          : r.err === 'already-init'
            ? '呢部機唔記得咗呢張 sheet 個 edit token，所以換唔到場。開返你張 sheet，B1 格抄個 token 出嚟，用下面「用返舊嘅 sheet」接返，或者開多張新 sheet。'
            : `段 script 唔收：${r.err}`,
      )
      return
    }

    rememberSheet(scriptId, edit)
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

（`live` route 喺 Task 6 先接。）

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

### Task 6: 觀眾 link —— 拉資料同 poll

做完呢個 task，**期一完成**：主辦推、觀眾實時睇。

**Files:**
- Create: `src/live/usePoll.ts`
- Create: `src/ui/Live.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/Board.tsx`（接受直接餵 tournament）
- Modify: `src/live/sync.ts` 未存在 —— 呢個 task 唔使佢
- Test: `src/live/usePoll.test.ts`

**Interfaces:**
- Consumes: Task 4 嘅 `createClient`、Task 1 嘅 `decodePayload`
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

呢個版本淨係識觀眾模式。Task 9 會**整個換走**佢，加埋入分模式。

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
2. copy 觀眾 link，喺另一個瀏覽器（或者無痕視窗）開 → 見到嗰場賽事
3. 觀眾嗰個 tab 切走 30 秒再切返 → 即刻拉一次（Network 面板見到）
4. 熄咗 wifi → 觀眾見到「連唔到，重試緊」→ 開返 wifi → 自動接返
5. 觀眾條 link 改亂個 token → 見到「呢條 link 唔啱」
6. 打開觀眾嗰個 GET 嘅 response，**確認入面冇 `edit-` 開頭嘅 token**

**⚠ 呢個 task 仲未測到「主辦入分 → 觀眾見到」。** 到呢一步為止，只有 `init`
會推嘢上張 sheet —— 冇任何 code path 喺入分之後推。嗰條線喺 **Task 9** 先接得通，
嗰度個人手測試會補返。呢度睇到嘅係 init 嗰一刻嘅快照。

第 6 點特別緊要：`init` 推上去嗰份已經 `{...t, live: null}`，所以 response 入面
唔應該有任何 token。見到嘅話即係剝漏咗，任何觀眾都攞到入分權。

- [ ] **Step 9: Commit**

```bash
git add src/live/usePoll.ts src/live/usePoll.test.ts src/ui/Live.tsx src/ui/Board.tsx src/ui/App.tsx src/ui/styles/app.css
git commit -m "觀眾 link：拉資料、poll、收埋 tab 就停"
```

---

## 期二：入分 link

### Task 7: `seat.ts` —— 佔位狀態機

純 reducer，**唔掂 timer** —— 所以全部規則測得到。

**Files:**
- Create: `src/live/seat.ts`
- Test: `src/live/seat.test.ts`

**Interfaces:**
- Consumes: Task 4 嘅 `ClaimResult` / `PushResult`
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
    expect(afterClaim({ ok: true, until: NOW + LEASE_MS }, NOW)).toEqual({
      kind: 'mine', until: NOW + LEASE_MS,
    })
  })

  /**
   * 段 script 個鐘快咗／慢咗都唔會影響客戶端 —— 到期一律自己算。
   * 撈埋兩個鐘用嘅話，部機個鐘快 10 分鐘就會即刻「過咗期」，
   * 心跳成功都冇用，個介面一路鎖住。
   */
  it('唔理段 script 返嗰個 until，一律用自己個鐘', () => {
    const wayOff = afterClaim({ ok: true, until: NOW + 999_999_999 }, NOW)
    expect(wayOff).toEqual({ kind: 'mine', until: NOW + LEASE_MS })
  })

  it('有人坐緊', () => {
    expect(afterClaim({ ok: false, err: 'held', until: NOW + 1000 }, NOW)).toEqual({
      kind: 'theirs', until: NOW + 1000,
    })
  })

  it('網絡爆咗當冇位 —— 唔好扮自己坐緊', () => {
    expect(afterClaim({ ok: false, err: 'network' }, NOW)).toEqual({ kind: 'none' })
  })
})

describe('推完之後', () => {
  it('推得成就順手續咗期', () => {
    expect(afterPush({ kind: 'mine', until: NOW }, { ok: true, v: 5 }, NOW)).toEqual({
      kind: 'mine', until: NOW + LEASE_MS,
    })
  })

  it('俾人收咗位 → lost', () => {
    expect(
      afterPush({ kind: 'mine', until: NOW }, { ok: false, err: 'not-holder', until: 9 }, NOW),
    ).toEqual({ kind: 'lost' })
  })

  it('網絡爆咗唔算跌位 —— 個位好可能仲喺我度', () => {
    const cur = { kind: 'mine', until: NOW + LEASE_MS } as const
    expect(afterPush(cur, { ok: false, err: 'network' }, NOW)).toEqual(cur)
  })

  it('view token 寫唔到 —— 唔關個位事', () => {
    const cur = { kind: 'none' } as const
    expect(afterPush(cur, { ok: false, err: 'read-only' }, NOW)).toEqual(cur)
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

/**
 * `now` 由外面傳入（`Date.now()`）—— 個到期時間一律用**客戶端自己個鐘**算。
 *
 * ⚠ 唔好用段 script 返嗰個 `r.until`。嗰個係 server 個鐘度嘅絕對時間，而
 * `canEdit` 係攞客戶端個鐘去比。兩個鐘差超過 5 分鐘，個介面就會一路顯示
 * 「過咗期」但心跳其實成功緊 —— 用家見到入分掣灰晒，查極都查唔到點解。
 *
 * 段 script 嗰邊自己用自己個鐘做真正裁判，本來就一致；亂嘅只係客戶端撈埋兩個鐘。
 */
export function afterClaim(r: ClaimResult, now: number): Seat {
  if (r.ok) return { kind: 'mine', until: now + LEASE_MS }
  if (r.err === 'held') return { kind: 'theirs', until: r.until ?? 0 }
  // 網絡爆咗／段 script 出事 —— 唔知邊個坐緊，唔好扮自己坐緊。
  return { kind: 'none' }
}

export function afterPush(cur: Seat, r: PushResult, now: number): Seat {
  if (r.ok) {
    // 段 script 推嘢嗰陣順手續期，所以本機都推返 —— 一樣用客戶端個鐘。
    return { kind: 'mine', until: now + LEASE_MS }
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

### Task 8: `sync.ts` —— 推送隊列同心跳

**Files:**
- Create: `src/live/queue.ts`
- Create: `src/live/sync.ts`
- Test: `src/live/queue.test.ts`

**Interfaces:**
- Consumes: Task 7 嘅 `Seat` 系列；Task 4 嘅 `LiveClient`
- Produces:
  - `createQueue(client, who): { push(t): void; pending(): number; drain(): Promise<void> }`
  - `useLiveSync(tournament: Tournament | null, adopt: (t: Tournament) => void): { seat: Seat; status: SyncStatus | undefined; claim: (force: boolean) => Promise<void>; onChanged: (t: Tournament) => void }`
  - `type SyncStatus = { label: string; bad: boolean }`

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
      } else if (r.err === 'not-holder' || r.err === 'read-only' || r.err === 'bad-token') {
        // bad-token = 張 sheet 換咗場（舊 token 死咗）。死撞冇用，
        // 而且唔停低嘅話個狀態會一路顯示「同步緊」，講緊大話。
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
import { POLL_MS } from './usePoll'
import type { Tournament } from '../engine/types'

export type SyncStatus =
  | { label: string; bad: boolean }

/**
 * 接線：把佔位狀態機、推送隊列同 timer 駁埋一齊。
 *
 * ⚠ 兩個背景行為要記住，佢哋係相反嘅：
 *   · 觀眾 poll（usePoll）—— `document.hidden` 就完全停
 *   · 坐緊入分位嘅心跳 —— hidden 都照跑
 *
 * 但唔好當「hidden 都照跑」等於「熄屏跌唔到位」：iOS Safari 熄屏係直接
 * 暫停晒 JS，一個 timer 都唔跑。個位捱得過熄屏靠嘅係 5 分鐘有效期夠長。
 */
export function useLiveSync(
  tournament: Tournament | null,
  adopt: (t: Tournament) => void,
): {
  seat: Seat
  status: SyncStatus | undefined
  claim: (force: boolean) => Promise<void>
  onChanged: (t: Tournament) => void
} {
  const live = tournament?.live ?? null
  const who = deviceId()

  const [seat, setSeat] = useState<Seat>({ kind: 'none' })
  const [pending, setPending] = useState(0)
  const [offline, setOffline] = useState(false)
  /** 條 link 死咗（多數係張 sheet 換咗第二場賽事）。 */
  const [dead, setDead] = useState(false)

  /*
    啲 timer 讀 ref 唔讀 state。

    ⚠ 如果個 effect 嘅 dependency 有 `seat`，咁每次 seat 一變就會拆咗個
    interval 再開過 —— 即係個心跳計時器不停由零數起，永遠數唔夠 60 秒，
    心跳就冇跑過。呢個 bug 唔會令任何測試變紅，但個位會靜靜雞過期。
  */
  const seatRef = useRef(seat)
  seatRef.current = seat
  const lastBeat = useRef(0)
  const version = useRef<number | null>(null)

  const client = useMemo(
    () => (live === null ? null : createClient(live.scriptId, live.edit)),
    [live?.scriptId, live?.edit],
  )

  const queue = useMemo(
    () =>
      client === null
        ? null
        : createQueue(client, who, (r) => {
            setSeat((cur) => afterPush(cur, r, Date.now()))
            if (r.ok) {
              lastBeat.current = Date.now()
              version.current = r.v
            }
            setOffline(!r.ok && r.err === 'network')
            if (!r.ok && r.err === 'bad-token') setDead(true)
          }),
    [client, who],
  )

  const claim = useCallback(
    async (force: boolean) => {
      if (client === null || queue === null) return
      const r = await client.claim(who, force)
      setSeat(afterClaim(r, Date.now()))
      if (!r.ok && r.err === 'bad-token') setDead(true)
      if (r.ok) {
        lastBeat.current = Date.now()
        queue.unblock()
        void queue.drain().then(() => setPending(queue.pending()))
      }
    },
    [client, who, queue],
  )

  const onChanged = useCallback(
    (t: Tournament) => {
      if (queue === null) return
      // ⚠ 一定要剝走 live —— 入面有兩個 token，推咗上去就會經 doGet
      // 交俾觀眾，任何人讀一讀 JSON 就攞到入分權。
      queue.push({ ...t, live: null })
      setPending(queue.pending())
      void queue.drain().then(() => setPending(queue.pending()))
    },
    [queue],
  )

  /*
    開場先試攞位，**唔 force**。

    就算係主辦都唔好自動搶 —— 佢可能淨係開個 tab 望一望，唔應該靜靜雞
    踢走緊入緊分嗰個人。要搶就撳「收返入分位」，撳嗰下先傳 force。
  */
  useEffect(() => {
    if (client === null) return
    void claim(false)
  }, [client, claim])

  /** 心跳 + 補推。**唔理 document.hidden**。 */
  useEffect(() => {
    if (client === null || queue === null) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      const cur = seatRef.current
      if (dueForHeartbeat(cur, lastBeat.current, now)) {
        void client.claim(who, false).then((r) => {
          setSeat(afterClaim(r, Date.now()))
          if (r.ok) lastBeat.current = Date.now()
        })
      }
      if (queue.pending() > 0 && canEdit(cur, now)) {
        void queue.drain().then(() => setPending(queue.pending()))
      }
    }, HEARTBEAT_MS / 2)
    return () => clearInterval(timer)
  }, [client, queue, who])

  /*
    坐唔到位嗰陣要 poll。

    **冇呢一段，等緊接手嗰部機會望住一份凍結咗嘅賽事** —— 佢見到嘅係第一次
    拉落嚟嗰份，之後主辦入幾多分佢都唔知。

    坐緊位嗰部機唔使 poll：得佢一個寫得到嘢，拉返嚟一定係佢自己啱啱推嗰份。
  */
  useEffect(() => {
    if (client === null) return
    let dead = false
    const tick = async (): Promise<void> => {
      if (dead || document.hidden) return
      if (canEdit(seatRef.current, Date.now())) return // 我坐緊，唔使拉
      /*
        本機仲有嘢未推就唔好蓋 —— 蓋咗就真係冇咗（隊列淨係喺記憶體，
        reload 一次就消失）。等佢攞返個位、推咗先再收遠端嘅嘢。
      */
      if (queue !== null && queue.pending() > 0) return

      const r = await client.get(version.current)
      if (dead) return
      setOffline(!r.ok && r.err === 'network')
      if (r.ok) {
        version.current = r.v
        if (r.t !== null) adopt(r.t)
      }
    }
    const timer = window.setInterval(() => void tick(), POLL_MS)
    return () => {
      dead = true
      clearInterval(timer)
    }
  }, [client, adopt, queue])

  /** 離開之前讓返個位，等下一個人唔使等 5 分鐘。 */
  useEffect(() => {
    if (client === null) return
    const bye = (): void => {
      if (seatRef.current.kind === 'mine') void client.release(who)
    }
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [client, who])

  const status: SyncStatus | undefined =
    live === null
      ? undefined
      : dead
        ? { label: '條分享 link 死咗（張 sheet 換咗場）', bad: true }
        : offline
        ? { label: pending > 0 ? `離線（${pending} 個改動未推）` : '離線', bad: true }
        : seat.kind === 'lost' || seat.kind === 'theirs'
          ? { label: '入分位喺第二部機', bad: true }
          : pending > 0
            ? { label: '同步緊', bad: false }
            : { label: '同步咗', bad: false }

  return { seat, status, claim, onChanged }
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

### Task 9: 接線 —— 令啲分真係推得上去

**呢個 task 係成個 feature 嘅樞紐。** 之前每一個 task 都係整零件；呢度先至有嘢真正
推得上張 sheet。冇咗佢，Task 6 個人手測試（「主辦入一場分 → 觀眾 3 秒內見到」）
係**由設計上就過唔到** —— 除咗 `init` 嗰一次，冇任何 code path 會 push。

**Files:**
- Modify: `src/storage/browserStore.ts`（`useTournament` 入面接埋 sync）
- Modify: `src/ui/Live.tsx`（加入分模式）
- Modify: `src/ui/Console.tsx`（鎖入分掣、出接手掣）
- Modify: `src/ui/components/TopBar.tsx`（出同步狀態）
- Modify: `src/ui/styles/app.css`

**Interfaces:**
- Consumes: Task 8 嘅 `useLiveSync`；Task 7 嘅 `canEdit` / `seatLabel`
- Produces: `useTournament(id)` 多返一個 `live` —— 每一頁都自動同步

- [ ] **Step 1: sync 接落 `useTournament` 入面**

**點解擺喺呢度而唔係逐頁接：** 入分係 `Console` 改，但改設定係 `Setup`、砌籤表係
`Bracket`、排加賽係 `Table` —— 四頁都會 `update()`。逐頁接就要接四次，漏一頁
就會有啲改動靜靜雞唔同步。`useTournament` 係佢哋唯一嘅共同入口，喺呢度接一次，
全部頁自動有。

`src/storage/browserStore.ts`：

```ts
export function useTournament(id: string) {
  const [tournament, setTournament] = useState<Tournament | null>(() => store.get(id))
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(tournament)
  latest.current = tournament

  /*
    呢個 ref 打破一個循環：`useLiveSync` 要 `tournament` 先砌到 client，
    但 `update` 又要叫返 sync 出嚟嘅 `onChanged`。直接寫就會互相等對方。
    Ref 令 `update` 唔使喺定義嗰陣就知 `onChanged` 係乜。
  */
  const push = useRef<((t: Tournament) => void) | null>(null)

  const update = useCallback((change: (t: Tournament) => Tournament) => {
    const current = latest.current
    if (current === null) return
    try {
      const saved = store.save(change(current))
      latest.current = saved
      setTournament(saved)
      setError(null)
      // 存咗落 localStorage **先至**推。同步失敗都唔會整跌本機資料 ——
      // 呢個就係「場地 wifi 幾差都影響唔到入分」嗰句承諾嘅實現。
      push.current?.(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : '存唔到落瀏覽器。')
    }
  }, [])

  /**
   * 由遠端拉到新版本，覆蓋本機。**唔會**反過嚟推上去。
   *
   * ⚠⚠ `live` 一定要保住本機嗰個，唔可以用遠端嗰個。
   *
   * 張 sheet 上面嗰份 `live` **永遠係 null** —— 推之前特登剝走咗，唔可以漏
   * token 俾觀眾。所以照單全收嘅話，本機個 `live` 就會俾 null 蓋走，跟住：
   * client 變 null → sync 靜靜雞死 → `editable` 因為 `live === null` 反而變返
   * true → 啲掣解鎖 → 之後入嘅分全部淨係留喺本機，永遠推唔上去，
   * 而個介面睇落一切正常。
   *
   * 呢個必定會發生：入分 link 嗰部機一等到主辦第一次 push 就中招。
   */
  const adopt = useCallback((t: Tournament) => {
    try {
      const keep = latest.current?.live ?? null
      const saved = store.save({ ...t, live: keep })
      latest.current = saved
      setTournament(saved)
      setError(null)
    } catch (e) {
      // localStorage 爆咗都唔好變成 unhandled rejection。
      setError(e instanceof Error ? e.message : '存唔到落瀏覽器。')
    }
  }, [])

  const live = useLiveSync(tournament, adopt)
  push.current = live.onChanged

  return { tournament, update, error, live }
}
```

頂部加 `import { useLiveSync } from '../live/sync'`。

- [ ] **Step 2: 驗證接得通**

呢個 task 最容易出事嘅位就係「睇落接咗，其實冇」。所以要有個測試釘住。

`src/storage/browserStore.test.ts`（新檔）：

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

/**
 * `useTournament` 每次 `update` 都一定要叫 `useLiveSync` 俾返嘅 `onChanged`。
 *
 * 呢條線斷咗嘅話，成個 feature 靜靜雞死：所有嘢照樣存落 localStorage、
 * 介面一切正常，但一分都推唔上張 sheet，而觀眾望住一個永遠唔郁嘅畫面。
 * 冇任何其他測試捉得到 —— 所以要專登釘住佢。
 */
describe('每次改動都會推上去', () => {
  it('update() 之後 onChanged 收到最新嗰份', async () => {
    const pushed: unknown[] = []
    vi.doMock('../live/sync', () => ({
      useLiveSync: () => ({
        seat: { kind: 'none' },
        status: undefined,
        claim: async () => {},
        onChanged: (t: unknown) => pushed.push(t),
      }),
    }))

    const { renderHook, act } = await import('@testing-library/react')
    const { useTournament } = await import('./browserStore')
    const { store } = await import('./browserStore')

    const made = store.create('測試')
    const { result } = renderHook(() => useTournament(made.id))
    act(() => result.current.update((t) => ({ ...t, name: '改咗' })))

    expect(pushed).toHaveLength(1)
    expect((pushed[0] as { name: string }).name).toBe('改咗')
  })
})
```

**呢個測試要裝兩樣嘢，唔止一樣：**

```
npm i -D @testing-library/react jsdom
```

`vite.config.ts` 而家係 `environment: 'node'` —— `renderHook` 要 DOM，唔換就會
死喺 `document is not defined`。個檔頂加一行就得（唔使改成個 config，
其他測試繼續行 node）：

```ts
// @vitest-environment jsdom
```

**呢個係整個 feature 唯一有自動測試守住嘅接線位**，值得裝兩個 dev dependency。
如果真係唔想裝：改成人手驗 —— 喺 `update` 入面暫時 `console.log('推:', saved.name)`，
入一場分，確認 console 見到，然後剷走。**但唔好跳過呢一步**，呢條線斷咗
成個 feature 靜靜雞死而冇任何嘢會變紅。

- [ ] **Step 3: Console 鎖入分掣**

`src/ui/Console.tsx`：

`Console`（外層）改成同時攞 `live` 傳落 `ConsoleBody`：

```tsx
export function Console({ id, matchId = null }: { id: string; matchId?: string | null }) {
  const { tournament, update, error, live } = useTournament(id)

  if (tournament === null) return <NotFound />
  if (tournament.matches.length === 0) return <NeedsSchedule id={id} name={tournament.name} />

  return (
    <ConsoleBody
      id={id}
      matchId={matchId}
      tournament={tournament}
      update={update}
      error={error}
      live={live}
    />
  )
}
```

`ConsoleBody` 個 props type 加 `live: ReturnType<typeof useTournament>['live']`，跟住：

```tsx
  const editable = tournament.live === null || canEdit(live.seat, Date.now())
  /*
    邊部先算主辦？—— **記唔記得呢張 sheet**。

    主辦喺分享頁貼網址嗰陣 `rememberSheet` 記低咗；入分 link 嗰部機
    冇經過嗰一步，所以永遠唔會等於。

    唔可以用「本機有冇呢場賽事」做準 —— 入分 link 嗰部機第一次開之後
    都會存落 localStorage，兩邊就分唔開。
  */
  const isHost = tournament.live !== null && savedSheet()?.scriptId === tournament.live.scriptId
```

兩個 `<Side>` 嘅 `locked` 加 `|| !editable`：

```tsx
            locked={winnerId !== null || needsConfirm || !editable}
```

`<TopBar …>` 加 `sync={live.status}`。

`<div className="arena">` 上面加：

```tsx
        {tournament.live !== null && !editable && (
          <p className="note note--bad" role="status">
            <span>⚠</span>
            <span>{seatLabel(live.seat, Date.now())}</span>
            <button className="btn btn--tight" onClick={() => void live.claim(isHost)}>
              {isHost ? '收返入分位' : '接手入分'}
            </button>
          </p>
        )}
```

頂部 import：`canEdit` / `seatLabel`（`../live/seat`）、`savedSheet`（`../live/device`）。

**冇開直播（`live === null`）就永遠 editable** —— 唔好因為加咗分享而整壞單機用法。

- [ ] **Step 4: `Live.tsx` 加入分模式**

`src/ui/Live.tsx` 整個換走：

```tsx
import { useEffect, useMemo, useState } from 'react'
import { decodePayload } from '../live/payload'
import { createClient } from '../live/remote'
import { usePoll } from '../live/usePoll'
import { store } from '../storage/browserStore'
import { parseTournament } from '../storage/storage'
import { Board } from './Board'
import type { Tournament } from '../engine/types'

type Mode =
  | { kind: 'loading' }
  | { kind: 'bad' }
  | { kind: 'view' }
  /** 已經存落本機，等緊跳去正常畫面。 */
  | { kind: 'edit'; id: string }

/**
 * 由分享 link 入嚟。
 *
 * 觀眾模式嘅資料**淨係喺記憶體** —— 唔會寫落佢部機嘅 localStorage，
 * 唔會污染佢自己嗰個賽事列表。佢淨係嚟睇場波，唔係要收藏。
 *
 * 入分模式就相反：存落本機，之後佢同一個主辦冇分別。
 */
export function Live({ payload }: { payload: string }) {
  const parsed = useMemo(() => decodePayload(payload), [payload])
  const client = useMemo(
    () => (parsed === null ? null : createClient(parsed.s, parsed.k)),
    [parsed],
  )

  const [mode, setMode] = useState<Mode>({ kind: 'loading' })
  const [t, setT] = useState<Tournament | null>(null)

  useEffect(() => {
    if (parsed === null || client === null) {
      setMode({ kind: 'bad' })
      return
    }
    let dead = false

    void client.get(null).then((r) => {
      if (dead) return
      if (!r.ok) {
        // 網絡問題唔好當條 link 爛 —— 場地 wifi 閃一閃就叫人「搵返個主辦
        // 攞條新 link」係誤導。留喺等緊嗰版，下面 usePoll 會一路重試。
        if (r.err === 'network') return
        setMode({ kind: 'bad' })
        return
      }
      if (r.t === null) {
        setMode({ kind: 'bad' })
        return
      }

      /*
        ⚠ 遠端返嚟嘅嘢係外面資料，一定要驗過先存。

        `store.save` 唔會驗；但 `readAll()` 下次讀返出嚟嗰陣會行
        `parseTournament`，parse 唔到就**靜靜雞丟走成場賽事**
        （storage.ts 特登咁寫，等一筆爛資料唔會拖冧其餘嘅）。
        即係話唔驗嘅話，一份爛資料會令成場賽事無聲無息消失。
      */
      let clean: Tournament
      try {
        clean = parseTournament(r.t)
      } catch {
        setMode({ kind: 'bad' })
        return
      }

      if (r.role === 'view') {
        setT(clean)
        setMode({ kind: 'view' })
        return
      }

      /*
        入分模式：由條 link 本身砌返個 `live`。

        張 sheet 上面嗰份 `live` 一定係 null（推之前剝走咗，唔可以漏 token 俾觀眾），
        所以要自己砌：`scriptId` 同 `edit` 喺 payload 度，`view` 由段 script
        額外派返 —— 佢淨係派俾 edit token。
      */
      const withLive: Tournament = {
        ...clean,
        live: { scriptId: parsed.s, edit: parsed.k, view: r.view ?? '' },
      }
      store.save(withLive)
      setMode({ kind: 'edit', id: withLive.id })
    })

    return () => {
      dead = true
    }
  }, [parsed, client])

  // ⚠ 跳頁一定要喺 effect 度做，唔可以喺 render 期間 ——
  // StrictMode 會 render 兩次，喺 render 度改 location 會跑兩次。
  useEffect(() => {
    if (mode.kind === 'edit') location.replace(`#/t/${mode.id}`)
  }, [mode])

  if (mode.kind === 'bad') return <BadLink />
  if (mode.kind === 'view' && t !== null && client !== null) {
    return <LiveBoard client={client} t={t} onData={setT} />
  }
  return <Waiting />
}

function LiveBoard({
  client,
  t,
  onData,
}: {
  client: ReturnType<typeof createClient>
  t: Tournament
  onData: (t: Tournament) => void
}) {
  const { state } = usePoll(client, (next) => onData(next))

  if (state === 'bad-token') return <BadLink />

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

function Waiting() {
  return (
    <div className="page stack">
      <p className="empty">拉緊場賽事…</p>
    </div>
  )
}

function BadLink() {
  return (
    <div className="page stack">
      <p className="empty">呢條 link 唔啱，或者主辦已經換咗場賽事。搵返個主辦攞條新嘅。</p>
      <a className="btn chamfer" href="#/">
        返主頁
      </a>
    </div>
  )
}
```

**`view: r.view ?? ''`**：段 script 一定派得返，但萬一冇（舊版 script），
留個吉字串好過成個 `live` 變 null。個 `parseLive` 要放寬到接受吉 `view` ——
喺 Task 3 嗰個 `parseLive` 度，`view` 改成 `typeof view !== 'string'` 先算爛
（吉字串照收）。**Task 3 做嗰陣要一併改埋**，唔係入分 link 會靜靜雞冇咗 `live`。

- [ ] **Step 5: TopBar 出同步狀態**

`src/ui/components/TopBar.tsx` 加可選 prop：

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

/* 窄畫面淨係留粒點，唔出字。 */
@media (max-width: 40rem) {
  .syncdot__text {
    display: none;
  }
}
```

- [ ] **Step 6: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 7: 人手行一次**

1. 主辦開直播 → **入一場分 → 觀眾 link 嗰邊 3 秒內見到**（呢個就係 Task 6 過唔到嗰個）
2. copy 入分 link，喺第二部機（或者無痕視窗）開
3. 第二部機見到「入分位而家喺第二部機」，入分掣灰 —— **但個排名仲會跟住主辦跳**
4. 主辦熄咗個 tab → 等 5 分鐘 → 第二部機撳「接手入分」→ 入到分
5. 主辦開返 → 撳「收返入分位」→ 即刻攞返
6. 主辦熄 wifi → 入分照樣即刻生效，TopBar 出「離線（N 個改動未推）」→ 開返 wifi → 自動補推
7. 觀眾 link 全程睇到最新

- [ ] **Step 8: Commit**

```bash
git add src/storage/browserStore.ts src/ui/Live.tsx src/ui/Console.tsx src/ui/components/TopBar.tsx src/ui/styles/app.css
git commit -m "接線：每次改動都推上去、入分 link 接得到手、同步狀態"
```

---

### Task 10: 救援路

**Files:**
- Modify: `src/ui/Share.tsx`
- Modify: `src/ui/styles/app.css`

**Interfaces:**
- Consumes: Task 4 嘅 `createClient`；Task 3 嘅 `rememberSheet`
- Produces: 冇新 API

> **本來仲有個「分岔處理」（兩邊都行前咗就攤出嚟俾人揀），已經 descope。**
>
> 三個理由：`describeDiverge` 由頭到尾冇一個 caller；`useLiveSync` 根本冇追蹤
> 遠端版本，所以 `myVersion` / `remoteVersion` 兩個參數冇嘢餵得入去；而個隊列
> 本身合併成一份，`pending()` 最多係 1，所以「你仲有 2 個改動未推」呢句
> 實際上出唔到。
>
> 而家嘅行為（spec 有寫）：跌咗位就推唔上去、隊列停低、TopBar 出
> 「入分位喺第二部機」，撳「收返入分位」就用本機嗰份蓋過線上。
> 即係「後嚟收位嗰個贏」—— 唔理想，但講得明、預測得到，而且冇資料靜靜雞消失。

- [ ] **Step 1: `Share.tsx` 加救援入口**

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

    /*
      ⚠ 兩樣嘢一定要做，同 Live.tsx 嗰邊一模一樣：

      1. **驗過先存。** `store.save` 唔會驗，但下次 `readAll()` 會行
         `parseTournament`，parse 唔到就靜靜雞丟走成場賽事。即係一份爛資料
         會令你啱啱救返嚟嗰場賽事無聲無息消失。

      2. **砌返個 `live`。** 張 sheet 上面嗰份 `live` 永遠係 null（推之前剝走咗），
         照單全收嘅話你救返嚟嗰場賽事係「冇分享」嘅 —— 收唔返個位、
         分享頁又叫你由頭設定過，成條救援路等於白行。
    */
    let clean: Tournament
    try {
      clean = parseTournament(r.t)
    } catch {
      setErr('張 sheet 上面嗰份資料讀唔明，可能俾人手改過。')
      return
    }

    rememberSheet(scriptId, token.trim())
    store.save({
      ...clean,
      live: { scriptId, edit: token.trim(), view: r.view ?? '' },
    })
    location.hash = `#/t/${clean.id}`
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

`Share.tsx` 頂部要加 `import { store } from '../storage/browserStore'`、`import { parseTournament } from '../storage/storage'`、同埋 `import type { Tournament } from '../engine/types'`。

CSS：

```css
.recover summary {
  cursor: pointer;
  color: var(--ink-soft);
  font-size: var(--step--1);
  font-variation-settings: 'wdth' 90, 'wght' 650;
}
```

- [ ] **Step 2: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/Share.tsx src/ui/styles/app.css
git commit -m "救援路：部機冇咗、只要張 sheet 仲喺，就接得返場賽事"
```

---

### Task 11: Contract test + README

**Files:**
- Create: `src/live/contract.test.ts`
- Modify: `package.json`（**唔使掂 `vite.config.ts`**，見 Step 2）
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

    const init = await admin.init(edit, view, { ...t('合約測試'), live: null })
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

  /**
   * 個安全性重點：**觀眾攞唔到任何 token**。
   *
   * 兩重保險都要驗 —— 推上去嗰份 `live` 剝走咗（客戶端做），
   * 而段 script 個 `view` field 淨係派俾 edit（server 做）。
   * 呢個係唯一自動驗到呢件事嘅地方，唔好淨係靠人手清單。
   */
  it('觀眾攞唔到任何 token', async () => {
    const admin = createClient(SCRIPT, edit)
    await admin.claim('devA', true)
    await admin.push({ ...t('保安測試'), live: { scriptId: SCRIPT, edit, view } }, 'devA')

    const asViewer = await createClient(SCRIPT, view).get(null)
    expect(asViewer.ok).toBe(true)
    expect(asViewer.ok && asViewer.view).toBeUndefined() // 段 script 唔派
    expect(asViewer.ok && asViewer.t?.live).toBeNull() // 客戶端剝走咗

    const asAdmin = await admin.get(null)
    expect(asAdmin.ok && asAdmin.view).toBe(view) // edit 就派得
  }, 60_000)

  /**
   * 分段位切中一個 emoji（兩個 code unit）。
   *
   * `slice` 切開再接返理論上原樣，但呢一步係經 Google Sheets 存過一轉 ——
   * 佢有冇動過一隻孤兒 surrogate，只有打真嘢先知。
   */
  it('emoji 啱啱跨過分段位都唔會爛', async () => {
    const admin = createClient(SCRIPT, edit)
    await admin.claim('devA', true)
    // 40,000 係段 script 個 CHUNK_SIZE。個 emoji 擺喺個位度跨界。
    const name = 'x'.repeat(39_999) + '🌀' + 'y'.repeat(10)
    expect((await admin.push({ ...t(name), live: null }, 'devA')).ok).toBe(true)
    const got = await admin.get(null)
    expect(got.ok && got.t?.name).toBe(name)
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

**`vite.config.ts` 唔好改。**

好易諗住要喺 `test.exclude` 度加 `'**/contract.test.ts'`，等 `npm test` 唔會打真
server。**咁做會令 `npm run test:live` 跑零個測試** —— vitest 嗰啲位置參數係喺
include／exclude 篩剩嘅檔案入面再過濾，唔係繞過 exclude。結果係
「No test files found」，exit 1，連呢個 task 自己嗰步驗證都過唔到。

而且冇必要：`describe.skipIf(SCRIPT === '')` 已經令 `npm test` 喺冇設 env var
嗰陣完全唔會打真 server。

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
git add src/live/contract.test.ts package.json README.md
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
- [ ] **打開觀眾嗰個 GET 嘅 response，確認冇任何 `edit-` 開頭嘅 token**
- [ ] 換場（同一張 sheet 擺第二場賽事）行得通，而且會問你確認
- [ ] 部機個鐘撥快 10 分鐘，入分位仍然用得（時鐘冇撈埋一齊）
