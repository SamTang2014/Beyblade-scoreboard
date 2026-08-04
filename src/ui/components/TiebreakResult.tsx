import { matchScore, matchWinnerId } from '../../engine/rules'
import { poolLabel } from '../../engine/pools'
import type { TieState } from '../../engine/pools'
import type { Player } from '../../engine/types'

/**
 * 加賽結果。
 *
 * 一定要一眼睇得出**邊幾個出線** —— 呢個係成件事嘅重點。所以唔用一句
 * 「阿明 → 阿華 → 阿強，頭 2 個出線」交代，要出返張表：逐個人嘅勝場、
 * 分差、名次，出線嗰幾個掛個「出線」章，出線線下面嗰啲一睇就知冇份。
 *
 * 特登同小組排名表分開擺：小組排名表要照實顯示「並列」，
 * 加賽淨係用嚟排邊個出線。
 */
export function TiebreakResult({
  tie,
  players,
  matchHref,
}: {
  tie: TieState
  players: Player[]
  /** 有嘅話啲場次撳得入去入分。電視版唔傳，因為嗰度冇得撳。 */
  matchHref?: (matchId: string) => string
}) {
  const nameOf = (pid: string | null) =>
    pid === null ? '？' : (players.find((p) => p.id === pid)?.name ?? '？')

  const attemptTag = tie.attempt > 1 ? `（第 ${tie.attempt} 次）` : ''
  const heading =
    tie.kind === 'pool'
      ? `${poolLabel(tie.key)} 組加賽${attemptTag}`
      : `爭第 ${tie.key} 位嘅加賽${attemptTag}`

  // 冇出線線（單循環）就唔係「爭幾多個位」，係要成班排晒先後。
  const goal =
    tie.slots === null
      ? `${tie.ids.length} 個人要排晒先後`
      : `${tie.ids.length} 個人爭 ${tie.slots} 個位`

  return (
    <section className="tiebreak">
      <h3 className="u-eyebrow">
        {heading} · {goal}
      </h3>

      {tie.played ? (
        <div className="tablewrap">
          <table className="stand">
            <caption className="sr-only">
              加賽成績。先比勝場，再比分差，最後極限勝出次數。
              {tie.slots === null ? '要排晒先後。' : `頭 ${tie.slots} 個出線。`}
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
                <th scope="col">分差</th>
                <th className="stand__xthead" scope="col">
                  <span aria-hidden="true">⚡</span>
                  <span className="sr-only">極限勝出次數</span>
                </th>
                <th scope="col">
                  <span className="sr-only">出唔出線</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tie.results.map((r, i) => {
                const through = tie.resolved && tie.slots !== null && i < tie.slots
                return (
                  <tr key={r.id} data-cut={i + 1 === tie.slots ? true : undefined}>
                    <td className="stand__rank">{i + 1}</td>
                    <th className="stand__who" scope="row">
                      {nameOf(r.id)}
                    </th>
                    <td className="stand__num">{r.wins}</td>
                    <td className="stand__num">
                      {r.diff > 0 ? '+' : ''}
                      {r.diff}
                    </td>
                    <td className="stand__num stand__xt">{r.xtreme}</td>
                    <td className="stand__num">
                      {through && <span className="through">出線</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="tiebreak__games">
        {tie.matches.map((m) => {
          const inner = (
            <>
              <span className="mrow__side">{nameOf(m.aId)}</span>
              <span className="mrow__score u-tab">
                {matchWinnerId(m) === null ? '對' : `${matchScore(m).a}–${matchScore(m).b}`}
              </span>
              <span className="mrow__side mrow__side--b">{nameOf(m.bId)}</span>
            </>
          )
          return matchHref === undefined ? (
            <div className="mrow" key={m.id}>
              {inner}
            </div>
          ) : (
            <a className="mrow" key={m.id} href={matchHref(m.id)}>
              {inner}
            </a>
          )
        })}
      </div>

      {!tie.played ? (
        <p className="note">
          <span>·</span>
          <span>
            加賽仲未打完，打晒先{tie.slots === null ? '排到先後' : '分到邊個出線'}。
          </span>
        </p>
      ) : tie.resolved ? (
        <p className="note">
          <span>·</span>
          <span>
            先比加賽勝場，打和就比分差，再打和就比極限勝出次數。
            {tie.slots === null
              ? '而家排晒先後喇。'
              : `線上面 ${tie.slots} 個出線，線下面冇份。`}
          </span>
        </p>
      ) : (
        <p className="note note--bad">
          <span>⚠</span>
          <span>加賽勝場、分差、極限次數全部一樣，仲係分唔開 —— 要再打多一次。</span>
        </p>
      )}
    </section>
  )
}
