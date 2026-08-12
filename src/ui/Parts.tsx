import { useState } from 'react'
import { useTournament } from '../storage/browserStore'
import { usePartsData } from '../lib/partsData'
import {
  searchBlades,
  searchParts,
  type BladeRow,
  type GradeFilter,
  type KindFilter,
  type PartRow,
  type PartsFilter,
  type TypeFilter,
} from '../lib/parts'
import { TopBar } from './components/TopBar'
import { NotFound } from './Setup'

/**
 * 零件搜尋版。
 *
 * 打完場波成日有人問「呢隻係咩 tier」「原裝配咩軸心」，之前要開手機搵張
 * Google Sheet 慢慢碌。呢版就係喺場內即撳即查 —— 純讀，唔會寫返落張 sheet。
 */

const KIND_CHIPS: { v: KindFilter; label: string }[] = [
  { v: 'all', label: '全部' },
  { v: 'blade', label: '戰刃' },
  { v: 'ratchet', label: '固鎖' },
  { v: 'bit', label: '軸心' },
  { v: 'assist', label: '輔助戰刃' },
]

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

const TYPE_LABEL: Record<string, string> = {
  attack: '攻擊',
  defense: '防禦',
  stamina: '持久',
  balance: '平衡',
  special: '特殊',
}

const KIND_LABEL: Record<PartRow['kind'], string> = {
  ratchet: '固鎖',
  bit: '軸心',
  assist: '輔助戰刃',
}

/** 手上呢份資料幾舊。同日拉嘅唔講「0 日前」—— 讀落似壞咗。 */
function ageText(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000)
  return days <= 0 ? '用緊今日攞落嚟嗰份。' : `用緊 ${days} 日前攞落嚟嗰份。`
}

