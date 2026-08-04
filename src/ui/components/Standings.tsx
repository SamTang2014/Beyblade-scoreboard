import type { StandingRow } from '../../engine/types'

/**
 * 排名表。四條主規則（勝場、得分、分差、極限次數）全部睇得出嚟，
 * 失分擺埋落去等人查得到。
 *
 * `cutAfter` = 第幾名之後劃條出線線（小組賽用）。
 */
export function Standings({
  rows,
  compact = false,
  cutAfter,
}: {
  rows: StandingRow[]
  compact?: boolean
  cutAfter?: number | undefined
}) {
  if (rows.length === 0) {
    return <p className="empty">仲未有選手。</p>
  }

  return (
    <div className="tablewrap">
      <table className="stand">
        <caption className="sr-only">
          排名。先比勝場，再比總得分，跟住得失分差，最後極限勝出次數。
        </caption>
        <thead>
          <tr>
            <th className="stand__rank" scope="col">
              #
            </th>
            <th className="stand__who" scope="col">
              選手
            </th>
            <th scope="col">勝</th>
            <th scope="col">負</th>
            <th scope="col">得分</th>
            <th scope="col">
              <span aria-hidden="true">⚡</span>
              <span className="sr-only">極限勝出次數</span>
            </th>
            {!compact && <th scope="col">失分</th>}
            {!compact && <th scope="col">分差</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.playerId}
              data-lead={r.rank === 1}
              data-cut={cutAfter !== undefined && i + 1 === cutAfter ? true : undefined}
            >
              <td className="stand__rank">{r.rank}</td>
              <th className="stand__who" scope="row">
                {r.name}
                {r.tied && <span className="stand__tie">並列</span>}
              </th>
              <td className="stand__num">{r.wins}</td>
              <td className="stand__num">{r.losses}</td>
              <td className="stand__num">{r.pointsFor}</td>
              <td className="stand__num">{r.xtremeWins}</td>
              {!compact && <td className="stand__num">{r.pointsAgainst}</td>}
              {!compact && (
                <td className="stand__num">
                  {r.diff > 0 ? '+' : ''}
                  {r.diff}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
