import { useState } from 'react'
import { createClient } from '../live/remote'
import { encodePayload, parseScriptId, scriptUrl } from '../live/payload'
import { newToken, rememberSheet, savedSheet } from '../live/device'
import { store } from '../storage/browserStore'
import { parseTournament } from '../storage/storage'
import { copyText } from '../lib/clipboard'
import type { Tournament } from '../engine/types'
/*
  段 script 嘅原文，build 嗰陣讀入嚟做字串。

  **一定要由個真檔案讀，唔可以抄一份落嚟。** 抄咗就會分叉：改咗
  `apps-script/Code.gs` 但個 app 仲派緊個舊版本，而冇任何嘢會提你。

  代價係 bundle 大咗約 9 KB。值 —— 用 GitHub Pages 開個 app 嘅人根本
  掂唔到個 repo 入面嘅檔，冇呢個佢就要自己去 GitHub 揾。
*/
import CODE from '../../apps-script/Code.gs?raw'

/**
 * 「認真」場嘅設定。
 *
 * **佢係一段 component，唔係一頁。** 冇 TopBar、冇 `.page` wrapper、
 * 唔會自己去 `useTournament` —— 由 `Setup.tsx` 傳 `tournament` 同 `update` 入嚟。
 * 咁樣先入得落開賽設定嗰個表單度，唔會變成另一個「地方」。
 *
 * 「認真」嘅定義就係「你要畀一張 Google Sheet」—— 唔係我哋加難度，係個結構
 * 本身擺喺度：冇張 sheet 就冇地方擺資料，冇地方擺就分享唔到。
 */

/** 條完整 link，可以直接 send 俾人。 */
function linkFor(scriptId: string, token: string): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#/live/${encodePayload({ s: scriptId, k: token })}`
}

export function ShareSetup({
  tournament,
  update,
}: {
  tournament: Tournament
  update: (change: (t: Tournament) => Tournament) => void
}) {
  const [url, setUrl] = useState(() => {
    const saved = savedSheet()
    return saved === null ? '' : scriptUrl(saved.scriptId)
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const live = tournament.live

  async function start(): Promise<void> {
    const scriptId = parseScriptId(url)
    if (scriptId === null) {
      setErr(
        '條網址唔似 Apps Script 個 deployment 網址。應該係 https://script.google.com/macros/s/…/exec 咁樣。',
      )
      return
    }

    /*
      認證用邊個 token？

      張 sheet 已經有 token 嘅話，段 script 要你畀返**現有嗰個** edit token
      先肯換場。呢場賽事本身 `live` 係 null（啱啱先開），所以要由 `savedSheet()`
      攞返 —— 即係「上次用呢張 sheet 嗰陣個 token」。

      ⚠ 唔可以用一個啱啱生出嚟嘅隨機 token 去認證 —— 同張 sheet 上面嗰個對唔上，
      段 script 會永遠答 already-init，換場由頭到尾做唔到。
    */
    const prev = savedSheet()
    const reusing = prev !== null && prev.scriptId === scriptId

    if (reusing && live === null) {
      const yes = confirm(
        '呢張 sheet 而家擺緊第二場賽事。換做呢場嘅話，舊嗰兩條 link 即刻會失效。要換？',
      )
      if (!yes) return
    }

    setBusy(true)
    setErr(null)
    const edit = newToken('edit')
    const view = newToken('view')
    const auth = live?.edit ?? prev?.edit ?? edit
    // ⚠ 推之前一定要剝走 live —— 入面有兩個 token，推咗上去就會經 doGet
    // 交俾觀眾，任何人讀一讀 JSON 就攞到入分權。
    const r = await createClient(scriptId, auth).init(edit, view, { ...tournament, live: null })
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

  return live === null ? (
    <>
      <SetupSteps url={url} onUrl={setUrl} busy={busy} err={err} onStart={() => void start()} />
      <Recover />
    </>
  ) : (
    <Links edit={linkFor(live.scriptId, live.edit)} view={linkFor(live.scriptId, live.view)} />
  )
}

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
         照單全收嘅話你救返嚟嗰場賽事係「玩下場」—— 收唔返個位、
         設定頁又叫你由頭嚟過，成條救援路等於白行。
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
        <label className="field__label" htmlFor="recoverurl">
          段 script 條網址
        </label>
        <input
          id="recoverurl"
          className="input chamfer-sm"
          value={url}
          placeholder="https://script.google.com/macros/s/…/exec"
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="recovertoken">
          edit token（張 sheet B1 格）
        </label>
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

/** 段 script 嘅原文 + 一粒 copy 掣。攤開睇得，唔使信我哋。 */
function CopyCode() {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')

  return (
    <div className="codebox">
      <div className="btnrow">
        <button
          className="btn btn--tight chamfer-sm"
          onClick={() => {
            void copyText(CODE).then((ok) => {
              setState(ok ? 'ok' : 'fail')
              if (ok) setTimeout(() => setState('idle'), 2000)
            })
          }}
        >
          {state === 'ok' ? 'copy 咗 ✓' : 'copy 段 code'}
        </button>
        <span className="codebox__size">{Math.round(CODE.length / 1024)} KB</span>
      </div>
      {state === 'fail' && (
        <p className="note note--bad">
          <span>⚠</span>
          <span>
            copy 唔到（plain HTTP 之下瀏覽器唔准）。攤開下面段 code，
            自己揀晒佢再 copy。
          </span>
        </p>
      )}
      <details>
        <summary>攤開睇段 code</summary>
        <pre className="codebox__pre">
          <code>{CODE}</code>
        </pre>
      </details>
    </div>
  )
}

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
        <span className="field__label">要一張你自己嘅 Google Sheet</span>
        <ol className="steps">
          <li>
            開一張新 Google Sheet。<b>唔好 share 俾任何人</b> —— 個 app 唔使佢 share 都讀到。
          </li>
          <li>Extensions → Apps Script</li>
          <li>
            蓋走原本嗰個 <code>myFunction</code>，貼段 code 落去：
            <CopyCode />
          </li>
          <li>
            Deploy → New deployment → 揀 <b>Web app</b>
          </li>
          <li>
            Execute as：<b>Me</b>　·　Who has access：<b>Anyone</b>
          </li>
          <li>Deploy → 授權 → copy 條網址，貼落下面</li>
        </ol>
        <p className="note">
          <span>·</span>
          <span>
            第 5 步兩個掣都要揀啱。Execute as 揀錯，段 script 掂唔到你張 sheet；Who has access
            揀錯，人哋撳條 link 會俾佢叫登入。
          </span>
        </p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="scripturl">
          段 script 條網址
        </label>
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
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="btnrow">
        <input
          className="input chamfer-sm"
          readOnly
          value={url}
          style={{ flex: 1 }}
          // copy 唔到嗰陣至少撳一下就揀晒佢。
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          className="btn chamfer-sm"
          onClick={() => {
            void copyText(url).then((ok) => {
              setState(ok ? 'ok' : 'fail')
              if (ok) setTimeout(() => setState('idle'), 1500)
            })
          }}
        >
          {state === 'ok' ? 'copy 咗' : 'copy'}
        </button>
      </div>
      <p className={state === 'fail' ? 'note note--bad' : 'note'}>
        <span>{state === 'fail' ? '⚠' : '·'}</span>
        <span>
          {state === 'fail'
            ? 'copy 唔到（plain HTTP 之下瀏覽器唔准）。撳一下上面條 link 就會揀晒，自己 copy。'
            : hint}
        </span>
      </p>
    </div>
  )
}
