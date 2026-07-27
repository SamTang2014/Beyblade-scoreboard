import { circleFrame } from '../../engine/schedule'
import { matchKey } from '../../engine/rules'
import type { Match, Player } from '../../engine/types'

/**
 * 圓周法本人。
 *
 * 圈上面嘅位置同連線係釘死嘅 —— 郁嘅係人。第一個位嗰個唔郁，
 * 其餘每過一輪順時針行一格，行到邊個位就同對面嗰位打。
 * 由頭到尾都係呢個動作，所以個轉盤唔係插圖，係條演算法本身。
 *
 * 個名擺喺圈外面唔擺喺粒圓入面 —— 塞入去嘅話，個名長少少就要砍到剩三個字。
 */

const RING = 52
const GAP = 5.5
const HUB = 15

/** 中文一個字大約一個 em，留鬆少少免得個名撞到隔籬。 */
const CHAR_W = 0.95

/** 圈上面第 seat 個位嘅單位向量，由正上方開始順時針。 */
function unitAt(seat: number, count: number): { x: number; y: number } {
  const angle = (seat / count) * Math.PI * 2 - Math.PI / 2
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

export interface CircleDialProps {
  players: Player[]
  round: number
  /** 有嘅話啲點會分返藍紅邊，同賽程一致；冇就用中性色。 */
  matches?: Match[]
  caption?: string
}

export function CircleDial({ players, round, matches = [], caption }: CircleDialProps) {
  const { ring, chords } = circleFrame(players, round)
  const count = ring.length
  if (count < 2) return null

  const font = count > 12 ? 6.5 : 8.5
  const dot = count > 12 ? 4.5 : 5.5

  // 邊個名最長就決定個圖要幾闊。唔砍名，改為讓開位俾佢。
  const longest = players.reduce((n, p) => Math.max(n, [...p.name].length), 2)
  const halfW = RING + dot + GAP + longest * font * CHAR_W + 4
  const halfH = RING + dot + font + 10

  const seatOf = new Map<string, number>()
  ring.forEach((p, i) => {
    if (p) seatOf.set(p.id, i)
  })

  /** 圈上面對住嘅位就係對手。 */
  const opponentSeat = (seat: number) => count - 1 - seat

  const sideOf = (me: Player, seat: number): 'blue' | 'red' | null => {
    const foe = ring[opponentSeat(seat)]
    if (!foe) return null
    const m = matches.find((x) => x.id === matchKey(me.id, foe.id))
    if (m === undefined) return null
    return m.aId === me.id ? 'blue' : 'red'
  }

  const pairs = chords
    .map(({ from, to }) => [ring[from], ring[to]] as const)
    .filter(([a, b]) => a && b)
    .map(([a, b]) => `${a!.name} 打 ${b!.name}`)
    .join('，')

  const byeSeat = ring.findIndex((p) => p === null)

  return (
    <figure className="dial-wrap">
      <svg
        className="dial"
        viewBox={`${-halfW} ${-halfH} ${halfW * 2} ${halfH * 2}`}
        role="img"
        aria-label={`第 ${round} 輪：${pairs}`}
      >
        <circle className="dial__ring" cx="0" cy="0" r={RING} />

        {chords.map(({ from, to }) => {
          const a = unitAt(from, count)
          const b = unitAt(to, count)
          const isBye = ring[from] === null || ring[to] === null
          return (
            <line
              key={`${from}-${to}`}
              className={isBye ? 'dial__chord dial__chord--bye' : 'dial__chord'}
              x1={a.x * RING}
              y1={a.y * RING}
              x2={b.x * RING}
              y2={b.y * RING}
            />
          )
        })}

        {/* 個轂遮住穿過圓心嗰條線，順便擺個輪次落去。 */}
        <circle className="dial__hub" cx="0" cy="0" r={HUB} />
        <text className="dial__hub-no" x="0" y="-1">
          {round}
        </text>
        <text className="dial__hub-cap" x="0" y="9.5">
          輪
        </text>

        {byeSeat >= 0 && (
          <Seat key="bye" seat={byeSeat} count={count} dot={dot} font={font} label="輪空" bye />
        )}

        {[...players]
          .sort((a, b) => a.seat - b.seat)
          .map((p) => {
            const seat = seatOf.get(p.id)
            if (seat === undefined) return null
            return (
              <Seat
                key={p.id}
                seat={seat}
                count={count}
                dot={dot}
                font={font}
                label={p.name}
                fixed={seat === 0}
                side={sideOf(p, seat)}
              />
            )
          })}
      </svg>
      {caption !== undefined && <figcaption className="dial__caption">{caption}</figcaption>}
    </figure>
  )
}

/**
 * 圈上面一個位。
 *
 * 一定要擺喺 CircleDial 外面 —— 喺入面定義嘅話每次 render 都係一個新
 * component type，React 會拆咗佢再砌過，粒點就唔會滑過去，冇晒轉盤個動畫。
 */
function Seat({
  seat,
  count,
  dot,
  font,
  label,
  fixed = false,
  bye = false,
  side = null,
}: {
  seat: number
  count: number
  dot: number
  font: number
  label: string
  fixed?: boolean
  bye?: boolean
  side?: 'blue' | 'red' | null
}) {
  const u = unitAt(seat, count)
  const anchor = u.x > 0.15 ? 'start' : u.x < -0.15 ? 'end' : 'middle'

  const dotClass = bye
    ? 'dial__dot dial__dot--bye'
    : side === 'blue'
      ? 'dial__dot dial__dot--blue'
      : side === 'red'
        ? 'dial__dot dial__dot--red'
        : 'dial__dot'

  return (
    <g className="dial__seat" transform={`translate(${u.x * RING} ${u.y * RING})`}>
      {fixed && <circle className="dial__pin" r={dot + 3.5} />}
      <circle className={dotClass} r={dot} />
      <text
        className={bye ? 'dial__label dial__label--bye' : 'dial__label'}
        x={u.x * (dot + GAP)}
        y={u.y * (dot + GAP)}
        fontSize={font}
        textAnchor={anchor}
      >
        {label}
      </text>
    </g>
  )
}
