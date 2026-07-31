import { useState } from 'react'
import { useTournament } from '../storage/browserStore'
import { byesInRound, inPlayOrder, isPureCircleSchedule, totalRounds } from '../engine/schedule'
import { matchScore, matchStatus, matchWinnerId } from '../engine/rules'
import { poolLabel, poolsOf } from '../engine/pools'
import { TopBar } from './components/TopBar'
import { CircleDial } from './components/CircleDial'
import { NotFound } from './Setup'
import type { Match, Tournament } from '../engine/types'

export function Schedule({ id }: { id: string }) {
  const { tournament } = useTournament(id)
  const [shownRound, setShownRound] = useState(1)
  const [shownPool, setShownPool] = useState(1)

  if (tournament === null) return <NotFound />

  const isPools = tournament.mode === 'poolsThenKnockout' && tournament.poolCount !== null
  const pools = isPools ? poolsOf(tournament.players, tournament.poolCount!) : null
  const poolOf = new Map(tournament.players.map((p) => [p.id, p.pool]))

  // 轉盤一次淨係畫一組 —— 三個圈疊埋一齊邊個都睇唔明。
  const dialPlayers = pools === null ? tournament.players : (pools[shownPool - 1] ?? [])
  const dialMatches =
    pools === null
      ? tournament.matches
      : tournament.matches.filter(
          (m) => m.stage === 'group' && m.aId !== null && poolOf.get(m.aId) === shownPool,
        )

  const rounds = [...new Set(inPlayOrder(tournament.matches).map((m) => m.round))]
  const laps = totalRounds(dialPlayers.length)

  // 中途加過人之後賽程唔再係轉盤轉出嚟，個轉盤會同下面啲場次對唔上，所以收起佢。
  const showDial =
    dialPlayers.length >= 2 &&
    (dialMatches.length === 0 || isPureCircleSchedule(dialMatches, dialPlayers))

  return (
    <>
      <TopBar
        id={id}
        name={tournament.name || '未命名賽事'}
        current="schedule"
        mode={tournament.mode}
      />
      <div className="page stack">
        {/*
          組別掣要擺喺轉盤外面。擺咗入去嘅話：A 組中途加過人 → A 組唔再係乾淨圓周法
          → 收起轉盤 → 連啲掣都一齊唔見 → 你困死喺 A 組，撳唔返去 B 組。
          轉盤收唔收起係逐組嘅事，揀邊組唔係。
        */}
        {pools !== null && (
          <div className="chips" style={{ justifyContent: 'center' }}>
            {pools.map((_, i) => (
              <button
                key={i}
                className="chip chamfer-sm"
                aria-pressed={shownPool === i + 1}
                onClick={() => {
                  setShownPool(i + 1)
                  setShownRound(1)
                }}
              >
                {poolLabel(i + 1)} 組
              </button>
            ))}
          </div>
        )}

        {!showDial && tournament.matches.length > 0 && (
          <p className="note">
            <span>·</span>
            <span>
              {pools === null
                ? '呢個賽程中途加過人，補返嘅場次係插喺尾嘅，唔再係一個乾淨嘅圓周法轉盤，所以唔畫轉盤住。下面每一輪都仍然冇人要打兩場。'
                : `${poolLabel(shownPool)} 組中途加過人，補返嘅場次係插喺尾嘅，唔再係一個乾淨嘅圓周法轉盤，所以唔畫轉盤住。下面每一輪都仍然冇人要打兩場。`}
            </span>
          </p>
        )}

        {showDial && (
          <section>
            <CircleDial
              players={dialPlayers}
              round={shownRound}
              matches={dialMatches}
              caption="有圈嗰個位釘死唔郁，其餘每過一輪順時針行一格，行到邊個位就同對面嗰位打。藍點紅點就係嗰場邊個企藍邊、邊個企紅邊。"
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
              <RoundBlock
                key={round}
                id={id}
                round={round}
                tournament={tournament}
                poolOf={isPools ? poolOf : null}
              />
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
  poolOf,
}: {
  id: string
  round: number
  tournament: Tournament
  poolOf: Map<string, number | null> | null
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
        <MatchRow key={m.id} id={id} match={m} tournament={tournament} poolOf={poolOf} />
      ))}
    </section>
  )
}

function MatchRow({
  id,
  match,
  tournament,
  poolOf,
}: {
  id: string
  match: Match
  tournament: Tournament
  poolOf: Map<string, number | null> | null
}) {
  const nameOf = (pid: string | null) =>
    pid === null ? '等緊上場' : (tournament.players.find((p) => p.id === pid)?.name ?? '？')
  const score = matchScore(match)
  const winner = matchWinnerId(match)
  const status = matchStatus(match)

  const cls = (side: 'a' | 'b') => {
    const pid = side === 'a' ? match.aId : match.bId
    const base = side === 'a' ? 'mrow__side' : 'mrow__side mrow__side--b'
    if (winner === null) return base
    return `${base} ${winner === pid ? 'mrow__won' : 'mrow__lost'}`
  }

  // 淘汰場次唔畫章 —— Player.pool 開波抽咗組之後就唔會再清，
  // 所以淨係睇 poolOf 唔夠，仲要 stage 係 'group' 先算數，唔係贏咗出線嗰個都會拖住舊組別章。
  const pool = poolOf !== null && match.stage === 'group' ? poolOf.get(match.aId ?? '') : undefined

  return (
    <a
      className="mrow"
      href={`#/t/${id}/m/${match.id}`}
      aria-current={status === 'live' ? 'true' : undefined}
    >
      {pool != null && <span className="mrow__pool">{poolLabel(pool)}</span>}
      <span className={cls('a')}>{nameOf(match.aId)}</span>
      <span className={status === 'live' ? 'mrow__score mrow__score--live' : 'mrow__score'}>
        {status === 'pending' ? '對' : `${score.a}–${score.b}`}
      </span>
      <span className={cls('b')}>{nameOf(match.bId)}</span>
    </a>
  )
}
