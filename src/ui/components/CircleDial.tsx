import { circleFrame } from '../../engine/schedule'
import type { Player } from '../../engine/types'

const CX = 50
const CY = 50
const R = 38
const DOT = 7.5

function seatPosition(index: number, count: number): { x: number; y: number } {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2
  return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) }
}

function short(name: string): string {
  return [...name].slice(0, 3).join('')
}

/**
 * 圓周法本人。
 *
 * 圈上面嘅位置同連線係釘死嘅 —— 郁嘅係人。第一個位嗰個唔郁，
 * 其餘每過一輪順時針行一格，行到邊個位就同對面嗰位打。
 * 由頭到尾都係呢個動作，所以個轉盤唔係插圖，係條演算法本身。
 */
export function CircleDial({
  players,
  round,
  caption,
}: {
  players: Player[]
  round: number
  caption?: string
}) {
  const { ring, chords } = circleFrame(players, round)
  const count = ring.length
  if (count < 2) return null

  const positions = Array.from({ length: count }, (_, i) => seatPosition(i, count))
  const seatOf = new Map<string, number>()
  ring.forEach((p, i) => {
    if (p) seatOf.set(p.id, i)
  })
  const byeSeat = ring.findIndex((p) => p === null)

  const pairs = chords
    .map(({ from, to }) => [ring[from], ring[to]] as const)
    .filter(([a, b]) => a && b)
    .map(([a, b]) => `${a!.name} 打 ${b!.name}`)
    .join('，')

  return (
    <figure className="dial-wrap">
      <svg
        className="dial"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`第 ${round} 輪：${pairs}`}
      >
        <circle className="dial__ring" cx={CX} cy={CY} r={R} />

        {chords.map(({ from, to }) => {
          const a = positions[from]!
          const b = positions[to]!
          const isBye = ring[from] === null || ring[to] === null
          return (
            <line
              key={`${from}-${to}`}
              className={isBye ? 'dial__chord dial__chord--bye' : 'dial__chord'}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          )
        })}

        {byeSeat >= 0 && (
          <g className="dial__seat" transform={`translate(${positions[byeSeat]!.x} ${positions[byeSeat]!.y})`}>
            <circle className="dial__dot dial__dot--bye" r={DOT} />
            <text className="dial__label dial__label--bye" y="0.5">
              唞
            </text>
          </g>
        )}

        {[...players]
          .sort((a, b) => a.seat - b.seat)
          .map((p) => {
            const seat = seatOf.get(p.id)
            if (seat === undefined) return null
            const pos = positions[seat]!
            const isFixed = seat === 0
            return (
              <g key={p.id} className="dial__seat" transform={`translate(${pos.x} ${pos.y})`}>
                <circle className={isFixed ? 'dial__dot dial__dot--fixed' : 'dial__dot'} r={DOT} />
                <text className={isFixed ? 'dial__label dial__label--fixed' : 'dial__label'} y="0.5">
                  {short(p.name)}
                </text>
              </g>
            )
          })}
      </svg>
      {caption !== undefined && <figcaption className="dial__caption">{caption}</figcaption>}
    </figure>
  )
}
