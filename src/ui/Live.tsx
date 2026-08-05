import { useEffect, useMemo, useState } from 'react'
import { decodePayload } from '../live/payload'
import { createClient } from '../live/remote'
import { nextDelay, usePoll } from '../live/usePoll'
import { parseTournament } from '../storage/storage'
import { Board } from './Board'
import type { Tournament } from '../engine/types'

/**
 * 由分享 link 入嚟。
 *
 * 觀眾模式嘅資料**淨係喺記憶體** —— 唔會寫落佢部機嘅 localStorage，
 * 唔會污染佢自己嗰個賽事列表。佢淨係嚟睇場波，唔係要收藏。
 */

type Mode =
  /** `fails` = 試咗幾多次都連唔到。0 = 第一次，仲未算有問題。 */
  | { kind: 'loading'; fails: number }
  | { kind: 'bad' }
  | { kind: 'view' }

export function Live({ payload }: { payload: string }) {
  const parsed = useMemo(() => decodePayload(payload), [payload])
  const client = useMemo(() => (parsed === null ? null : createClient(parsed.s, parsed.k)), [parsed])

  const [mode, setMode] = useState<Mode>({ kind: 'loading', fails: 0 })
  const [t, setT] = useState<Tournament | null>(null)
  /** 撳「再試」就 +1，令個 effect 重跑。 */
  const [tryAgain, setTryAgain] = useState(0)

  useEffect(() => {
    if (parsed === null || client === null) {
      setMode({ kind: 'bad' })
      return
    }
    let stopped = false
    let fails = 0
    let timer: number | null = null

    const attempt = (): void =>
      void client.get(null).then((r) => {
        if (stopped) return

        if (!r.ok) {
          /*
            分開「條 link 真係爛」同「一時三刻連唔到」。

            `bad-token` = 條 link 真係唔啱（或者張 sheet 換咗場）—— 等幾耐都冇用。
            `network` / `busy`（段 script 攞唔到鎖）/ `bad-response`（Google 間唔中
            派一版 HTML 錯誤頁）全部係一時嘅，要重試。

            ⚠ 呢度一定要自己重試。`usePoll` 淨係喺下面 `LiveBoard` 入面行，
            而 `LiveBoard` 要 mode 變咗 'view' 先 render —— 即係第一次 GET 失敗
            就永遠冇人再試，個畫面會凍死喺「拉緊場賽事…」。
          */
          if (r.err === 'bad-token' || r.err === 'bad-data') {
            setMode({ kind: 'bad' })
            return
          }
          fails += 1
          // 重試要**睇得見**。靜靜雞轉圈嘅話，用家望住「拉緊…」永遠唔知
          // 係慢、係壞、定係自己條 link 有問題 —— 凍死同無聲重試一樣咁差。
          setMode({ kind: 'loading', fails })
          timer = window.setTimeout(attempt, nextDelay(fails))
          return
        }

        if (r.t === null) {
          setMode({ kind: 'bad' })
          return
        }

        /*
          ⚠ 遠端返嚟嘅嘢係外面資料，一定要驗過先用。

          `store.save` 唔會驗；而 `readAll()` 下次讀返出嚟嗰陣會行
          `parseTournament`，parse 唔到就**靜靜雞丟走成場賽事**。
          觀眾模式雖然唔會存落 localStorage，但驗一驗都要 —— 唔係
          畫面會用住一份唔知咩形狀嘅嘢去 render。
        */
        try {
          setT(parseTournament(r.t))
        } catch {
          setMode({ kind: 'bad' })
          return
        }
        setMode({ kind: 'view' })
      })

    attempt()

    return () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
    }
    // `tryAgain` 落 deps —— 撳「再試」就重跑成個 effect。
  }, [parsed, client, tryAgain])

  if (mode.kind === 'bad') return <BadLink />
  if (mode.kind === 'view' && t !== null && client !== null) {
    return <LiveBoard client={client} t={t} onData={setT} />
  }
  return (
    <Waiting
      fails={mode.kind === 'loading' ? mode.fails : 0}
      onRetry={() => {
        setMode({ kind: 'loading', fails: 0 })
        setTryAgain((n) => n + 1)
      }}
    />
  )
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
  const { state, fails, refresh } = usePoll(client, (next) => onData(next))

  if (state === 'bad-token') return <BadLink />

  return (
    <>
      <Board tournament={t} />
      {/*
        個表照留喺度（最後拉到嗰份好過乜都冇），但要講明佢有幾舊、
        重試緊、同埋俾人自己撳一下。
      */}
      {state !== 'live' && state !== 'loading' && (
        <p className="note note--bad livebar" role="status">
          <span>⚠</span>
          <span>
            {state === 'offline' ? '連唔到' : '出咗啲問題'}，重試緊…
            {fails >= 3 && `（已試 ${fails} 次，個表可能唔係最新）`}
          </span>
          <button className="btn btn--tight" onClick={refresh}>
            再試
          </button>
        </p>
      )}
    </>
  )
}

/**
 * 等緊。
 *
 * 頭兩次失敗當佢係「慢」，唔好嚇親人。第三次起就要講明重試緊、試咗幾多次，
 * 而且要有粒掣俾人自己再試 —— 唔好淨係轉圈等佢自己好返。
 *
 * 試耐咗仲要講埋最常見嘅原因 —— 但要講**去到呢一步先可能發生**嗰啲。
 * 「未開直播」同「換咗場」兩樣都係 `bad-token`，即刻出 BadLink，
 * 根本入唔到呢條重試路。
 */
function Waiting({ fails, onRetry }: { fails: number; onRetry: () => void }) {
  if (fails < 3) {
    return (
      <div className="page stack">
        <p className="empty">拉緊場賽事…</p>
      </div>
    )
  }

  return (
    <div className="page stack">
      <p className="empty">連唔到，重試緊…（已試 {fails} 次）</p>
      {fails >= 8 && (
        <p className="note">
          <span>·</span>
          <span>
            檢查下部機有冇網絡。都連唔到嘅話，可能係主辦條 script 網址俾人刪咗 ——
            搵返佢問問。
          </span>
        </p>
      )}
      <button className="btn chamfer" onClick={onRetry}>
        再試
      </button>
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
