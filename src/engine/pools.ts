import { bracketSize, drawOrder, seedSlots } from './bracket'
import { groupMatches, mergeSchedule } from './schedule'
import { matchScore, matchWinnerId, xtremeInMatch } from './rules'
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

  // 淘汰同加賽場次原封不動擺返出去 —— 補循環賽場次唔應該郁到佢哋。
  return [...renumber(built, poolOf), ...existing.filter((m) => m.stage !== 'group')]
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
export function poolStandings(
  players: Player[],
  matches: Match[],
  poolCount: number,
  headToHead = false,
): PoolTable[] {
  const group = groupMatches(matches)
  return poolsOf(players, poolCount).map((pool, i) => {
    const ids = new Set(pool.map((p) => p.id))
    // 兩邊一定同組，所以查一邊就夠。
    const mine = group.filter((m) => m.aId !== null && ids.has(m.aId))
    return { pool: i + 1, players: pool, rows: computeStandings(pool, mine, headToHead) }
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
  headToHead = false,
): string[] {
  const tables = poolStandings(players, matches, poolCount, headToHead).map((t) => ({
    ...t,
    rows: applyTiebreaks(t, matches, advancePerPool),
  }))
  const globalRank = new Map(
    computeStandings(players, groupMatches(matches), headToHead).map((r, i) => [r.playerId, i]),
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

// ── 並列加賽 ────────────────────────────────────────────────────
//
// 小組賽打完，爭最後嗰個出線位嘅幾個人可能四條規則都分唔開（例：三個人
// 互相循環贏、每場都 4–0，勝場、得分、失分、分差全部一樣）。
//
// 以前呢度靜靜雞攞排頭嗰幾個 —— 而排序最後 fallback 係個名，
// 即係「邊個出線」變成睇個名點串。喺場細路面前，呢個係最唔應該嘅做法。
//
// 而家：嗰幾個人再打一個循環（加賽），睇加賽嘅勝場，再唔得就睇加賽嘅分差。
// 小組賽本身嘅分差唔使睇 —— 會行到加賽就係因為佢已經一樣。

/** 邊幾個人卡住喺出線線上面又分唔開。分得開就返 null。 */
export function tiedAtCut(
  rows: StandingRow[],
  advancePerPool: number,
): { ids: string[]; slots: number } | null {
  // 人數唔夠爭 —— 個個都入到，並列都唔緊要。
  if (advancePerPool < 1 || rows.length <= advancePerPool) return null

  const cutRank = rows[advancePerPool - 1]!.rank
  const start = rows.findIndex((r) => r.rank === cutRank)
  const block = rows.filter((r) => r.rank === cutRank)

  // 線上面嗰個同線下面嗰個分得開 —— 冇嘢要拆。
  if (block.length === 1) return null

  const slots = advancePerPool - start
  // 成班人都入到（並列但全部喺線之上）—— 都係冇嘢要拆。
  if (slots >= block.length) return null

  return { ids: block.map((r) => r.playerId), slots }
}

/** 加賽場次 id：`tb<組><第幾次>m<第幾場>`。同循環賽同淘汰賽都唔會撞。 */
function tiebreakId(pool: number, attempt: number, order: number): string {
  return `tb${pool}r${attempt}m${order}`
}

/**
 * 排一個加賽循環：並列嗰幾個人互相打一次。
 *
 * `attempt` 由 1 起計。打完一次仲係分唔開就排第 2 次，如此類推。
 * 次序跟住 `ids` 入面嘅次序，所以同一批人永遠排出同一個賽程。
 */
export function buildTiebreak(pool: number, ids: string[], attempt: number): Match[] {
  const out: Match[] = []
  let order = 1
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push({
        id: tiebreakId(pool, attempt, order),
        stage: 'tiebreak',
        round: attempt,
        order,
        aId: ids[i]!,
        bId: ids[j]!,
        aFrom: null,
        bFrom: null,
        rounds: [],
      })
      order += 1
    }
  }
  return out
}

/** 呢組、呢一次加賽嘅場次。 */
function tiebreaksFor(matches: Match[], pool: number, attempt: number): Match[] {
  const prefix = `tb${pool}r${attempt}m`
  return matches.filter((m) => m.stage === 'tiebreak' && m.id.startsWith(prefix))
}

/**
 * 加賽成績排先後：勝場 → 分差 → 極限次數。
 *
 * 唔用 `computeStandings` —— 嗰個喺勝場之後仲夾住「總得分」先至到分差，
 * 但加賽嘅規則係直接跳去分差。加賽場數少，尾段多一條極限拆得開多啲，
 * 唔使動不動就叫人打多輪。
 */
export function rankByTiebreak(ids: string[], played: Match[]): TiebreakRow[] {
  const stat = new Map(ids.map((id) => [id, { id, wins: 0, diff: 0, xtreme: 0 }]))
  for (const m of played) {
    if (m.aId === null || m.bId === null) continue
    const a = stat.get(m.aId)
    const b = stat.get(m.bId)
    if (!a || !b) continue
    const { a: sa, b: sb } = matchScore(m)
    a.diff += sa - sb
    b.diff += sb - sa
    a.xtreme += xtremeInMatch(m, m.aId)
    b.xtreme += xtremeInMatch(m, m.bId)
    const winner = matchWinnerId(m)
    if (winner === m.aId) a.wins += 1
    else if (winner === m.bId) b.wins += 1
  }
  // 排唔開嘅照留返原本次序，等上面自己判斷分唔分得開。
  return [...stat.values()].sort(
    (x, y) => y.wins - x.wins || y.diff - x.diff || y.xtreme - x.xtreme,
  )
}

/** 加賽入面一個人嘅成績。 */
export interface TiebreakRow {
  id: string
  wins: number
  /** 加賽場次嘅得失分差。 */
  diff: number
  /** 加賽場次嘅極限勝出次數。 */
  xtreme: number
}

/** 一個組喺出線線上面嘅並列狀況。 */
export interface TieState {
  /** 第幾組，1 起計。 */
  pool: number
  /** 分唔開嗰班人（小組賽排名次序）。 */
  ids: string[]
  /** 佢哋入面爭緊幾多個出線位。 */
  slots: number
  /** 已經排咗幾多次加賽（0 = 未排過）。 */
  attempt: number
  /** 最近嗰次加賽嘅場次。 */
  matches: Match[]
  /** 最近嗰次加賽打完晒未。 */
  played: boolean
  /** 打完之後線上線下分唔分得開。 */
  resolved: boolean
  /**
   * 加賽成績，已經排好次序（勝場 → 分差）。未打完就係吉。
   *
   * 頭 `slots` 個就係出線嗰幾個 —— 前提係 `resolved` 為真。
   * 介面要靠呢啲數畫張表出嚟，唔可以淨係寫一句「邊個邊個出線」。
   */
  results: TiebreakRow[]
}

/** 每組睇一睇出線線上面有冇並列。冇並列嘅組唔會出現喺結果入面。 */
export function tieStates(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
  headToHead = false,
): TieState[] {
  const out: TieState[] = []

  for (const table of poolStandings(players, matches, poolCount, headToHead)) {
    const tie = tiedAtCut(table.rows, advancePerPool)
    if (tie === null) continue

    // 排到第幾次。冇排過就係 0。
    let attempt = 0
    while (tiebreaksFor(matches, table.pool, attempt + 1).length > 0) attempt += 1

    const mine = attempt === 0 ? [] : tiebreaksFor(matches, table.pool, attempt)
    const played = mine.length > 0 && mine.every((m) => matchWinnerId(m) !== null)

    let resolved = false
    let results: TiebreakRow[] = []
    if (played) {
      results = rankByTiebreak(tie.ids, mine)
      const above = results[tie.slots - 1]!
      const below = results[tie.slots]!
      // 淨係要線上線下嗰兩個分得開就夠 —— 唔關事嗰啲分唔開都唔使再打。
      resolved =
        above.wins !== below.wins || above.diff !== below.diff || above.xtreme !== below.xtreme
    }

    out.push({ pool: table.pool, ids: tie.ids, slots: tie.slots, attempt, matches: mine, played, resolved, results })
  }

  return out
}

/** 仲有組拆唔掂就砌唔到籤表。 */
export function tiesPending(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
  headToHead = false,
): boolean {
  return tieStates(players, matches, poolCount, advancePerPool, headToHead).some((s) => !s.resolved)
}

/**
 * 排下一次加賽。
 *
 * 未排過就排第 1 次；已經排咗而且打完但仲分唔開，就排下一次。
 * 打緊嗰次未打完就唔排 —— 唔係會排咗一堆冇人打嘅場次出嚟。
 */
export function nextTiebreak(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
  headToHead = false,
): Match[] {
  const out: Match[] = []
  for (const s of tieStates(players, matches, poolCount, advancePerPool, headToHead)) {
    if (s.resolved) continue
    if (s.attempt === 0) out.push(...buildTiebreak(s.pool, s.ids, 1))
    else if (s.played) out.push(...buildTiebreak(s.pool, s.ids, s.attempt + 1))
  }
  return out
}

/** 用加賽結果重排小組排名表入面並列嗰一段。冇加賽或者拆唔掂就原封不動。 */
function applyTiebreaks(table: PoolTable, matches: Match[], advancePerPool: number): StandingRow[] {
  const tie = tiedAtCut(table.rows, advancePerPool)
  if (tie === null) return table.rows

  let attempt = 0
  while (tiebreaksFor(matches, table.pool, attempt + 1).length > 0) attempt += 1
  if (attempt === 0) return table.rows

  const mine = tiebreaksFor(matches, table.pool, attempt)
  if (!mine.every((m) => matchWinnerId(m) !== null)) return table.rows

  const order = rankByTiebreak(tie.ids, mine).map((r) => r.id)
  const start = table.rows.findIndex((r) => r.playerId === tie.ids[0]!)
  const byId = new Map(table.rows.map((r) => [r.playerId, r]))

  const out = [...table.rows]
  order.forEach((id, i) => {
    out[start + i] = byId.get(id)!
  })
  return out
}
