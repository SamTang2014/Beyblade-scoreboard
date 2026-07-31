import { useTournament, store } from '../storage/browserStore'
import { computeStandings, completedCount, isTournamentComplete } from '../engine/standings'
import { bracketChampion } from '../engine/bracket'
import { poolLabel, poolStandings } from '../engine/pools'
import { poolTies } from '../engine/tournament'
import { matchScore, matchWinnerId } from '../engine/rules'
import type { TieState } from '../engine/pools'
import type { Tournament } from '../engine/types'
import { downloadJson } from '../lib/download'
import { TopBar } from './components/TopBar'
import { Standings } from './components/Standings'
import { NotFound } from './Setup'

export function Table({ id }: { id: string }) {
  const { tournament } = useTournament(id)
  if (tournament === null) return <NotFound />

  const rows = computeStandings(tournament.players, tournament.matches)
  const done = completedCount(tournament.matches)

  /**
   * 有籤表嘅模式，冠軍一定係淘汰賽冠軍。
   *
   * 原本呢度淨係讀排名第 1 —— 但 computeStandings 唔計淘汰階段，
   * 而 isTournamentComplete 計埋，所以打完成個籤表之後會捧咗
   * 循環賽第一名做冠軍。
   */
  const hasBracketStage = tournament.mode !== 'roundRobin'
  const champId = hasBracketStage ? bracketChampion(tournament.matches) : null
  const champName =
    champId === null ? null : (tournament.players.find((p) => p.id === champId)?.name ?? null)
  const roundRobinChamp =
    !hasBracketStage && isTournamentComplete(tournament.matches)
      ? rows.find((r) => r.rank === 1)
      : undefined

  const pools =
    tournament.mode === 'poolsThenKnockout' && tournament.poolCount !== null
      ? poolStandings(tournament.players, tournament.matches, tournament.poolCount)
      : null

  // 加賽另出一張表 —— 唔會撈入小組排名表，嗰度照顯示並列。
  const ties = poolTies(tournament)

  return (
    <>
      <TopBar
        id={id}
        name={tournament.name || '未命名賽事'}
        current="table"
        mode={tournament.mode}
      />
      <div className="page stack">
        {champName !== null && (
          <div className="verdict chamfer">
            <div>
              <span className="u-eyebrow">打完喇 · 冠軍</span>
              <div className="verdict__who">{champName}</div>
              <span className="u-eyebrow">淘汰賽冠軍</span>
            </div>
          </div>
        )}

        {hasBracketStage && champName === null && isTournamentComplete(tournament.matches) && (
          <div className="verdict chamfer">
            <div>
              <span className="u-eyebrow">
                {tournament.mode === 'poolsThenKnockout' ? '小組賽打完喇' : '循環打完喇'}
              </span>
              <div className="verdict__who">等緊砌籤表</div>
              <span className="u-eyebrow">籤表打完先有冠軍</span>
            </div>
            <a className="btn btn--primary btn--big chamfer" href={`#/t/${id}/bracket`}>
              去砌籤表
            </a>
          </div>
        )}

        {roundRobinChamp !== undefined && (
          <div className="verdict chamfer">
            <div>
              <span className="u-eyebrow">打完喇 · 冠軍</span>
              <div className="verdict__who">{roundRobinChamp.name}</div>
              <span className="u-eyebrow u-tab">
                {roundRobinChamp.wins} 勝 {roundRobinChamp.losses} 負 · 總得分{' '}
                {roundRobinChamp.pointsFor}
              </span>
            </div>
            {roundRobinChamp.tied && (
              <p className="note">
                <span>·</span>
                <span>第一位有人並列，四條規則都分唔開。要分先後就要加賽或者抽籤。</span>
              </p>
            )}
          </div>
        )}

        <div className="btnrow" style={{ alignItems: 'baseline' }}>
          <span className="u-eyebrow u-tab" style={{ flex: 1 }}>
            打咗 {done} / {tournament.matches.length} 場
          </span>
          <button
            className="btn chamfer-sm"
            onClick={() => downloadJson(tournament.name, store.exportJson(tournament.id))}
          >
            down 低備份
          </button>
        </div>

        {pools === null ? (
          <Standings rows={rows} />
        ) : (
          <div className="poolgrid">
            {pools.map((table) => (
              <section key={table.pool}>
                <h2 className="u-eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
                  {poolLabel(table.pool)} 組
                </h2>
                <Standings rows={table.rows} cutAfter={tournament.advancePerPool ?? undefined} />
                <TiebreakTable
                  tie={ties.find((t) => t.pool === table.pool)}
                  tournament={tournament}
                />
              </section>
            ))}
          </div>
        )}

        <p className="note">
          <span>·</span>
          <span>
            排名次序：先比勝場 → 兩個人同勝場就睇佢哋當初邊個贏咗邊個 → 總得分 → 得失分差。
            未打完嘅場次一分都唔計。
          </span>
        </p>
        {pools !== null && (
          <p className="note">
            <span>·</span>
            <span>
              線上面嗰啲入淘汰賽。組同組唔會互相比較 —— 每組自己排自己嘅名次。
            </span>
          </p>
        )}
      </div>
    </>
  )
}

/**
 * 加賽結果，另一張表。
 *
 * 特登唔撈入小組排名表：小組排名表要照實顯示「並列」，加賽淨係用嚟排
 * 邊個出線。撈埋一齊嘅話會變成「因為並列所以打，打完就唔並列」，
 * 睇嘅人根本唔知當初點解要加賽。
 */
function TiebreakTable({ tie, tournament }: { tie: TieState | undefined; tournament: Tournament }) {
  if (tie === undefined || tie.matches.length === 0) return null

  const nameOf = (pid: string | null) =>
    pid === null ? '？' : (tournament.players.find((p) => p.id === pid)?.name ?? '？')

  return (
    <section style={{ marginTop: 'var(--sp-4)' }}>
      <h3 className="u-eyebrow">
        加賽{tie.attempt > 1 ? `（第 ${tie.attempt} 次）` : ''} · {tie.ids.length} 個人爭{' '}
        {tie.slots} 個位
      </h3>
      {tie.matches.map((m) => (
        <div className="mrow" key={m.id}>
          <span className="mrow__side">{nameOf(m.aId)}</span>
          <span className="mrow__score u-tab">
            {matchWinnerId(m) === null ? '對' : `${matchScore(m).a}–${matchScore(m).b}`}
          </span>
          <span className="mrow__side mrow__side--b">{nameOf(m.bId)}</span>
        </div>
      ))}
      <p className="note">
        <span>·</span>
        <span>
          {!tie.played
            ? '加賽仲未打完。'
            : tie.resolved
              ? `加賽排出嚟：${tie.order!.map(nameOf).join(' → ')}，頭 ${tie.slots} 個出線。`
              : '加賽又分唔開，要再打多一次。'}
        </span>
      </p>
    </section>
  )
}
