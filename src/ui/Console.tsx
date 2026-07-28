import { useEffect, useRef, useState } from 'react'
import { useTournament } from '../storage/browserStore'
import { inPlayOrder } from '../engine/schedule'
import {
  FINISH_HINT,
  FINISH_LABEL,
  FINISH_ORDER,
  FINISH_POINTS,
  MATCH_TARGET,
  isReady,
  matchScore,
  matchWinnerId,
} from '../engine/rules'
import { completedCount } from '../engine/standings'
import { bracketRoundName, clearDownstream, downstreamWithScores, propagate, totalBracketRounds } from '../engine/bracket'
import { groupStageComplete, hasBracket, nextPlayable } from '../engine/tournament'
import { downloadJson } from '../lib/download'
import { store } from '../storage/browserStore'
import { GoShotButton } from './components/GoShot'
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
  const [armedEdit, setArmedEdit] = useState(false)
  const onwardRef = useRef<HTMLButtonElement>(null)

  const order = inPlayOrder(tournament.matches)
  // 淘汰賽後面幾輪一開始就係「等緊上游」，揀到嗰啲嘅話個控制台會 show
  // 一場根本打唔到嘅比賽，所以要跳過。
  const firstOpen = nextPlayable(order) ?? order.find((m) => matchWinnerId(m) === null) ?? null
  const match = order.find((m) => m.id === focusId) ?? firstOpen ?? order[order.length - 1]!
  // 淘汰賽嘅對手可以未定 —— 等緊上游場次出結果。
  const nameOf = (pid: string | null) =>
    pid === null ? '等緊上場' : (tournament.players.find((p) => p.id === pid)?.name ?? '（唔見咗嘅選手）')

  const score = matchScore(match)
  const winnerId = matchWinnerId(match)
  const position = order.findIndex((m) => m.id === match.id) + 1

  /**
   * 改完一場之後收尾：淘汰賽要清走下游已入嘅分再重新推進，
   * 唔係個 4-2 會黐咗喺一個唔存在嘅對戰上面。
   */
  function applyEdit(t: Tournament, changed: Match[]): Match[] {
    if (!hasBracket(t)) return changed
    return clearDownstream(propagate(changed), match.id)
  }

  function record(winner: string, finish: FinishType) {
    // 釘住呢場。唔釘嘅話一夠 4 分就即刻跳咗去下一場，
    // 主持人連邊個贏都未見到。
    setFocusId(match.id)
    setArmedEdit(false)
    update((t) => ({
      ...t,
      matches: applyEdit(
        t,
        t.matches.map((m) =>
          m.id === match.id ? { ...m, rounds: [...m.rounds, { winnerId: winner, finish }] } : m,
        ),
      ),
    }))
  }

  function undo() {
    setArmedEdit(false)
    update((t) => ({
      ...t,
      matches: applyEdit(
        t,
        t.matches.map((m) => (m.id === match.id ? { ...m, rounds: m.rounds.slice(0, -1) } : m)),
      ),
    }))
  }

  function nextMatch() {
    const remaining = order.filter((m) => m.id !== match.id && matchWinnerId(m) === null)
    setFocusId(remaining.length > 0 ? remaining[0]!.id : null)
  }

  // 淘汰賽講「決賽」「四強」，唔講「第 3 輪」—— 階段先係人記得住嗰樣嘢。
  const stageLabel =
    match.stage === 'bracket'
      ? `${bracketRoundName(match.round, totalBracketRounds(tournament.matches))} · 第 ${match.order} 場`
      : `第 ${match.round} 輪 · 全場第 ${position} 場`

  // 改呢場會清走後面幾多場已經打完嘅。
  const willClear = downstreamWithScores(tournament.matches, match.id)
  const needsConfirm = willClear.length > 0 && !armedEdit

  const upcoming = order.find((m) => m.id !== match.id && matchWinnerId(m) === null) ?? null
  const done = completedCount(tournament.matches)
  const allDone = done === tournament.matches.length
  // 循環打完但籤表未砌 —— 呢個唔算打完，仲有淘汰賽要打。
  const cutPending =
    tournament.mode === 'groupThenKnockout' && groupStageComplete(tournament) && !hasBracket(tournament)

  // 撳低嗰粒入分掣一贏就變 disabled，鍵盤焦點會跌返落 body。搬去「落一場」。
  useEffect(() => {
    if (winnerId !== null) onwardRef.current?.focus()
  }, [winnerId, match.id])

  return (
    <>
      <TopBar
        id={id}
        name={tournament.name || '未命名賽事'}
        current="console"
        mode={tournament.mode}
      />

      <div className="console">
        <div className="console__head">
          <span className="u-eyebrow">{stageLabel}</span>
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

        {needsConfirm && (
          <p className="note note--bad" role="alert">
            <span>⚠</span>
            <span>
              呢場後面已經有 {willClear.length} 場打完咗。改呢場嘅話，嗰 {willClear.length}{' '}
              場要重新打過。
            </span>
            <button className="btn btn--tight" onClick={() => setArmedEdit(true)}>
              知道，照改
            </button>
          </p>
        )}

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
            locked={winnerId !== null || needsConfirm}
            onRecord={record}
          />
          <Side
            tone="red"
            label="紅邊"
            name={nameOf(match.bId)}
            score={score.b}
            rounds={match.rounds}
            playerId={match.bId}
            locked={winnerId !== null || needsConfirm}
            onRecord={record}
          />
        </div>

        {/* 呢場打完咗就冇嘢好開，等緊上場對手嗰啲仲未知邊個打邊個。 */}
        {winnerId === null && isReady(match) && <GoShotButton />}

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
              <button className="btn chamfer" onClick={undo} disabled={needsConfirm}>
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
              ) : cutPending ? (
                <a className="btn btn--primary btn--big chamfer" href={`#/t/${id}/bracket`}>
                  去砌籤表
                </a>
              ) : allDone ? (
                <a className="btn btn--primary btn--big chamfer" href={`#/t/${id}/table`}>
                  {tournament.mode === 'knockout' ? '睇籤表' : '睇最終排名'}
                </a>
              ) : null}
            </div>
            {allDone && <FinishedNote tournament={tournament} />}
          </div>
        ) : (
          <div className="console__foot">
            <button
              className="btn btn--quiet"
              onClick={undo}
              disabled={match.rounds.length === 0 || needsConfirm}
            >
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
  playerId: string | null
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
            disabled={locked || playerId === null}
            onClick={() => playerId !== null && onRecord(playerId, finish)}
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
