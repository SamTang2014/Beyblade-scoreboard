import { matchWinnerId } from './rules'
import type { Match, Player } from './types'

/**
 * 單淘汰籤表。
 *
 * 同單循環最大嘅分別：淘汰賽開賽嗰刻，後面啲場次根本未知邊個打邊個 ——
 * 決賽係「四強場1 嘅贏家 打 四強場2 嘅贏家」。所以場次要記住個指針
 * （aFrom / bFrom），等上游有結果先填人入去。
 *
 * 純 function：唔掂 storage、唔掂 React、唔掂 DOM、唔自己搵隨機數。
 */

/** 大過等於 n 嘅最細 2 次方。 */
export function bracketSize(playerCount: number): number {
  let size = 1
  while (size < playerCount) size *= 2
  return size
}

/** 幾多個人首圈輪空。 */
export function byeCount(playerCount: number): number {
  return playerCount < 2 ? 0 : bracketSize(playerCount) - playerCount
}

/** 淘汰賽要打幾多輪。 */
export function bracketRounds(playerCount: number): number {
  return playerCount < 2 ? 0 : Math.log2(bracketSize(playerCount))
}

/**
 * 標準種子位序。size 8 → [1,8,4,5,2,7,3,6]。
 *
 * 咁排先至令 1 號同 2 號種子只會喺決賽相遇，3、4 號最快喺四強。
 * 相鄰兩個位就係首圈一場。
 */
export function seedSlots(size: number): number[] {
  let slots = [1]
  while (slots.length < size) {
    const pairSum = slots.length * 2 + 1
    const next: number[] = []
    for (const s of slots) {
      next.push(s)
      next.push(pairSum - s)
    }
    slots = next
  }
  return slots
}

/**
 * 隨機抽籤：打亂選手次序。
 *
 * rng 由外面傳入（Fisher–Yates），所以測試可以餵一個固定嘅假 rng，
 * 呢個 function 本身冇 side effect。
 */
export function drawOrder(players: Player[], rng: () => number): string[] {
  const ids = players.map((p) => p.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = ids[i]!
    ids[i] = ids[j]!
    ids[j] = a
  }
  return ids
}

type Source = { kind: 'player'; playerId: string } | { kind: 'match'; matchId: string }

/**
 * 由種子順序砌一個完整籤表。
 *
 * `seedOrder[0]` 係第 1 種子。人數唔夠 2 次方時，頭幾個種子首圈輪空 ——
 * 純淘汰模式因為個順序本身就係隨機抽出嚟，所以等同隨機輪空。
 *
 * 輪空唔會產生場次：首圈某個位淨得一個人，佢直接填落下一輪嗰場，
 * 唔會出現一場「對住空氣」嘅比賽。
 */
export function generateBracket(seedOrder: string[]): Match[] {
  if (seedOrder.length < 2) return []

  const size = bracketSize(seedOrder.length)
  const slots = seedSlots(size)

  // 位序上面每個位擺邊個。種子號大過人數就係輪空（null）。
  let sources: (Source | null)[] = slots.map((seed) => {
    const playerId = seedOrder[seed - 1]
    return playerId === undefined ? null : { kind: 'player', playerId }
  })

  const matches: Match[] = []
  let round = 1

  while (sources.length > 1) {
    const next: (Source | null)[] = []
    const pairs: { a: Source; b: Source; slot: number }[] = []

    for (let i = 0; i < sources.length; i += 2) {
      const a = sources[i] ?? null
      const b = sources[i + 1] ?? null

      // 兩邊都空 → 呢條線根本冇人，繼續空落去。
      if (a === null && b === null) {
        next.push(null)
        continue
      }
      // 一邊空 → 另一邊輪空晉級，唔開場次。
      if (a === null) {
        next.push(b)
        continue
      }
      if (b === null) {
        next.push(a)
        continue
      }

      pairs.push({ a, b, slot: next.length })
      next.push(null) // 場次編咗號先填返落去
    }

    // 排場次：兩邊都係輪空直入嘅場先打；接上一輪贏家嘅場排最尾，
    // 等啱啱打完嗰個唞返陣先再上場。sort 係 stable，其餘次序不變。
    const fed = (p: { a: Source; b: Source }) => (p.a.kind === 'match' || p.b.kind === 'match' ? 1 : 0)
    let order = 1
    for (const p of [...pairs].sort((x, y) => fed(x) - fed(y))) {
      const id = `b${round}m${order}`
      matches.push({
        id,
        stage: 'bracket',
        round,
        order,
        aId: p.a.kind === 'player' ? p.a.playerId : null,
        bId: p.b.kind === 'player' ? p.b.playerId : null,
        aFrom: p.a.kind === 'match' ? p.a.matchId : null,
        bFrom: p.b.kind === 'match' ? p.b.matchId : null,
        rounds: [],
      })
      next[p.slot] = { kind: 'match', matchId: id }
      order += 1
    }

    sources = next
    round += 1
  }

  return matches
}

