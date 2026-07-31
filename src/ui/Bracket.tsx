import { useTournament } from '../storage/browserStore'
import { bracketMatches } from '../engine/schedule'
import { bracketChampion, bracketRoundName, totalBracketRounds } from '../engine/bracket'
import { matchScore, matchStatus, matchWinnerId } from '../engine/rules'
import { Standings } from './components/Standings'
import { addTiebreak, buildCut, groupStageComplete, hasBracket, poolTies } from '../engine/tournament'
import { poolLabel, poolStandings } from '../engine/pools'
import type { TieState } from '../engine/pools'
import { TiebreakResult } from './components/TiebreakResult'
import { TopBar } from './components/TopBar'
import { NotFound } from './Setup'
import type { Match, Tournament } from '../engine/types'

/**
 * 籤表。一欄一輪，由左到右。
 *
 * 用 CSS grid 唔畫連接線：喺手機上面畫線要橫向捲，好難撳。
 * 每一格寫住「等緊 八強第 1 場」就已經講得出晉級路線，唔使靠條線。
 */
export function Bracket({ id }: { id: string }) {
  const { tournament, update } = useTournament(id)
  if (tournament === null) return <NotFound />

  const bracket = bracketMatches(tournament.matches)
  const ready = hasBracket(tournament)
  // 出線線上面分唔開嘅組。有一組拆唔掂就砌唔到籤表。
  const ties = poolTies(tournament).filter((s) => !s.resolved)
  const canBuild =
    (tournament.mode === 'groupThenKnockout' || tournament.mode === 'poolsThenKnockout') &&
    !ready &&
    ties.length === 0 &&
    groupStageComplete(tournament)

  return (
    <>
      <TopBar
        id={id}
        name={tournament.name || '未命名賽事'}
        current="bracket"
        mode={tournament.mode}
      />
      <div className="page page--wide stack">
        {!ready && ties.length > 0 && groupStageComplete(tournament) ? (
          <TieBreakers
            id={id}
            tournament={tournament}
            ties={ties}
            onDraw={() => update((t) => ({ ...t, matches: addTiebreak(t) }))}
          />
        ) : !ready ? (
          <NotYet
            tournament={tournament}
            canBuild={canBuild}
            onBuild={() => update((t) => ({ ...t, matches: buildCut(t) }))}
          />
        ) : (
          <BracketGrid id={id} tournament={tournament} matches={bracket} />
        )}
      </div>
    </>
  )
}

function NotYet({
  tournament,
  canBuild,
  onBuild,
}: {
  tournament: Tournament
  canBuild: boolean
  onBuild: () => void
}) {
  if (tournament.mode === 'roundRobin') {
    return <p className="empty">呢場係單循環賽，冇籤表。</p>
  }

  if (canBuild) {
    const pools = tournament.mode === 'poolsThenKnockout'
    return (
      <div className="verdict chamfer">
        <div>
          <span className="u-eyebrow">{pools ? '小組賽打完喇' : '大循環打完喇'}</span>
          <div className="verdict__who">
            {pools
              ? `每組頭 ${tournament.advancePerPool} 名入籤表`
              : `頭 ${tournament.cutSize} 名入籤表`}
          </div>
          <span className="u-eyebrow">
            {pools
              ? '交叉搵：A 組第 1 對 B 組第 2，同組嘅唔會一入淘汰就撞返'
              : '種子跟排名排，第 1 名對最後一個入圍嘅'}
          </span>
        </div>
        <button className="btn btn--primary btn--big chamfer" onClick={onBuild}>
          砌籤表
        </button>
      </div>
    )
  }

  return (
    <p className="empty">
      {tournament.mode === 'poolsThenKnockout' ? (
        <>
          小組賽仲未打完，籤表要等成績出齊先砌得到。
          <br />
          每組頭 {tournament.advancePerPool ?? '？'} 名入籤表。
        </>
      ) : (
        <>
          循環賽仲未打完，籤表要等成績出齊先砌得到。
          <br />
          入圍人數：頭 {tournament.cutSize ?? '？'} 名。
        </>
      )}
    </p>
  )
}

function BracketGrid({
  id,
  tournament,
  matches,
}: {
  id: string
  tournament: Tournament
  matches: Match[]
}) {
  const total = totalBracketRounds(matches)
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  const champion = bracketChampion(tournament.matches)
  const nameOf = (pid: string | null) =>
    pid === null ? null : (tournament.players.find((p) => p.id === pid)?.name ?? '？')

  return (
    <>
      {champion !== null && (
        <div className="verdict chamfer">
          <div>
            <span className="u-eyebrow">打完喇 · 冠軍</span>
            <div className="verdict__who">{nameOf(champion)}</div>
          </div>
        </div>
      )}

      <div className="bracket">
        {rounds.map((round) => (
          <section className="bracket__col" key={round}>
            <h2 className="u-eyebrow bracket__head">{bracketRoundName(round, total)}</h2>
            {matches
              .filter((m) => m.round === round)
              .sort((a, b) => a.order - b.order)
              .map((m) => (
                <BracketMatch
                  key={m.id}
                  id={id}
                  match={m}
                  matches={matches}
                  total={total}
                  nameOf={nameOf}
                />
              ))}
          </section>
        ))}
      </div>

      <p className="note">
        <span>·</span>
        <span>撳任何一場就跳去入分。改咗前面嗰場，後面已經打完嘅會要重新打過。</span>
      </p>
    </>
  )
}

