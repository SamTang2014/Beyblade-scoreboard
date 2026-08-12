import { useState } from 'react'
import { usePartsData } from '../lib/partsData'
import {
  searchBlades,
  searchParts,
  type BladeRow,
  type GradeFilter,
  type PartRow,
  type TypeFilter,
} from '../lib/parts'
import {
  bladeIdentity,
  emptyTeam,
  isComplete,
  resizeTeam,
  takenKeys,
  type Combo,
  type Slot,
  type Team as TeamModel,
  type TeamSize,
} from '../lib/team'
import { ThemeToggle } from './components/Theme'

/**
 * 砌隊版。
 *
 * 比賽規則係同一隊唔准重複用同一件零件，所以呢版唔係「砌完再驗」——
 * 用咗嘅嘢喺揀盤度就已經撳唔到，你根本入唔到一隊犯規嘅。
 *
 * 呢版**唔存底**：純 React state，refresh 就冇。成品靠張分享卡帶走。
 */

const SLOT_LABEL: Record<Slot, string> = {
  blade: '戰刃',
  ratchet: '固鎖',
  bit: '軸心',
  assist: '輔助戰刃',
}

const TYPE_CHIPS: { v: TypeFilter; label: string }[] = [
  { v: 'all', label: '全部' },
  { v: 'attack', label: '攻擊' },
  { v: 'defense', label: '防禦' },
  { v: 'stamina', label: '持久' },
  { v: 'balance', label: '平衡' },
]

const GRADE_CHIPS: { v: GradeFilter; label: string }[] = [
  { v: 'all', label: '全部' },
  { v: 'X', label: 'X' },
  { v: 'S', label: 'S' },
  { v: 'A', label: 'A' },
  { v: 'B', label: 'B' },
  { v: 'C', label: 'C' },
  { v: 'D', label: 'D' },
  { v: 'E', label: 'E' },
  { v: 'unrated', label: '未評' },
]

/** 邊個位未填。返 null 即係砌得晒。 */
function missingText(team: TeamModel): string | null {
  for (const [i, c] of team.combos.entries()) {
    const miss: string[] = []
    if (c.blade === null) miss.push('戰刃')
    if (c.ratchet === null) miss.push('固鎖')
    if (c.bit === null) miss.push('軸心')
    if (miss.length > 0) return `第 ${i + 1} 隻仲爭${miss.join('、')}`
  }
  return null
}

function comboIsEmpty(c: Combo | undefined): boolean {
  if (c === undefined) return true
  return c.blade === null && c.ratchet === null && c.bit === null && c.assist === null
}

