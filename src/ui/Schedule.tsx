import { useState } from 'react'
import { useTournament } from '../storage/browserStore'
import { byesInRound, inPlayOrder, totalRounds } from '../engine/schedule'
import { matchScore, matchStatus, matchWinnerId } from '../engine/rules'
import { TopBar } from './components/TopBar'
import { CircleDial } from './components/CircleDial'
import { NotFound } from './Setup'
import type { Match, Tournament } from '../engine/types'

export function Schedule({ id }: { id: string }) {
  const { tournament } = useTournament(id)
  const [shownRound, setShownRound] = useState(1)

  if (tournament === null) return <NotFound />

  const rounds = [...new Set(inPlayOrder(tournament.matches).map((m) => m.round))]
  const laps = totalRounds(tournament.players.length)

  return (
    <>
      <TopBar id={id} name={tournament.name || '未命名賽事'} current="schedule" />
      <div className="page stack">
        {tournament.players.length >= 2 && (
          <section>
            <CircleDial
              players={tournament.players}
              round={shownRound}
              caption={`第 ${shownRound} 輪。實心嗰個位釘死唔郁，其餘每過一輪順時針行一格，行到邊個位就同對面嗰位打。`}
            />
            <div className="btnrow" style={{ justifyContent: 'center', marginTop: 'var(--sp-3)' }}>
              <button
                className="btn chamfer-sm"
                onClick={() => setShownRound((r) => (r <= 1 ? laps : r - 1))}
              >
                上一輪
              </button>
              <button
                className="btn chamfer-sm"
                onClick={() => setShownRound((r) => (r >= laps ? 1 : r + 1))}
              >
                下一輪
              </button>
            </div>
          </section>
        )}

        {tournament.matches.length === 0 ? (
          <p className="empty">
            仲未排賽程。
            <br />
            <a href={`#/t/${id}/setup`}>去加選手同排賽程</a>
          </p>
        ) : (
          <div className="rounds">
            {rounds.map((round) => (
              <RoundBlock key={round} id={id} round={round} tournament={tournament} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function RoundBlock({
  id,
  round,
  tournament,
}: {
  id: string
  round: number
  tournament: Tournament
}) {
  const matches = inPlayOrder(tournament.matches).filter((m) => m.round === round)
  const byes = byesInRound(tournament.matches, tournament.players, round)

  return (
    <section>
      <div className="round__head">
        <span className="round__no u-tab">{round}</span>
        <span className="u-eyebrow">輪</span>
        {byes.length > 0 && (
          <span className="round__bye">{byes.map((p) => p.name).join('、')} 呢輪唞</span>
        )}
      </div>
      {matches.map((m) => (
        <MatchRow key={m.id} id={id} match={m} tournament={tournament} />
      ))}
    </section>
  )
}

function MatchRow({ id, match, tournament }: { id: string; match: Match; tournament: Tournament }) {
  const nameOf = (pid: string) => tournament.players.find((p) => p.id === pid)?.name ?? '？'
  const score = matchScore(match)
  const winner = matchWinnerId(match)
  const status = matchStatus(match)

  const cls = (side: 'a' | 'b') => {
    const pid = side === 'a' ? match.aId : match.bId
    const base = side === 'a' ? 'mrow__side' : 'mrow__side mrow__side--b'
    if (winner === null) return base
    return `${base} ${winner === pid ? 'mrow__won' : 'mrow__lost'}`
  }

  return (
    <a
      className="mrow"
      href={`#/t/${id}/m/${match.id}`}
      aria-current={status === 'live' ? 'true' : undefined}
    >
      <span className={cls('a')}>{nameOf(match.aId)}</span>
      <span className={status === 'live' ? 'mrow__score mrow__score--live' : 'mrow__score'}>
        {status === 'pending' ? '對' : `${score.a}–${score.b}`}
      </span>
      <span className={cls('b')}>{nameOf(match.bId)}</span>
    </a>
  )
}