export function Parts({ id }: { id: string }) {
  const { tournament } = useTournament(id)
  const { data, state, retry } = usePartsData()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PartsFilter>({ kind: 'all', type: 'all', grade: 'all' })
  const [openId, setOpenId] = useState<string | null>(null)

  if (tournament === null) return <NotFound />

  // 揀零件（固鎖／軸心／輔助戰刃）嗰陣類型排會收埋。收埋咗仲 AND 住舊嘅
  // 揀擇就會出現「乜都搵唔到但睇唔出點解」，所以轉種類就順手 reset 返類型。
  const showType = filter.kind === 'all' || filter.kind === 'blade'
  const setKind = (kind: KindFilter) =>
    setFilter((f) => ({ ...f, kind, type: kind === 'all' || kind === 'blade' ? f.type : 'all' }))

  const blades = data === null ? [] : searchBlades(data.blades, query, filter)
  const parts = data === null ? [] : searchParts(data.parts, query, filter)
  const found = blades.length + parts.length

  /*
    識別一行用「喺原本清單入面第幾個」，唔用型號。
    張 sheet 有幾隻聯乘戰刃兩隻共用一個型號（BX-00-02 就有丘巴卡同風暴兵，
    BX-00-03 有紅浩克同美國隊長）。用型號做 React key 就會撞：撞完 React
    清唔走已經篩走咗嘅卡（試過話「搵到 7 件」但版面留低 15 張），
    而且撳開詳細會兩隻一齊開。位置實唔撞。
    戰刃同零件喺同一個 grid 入面做兄弟，所以要分開字頭。
  */
  const bladeKey = new Map(data?.blades.map((b, i) => [b, `b${i}/${b.id}`]) ?? [])
  const partKey = new Map(data?.parts.map((p, i) => [p, `p${i}/${p.name}`]) ?? [])

  return (
    <>
      <TopBar id={id} name={tournament.name || '未命名賽事'} current="parts" mode={tournament.mode} />
      <div className="page stack">
        <div className="field">
          <label className="field__label" htmlFor="parts-q">
            搵零件
          </label>
          <input
            id="parts-q"
            className="input chamfer-sm"
            type="search"
            value={query}
            placeholder="名／型號／固鎖／軸心"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="pfilters">
          <ChipRow
            label="種類"
            options={KIND_CHIPS}
            value={filter.kind}
            onPick={setKind}
          />
          {showType && (
            <ChipRow
              label="類型"
              options={TYPE_CHIPS}
              value={filter.type}
              onPick={(type) => setFilter((f) => ({ ...f, type }))}
            />
          )}
          <ChipRow
            label="階級"
            options={GRADE_CHIPS}
            value={filter.grade}
            onPick={(grade) => setFilter((f) => ({ ...f, grade }))}
          />
        </div>

        {state === 'stale' && data !== null && (
          <p className="note">
            <span>·</span>
            <span>而家拉唔到最新資料，{ageText(data.at)}</span>
          </p>
        )}

        {data === null && state === 'loading' && <p className="empty">攞緊零件資料…</p>}

        {data === null && state === 'error' && (
          <div className="empty">
            <p>攞唔到零件資料。啲資料喺一張公開嘅 Google Sheet 度，可能係網絡問題。</p>
            <div className="btnrow" style={{ justifyContent: 'center', marginTop: 'var(--sp-4)' }}>
              <button className="btn chamfer-sm" onClick={retry}>
                再試
              </button>
            </div>
          </div>
        )}

        {data !== null && (
          <>
            <p className="u-eyebrow">搵到 {found} 件</p>
            {found === 0 ? (
              <p className="empty">
                冇零件夾呢個搜尋。
                <br />
                試吓清返啲篩選，或者搵少幾個字。
              </p>
            ) : (
              <div className="pgrid">
                {blades.map((b) => {
                  const k = bladeKey.get(b)!
                  return (
                    <BladeCard
                      key={k}
                      blade={b}
                      open={openId === k}
                      onToggle={() => setOpenId((cur) => (cur === k ? null : k))}
                    />
                  )
                })}
                {parts.map((p) => (
                  <PartCard key={partKey.get(p)!} part={p} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
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

/** 圖格尺寸釘死喺 CSS —— 四百張圖陸續 load 完先撐開，成版會跳到你揀唔到嘢。 */
function PartImg({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="pcard__shot">
      {src !== '' && <img src={src} alt={alt} loading="lazy" />}
    </span>
  )
}

function Tier({ tier }: { tier: string }) {
  const shown = tier === '' || tier === '-' ? '未評' : tier
  return <span className="pcard__tier u-tab">{shown}</span>
}

function BladeCard({
  blade,
  open,
  onToggle,
}: {
  blade: BladeRow
  open: boolean
  onToggle: () => void
}) {
  const type = TYPE_LABEL[blade.type]
  const specs: { k: string; v: string }[] = [
    { k: '原裝固鎖', v: blade.ratchet },
    { k: '原裝軸心', v: blade.bit },
    { k: '原裝輔助戰刃', v: blade.assist },
    { k: '來源產品', v: blade.source },
  ].filter((s) => s.v !== '')

  return (
    <div className="pcard">
      <button className="pcard__main" aria-expanded={open} onClick={onToggle}>
        <PartImg src={blade.img} alt={blade.name} />
        <span className="pcard__body">
          <span className="pcard__name">{blade.name || blade.id}</span>
          <span className="pcard__meta">
            {blade.id}
            {type !== undefined && ` · ${type}`}
          </span>
        </span>
        <Tier tier={blade.tier} />
      </button>

      {open && (
        <div className="pcard__more">
          {specs.length === 0 && blade.combo === '' ? (
            <p className="pcard__blank">張 sheet 度冇填呢隻嘅詳細。</p>
          ) : (
            <>
              {specs.map((s) => (
                <p key={s.k} className="pcard__spec">
                  <span className="pcard__k">{s.k}</span>
                  <span>{s.v}</span>
                </p>
              ))}
              {blade.combo !== '' && (
                <p className="pcard__spec pcard__spec--combo">
                  <span className="pcard__k">建議配置</span>
                  <span className="pcard__combo">{blade.combo}</span>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PartCard({ part }: { part: PartRow }) {
  return (
    <div className="pcard">
      <div className="pcard__main">
        <PartImg src={part.img} alt={part.name} />
        <span className="pcard__body">
          <span className="pcard__name">{part.name}</span>
          <span className="pcard__meta">{KIND_LABEL[part.kind]}</span>
        </span>
        <Tier tier={part.tier} />
      </div>
    </div>
  )
}
