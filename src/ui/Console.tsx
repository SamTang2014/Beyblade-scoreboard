import { useEffect, useRef, useState } from 'react'
import { useTournament } from '../storage/browserStore'
import { inPlayOrder } from '../engine/schedule'
import {
  FINISH_HINT,
  FINISH_LABEL,
  FINISH_ORDER,
  FINISH_POINTS,
  MATCH_TARGET,
  matchScore,
  matchWinnerId,
} from '../engine/rules'
import { completedCount } from '../engine/standings'
import { downloadJson } from '../lib/download'
import { store } from '../storage/browserStore'
import { TopBar } from './components/TopBar'
import { NotFound } from './Setup'
import type { FinishType, Match, Tournament } from '../engine/types'

export function Console({ id, matchId = null }: { id: string; matchId?: string | null }) {
  const { tournament, update, error } = useTournament(id)

  if (tournament === null) return <NotFound />
  if (tournament.matches.length === 0) return <NeedsSchedule id={id} name={tournament.name} />

  return (
    <ConsoleBody id={id} matchId={matchId} tournament={tournament} update={update} error={error} />
  )
}

/** 分開一層，等 hook 唔使排喺 early return 後面。 */
function ConsoleBody({
  id,
  matchId,
  tournament,
  update,
  error,
}: {
  id: string
  matchId: string | null
  tournament: Tournament
  update: (change: (t: Tournament) => Tournament) => void
  error: string | null
}) {
  const [focusId, setFocusId] = useState<string | null>(matchId)
  const onwardRef = useRef<HTMLButtonElement>(null)

  const order = inPlayOrder(tournament.matches)
  const firstOpen = order.find((m) => matchWinnerId(m) === null) ?? null
  const match = order.find((m) => m.id === focusId) ?? firstOpen ?? order[order.length - 1]!
  const nameOf = (pid: string) =>
    tournament.players.find((p) => p.id === pid)?.name ?? '（唔見咗嘅選手）'

  const score = matchScore(match)
  const winnerId = matchWinnerId(match)
  const position = order.findIndex((m) => m.id === match.id) + 1

  function record(winner: string, finish: FinishType) {
    // 釘住呢場。唔釘嘅話一夠 4 分就即刻跳咗去下一場，
    // 主持人連邊個贏都未見到。
    setFocusId(match.id)
    update((t) => ({
      ...t,
      matches: t.matches.map((m) =>
        m.id === match.id ? { ...m, rounds: [...m.rounds, { winnerId: winner, finish }] } : m,
      ),
    }))
  }

  function undo() {
    update((t) => ({
      ...t,
      matches: t.matches.map((m) => (m.id === match.id ? { ...m, rounds: m.rounds.slice(0, -1) } : m)),
    }))
  }

  function nextMatch() {
    const remaining = order.filter((m) => m.id !== match.id && matchWinnerId(m) === null)
    setFocusId(remaining.length > 0 ? remaining[0]!.id : null)
  }

  const upcoming = order.find((m) => m.id !== match.id && matchWinnerId(m) === null) ?? null
  const done = completedCount(tournament.matches)
  const allDone = done === tournament.matches.length

  // 撳低嗰粒入分掣一贏就變 disabled，鍵盤焦點會跌返落 body。搬去「落一場」。
  useEffect(() => {
    if (winnerId !== null) onwardRef.current?.focus()
  }, [winnerId, match.id])

  return (
    <>
      <TopBar id={id} name={tournament.name || '未命名賽事'} current="console" />

      <div className="console">
        <div className="console__head">
          <span className="u-eyebrow">
            第 {match.round} 輪 · 全場第 {position} 場
          </span>
          <span className="u-eyebrow u-tab">
            打咗 {done}/{tournament.matches.length}
          </span>
          {/* 常駐。資料淨係喺呢部機，備份要隨時撳到，唔可以等打完先出現。 */}
          <button
            className="btn btn--quiet btn--tight"
            onClick={() => downloadJson(tournament.name, store.exportJson(tournament.id))}
          >
            備份
          </button>
        </div>

        <div className="arena">
          <div className="arena__wash" aria-hidden="true" />
          <div className="arena__seam" aria-hidden="true" />

          <Side
            tone="blue"
            label="藍邊"
            name={nameOf(match.aId)}
            score={score.a}
            rounds={match.rounds}
            playerId={match.aId}
            locked={winnerId !== null}
            onRecord={record}
          />
          <Side
            tone="red"
            label="紅邊"
            name={nameOf(match.bId)}
            score={score.b}
            rounds={match.rounds}
            playerId={match.bId}
            locked={winnerId !== null}
            onRecord={record}
          />
        </div>

        {error !== null && (
          <p className="note note--bad" role="alert">
            <span>⚠</span>
            <span>{error}</span>
          </p>
        )}

        {winnerId !== null ? (
          /* role="status" 令贏咗嗰下讀屏器會讀出邊個贏、幾比幾。
             撳低嗰粒掣一贏就變 disabled，鍵盤焦點會跌返落 body，
             所以要主動搬去「落一場」。 */
          <div
            className={`verdict pop ${winnerId === match.aId ? 'verdict--blue' : 'verdict--red'}`}
            role="status"
          >
            <div>
              <span className="u-eyebrow">呢場贏咗</span>
              <div className="verdict__who">{nameOf(winnerId)}</div>
              <span className="u-eyebrow u-tab">
                {score.a} — {score.b}
              </span>
            </div>
            <div className="btnrow">
              <button className="btn chamfer" onClick={undo}>
                撳返轉頭
              </button>
              {upcoming !== null ? (
                <button
                  ref={onwardRef}
                  className="btn btn--primary btn--big chamfer"
                  onClick={nextMatch}
                >
                  落一場
                </button>
              ) : allDone ? (
                <a className="btn btn--primary btn--big chamfer" href={`#/t/${id}/table`}>
                  睇最終排名
                </a>
              ) : null}
            </div>
            {allDone && <FinishedNote tournament={tournament} />}
          </div>
        ) : (
          <div className="console__foot">
            <button className="btn btn--quiet" onClick={undo} disabled={match.rounds.length === 0}>
              撳返轉頭
            </button>
            <span className="nextup">
              {upcoming === null ? (
                '打完呢場就完晒'
              ) : (
                <>
                  下一場：<b>{nameOf(upcoming.aId)}</b> 打 <b>{nameOf(upcoming.bId)}</b>
                </>
              )}
            </span>
          </div>
        )}
      </div>
    </>
  )
}

