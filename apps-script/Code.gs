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

/**
 * 剝走 `live` —— 入面有兩個 token。
 *
 * 客戶端推之前**應該**已經剝走咗，呢度係第二重保險。點解要兩重：剝走呢件事
 * 淨係喺客戶端做嘅話，一個寫錯咗嘅（或者惡意嘅）edit-token 客戶端，就可以
 * 把兩個 token 一次過發佈俾全部觀眾 —— 而唯一守住呢個性質嘅嘢喺佢部機度。
 *
 * 段 script 係唯一一個所有寫入都要行經嘅樽頸，所以呢條線放喺呢度先真係守得住。
 */
function stripLive_(t) {
  if (t !== null && typeof t === 'object') t.live = null
  return t
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
  // 同 push_ 一樣：冇 t 就唔好行落去。JSON.stringify(undefined) 返 undefined，
  // 落到 setValue 會掟錯，個 client 收到一版 HTML 錯誤頁，睇落似網絡問題。
  if (body.t === undefined || body.t === null) return reply_({ ok: false, err: 'bad-body' })

  // 版本要繼續行前，唔可以 reset 做 1 —— 換場之後，一個 `since` 啱啱係 1 嘅
  // 觀眾會以為「冇變」，望住舊畫面唔郁。
  var v = m.version + 1
  writeData_(sh, JSON.stringify(stripLive_(body.t)))
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
  writeData_(sh, JSON.stringify(stripLive_(body.t)))
  // 推嘢順手續期 —— 入分入得密就唔使等心跳。
  sh.getRange('B3:B5').setValues([[v], [who], [now + LEASE_MS]])
  putCache_({ edit: m.edit, view: m.view, version: v })
  return reply_({ ok: true, v: v })
}