/**
 * 上游有結果就填落下游。
 *
 * 由第一輪行到最後一輪，所以一次過就傳到底 —— 唔使叫兩次。
 * 上游未有結果嘅位會被清返做 null，咁改咗上游之後下游唔會殘留舊對手。
 */
export function propagate(matches: Match[]): Match[] {
  const byId = new Map(matches.map((m) => [m.id, m]))
  const result = matches.map((m) => ({ ...m }))
  const out = new Map(result.map((m) => [m.id, m]))

  for (const m of [...result].sort((x, y) => x.round - y.round)) {
    if (m.aFrom !== null) {
      const up = out.get(m.aFrom) ?? byId.get(m.aFrom)
      m.aId = up === undefined ? null : matchWinnerId(up)
    }
    if (m.bFrom !== null) {
      const up = out.get(m.bFrom) ?? byId.get(m.bFrom)
      m.bId = up === undefined ? null : matchWinnerId(up)
    }
  }

  return result
}

/**
 * 改咗 `matchId` 會連累到邊幾場。
 *
 * 返出嚟嘅唔包括自己。用嚟喺改分之前話俾用戶知會冇咗啲乜。
 */
export function downstreamOf(matches: Match[], matchId: string): string[] {
  const affected: string[] = []
  const frontier = new Set([matchId])

  for (const m of [...matches].sort((x, y) => x.round - y.round)) {
    if (m.id === matchId) continue
    if ((m.aFrom !== null && frontier.has(m.aFrom)) || (m.bFrom !== null && frontier.has(m.bFrom))) {
      affected.push(m.id)
      frontier.add(m.id)
    }
  }

  return affected
}

/** 下游入面有邊幾場已經入咗分 —— 呢啲就係改上游會清走嘅嘢。 */
export function downstreamWithScores(matches: Match[], matchId: string): Match[] {
  const ids = new Set(downstreamOf(matches, matchId))
  return matches.filter((m) => ids.has(m.id) && m.rounds.length > 0)
}

/**
 * 改上游之後清走下游啲分，再重新推進。
 * 淨係郁下游 —— 被改嗰場自己嘅分由呼叫者負責。
 */
export function clearDownstream(matches: Match[], matchId: string): Match[] {
  const ids = new Set(downstreamOf(matches, matchId))
  return propagate(matches.map((m) => (ids.has(m.id) ? { ...m, rounds: [] } : m)))
}

const ROUND_NAME: Record<number, string> = {
  1: '決賽',
  2: '四強',
  3: '八強',
  4: '十六強',
  5: '三十二強',
}

/** 「決賽」「四強」…… 由仲有幾多輪未打計出嚟。 */
export function bracketRoundName(round: number, totalRounds: number): string {
  const remaining = totalRounds - round + 1
  return ROUND_NAME[remaining] ?? `第 ${round} 輪`
}

/** 淘汰階段總共幾多輪。 */
export function totalBracketRounds(matches: Match[]): number {
  const rounds = matches.filter((m) => m.stage === 'bracket').map((m) => m.round)
  return rounds.length === 0 ? 0 : Math.max(...rounds)
}

/** 成個籤表打完之後嘅冠軍。未打完返 null。 */
export function bracketChampion(matches: Match[]): string | null {
  const bracket = matches.filter((m) => m.stage === 'bracket')
  if (bracket.length === 0) return null
  const last = Math.max(...bracket.map((m) => m.round))
  const final = bracket.find((m) => m.round === last)
  return final === undefined ? null : matchWinnerId(final)
}
