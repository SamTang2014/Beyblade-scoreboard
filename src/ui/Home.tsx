import { useEffect, useState } from 'react'
import { store, storageIsPersistent } from '../storage/browserStore'
import { downloadJson, pickJsonFile } from '../lib/download'
import { go } from '../lib/router'
import { CircleDial } from './components/CircleDial'
import { totalRounds } from '../engine/schedule'
import { completedCount } from '../engine/standings'
import type { Player } from '../engine/types'
import type { TournamentSummary as Summary } from '../storage/storage'
import { ThemePicker } from './components/ThemePicker'

/** 主頁個轉盤要有嘢轉先睇得出，所以擺一組樣板名。 */
const DEMO: Player[] = ['阿明', '阿強', '阿華', '小美', '阿聰'].map((name, seat) => ({
  id: `demo${seat}`,
  name,
  seat,
  pool: null,
}))

export function Home() {
  const [list, setList] = useState<Summary[]>(() => store.list())
  const [message, setMessage] = useState<string | null>(null)
  const [round, setRound] = useState(1)

  // 轉一個圈俾人睇個賽程係點排出嚟，跟住停低，唔好轉唔停搞到人眼花。
  useEffect(() => {
    const laps = totalRounds(DEMO.length)
    if (round >= laps) return
    const timer = setTimeout(() => setRound((r) => r + 1), 900)
    return () => clearTimeout(timer)
  }, [round])

  function startNew() {
    try {
      const t = store.create('')
      go(`#/t/${t.id}/setup`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '開唔到新賽事。')
    }
  }

  async function importBackup() {
    const text = await pickJsonFile()
    if (text === null) return
    try {
      const added = store.importJson(text)
      setList(store.list())
      setMessage(`入返咗 ${added.length} 場賽事。`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '入唔到個檔案。')
    }
  }

  function backupAll() {
    if (list.length === 0) return
    downloadJson('全部賽事', store.exportJson())
    setMessage('備份檔已經 down 咗落去。')
  }

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1 className="hero__title">
            陀螺
            <br />
            計分板
          </h1>
          <p className="hero__lede">
            單循環，人人都要打過。圓周法排賽程，Beyblade X 計分，即場出排名。
          </p>
          <div className="hero__actions btnrow">
            <button className="btn btn--primary btn--big chamfer" onClick={startNew}>
              開場新賽事
            </button>
            <button className="btn btn--big chamfer" onClick={importBackup}>
              入返個備份
            </button>
          </div>
        </div>
        <CircleDial
          players={DEMO}
          round={round}
          caption="有圈嗰個位釘死，其餘順時針行一格"
        />
      </section>

      {!storageIsPersistent && (
        <p className="note note--bad">
          <span>⚠</span>
          <span>
            呢個瀏覽器唔俾存嘢（多數係無痕視窗）。而家照用得，但關咗個 tab
            就乜都冇晒。打完記得撳「down 低備份」。
          </span>
        </p>
      )}

      {message !== null && (
        <p className="note" role="status">
          <span>·</span>
          <span>{message}</span>
        </p>
      )}

      <section className="stack" style={{ marginTop: 'var(--sp-6)' }}>
        <div className="btnrow" style={{ alignItems: 'baseline' }}>
          <h2 className="u-eyebrow" style={{ flex: 1 }}>
            我啲賽事
          </h2>
          {list.length > 0 && (
            <button className="btn btn--quiet" onClick={backupAll}>
              down 低全部
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <p className="empty">仲未有賽事。撳上面「開場新賽事」開一場先。</p>
        ) : (
          <div className="tlist">
            {list.map((t) => (
              <TournamentCard
                key={t.id}
                summary={t}
                onDeleted={(name) => {
                  setList(store.list())
                  setMessage(`刪咗「${name || '未命名賽事'}」。`)
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="stack" style={{ marginTop: 'var(--sp-6)' }}>
        <ThemePicker />
      </section>
    </div>
  )
}

function TournamentCard({
  summary,
  onDeleted,
}: {
  summary: Summary
  onDeleted: (name: string) => void
}) {
  const [armed, setArmed] = useState(false)
  const t = store.get(summary.id)
  // 用「打完咗」而唔係「開咗波」，同排名版嗰個數一致。
  const done = t === null ? 0 : completedCount(t.matches)
  const pct = summary.matchCount === 0 ? 0 : (done / summary.matchCount) * 100
  const target = summary.matchCount === 0 ? `#/t/${summary.id}/setup` : `#/t/${summary.id}`

  return (
    <div className="tcard chamfer">
      <a className="tcard__main" href={target}>
        <div className="tcard__top">
          <span className="tcard__name">{summary.name || '未命名賽事'}</span>
          <span className="tcard__meta u-tab">{formatWhen(summary.updatedAt)}</span>
        </div>
        <div className="tcard__bar">
          <div className="tcard__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="tcard__foot u-tab">
          {summary.playerCount} 個人 ·{' '}
          {summary.matchCount === 0 ? '仲未排賽程' : `打咗 ${done} / ${summary.matchCount} 場`}
        </div>
      </a>

      {armed ? (
        /* 冇後端，刪咗係真係救唔返，所以確認嗰陣順手俾條路你先備份。 */
        <div className="tcard__confirm" role="group" aria-label={`刪除 ${summary.name}`}>
          <span className="tcard__warn">
            {done === 0
              ? '刪咗就冇㗎喇，救唔返。'
              : `打咗嘅 ${done} 場成績會一齊冇，救唔返。`}
          </span>
          <button
            className="btn btn--tight"
            onClick={() => downloadJson(summary.name, store.exportJson(summary.id))}
          >
            先 down 低
          </button>
          <button className="btn btn--quiet btn--tight" onClick={() => setArmed(false)}>
            算數
          </button>
          <button
            className="btn btn--danger btn--armed btn--tight"
            onClick={() => {
              store.remove(summary.id)
              onDeleted(summary.name)
            }}
          >
            真係刪
          </button>
        </div>
      ) : (
        <div className="tcard__actions">
          <button
            className="btn btn--danger btn--tight"
            onClick={() => setArmed(true)}
            aria-label={`刪除 ${summary.name || '未命名賽事'}`}
          >
            刪除
          </button>
        </div>
      )}
    </div>
  )
}

function formatWhen(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '啱啱'
  if (min < 60) return `${min} 分鐘前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 個鐘前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 日前`
  return new Date(ts).toLocaleDateString('zh-HK')
}
