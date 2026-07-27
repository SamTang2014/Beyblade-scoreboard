import { useEffect } from 'react'
import { useTournament } from '../storage/browserStore'
import { inPlayOrder } from '../engine/schedule'
import { matchScore, matchWinnerId } from '../engine/rules'
import { computeStandings, isTournamentComplete } from '../engine/standings'
import { Standings } from './components/Standings'
import { NotFound } from './Setup'

/**
 * 投屏模式：接電視／全螢幕俾一班人企喺度睇。
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
  const rows = computeStandings(tournament.players, tournament.matches)
  const complete = isTournamentComplete(tournament.matches)
  const nameOf = (pid: string) => tournament.players.find((p) => p.id === pid)?.name ?? '？'

  return (
    <div className="board">
      {current !== null ? (
        <section className="board__now chamfer">
          <div className="board__who board__who--blue">{nameOf(current.aId)}</div>
          <div className="board__score u-tab">
            {matchScore(current).a} — {matchScore(current).b}
          </div>
          <div className="board__who board__who--red">{nameOf(current.bId)}</div>
        </section>
      ) : (
        <section className="board__now chamfer" style={{ gridTemplateColumns: '1fr' }}>
          <div className="board__who" style={{ textAlign: 'center' }}>
            {complete ? `打完喇 · 冠軍 ${rows[0]?.name ?? ''}` : '仲未排賽程'}
          </div>
        </section>
      )}

      <div className="board__grid">
        <section>
          <h2 className="u-eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
            排名榜
          </h2>
          <Standings rows={rows} compact />
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
