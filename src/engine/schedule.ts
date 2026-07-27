import { matchKey } from './rules'
import type { Match, Player } from './types'

/**
 * 圓周法（circle method）。
 *
 * 選手排成一個圈：第一個人釘死唔郁，其餘每輪順時針轉一格。
 * 每輪對面嘅兩個人就係一場。單數人數補一個 null（輪空），
 * 撞到 null 嗰個人就係嗰輪唞。
 *
 * 純 function：唔掂 storage、唔掂 React、唔掂 DOM。
 */

/** 某一輪嘅圈面，index 就係圈上面嘅位置。null = 輪空位。 */
export interface CircleFrame {
  ring: (Player | null)[]
  /** 圈上面對住嘅位置對。畫線用。 */
  chords: { from: number; to: number }[]
}

function seated(players: Player[]): Player[] {
  return [...players].sort((x, y) => x.seat - y.seat || x.id.localeCompare(y.id))
}

/** 補齊輪空之後嘅圈，人數一定係雙數。 */
function paddedRing(players: Player[]): (Player | null)[] {
  const ring: (Player | null)[] = seated(players)
  if (ring.length % 2 === 1) ring.push(null)
  return ring
}

/** 第一個位釘死，其餘順時針轉一格。 */
function rotate(ring: (Player | null)[]): (Player | null)[] {
  if (ring.length < 3) return [...ring]
  const [fixed, ...rest] = ring
  const last = rest.pop()!
  return [fixed!, last, ...rest]
}

export function totalRounds(playerCount: number): number {
  if (playerCount < 2) return 0
  return playerCount % 2 === 0 ? playerCount - 1 : playerCount
}

/** 單循環總場數 = n(n-1)/2。 */
export function totalMatches(playerCount: number): number {
  if (playerCount < 2) return 0
  return (playerCount * (playerCount - 1)) / 2
}

/**
 * 攞第 `round` 輪（1 起計）嘅圈面，畫轉盤動畫用。
 * round 超出範圍會 wrap，方便 UI 循環播放。
 */
export function circleFrame(players: Player[], round: number): CircleFrame {
  const base = paddedRing(players)
  const m = base.length
  const chords: { from: number; to: number }[] = []
  for (let i = 0; i < m / 2; i++) chords.push({ from: i, to: m - 1 - i })

  if (m < 2) return { ring: base, chords: [] }

  const steps = ((round - 1) % (m - 1) + (m - 1)) % (m - 1)
  let ring = base
  for (let r = 0; r < steps; r++) ring = rotate(ring)
  return { ring, chords }
}

/**
 * 派藍紅邊。
 *
 * 圓周法本身會令某啲人次次都排喺同一邊，所以唔靠圈嘅幾何嚟決定。
 * 改為將選手當成一個 0..n-1 嘅環：睇由 x 順時針行到 y 要行幾步，
 * 行少過半個圈就 x 做藍邊，多過就 y 做。啱啱半個圈（只有雙數人數先會出現）
 * 就用位置細嗰個做藍邊。
 *
 * 咁樣每個人做藍邊嘅次數一定係 ⌊(n-1)/2⌋ 或 ⌈(n-1)/2⌉，
 * 即係藍紅邊相差最多一場，同人數幾多無關。
 */
function blueFirst(x: Player, y: Player, index: Map<string, number>, n: number): [Player, Player] {
  const i = index.get(x.id)!
  const j = index.get(y.id)!
  const steps = (j - i + n) % n
  const xIsBlue = steps < n / 2 || (steps === n / 2 && i < n / 2)
  return xIsBlue ? [x, y] : [y, x]
}

/**
 * 排一個完整單循環賽程。
 *
 * 場次 id 由對戰雙方組成，所以同一對人無論排幾多次都係同一個 id ——
 * 中途加人重排時，已入嘅分靠呢個 id 對返上。
 */
export function generateSchedule(players: Player[]): Match[] {
  const list = seated(players)
  if (list.length < 2) return []

  const index = new Map(list.map((p, i) => [p.id, i]))
  let ring = paddedRing(list)
  const m = ring.length
  const matches: Match[] = []

  for (let r = 0; r < m - 1; r++) {
    let order = 1
    for (let i = 0; i < m / 2; i++) {
      const home = ring[i]
      const away = ring[m - 1 - i]
      if (!home || !away) continue

      const [a, b] = blueFirst(home, away, index, list.length)
      matches.push({
        id: matchKey(a.id, b.id),
        round: r + 1,
        order: order++,
        aId: a.id,
        bId: b.id,
        rounds: [],
      })
    }
    ring = rotate(ring)
  }

  return matches
}

/**
 * 中途加人。已經排咗（無論打完未）嘅場次原封不動留返喺原位，
 * 只係補返未有過嘅配對，插喺賽程最尾。
 *
 * 補嘅時候會確保同一輪入面冇人要打兩場。
 */
export function mergeSchedule(existing: Match[], players: Player[]): Match[] {
  const known = new Set(players.map((p) => p.id))
  // 有選手俾人刪咗嘅話，佢嘅場次一齊消失。
  const kept = existing.filter((m) => known.has(m.aId) && known.has(m.bId))
  const keptIds = new Set(kept.map((m) => m.id))

  const pool = generateSchedule(players).filter((m) => !keptIds.has(m.id))
  if (pool.length === 0) return kept

  let round = kept.reduce((mx, m) => Math.max(mx, m.round), 0)
  const appended: Match[] = []

  while (pool.length > 0) {
    round += 1
    const busy = new Set<string>()
    let order = 1
    for (let i = 0; i < pool.length; ) {
      const m = pool[i]!
      if (busy.has(m.aId) || busy.has(m.bId)) {
        i += 1
        continue
      }
      busy.add(m.aId)
      busy.add(m.bId)
      appended.push({ ...m, round, order: order++ })
      pool.splice(i, 1)
    }
  }

  // 舊場次一律唔郁，連藍紅邊都唔換。
  return [...kept, ...appended]
}

/**
 * 而家個賽程係咪仲係一個乾淨嘅圓周法排程。
 *
 * 中途加過人之後，補返嘅場次係貪心塞落尾嘅新輪次，唔再係轉盤轉出嚟嘅。
 * 呢個時候轉盤同賽程會對唔上，所以介面要收起個轉盤，唔好講大話。
 */
export function isPureCircleSchedule(matches: Match[], players: Player[]): boolean {
  const ideal = generateSchedule(players)
  if (ideal.length !== matches.length) return false
  const slots = new Set(ideal.map((m) => `${m.round}:${m.id}`))
  return matches.every((m) => slots.has(`${m.round}:${m.id}`))
}

/** 邊個喺呢輪冇得打。 */
export function byesInRound(matches: Match[], players: Player[], round: number): Player[] {
  const playing = new Set<string>()
  for (const m of matches) {
    if (m.round !== round) continue
    playing.add(m.aId)
    playing.add(m.bId)
  }
  return seated(players).filter((p) => !playing.has(p.id))
}

/** 賽程順序：先按輪次，再按輪入面嘅次序。 */
export function inPlayOrder(matches: Match[]): Match[] {
  return [...matches].sort((x, y) => x.round - y.round || x.order - y.order)
}
