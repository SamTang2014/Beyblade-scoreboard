import { useRef, useState } from 'react'
import { useTournament } from '../storage/browserStore'
import { totalMatches, totalRounds } from '../engine/schedule'
import { bracketRounds, byeCount } from '../engine/bracket'
import { MODE_HINT, MODE_LABEL, canStart, cutOptions, startTournament } from '../engine/tournament'
import { advanceOptions, poolLabel, poolOptions, poolSizes } from '../engine/pools'
import { newId } from '../lib/id'
import { go } from '../lib/router'
import { TopBar } from './components/TopBar'
import type { Player, TournamentMode } from '../engine/types'

export function Setup({ id }: { id: string }) {
  const { tournament, update, error } = useTournament(id)
  const [draft, setDraft] = useState('')
  const [warning, setWarning] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const nameBox = useRef<HTMLInputElement>(null)

  if (tournament === null) return <NotFound />

  const players = tournament.players
  const alreadyStarted = tournament.matches.some((m) => m.rounds.length > 0)


  function addPlayer() {
    const name = draft.trim()
    if (name === '') return
    if (players.some((p) => p.name === name)) {
      setWarning(`已經有一個「${name}」。改個唔同嘅名，唔係入分嗰陣會撈亂。`)
      return
    }
    const seat = players.reduce((mx, p) => Math.max(mx, p.seat), -1) + 1
    update((t) => ({ ...t, players: [...t.players, { id: newId(), name, seat, pool: null }] }))
    setDraft('')
    setWarning(null)
    nameBox.current?.focus()
  }

  /** 呢個選手已經打咗幾多場 —— 除名會連呢啲成績一齊冇。 */
  function playedCountOf(playerId: string): number {
    return tournament === null
      ? 0
      : tournament.matches.filter(
          (m) => (m.aId === playerId || m.bId === playerId) && m.rounds.length > 0,
        ).length
  }

  function removePlayer(player: Player) {
    // 有成績嘅要撳兩次先郁得到。冇後端，除錯咗係救唔返嘅。
    if (playedCountOf(player.id) > 0 && armed !== player.id) {
      setArmed(player.id)
      return
    }
    setArmed(null)
    update((t) => ({
      ...t,
      players: t.players.filter((p) => p.id !== player.id),
      matches: t.matches.filter((m) => m.aId !== player.id && m.bId !== player.id),
    }))
  }

  function buildSchedule() {
    if (tournament === null) return
    if (players.length < 2) {
      setWarning('至少要有 2 個人先排到賽程。')
      return
    }
    if (!canStart(tournament)) {
      if (tournament.mode === 'poolsThenKnockout') {
        setWarning(
          poolOptions(players.length).length === 0
            ? '至少要有 4 個人先分到組（每組最少 2 個人）。'
            : '揀埋分幾多組同每組出幾多個，先排得到賽程。',
        )
        return
      }
      const options = cutOptions(players.length)
      setWarning(
        tournament.cutSize !== null && !options.includes(tournament.cutSize)
          ? `而家得 ${players.length} 個人，入圍人數最多只可以揀頭 ${Math.max(...options)} 名。`
          : '揀埋入圍人數先排得到賽程。',
      )
      return
    }
    update((t) => {
      const started = startTournament(t, Math.random)
      return { ...t, players: started.players, matches: started.matches }
    })
    go(`#/t/${id}`)
  }

  const count = players.length
  const pools = poolOptions(count)
  // 預設 2 組、每組出 2 個；人數唔夠就用揀得到嘅第一個。
  const defaultPools = pools.includes(2) ? 2 : (pools[0] ?? null)
  const advances = defaultPools === null ? [] : advanceOptions(count, defaultPools)
  const defaultAdvance = advances.includes(2) ? 2 : (advances[0] ?? null)
  const newMatches =
    tournament.mode === 'poolsThenKnockout' && tournament.poolCount !== null
      ? poolSizes(count, tournament.poolCount).reduce((n, s) => n + totalMatches(s), 0) -
        tournament.matches.filter((m) => m.stage === 'group').length
      : totalMatches(count) - tournament.matches.length

  return (
    <>
      <TopBar
        id={id}
        name={tournament.name || '未命名賽事'}
        current="setup"
        mode={tournament.mode}
      />
      <div className="page stack">
        <div className="field">
          <label className="field__label" htmlFor="tname">
            場賽事叫咩名
          </label>
          <input
            id="tname"
            className="input chamfer-sm"
            value={tournament.name}
            placeholder="星期六陀螺仔聚會"
            onChange={(e) => update((t) => ({ ...t, name: e.target.value }))}
          />
        </div>

        <div className="field">
          <span className="field__label">點打</span>
          <div className="modes">
            {(
              [
                'roundRobin',
                'knockout',
                'groupThenKnockout',
                'poolsThenKnockout',
              ] as TournamentMode[]
            ).map((m) => (
              <button
                key={m}
                className="mode chamfer-sm"
                aria-pressed={tournament.mode === m}
                disabled={alreadyStarted}
                onClick={() =>
                  update((t) => ({
                    ...t,
                    mode: m,
                    // 轉走某個模式就冇咗嗰個模式嘅設定，唔好留住個舊值。
                    cutSize: m === 'groupThenKnockout' ? (t.cutSize ?? 4) : null,
                    poolCount: m === 'poolsThenKnockout' ? (t.poolCount ?? defaultPools) : null,
                    advancePerPool:
                      m === 'poolsThenKnockout' ? (t.advancePerPool ?? defaultAdvance) : null,
                    // 連選手身上嘅組別都要清。唔清嘅話，轉咗做單循環之後名單仲會出
                    // A／B／C 章、入分版仲會寫「A 組 · 第 1 輪」、連「呢輪唞」都會
                    // 當啲人仲係分開幾組咁計。存檔讀返嗰陣本身會清，但你唔會 reload
                    // 先繼續玩。
                    players:
                      m === 'poolsThenKnockout'
                        ? t.players
                        : t.players.map((p) => (p.pool === null ? p : { ...p, pool: null })),
                  }))
                }
              >
                <span className="mode__name">{MODE_LABEL[m]}</span>
                <span className="mode__hint">{MODE_HINT[m]}</span>
              </button>
            ))}
          </div>
          {alreadyStarted && (
            <p className="note">
              <span>·</span>
              <span>賽事已經開咗波，改唔到賽制。要改就開過另一場。</span>
            </p>
          )}
        </div>

        {tournament.mode === 'groupThenKnockout' && (
          <div className="field">
            <span className="field__label">循環打完，頭幾多名入籤表</span>
            <div className="chips">
              {cutOptions(count).map((n) => (
                <button
                  key={n}
                  className="chip chamfer-sm"
                  aria-pressed={tournament.cutSize === n}
                  disabled={alreadyStarted}
                  onClick={() => update((t) => ({ ...t, cutSize: n }))}
                >
                  頭 {n} 名
                </button>
              ))}
            </div>
            {cutOptions(count).length === 0 ? (
              <p className="note note--bad">
                <span>⚠</span>
                <span>至少要有 2 個人先揀到入圍人數。</span>
              </p>
            ) : (
              tournament.cutSize !== null &&
              !cutOptions(count).includes(tournament.cutSize) && (
                <p className="note note--bad">
                  <span>⚠</span>
                  <span>
                    而家揀咗頭 {tournament.cutSize} 名，但係得 {count} 個人。
                    揀返上面其中一個。
                  </span>
                </p>
              )
            )}
          </div>
        )}

        {tournament.mode === 'poolsThenKnockout' && (
          <PoolSetup
            count={count}
            poolCount={tournament.poolCount}
            advancePerPool={tournament.advancePerPool}
            locked={alreadyStarted}
            onPools={(n) =>
              update((t) => {
                // 改咗組數，原本嘅出線人數可能已經超出最細嗰組 —— 夾返落合法值。
                const opts = advanceOptions(count, n)
                const keep =
                  t.advancePerPool !== null && opts.includes(t.advancePerPool)
                    ? t.advancePerPool
                    : (opts[opts.length - 1] ?? null)
                return { ...t, poolCount: n, advancePerPool: keep }
              })
            }
            onAdvance={(n) => update((t) => ({ ...t, advancePerPool: n }))}
          />
        )}

        {/* 純淘汰賽冇排名表，呢段說明對佢冇意義，唔好出。 */}
        {tournament.mode !== 'knockout' && (
          <div className="field">
            <span className="field__label">排名點計</span>
            <p className="note">
              <span>·</span>
              <span>
                排名次序：勝場 → 分差 → 對戰（並列嗰班人之間邊個贏得多）→
                極限勝出次數 → 總得分。全部一樣先當並列，出線位有並列就打加賽。
              </span>
            </p>
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="pname">
            有邊個打
          </label>
          <form
            style={{ display: 'flex', gap: 'var(--sp-2)' }}
            onSubmit={(e) => {
              e.preventDefault()
              addPlayer()
            }}
          >
            <input
              id="pname"
              ref={nameBox}
              className="input chamfer-sm"
              value={draft}
              placeholder="打個名，撳 Enter 加下一個"
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn chamfer-sm" type="submit" disabled={draft.trim() === ''}>
              加
            </button>
          </form>
        </div>

        {warning !== null && (
          <p className="note note--bad" role="alert">
            <span>⚠</span>
            <span>{warning}</span>
          </p>
        )}
        {error !== null && (
          <p className="note note--bad" role="alert">
            <span>⚠</span>
            <span>{error}</span>
          </p>
        )}

        {count > 0 && (
          <div className="roster">
            {[...players]
              .sort((a, b) => a.seat - b.seat)
              .map((p, i) => {
                const hasPlayed = playedCountOf(p.id)
                const isArmed = armed === p.id
                return (
                  <div className="roster__row chamfer-sm" key={p.id}>
                    <span className="roster__seat">{i + 1}</span>
                    <span className="roster__name">{p.name}</span>
                    {p.pool !== null && (
                      <span className="roster__pool" aria-label={`${poolLabel(p.pool)} 組`}>
                        {poolLabel(p.pool)}
                      </span>
                    )}
                    {isArmed && (
                      <button className="btn btn--quiet" onClick={() => setArmed(null)}>
                        算數
                      </button>
                    )}
                    <button
                      className={isArmed ? 'btn btn--danger btn--armed' : 'btn btn--danger'}
                      onClick={() => removePlayer(p)}
                      aria-label={
                        isArmed
                          ? `真係除名 ${p.name}，連佢打咗嘅 ${hasPlayed} 場成績一齊冇`
                          : `除名 ${p.name}`
                      }
                    >
                      {isArmed ? `真係除？${hasPlayed} 場成績會冇` : '除名'}
                    </button>
                  </div>
                )
              })}
          </div>
        )}

        <Preview
          mode={tournament.mode}
          count={count}
          cutSize={tournament.cutSize}
          poolCount={tournament.poolCount}
          advancePerPool={tournament.advancePerPool}
        />

        {alreadyStarted && tournament.mode === 'poolsThenKnockout' && (
          <p className="note">
            <span>·</span>
            <span>賽事已經開咗波。而家加嘅人會入人最少嗰組，唔會重新抽組。</span>
          </p>
        )}

        {alreadyStarted && newMatches > 0 && tournament.mode !== 'poolsThenKnockout' && (
          <p className="note">
            <span>·</span>
            <span>
              賽事已經開咗波。撳落去會補返 {newMatches} 場新對戰喺賽程最尾，
              打咗嘅成績一場都唔會郁。
            </span>
          </p>
        )}

        <div className="btnrow">
          <button
            className="btn btn--primary btn--big chamfer"
            onClick={buildSchedule}
            disabled={count < 2}
          >
            {alreadyStarted ? '補返新場次' : '排賽程'}
          </button>
          {tournament.matches.length > 0 && (
            <a className="btn btn--big chamfer" href={`#/t/${id}`}>
              返去入分
            </a>
          )}
        </div>
      </div>
    </>
  )
}

/** 開波前俾個數俾人心裡有數：打幾多場、幾多輪、有冇人輪空。 */
function Preview({
  mode,
  count,
  cutSize,
  poolCount,
  advancePerPool,
}: {
  mode: TournamentMode
  count: number
  cutSize: number | null
  poolCount: number | null
  advancePerPool: number | null
}) {
  const cells: { num: number; label: string }[] = [{ num: count, label: '個人' }]

  // 組數同出線人數要對得返而家嘅人數先寫得出個預覽。
  // 除名到人數跌咗之後個舊設定會過晒時：12 個人揀咗 6 組，除到剩 8 個，
  // 唔 check 就會寫「8 個人 · 6 組 · 12 人入籤表」—— 8 個人邊度變 12 個出嚟。
  // 排唔到賽程本身有 canStart 擋住，但個預覽唔應該喺度講大話。
  const poolsUsable =
    mode === 'poolsThenKnockout' &&
    poolCount !== null &&
    poolOptions(count).includes(poolCount) &&
    advancePerPool !== null &&
    advanceOptions(count, poolCount).includes(advancePerPool)

  if (poolsUsable && poolCount !== null && advancePerPool !== null) {
    const sizes = poolSizes(count, poolCount)
    cells.push({ num: poolCount, label: '組' })
    cells.push({ num: sizes.reduce((n, s) => n + totalMatches(s), 0), label: '場小組賽' })
    const inBracket = poolCount * advancePerPool
    cells.push({ num: inBracket, label: '人入籤表' })
    if (inBracket >= 2) cells.push({ num: bracketRounds(inBracket), label: '輪淘汰' })
  }

  if (mode === 'roundRobin' || mode === 'groupThenKnockout') {
    cells.push({ num: totalRounds(count), label: '輪循環' })
    cells.push({ num: totalMatches(count), label: '場循環' })
  }
  if (mode === 'knockout' || mode === 'groupThenKnockout') {
    const inBracket = mode === 'knockout' ? count : (cutSize ?? 0)
    if (inBracket >= 2) {
      cells.push({ num: bracketRounds(inBracket), label: '輪淘汰' })
      cells.push({ num: inBracket - 1, label: '場淘汰' })
    }
  }

  const oddRoundRobin =
    (mode === 'roundRobin' || mode === 'groupThenKnockout') && count % 2 === 1 && count >= 3
  const byes = mode === 'knockout' ? byeCount(count) : 0

  return (
    <>
      <div className="preview chamfer">
        {cells.map((c) => (
          <div className="preview__cell" key={c.label}>
            <span className="preview__num u-tab">{c.num}</span>
            <span className="u-eyebrow">{c.label}</span>
          </div>
        ))}
      </div>

      {oddRoundRobin && (
        <p className="note">
          <span>·</span>
          <span>單數人，所以每輪會有一個人唞，輪流嚟，人人啱啱唞一次。</span>
        </p>
      )}

      {byes > 0 && (
        <p className="note">
          <span>·</span>
          <span>
            {count} 個人唔夠砌一個完整籤表，所以會有 {byes} 個人首圈輪空直接晉級。
            邊個輪空係隨機抽嘅。
          </span>
        </p>
      )}
    </>
  )
}

/** 分幾多組 + 每組出幾多個。兩行 chip，同「入圍人數」嗰行同一個樣。 */
function PoolSetup({
  count,
  poolCount,
  advancePerPool,
  locked,
  onPools,
  onAdvance,
}: {
  count: number
  poolCount: number | null
  advancePerPool: number | null
  locked: boolean
  onPools: (n: number) => void
  onAdvance: (n: number) => void
}) {
  const pools = poolOptions(count)

  if (pools.length === 0) {
    return (
      <div className="field">
        <span className="field__label">分幾多組</span>
        <p className="note note--bad">
          <span>⚠</span>
          <span>至少要有 4 個人先分到組（每組最少 2 個人）。</span>
        </p>
      </div>
    )
  }

  const advances = poolCount === null ? [] : advanceOptions(count, poolCount)
  const sizes = poolCount === null ? [] : poolSizes(count, poolCount)
  const qualifiers = poolCount === null || advancePerPool === null ? 0 : poolCount * advancePerPool

  return (
    <>
      <div className="field">
        <span className="field__label">分幾多組</span>
        <div className="chips">
          {pools.map((n) => (
            <button
              key={n}
              className="chip chamfer-sm"
              aria-pressed={poolCount === n}
              disabled={locked}
              onClick={() => onPools(n)}
            >
              {n} 組
            </button>
          ))}
        </div>
        {poolCount !== null && !pools.includes(poolCount) ? (
          /* 除名到人數跌咗，原本揀嘅組數就分唔到 —— 唔講嘅話啲 chip 得個樣冇一粒撳低，
             用戶淨係見到「排賽程」冇反應。 */
          <p className="note note--bad">
            <span>⚠</span>
            <span>
              而家揀咗 {poolCount} 組，但得返 {count} 個人，最多只可以分{' '}
              {Math.max(...pools)} 組。撳返上面其中一個。
            </span>
          </p>
        ) : (
          sizes.length > 0 && (
            <p className="note">
              <span>·</span>
              <span>
                {count} 個人分 {poolCount} 組 = {sizes.join(' / ')} 人。抽籤決定邊個同邊個一組。
              </span>
            </p>
          )
        )}
      </div>

      <div className="field">
        <span className="field__label">每組出幾多個入籤表</span>
        <div className="chips">
          {advances.map((n) => (
            <button
              key={n}
              className="chip chamfer-sm"
              aria-pressed={advancePerPool === n}
              disabled={locked}
              onClick={() => onAdvance(n)}
            >
              頭 {n} 名
            </button>
          ))}
        </div>
        {qualifiers > 0 && (
          <p className="note">
            <span>·</span>
            <span>
              {qualifiers} 個人入籤表。交叉搵：A 組第 1 對 B 組第 2，同組嘅唔會一入淘汰就撞返。
            </span>
          </p>
        )}
      </div>
    </>
  )
}

export function NotFound() {
  return (
    <div className="page">
      <p className="empty">
        搵唔到呢場賽事。可能係喺第二部機／第二個瀏覽器開嘅。
        <br />
        <a href="#/">返主頁</a>
      </p>
    </div>
  )
}