export function Team() {
  const { data, state, retry } = usePartsData()
  const [team, setTeam] = useState<TeamModel>(() => emptyTeam(3))
  const [open, setOpen] = useState<{ index: number; slot: Slot } | null>(null)
  // 縮細會斬走第 4 隻，砌咗嘢就唔可以靜靜哋掟走 —— inline 問過先。
  const [askShrink, setAskShrink] = useState(false)

  const missing = missingText(team)

  function pickSize(size: TeamSize) {
    if (size === team.size) return
    if (size === 3 && !comboIsEmpty(team.combos[3])) {
      setAskShrink(true)
      return
    }
    setAskShrink(false)
    setOpen(null)
    setTeam((t) => resizeTeam(t, size))
  }

  function setSlot(index: number, slot: Slot, value: BladeRow | PartRow | null) {
    setTeam((t) => {
      const combos = t.combos.map((c, i) => (i === index ? { ...c, [slot]: value } : c))
      return { ...t, combos }
    })
    setOpen(null)
  }

  return (
    <>
      <header className="topbar">
        <a className="navlink" href="#/" aria-label="返主頁">
          ←
        </a>
        <h1 className="topbar__name">砌隊</h1>
        <div className="topbar__spacer" />
        <ThemeToggle />
      </header>

      <div className="page stack">
        <p className="note">
          <span>·</span>
          <span>呢度唔會存底 —— 砌完記得出卡帶走。</span>
        </p>

        <div className="field">
          <span className="field__label">格式</span>
          <div className="chips">
            {([3, 4] as TeamSize[]).map((n) => (
              <button
                key={n}
                className="chip chamfer-sm"
                aria-pressed={team.size === n}
                onClick={() => pickSize(n)}
              >
                {n === 3 ? '3 隻（3on3）' : '4 隻（禁 1）'}
              </button>
            ))}
          </div>
          {askShrink && (
            <p className="note note--bad">
              <span>⚠</span>
              <span>
                轉返 3 隻會掟走第 4 隻砌咗嘅嘢。
                <button
                  className="btn btn--tight btn--danger btn--armed"
                  style={{ marginLeft: 'var(--sp-3)' }}
                  onClick={() => {
                    setAskShrink(false)
                    setOpen(null)
                    setTeam((t) => resizeTeam(t, 3))
                  }}
                >
                  照斬
                </button>
                <button
                  className="btn btn--quiet btn--tight"
                  style={{ marginLeft: 'var(--sp-2)' }}
                  onClick={() => setAskShrink(false)}
                >
                  算數
                </button>
              </span>
            </p>
          )}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="team-name">
            隊名
          </label>
          <input
            id="team-name"
            className="input chamfer-sm"
            value={team.name}
            placeholder="隊名（出卡會顯示）"
            onChange={(e) => setTeam((t) => ({ ...t, name: e.target.value }))}
          />
        </div>

        {data === null && state === 'loading' && <p className="empty">攞緊零件資料…</p>}

        {data === null && state === 'error' && (
          <div className="empty">
            <p>攞唔到零件資料，砌唔到隊住。啲資料喺一張公開嘅 Google Sheet 度。</p>
            <div className="btnrow" style={{ justifyContent: 'center', marginTop: 'var(--sp-4)' }}>
              <button className="btn chamfer-sm" onClick={retry}>
                再試
              </button>
            </div>
          </div>
        )}

        {data !== null &&
          team.combos.map((combo, i) => (
            <ComboCard
              key={i}
              index={i}
              combo={combo}
              team={team}
              blades={data.blades}
              parts={data.parts}
              open={open?.index === i ? open.slot : null}
              onOpen={(slot) =>
                setOpen((cur) =>
                  cur !== null && cur.index === i && cur.slot === slot ? null : { index: i, slot },
                )
              }
              onPick={(slot, value) => setSlot(i, slot, value)}
            />
          ))}

        {data !== null && (
          <div className="stack">
            <div className="btnrow">
              <button className="btn btn--primary btn--big chamfer" disabled={!isComplete(team)}>
                出卡
              </button>
            </div>
            {missing !== null && (
              <p className="note">
                <span>·</span>
                <span>{missing}。砌齊晒先出得卡。</span>
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function ComboCard({
  index,
  combo,
  team,
  blades,
  parts,
  open,
  onOpen,
  onPick,
}: {
  index: number
  combo: Combo
  team: TeamModel
  blades: BladeRow[]
  parts: PartRow[]
  open: Slot | null
  onOpen: (slot: Slot) => void
  onPick: (slot: Slot, value: BladeRow | PartRow | null) => void
}) {
  const slots: Slot[] = ['blade', 'ratchet', 'bit', 'assist']

  return (
    <section className="tcombo">
      <div className="tcombo__head">
        <span className="tcombo__no u-tab">{index + 1}</span>
        <span className="u-eyebrow">隻</span>
      </div>

      <div className="tslots">
        {slots.map((slot) => {
          const picked = combo[slot]
          return (
            <button
              key={slot}
              className="tslot chamfer-sm"
              aria-expanded={open === slot}
              onClick={() => onOpen(slot)}
            >
              <span className="tslot__label">{SLOT_LABEL[slot]}</span>
              <span className="tslot__val">
                {picked === null ? (
                  <span className="tslot__blank">{slot === 'assist' ? '冇裝' : '揀…'}</span>
                ) : (
                  picked.name
                )}
              </span>
            </button>
          )
        })}
      </div>

      {open !== null && (
        <Picker
          slot={open}
          index={index}
          team={team}
          blades={blades}
          parts={parts}
          onPick={(v) => onPick(open, v)}
        />
      )}
    </section>
  )
}

function Picker({
  slot,
  index,
  team,
  blades,
  parts,
  onPick,
}: {
  slot: Slot
  index: number
  team: TeamModel
  blades: BladeRow[]
  parts: PartRow[]
  onPick: (value: BladeRow | PartRow | null) => void
}) {
  const [query, setQuery] = useState('')
  const [grade, setGrade] = useState<GradeFilter>('all')
  const [type, setType] = useState<TypeFilter>('all')

  // 隊入面其他隻用咗嘅嘢 —— 呢度就係「唔准重複」落地嘅位。
  const taken = takenKeys(team, slot, index)

  const items: { key: string; name: string; tier: string; img: string; meta: string; value: BladeRow | PartRow }[] =
    slot === 'blade'
      ? searchBlades(blades, query, { kind: 'blade', type, grade }).map((b, i) => ({
          key: `b${i}/${b.id}`,
          name: b.name || b.id,
          tier: b.tier,
          img: b.img,
          meta: b.id,
          value: b,
        }))
      : searchParts(parts, query, { kind: slot, type: 'all', grade }).map((p, i) => ({
          key: `p${i}/${p.name}`,
          name: p.name,
          tier: p.tier,
          img: p.img,
          meta: SLOT_LABEL[slot],
          value: p,
        }))

  return (
    <div className="tpicker">
      <div className="field">
        <label className="field__label" htmlFor={`pick-${index}-${slot}`}>
          搵{SLOT_LABEL[slot]}
        </label>
        <input
          id={`pick-${index}-${slot}`}
          className="input chamfer-sm"
          type="search"
          value={query}
          placeholder={slot === 'blade' ? '名／型號' : '名'}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {slot === 'blade' && (
        <ChipRow label="類型" options={TYPE_CHIPS} value={type} onPick={setType} />
      )}
      <ChipRow label="階級" options={GRADE_CHIPS} value={grade} onPick={setGrade} />

      {slot === 'assist' && (
        <div className="btnrow">
          <button className="btn btn--quiet chamfer-sm" onClick={() => onPick(null)}>
            唔要輔助
          </button>
        </div>
      )}

      <p className="u-eyebrow">{items.length} 件揀得</p>

      {items.length === 0 ? (
        <p className="empty">冇嘢夾呢個搜尋。</p>
      ) : (
        <div className="pgrid">
          {items.map((it) => {
            const usedBy = taken.get(slot === 'blade' ? bladeIdentity(it.name) : it.name)
            return (
              <div className="pcard" key={it.key}>
                <button
                  className="pcard__main"
                  disabled={usedBy !== undefined}
                  onClick={() => onPick(it.value)}
                >
                  <span className="pcard__shot">
                    {it.img !== '' && <img src={it.img} alt={it.name} loading="lazy" />}
                  </span>
                  <span className="pcard__body">
                    <span className="pcard__name">{it.name}</span>
                    <span className="pcard__meta">
                      {usedBy === undefined ? it.meta : `第 ${usedBy + 1} 隻用咗`}
                    </span>
                  </span>
                  <span className="pcard__tier u-tab">
                    {it.tier === '' || it.tier === '-' ? '未評' : it.tier}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChipRow<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: { v: T; label: string }[]
  value: T
  onPick: (v: T) => void
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o.v}
            className="chip chamfer-sm"
            aria-pressed={value === o.v}
            onClick={() => onPick(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
