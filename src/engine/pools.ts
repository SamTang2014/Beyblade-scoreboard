import { bracketSize, drawOrder, seedSlots } from './bracket'
import { bracketMatches, groupMatches, mergeSchedule } from './schedule'
import { computeStandings } from './standings'
import type { Match, Player, StandingRow } from './types'

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

export interface PoolTable {
  /** 第幾組，1 起計。 */
  pool: number
  players: Player[]
  rows: StandingRow[]
}

/**
 * 逐組排名。
 *
 * 同一套 tiebreak（`computeStandings` 唔使改），淨係餵入去嘅選手同場次
 * 換成嗰組嘅 —— 所以 B 組打完一場唔會郁到 A 組嘅名次。
 */
export function poolStandings(players: Player[], matches: Match[], poolCount: number): PoolTable[] {
  const group = groupMatches(matches)
  return poolsOf(players, poolCount).map((pool, i) => {
    const ids = new Set(pool.map((p) => p.id))
    // 兩邊一定同組，所以查一邊就夠。
    const mine = group.filter((m) => m.aId !== null && ids.has(m.aId))
    return { pool: i + 1, players: pool, rows: computeStandings(pool, mine) }
  })
}

/**
 * 交叉種子。
 *
 * 各組第 1 名排一梯次、各組第 2 名排下一梯次，如此類推；同梯次之間用
 * 總成績（全部小組場次一齊計）分先後。排完再行修補 pass。
 *
 * 點解要梯次：同組嘅人組內已經打過，一入淘汰就重演冇意思。
 */
export function poolSeedOrder(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
): string[] {
  const tables = poolStandings(players, matches, poolCount)
  const globalRank = new Map(
    computeStandings(players, groupMatches(matches)).map((r, i) => [r.playerId, i]),
  )

  const seeds: string[] = []
  const tierOf = new Map<string, number>()

  for (let place = 0; place < advancePerPool; place++) {
    const tier = tables
      .map((t) => t.rows[place]?.playerId)
      .filter((id): id is string => id !== undefined)
      .sort((x, y) => (globalRank.get(x) ?? 0) - (globalRank.get(y) ?? 0))
    for (const id of tier) tierOf.set(id, place)
    seeds.push(...tier)
  }

  const poolOf = new Map(players.map((p) => [p.id, p.pool]))
  return avoidSamePool(seeds, poolOf, tierOf)
}

/**
 * 修補 pass：首圈撞到同組嘅就換位。
 *
 * 郁後面嗰個種子（位序細嗰個唔郁，保住上梯次嘅位），喺**同梯次**入面搵對象換。
 * 換之前兩邊都要 check：換完呢一對唔再同組，而且被抽走嗰個原本嗰對亦唔會變成同組。
 * 逐對按位序掃、候選按種子號由細到大掃，第一個合格就換 —— 所以結果係定死嘅，唔靠隨機。
 *
 * **點解唔用一條死規則：** 試過兩條都唔 work ——
 * 梯次照順序排，3 組出 2 個嗰陣 C 組第 1 會撞返 C 組第 2；
 * 梯次輪轉一格，2 組出 2 個嗰陣 A 組第 1 會撞返 A 組第 2。冇一條固定規則食晒所有組合。
 *
 * 掃到冇嘢再換為止（最多 4 次）。**唔係**因為換一次會開返另一對出嚟 —— 呢樣係冇可能嘅：
 * 一次換淨係郁到 `move` 同 `c` 兩個位，受影響嘅就只有 `(keep, move)` 同 `(c, partner)` 兩對，
 * 而換之前嗰個 check 兩對都驗過先算數。擋住「補甲爆乙」嘅係嗰個 check，唔係呢個迴圈。
 *
 * 要行多幾 pass 係另一個原因：呢一 pass 掃唔到合格候選嘅一對，等後面幾次換位
 * 攪動咗個種子表之後，下一 pass 可能就搵到。真係搵唔到就照擺，唔硬拗。
 *
 * ⚠ 呢個 function 淨係管**首圈**。後面幾輪冇得保證：2 組出 3 個嗰陣，
 * A 組第 1 有可能喺第 2 輪撞返啱啱贏咗首圈嘅 A 組第 3。呢個係單淘汰籤表嘅本質。
 */
export function avoidSamePool(
  seeds: string[],
  poolOf: Map<string, number | null>,
  tierOf: Map<string, number>,
): string[] {
  const out = [...seeds]
  if (out.length < 2) return out

  const size = bracketSize(out.length)
  const slots = seedSlots(size)

  /** 種子號 → 首圈對手嘅種子號。 */
  const rival = new Map<number, number>()
  for (let i = 0; i < size; i += 2) {
    rival.set(slots[i]!, slots[i + 1]!)
    rival.set(slots[i + 1]!, slots[i]!)
  }

  /** 種子號係邊組。號碼超出人數即係輪空，冇組。 */
  const poolAt = (seedNo: number): number | null | undefined =>
    seedNo > out.length ? undefined : (poolOf.get(out[seedNo - 1]!) ?? null)

  const clash = (x: number, y: number): boolean => {
    const px = poolAt(x)
    const py = poolAt(y)
    return px !== undefined && py !== undefined && px === py
  }

  // 呢一 pass 搵唔到候選嘅一對，俾後面嘅換位攪動過個表之後可能就搵到，所以要掃多幾轉。
  for (let pass = 0; pass < 4; pass++) {
    let swapped = false

    for (let i = 0; i < size; i += 2) {
      const x = slots[i]!
      const y = slots[i + 1]!
      if (!clash(x, y)) continue

      const keep = Math.min(x, y)
      const move = Math.max(x, y)

      for (let c = 1; c <= out.length; c++) {
        if (c === keep || c === move) continue
        if (tierOf.get(out[c - 1]!) !== tierOf.get(out[move - 1]!)) continue

        const partner = rival.get(c)!
        const mine = out[move - 1]!
        out[move - 1] = out[c - 1]!
        out[c - 1] = mine

        // 兩對都要清先算數。⚠ 兩個條件缺一不可 —— 淨係驗返自己嗰對（前面嗰個），
        // 就會出現「補甲爆乙」：手頭上呢對修好咗，但被抽走嗰個原本嗰對變成內戰。
        // 呢度先係唔會愈換愈亂嘅保證，唔好當外面個多 pass 迴圈會執手尾。
        if (!clash(keep, move) && !clash(c, partner)) {
          swapped = true
          break
        }

        // 換唔成，換返轉頭。次序要緊：先寫返 c 個位。
        out[c - 1] = out[move - 1]!
        out[move - 1] = mine
      }
    }

    if (!swapped) break
  }

  return out
}
