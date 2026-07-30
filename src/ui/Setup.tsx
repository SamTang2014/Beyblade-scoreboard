import { useRef, useState } from 'react'
import { useTournament } from '../storage/browserStore'
import { totalMatches, totalRounds } from '../engine/schedule'
import { bracketRounds, byeCount } from '../engine/bracket'
import { MODE_HINT, MODE_LABEL, canStart, cutOptions, startTournament } from '../engine/tournament'
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
    if (!canStart(tournament.mode, players.length, tournament.cutSize)) {
      const options = cutOptions(players.length)
      setWarning(
        tournament.cutSize !== null && !options.includes(tournament.cutSize)
          ? `而家得 ${players.length} 個人，入圍人數最多只可以揀頭 ${Math.max(...options)} 名。`
          : '揀埋入圍人數先排得到賽程。',
      )
      return
    }
    update((t) => ({ ...t, matches: startTournament(t, Math.random) }))
    go(`#/t/${id}`)
  }

  const count = players.length
  const newMatches = totalMatches(count) - tournament.matches.length

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
            {(['roundRobin', 'knockout', 'groupThenKnockout'] as TournamentMode[]).map((m) => (
              <button
                key={m}
                className="mode chamfer-sm"
                aria-pressed={tournament.mode === m}
                disabled={alreadyStarted}
                onClick={() =>
                  update((t) => ({
                    ...t,
                    mode: m,
                    // 轉走「循環 + 淘汰」就冇入圍人數呢回事，唔好留住個舊值。
                    cutSize: m === 'groupThenKnockout' ? (t.cutSize ?? 4) : null,
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

        <Preview mode={tournament.mode} count={count} cutSize={tournament.cutSize} />

        {alreadyStarted && newMatches > 0 && (
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
}: {
  mode: TournamentMode
  count: number
  cutSize: number | null
}) {
  const cells: { num: number; label: string }[] = [{ num: count, label: '個人' }]

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

  const oddRoundRobin = mode !== 'knockout' && count % 2 === 1 && count >= 3
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
