import type { StandingRow } from '../../engine/types'

/** 排名表。頭三個規則睇得出嚟，第 4 條（得失分差）都擺埋，等人查得到。 */
export function Standings({ rows, compact = false }: { rows: StandingRow[]; compact?: boolean }) {
  if (rows.length === 0) {
    return <p className="empty">仲未有選手。</p>
  }

  return (
    <div className="tablewrap">
      <table className="stand">
        <caption className="sr-only">
          排名。先比勝場，再比對賽成績，跟住總得分，最後得失分差。
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
            {!compact && <th scope="col">失分</th>}
            {!compact && <th scope="col">分差</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} data-lead={r.rank === 1}>
              <td className="stand__rank">{r.rank}</td>
              <th className="stand__who" scope="row">
                {r.name}
                {r.tied && <span className="stand__tie">並列</span>}
              </th>
              <td className="stand__num">{r.wins}</td>
              <td className="stand__num">{r.losses}</td>
              <td className="stand__num">{r.pointsFor}</td>
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
