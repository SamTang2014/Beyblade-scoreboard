import { useTournament, store } from '../storage/browserStore'
import { computeStandings, completedCount, isTournamentComplete } from '../engine/standings'
import { downloadJson } from '../lib/download'
import { TopBar } from './components/TopBar'
import { Standings } from './components/Standings'
import { NotFound } from './Setup'

export function Table({ id }: { id: string }) {
  const { tournament } = useTournament(id)
  if (tournament === null) return <NotFound />

  const rows = computeStandings(tournament.players, tournament.matches)
  const done = completedCount(tournament.matches)
  const complete = isTournamentComplete(tournament.matches)
  const champion = complete ? rows.find((r) => r.rank === 1) : undefined

  return (
    <>
      <TopBar
        id={id}
        name={tournament.name || '未命名賽事'}
        current="table"
        mode={tournament.mode}
      />
      <div className="page stack">
        {complete && champion !== undefined && (
          <div className="verdict chamfer">
            <div>
              <span className="u-eyebrow">打完喇 · 冠軍</span>
              <div className="verdict__who">{champion.name}</div>
              <span className="u-eyebrow u-tab">
                {champion.wins} 勝 {champion.losses} 負 · 總得分 {champion.pointsFor}
              </span>
            </div>
            {champion.tied && (
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

        <Standings rows={rows} />

        <p className="note">
          <span>·</span>
          <span>
            排名次序：先比勝場 → 兩個人同勝場就睇佢哋當初邊個贏咗邊個 → 總得分 → 得失分差。
            未打完嘅場次一分都唔計。
          </span>
        </p>
      </div>
    </>
  )
}
