import { useRef, useState } from 'react'
import { useTournament } from '../storage/browserStore'
import { mergeSchedule, totalMatches, totalRounds } from '../engine/schedule'
import { newId } from '../lib/id'
import { go } from '../lib/router'
import { TopBar } from './components/TopBar'
import type { Player } from '../engine/types'

export function Setup({ id }: { id: string }) {
  const { tournament, update, error } = useTournament(id)
  const [draft, setDraft] = useState('')
  const [warning, setWarning] = useState<string | null>(null)
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
    update((t) => ({ ...t, players: [...t.players, { id: newId(), name, seat }] }))
    setDraft('')
    setWarning(null)
    nameBox.current?.focus()
  }

  function removePlayer(player: Player) {
    update((t) => ({
      ...t,
      players: t.players.filter((p) => p.id !== player.id),
      matches: t.matches.filter((m) => m.aId !== player.id && m.bId !== player.id),
    }))
  }

  function buildSchedule() {
    if (players.length < 2) {
      setWarning('至少要有 2 個人先排到賽程。')
      return
    }
    update((t) => ({ ...t, matches: mergeSchedule(t.matches, t.players) }))
    go(`#/t/${id}`)
  }

  const count = players.length
  const newMatches = totalMatches(count) - tournament.matches.length

  return (
    <>
      <TopBar id={id} name={tournament.name || '未命名賽事'} current="setup" />
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
              .map((p, i) => (
                <div className="roster__row chamfer-sm" key={p.id}>
                  <span className="roster__seat">{i + 1}</span>
                  <span className="roster__name">{p.name}</span>
                  <button
                    className="btn btn--danger"
                    onClick={() => removePlayer(p)}
                    aria-label={`除名 ${p.name}`}
                  >
                    除名
                  </button>
                </div>
              ))}
          </div>
        )}

        <div className="preview chamfer">
          <div className="preview__cell">
            <span className="preview__num u-tab">{count}</span>
            <span className="u-eyebrow">個人</span>
          </div>
          <div className="preview__cell">
            <span className="preview__num u-tab">{totalRounds(count)}</span>
            <span className="u-eyebrow">輪</span>
          </div>
          <div className="preview__cell">
            <span className="preview__num u-tab">{totalMatches(count)}</span>
            <span className="u-eyebrow">場</span>
          </div>
        </div>

        {count % 2 === 1 && count >= 3 && (
          <p className="note">
            <span>·</span>
            <span>單數人，所以每輪會有一個人唞，輪流嚟，人人啱啱唞一次。</span>
          </p>
        )}

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