function Side({
  tone,
  label,
  name,
  score,
  rounds,
  playerId,
  locked,
  onRecord,
}: {
  tone: 'blue' | 'red'
  label: string
  name: string
  score: number
  rounds: Match['rounds']
  playerId: string
  locked: boolean
  onRecord: (winnerId: string, finish: FinishType) => void
}) {
  const togo = Math.max(0, MATCH_TARGET - score)

  return (
    <div className={`side side--${tone}`}>
      <div className="side__stat">
        <span className="u-eyebrow side__eyebrow">{label}</span>
        <h2 className="side__name">{name}</h2>
        <div className="side__score u-tab">{score}</div>
        <div className="side__togo">{togo === 0 ? '贏咗' : `仲爭 ${togo} 分`}</div>

        {/* 逐 round 嘅歷史：亮起嗰粒就係呢邊贏嗰 round。 */}
        <div className="pips" aria-hidden="true">
          {rounds.map((r, i) => (
            <span key={i} className={r.winnerId === playerId ? 'pip pip--won' : 'pip'} />
          ))}
        </div>
      </div>

      <div className="finishes">
        {FINISH_ORDER.map((finish) => (
          <button
            key={finish}
            className="finishbtn chamfer-sm"
            disabled={locked}
            onClick={() => onRecord(playerId, finish)}
          >
            <span className="finishbtn__pts">+{FINISH_POINTS[finish]}</span>
            <span className="finishbtn__body">
              <span className="finishbtn__label">{FINISH_LABEL[finish]}</span>
              <span className="finishbtn__hint">{FINISH_HINT[finish]}</span>
            </span>
            <span className="sr-only">
              {name}以{FINISH_LABEL[finish]}贏呢個 round，加 {FINISH_POINTS[finish]} 分
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function FinishedNote({ tournament }: { tournament: Tournament }) {
  return (
    <p className="note">
      <span>·</span>
      <span>
        全部場次打完喇。啲資料淨係喺呢部機呢個瀏覽器，
        <button
          className="btn btn--quiet"
          onClick={() => downloadJson(tournament.name, store.exportJson(tournament.id))}
        >
          down 低備份
        </button>
        保住佢。
      </span>
    </p>
  )
}

function NeedsSchedule({ id, name }: { id: string; name: string }) {
  return (
    <>
      <TopBar id={id} name={name || '未命名賽事'} current="console" />
      <div className="page">
        <p className="empty">
          仲未排賽程。
          <br />
          <a href={`#/t/${id}/setup`}>去加選手同排賽程</a>
        </p>
      </div>
    </>
  )
}
