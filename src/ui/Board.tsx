import { useEffect } from 'react'
import { useTournament } from '../storage/browserStore'
import { inPlayOrder } from '../engine/schedule'
import { matchScore, matchWinnerId } from '../engine/rules'
import { computeStandings, isTournamentComplete } from '../engine/standings'
import { bracketChampion } from '../engine/bracket'
import { poolLabel, poolStandings } from '../engine/pools'
import { standingsTies } from '../engine/tournament'
import { TiebreakResult } from './components/TiebreakResult'
import { Standings } from './components/Standings'
import { NotFound } from './Setup'
import type { StandingRow, Tournament } from '../engine/types'

/**
 * 電視模式：接電視／全螢幕俾一班人企喺度睇。
 * 燈熄咗 —— 深色底，因為電視多數擺喺場地暗啲嘅角落，
 * 而主持人部機仍然係淺色（商場光猛）。同一個 token 系統，倒轉一次。
 */
export function Board({ id }: { id: string }) {
  const { tournament } = useTournament(id)

  useEffect(() => {
    document.body.classList.add('is-dark')
    return () => document.body.classList.remove('is-dark')
  }, [])

  if (tournament === null) return <NotFound />

  const order = inPlayOrder(tournament.matches)
  const current = order.find((m) => matchWinnerId(m) === null) ?? null
  const rows = computeStandings(tournament.players, tournament.matches, tournament.headToHead)
  const complete = isTournamentComplete(tournament.matches)
  const nameOf = (pid: string | null) =>
    pid === null ? '等緊上場' : (tournament.players.find((p) => p.id === pid)?.name ?? '？')
  const pools =
    tournament.mode === 'poolsThenKnockout' && tournament.poolCount !== null
      ? poolStandings(
          tournament.players,
          tournament.matches,
          tournament.poolCount,
          tournament.headToHead,
        )
      : null
  const champText = complete ? championLine(tournament, rows) : ''
  const ties = standingsTies(tournament)

  /**
   * 打緊嗰場係加賽嘅話，喺個大比分上面講明。
   *
   * 電視係打俾企喺度睇嘅人，唔講嘅話佢哋淨係見到「呢兩個人頭先明明打過」，
   * 唔知係加賽 —— 反而以為個 app 出錯。
   */
  const currentTie =
    current !== null && current.stage === 'tiebreak' && current.aId !== null
      ? (tournament.players.find((p) => p.id === current.aId)?.pool ?? null)
      : null

  return (
    <div className="board">
      {current !== null ? (
        <section className="board__now chamfer">
          {currentTie !== null && (
            <div className="board__tag u-eyebrow">
              {poolLabel(currentTie)} 組加賽 · 分唔開，再打過
            </div>
          )}
          <div className="board__who board__who--blue">{nameOf(current.aId)}</div>
          <div className="board__score u-tab">
            {matchScore(current).a} — {matchScore(current).b}
          </div>
          <div className="board__who board__who--red">{nameOf(current.bId)}</div>
        </section>
      ) : (
        <section className="board__now chamfer" style={{ gridTemplateColumns: '1fr' }}>
          <div className="board__who" style={{ textAlign: 'center' }}>
            {!complete
              ? '仲未排賽程'
              : champText !== ''
                ? `打完喇 · 冠軍 ${champText}`
                : '打完喇 · 等緊砌籤表'}
          </div>
        </section>
      )}

      <div className="board__grid">
        <section>
          <h2 className="u-eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
            排名榜
          </h2>
          {pools === null ? (
            <Standings rows={rows} compact />
          ) : (
            <div className="poolgrid">
              {pools.map((table) => (
                <div key={table.pool}>
                  <h3 className="u-eyebrow">{poolLabel(table.pool)} 組</h3>
                  <Standings
                    rows={table.rows}
                    compact
                    cutAfter={tournament.advancePerPool ?? undefined}
                  />
                  {(() => {
                    const tie = ties.find((t) => t.key === table.pool)
                    // 電視上面撳唔到嘢，所以唔傳 matchHref。
                    return tie === undefined || tie.matches.length === 0 ? null : (
                      <TiebreakResult tie={tie} players={tournament.players} />
                    )
                  })()}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="u-eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
            跟住落嚟
          </h2>
          <div>
            {order
              .filter((m) => matchWinnerId(m) === null && m.id !== current?.id)
              .slice(0, 6)
              .map((m) => (
                <div className="mrow" key={m.id}>
                  <span className="mrow__side">{nameOf(m.aId)}</span>
                  <span className="mrow__score">對</span>
                  <span className="mrow__side mrow__side--b">{nameOf(m.bId)}</span>
                </div>
              ))}
            {order.filter((m) => matchWinnerId(m) === null).length <= 1 && (
              <p className="empty">冇下一場喇。</p>
            )}
          </div>
        </section>
      </div>

      <a className="btn btn--quiet board__exit" href={`#/t/${id}`}>
        走返出去入分
      </a>
    </div>
  )
}

/**
 * 電視上面寫邊個冠軍。
 *
 * 有籤表嘅模式睇籤表冠軍；純循環先睇排名第 1，而第一位可以有幾個人並列 ——
 * 原本淨係讀 rows[0]，即係喺成班人面前照住個大螢幕，用名字排序隨機捧咗一個做冠軍。
 */
function championLine(tournament: Tournament, rows: StandingRow[]): string {
  if (tournament.mode !== 'roundRobin') {
    const id = bracketChampion(tournament.matches)
    return id === null ? '' : (tournament.players.find((p) => p.id === id)?.name ?? '')
  }
  const top = rows.filter((r) => r.rank === 1)
  if (top.length === 0) return ''
  if (top.length === 1) return top[0]!.name
  return `${top.map((r) => r.name).join('、')}（並列）`
}
