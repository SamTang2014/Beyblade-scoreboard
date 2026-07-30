import { useTournament } from '../storage/browserStore'
import { matchKey, matchScore, matchStatus, matchWinnerId } from '../engine/rules'
import { poolLabel, poolsOf } from '../engine/pools'
import { TopBar } from './components/TopBar'
import { NotFound } from './Setup'
import type { Match, Player } from '../engine/types'

/**
 * 交叉得分矩陣：橫直都係選手，對角線係自己打自己所以劃走。
 * 一眼睇晒邊個贏過邊個 —— 呢個就係主持人本身用紙畫嗰張表。
 */
export function Matrix({ id }: { id: string }) {
  const { tournament } = useTournament(id)
  if (tournament === null) return <NotFound />

  const players = [...tournament.players].sort((a, b) => a.seat - b.seat)
  if (players.length === 0) {
    return (
      <>
        <TopBar
        id={id}
        name={tournament.name || '未命名賽事'}
        current="matrix"
        mode={tournament.mode}
      />
        <div className="page">
          <p className="empty">仲未有選手。</p>
        </div>
      </>
    )
  }

  const pools =
    tournament.mode === 'poolsThenKnockout' && tournament.poolCount !== null
      ? poolsOf(tournament.players, tournament.poolCount)
      : null

  return (
    <>
      <TopBar
        id={id}
        name={tournament.name || '未命名賽事'}
        current="matrix"
        mode={tournament.mode}
      />
      <div className="page page--wide stack">
        {pools === null ? (
          <MatrixTable players={players} matches={tournament.matches} />
        ) : (
          pools.map((pool, i) => (
            <section key={i}>
              <h2 className="u-eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
                {poolLabel(i + 1)} 組
              </h2>
              <MatrixTable players={pool} matches={tournament.matches} />
            </section>
          ))
        )}

        <p className="note">
          <span>·</span>
          <span>
            每格係橫行嗰個嘅比分。粗體藍色 = 贏咗，灰色 = 輸咗，「·」= 仲未打。
          </span>
        </p>
        {pools !== null && (
          <p className="note">
            <span>·</span>
            <span>逐組畫 —— 唔同組嘅人根本冇對過，擺埋一張大表會成張都係空格。</span>
          </p>
        )}
      </div>
    </>
  )
}

function MatrixTable({ players, matches }: { players: Player[]; matches: Match[] }) {
  const byKey = new Map(matches.map((m) => [m.id, m]))

  return (
    <div className="tablewrap tablewrap--fit">
      <table className="matrix">
        <caption className="sr-only">交叉得分矩陣。每格係橫行嗰個對縱列嗰個嘅比分。</caption>
        <thead>
          <tr>
            <th scope="col">　</th>
            {players.map((p) => (
              <th key={p.id} scope="col">
                {p.name}
              </th>
            ))}
            <th scope="col">勝</th>
          </tr>
        </thead>
        <tbody>
          {players.map((row) => (
            <tr key={row.id}>
              <th className="matrix__who" scope="row">
                {row.name}
              </th>
              {players.map((col) => (
                <Cell
                  key={col.id}
                  row={row}
                  col={col}
                  match={byKey.get(matchKey(row.id, col.id))}
                />
              ))}
              <td className="matrix__total u-tab">{winsOf(row.id, matches)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ row, col, match }: { row: Player; col: Player; match: Match | undefined }) {
  if (row.id === col.id) {
    return <td className="matrix__self" aria-label="自己唔打自己" />
  }
  if (match === undefined || matchStatus(match) === 'pending') {
    return <td className="matrix__pending">·</td>
  }

  const score = matchScore(match)
  const mine = match.aId === row.id ? score.a : score.b
  const theirs = match.aId === row.id ? score.b : score.a
  const winner = matchWinnerId(match)

  if (winner === null) {
    return (
      <td className="matrix__pending u-tab">
        {mine}–{theirs}
      </td>
    )
  }

  return (
    <td className={winner === row.id ? 'matrix__win u-tab' : 'matrix__loss u-tab'}>
      {mine}–{theirs}
    </td>
  )
}

function winsOf(playerId: string, matches: Match[]): number {
  return matches.reduce((n, m) => n + (matchWinnerId(m) === playerId ? 1 : 0), 0)
}
