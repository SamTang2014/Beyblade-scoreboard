import { drawOrder } from './bracket'
import { bracketMatches, groupMatches, mergeSchedule } from './schedule'
import type { Match, Player } from './types'

/**
 * 小組賽。
 *
 * 同「大循環 + 淘汰」（`groupThenKnockout`）唔同：嗰個係全部人打一個大循環，
 * 呢個係分開幾組、淨係同組內嘅人打。12 個人打大循環要 66 場，分 3 組得 18 場 ——
 * 呢個就係開呢個模式嘅原因。
 *
 * 詞彙：`stage: 'group'` 係「循環階段」（兩個混合模式都用），`pool` 先係「小組」。
 *
 * 純 function：唔掂 storage、唔掂 React、唔掂 DOM、唔自己搵隨機數。
 */

/** 揀得幾多組。每組最少 2 個人，唔係嗰組根本冇得打。 */
export function poolOptions(playerCount: number): number[] {
  return [2, 3, 4, 5, 6].filter((n) => playerCount >= n * 2)
}

/** 每組幾多人。夾唔啱就早啲嘅組多一個：(13, 3) → [5, 4, 4]。 */
export function poolSizes(playerCount: number, poolCount: number): number[] {
  if (poolCount < 1) return []
  const base = Math.floor(playerCount / poolCount)
  const extra = playerCount % poolCount
  return Array.from({ length: poolCount }, (_, i) => base + (i < extra ? 1 : 0))
}

/** 每組出得幾多個。最多就係最細嗰組嘅人數 —— 唔可以出多過組入面有嘅人。 */
export function advanceOptions(playerCount: number, poolCount: number): number[] {
  const sizes = poolSizes(playerCount, poolCount)
  if (sizes.length === 0) return []
  const smallest = Math.min(...sizes)
  return [1, 2, 3].filter((k) => k <= smallest)
}

/** 1 → 「A」、2 → 「B」…… 介面一律用字母叫組別，唔叫「第 1 組」。 */
export function poolLabel(pool: number): string {
  return String.fromCharCode(64 + pool)
}

/**
 * 隨機抽組。
 *
 * 洗完牌一人一組派落去（第 i 個入第 (i % 組數) + 1 組），
 * 所以組同組最多爭一個人，而且早啲嘅組多嗰一個 —— 同 `poolSizes` 對得返。
 *
 * rng 由外面傳入，所以測試餵固定假 rng 就有固定結果。
 */
export function drawPools(players: Player[], poolCount: number, rng: () => number): Player[] {
  if (poolCount < 1) return players.map((p) => ({ ...p, pool: null }))
  const order = drawOrder(players, rng)
  const assigned = new Map(order.map((id, i) => [id, (i % poolCount) + 1]))
  return players.map((p) => ({ ...p, pool: assigned.get(p.id) ?? null }))
}

/**
 * 未分組嘅人塞落人最少嗰組，打和就入組號細嗰個。
 *
 * 賽事開咗之後加人行呢條路 —— **唔可以重抽**，重抽會令已經打咗嘅場次
 * 變成跨組對戰，成個小組賽即刻報廢。
 */
export function assignLatecomers(players: Player[], poolCount: number): Player[] {
  if (poolCount < 1) return players.map((p) => ({ ...p }))

  const inRange = (pool: number | null): pool is number =>
    pool !== null && pool >= 1 && pool <= poolCount

  const size = Array.from({ length: poolCount }, () => 0)
  for (const p of players) if (inRange(p.pool)) size[p.pool - 1]! += 1

  const out = players.map((p) => ({ ...p }))
  // 跟入座次序逐個派，所以同一份名單永遠出同一個結果。
  for (const p of [...out].sort((x, y) => x.seat - y.seat)) {
    if (inRange(p.pool)) continue
    let pick = 0
    for (let i = 1; i < poolCount; i++) if (size[i]! < size[pick]!) pick = i
    p.pool = pick + 1
    size[pick]! += 1
  }
  return out
}

/** 逐組嘅選手，index 0 = 第 1 組。組內按入座次序，未分組嘅唔會出現。 */
export function poolsOf(players: Player[], poolCount: number): Player[][] {
  return Array.from({ length: Math.max(0, poolCount) }, (_, i) =>
    players.filter((p) => p.pool === i + 1).sort((x, y) => x.seat - y.seat),
  )
}

/**
 * 逐組排／補賽程。
 *
 * 每組各自行圓周法 —— 直接用返 `mergeSchedule`，餵入去嘅淨係嗰組嘅人同嗰組嘅場次。
 * 咁樣中途加人嘅處理（舊場次一場唔郁、同一輪冇人打兩場）自動繼承落嚟，
 * 唔使喺呢度重寫一次排程邏輯。
 *
 * 輪次對齊：每組自己嘅第 1 輪就係全場第 1 輪。人少嗰組早幾輪打完就冇咗場次 ——
 * 呢個係啱嘅，`byesInRound` 會知佢哋係打完唔係唞。
 */
export function buildPoolSchedule(
  existing: Match[],
  players: Player[],
  poolCount: number,
): Match[] {
  const poolOf = new Map(players.map((p) => [p.id, p.pool]))
  const group = groupMatches(existing)

  const built: Match[] = []
  for (const [i, pool] of poolsOf(players, poolCount).entries()) {
    // 兩邊都要仲喺呢組先算數 —— 除咗名嘅、或者組別俾人改到唔合理嘅，
    // 喺呢度自然咁跌咗出去。
    const mine = group.filter(
      (m) =>
        m.aId !== null &&
        m.bId !== null &&
        poolOf.get(m.aId) === i + 1 &&
        poolOf.get(m.bId) === i + 1,
    )
    built.push(...mergeSchedule(mine, pool))
  }

  return [...renumber(built, poolOf), ...bracketMatches(existing)]
}

/**
 * 同一輪入面按組別 A→B→C 重編次序。
 *
 * 唔重編嘅話，兩組喺同一輪都會有一場 `order: 1`，`inPlayOrder` 排出嚟嘅
 * 次序就靠 sort 穩定性頂住 —— 睇落 work，但補一次人就會跳位。
 */
function renumber(matches: Match[], poolOf: Map<string, number | null>): Match[] {
  const sorted = [...matches].sort(
    (x, y) =>
      x.round - y.round ||
      (poolOf.get(x.aId ?? '') ?? 0) - (poolOf.get(y.aId ?? '') ?? 0) ||
      x.order - y.order ||
      x.id.localeCompare(y.id),
  )

  let round = 0
  let order = 0
  return sorted.map((m) => {
    if (m.round !== round) {
      round = m.round
      order = 0
    }
    order += 1
    return { ...m, order }
  })
}