function BracketMatch({
  id,
  match,
  matches,
  total,
  nameOf,
}: {
  id: string
  match: Match
  matches: Match[]
  total: number
  nameOf: (pid: string | null) => string | null
}) {
  const score = matchScore(match)
  const winner = matchWinnerId(match)
  const status = matchStatus(match)

  /** 對手未定嗰陣，講明等緊邊一場，唔好淨係擺個問號。 */
  const waitingFor = (fromId: string | null): string => {
    if (fromId === null) return '未定'
    const up = matches.find((m) => m.id === fromId)
    if (up === undefined) return '未定'
    return `等 ${bracketRoundName(up.round, total)}第 ${up.order} 場`
  }

  const side = (which: 'a' | 'b') => {
    const pid = which === 'a' ? match.aId : match.bId
    const from = which === 'a' ? match.aFrom : match.bFrom
    const name = nameOf(pid)
    const points = which === 'a' ? score.a : score.b

    if (name === null) {
      return (
        <span className="bslot bslot--waiting">
          <span className="bslot__name">{waitingFor(from)}</span>
        </span>
      )
    }

    const won = winner === pid
    const lost = winner !== null && !won
    return (
      <span className={`bslot${won ? ' bslot--won' : ''}${lost ? ' bslot--lost' : ''}`}>
        <span className="bslot__name">{name}</span>
        {status !== 'waiting' && status !== 'pending' && (
          <span className="bslot__score u-tab">{points}</span>
        )}
      </span>
    )
  }

  return (
    <a
      className={`bmatch chamfer-sm${status === 'waiting' ? ' bmatch--waiting' : ''}`}
      href={`#/t/${id}/m/${match.id}`}
      aria-label={`${bracketRoundName(match.round, total)}第 ${match.order} 場`}
    >
      {side('a')}
      {side('b')}
    </a>
  )
}

/**
 * 出線線上面分唔開就要加賽。
 *
 * 點解要擋住唔俾砌籤表：唔擋嘅話會靜靜雞照排序攞頭幾個出線，而排序最後
 * fallback 係個名 —— 即係「邊個出線」變成睇個名點串。喺一班細路面前，
 * 呢個係最唔應該嘅做法。
 */
function TieBreakers({
  id,
  tournament,
  ties,
  onDraw,
}: {
  id: string
  tournament: Tournament
  ties: TieState[]
  onDraw: () => void
}) {
  const tables = poolStandings(
    tournament.players,
    tournament.matches,
    tournament.poolCount ?? 0,
  )
  // 有邊組排咗加賽但仲未打完 —— 打緊就唔好再彈粒「排加賽」出嚟。
  const waiting = ties.some((s) => s.attempt > 0 && !s.played)

  return (
    <>
      {ties.map((s) => {
        const rows = tables.find((t) => t.pool === s.pool)?.rows ?? []
        const tiedRows = rows.filter((r) => s.ids.includes(r.playerId))
        return (
          <section key={s.pool} className="stack">
            <div className="verdict chamfer">
              <div>
                <span className="u-eyebrow">{poolLabel(s.pool)} 組分唔開</span>
                <div className="verdict__who">
                  {s.ids.length} 個人爭 {s.slots} 個位
                </div>
                <span className="u-eyebrow">
                  {s.attempt === 0
                    ? '勝場、得分、失分、分差四樣都一樣，要打加賽先分到'
                    : s.played
                      ? `第 ${s.attempt} 次加賽又分唔開`
                      : `第 ${s.attempt} 次加賽打緊`}
                </span>
              </div>
            </div>

            <Standings rows={tiedRows} />

            {s.matches.length > 0 && (
              <TiebreakResult
                tie={s}
                players={tournament.players}
                matchHref={(mid) => `#/t/${id}/m/${mid}`}
              />
            )}

            {s.attempt >= 2 && s.played && (
              <p className="note">
                <span>·</span>
                <span>
                  打咗 {s.attempt} 次都分唔開。可以再打，或者你哋自己抽籤決定，
                  然後照抽籤結果入返落加賽度 —— 個 app 唔會幫你抽。
                </span>
              </p>
            )}
          </section>
        )
      })}

      {!waiting && (
        <div className="btnrow">
          <button className="btn btn--primary btn--big chamfer" onClick={onDraw}>
            {ties.some((s) => s.attempt > 0) ? '再排多一次加賽' : '排加賽'}
          </button>
        </div>
      )}

      <p className="note">
        <span>·</span>
        <span>
          加賽打完晒先砌得到籤表。加賽成績唔會計入小組排名表 ——
          嗰度照顯示並列，加賽淨係用嚟排邊個出線。
        </span>
      </p>
    </>
  )
}
