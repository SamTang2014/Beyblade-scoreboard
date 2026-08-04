import { bracketMatches, groupMatches, mergeSchedule } from './schedule'
import { drawOrder, generateBracket, propagate } from './bracket'
import {
  advanceOptions,
  assignLatecomers,
  buildPoolSchedule,
  drawPools,
  nextTiebreak,
  poolOptions,
  poolSeedOrder,
  tieStates,
  tiesPending,
} from './pools'
import type { TieState } from './pools'
import { computeStandings, isTournamentComplete } from './standings'
import type { Match, Player, Tournament, TournamentMode } from './types'

/**
 * 四個模式共用嘅入口。
 *
 * 每個模式落到最後都係「一堆 Match」，所以介面唔使識分模式 ——
 * 佢淨係讀 stage 同 aFrom/bFrom 就砌到畫面。
 *
 * ⚠ 命名陷阱：`groupThenKnockout` 係「大循環 + 淘汰」（全部人打一個大循環），
 * `poolsThenKnockout` 先係「小組賽 + 淘汰」（分開幾組）。
 * 同樣，`stage: 'group'` 係「循環階段」，`pool` 先係「小組」。
 * 內部名唔改 —— 改咗要遷移已經存咗嘅賽事，為咗個名唔抵。
 */

export const MODE_LABEL: Record<TournamentMode, string> = {
  roundRobin: '單循環',
  knockout: '純淘汰',
  groupThenKnockout: '大循環 + 淘汰',
  poolsThenKnockout: '小組賽 + 淘汰',
}

export const MODE_HINT: Record<TournamentMode, string> = {
  roundRobin: '人人都要同其他所有人打一次，分數最高嗰個贏。',
  knockout: '隨機抽籤，輸咗就出局，一路打到剩返一個。',
  groupThenKnockout: '全部人打晒一個大循環，成績最好嗰幾個再打淘汰賽爭冠軍。',
  poolsThenKnockout: '隨機分幾組，組內打循環，每組頭幾名再打淘汰賽爭冠軍。',
}

/** 呢個模式而家排唔排到賽程。 */
export function canStart(t: Tournament): boolean {
  const n = t.players.length
  if (n < 2) return false

  if (t.mode === 'groupThenKnockout') {
    return t.cutSize !== null && t.cutSize >= 2 && t.cutSize <= n
  }

  if (t.mode === 'poolsThenKnockout') {
    if (t.poolCount === null || t.advancePerPool === null) return false
    if (!poolOptions(n).includes(t.poolCount)) return false
    return advanceOptions(n, t.poolCount).includes(t.advancePerPool)
  }

  return true
}

/** 「大循環 + 淘汰」可以揀嘅入圍人數。 */
export function cutOptions(playerCount: number): number[] {
  return [2, 4, 8, 16].filter((n) => n <= playerCount)
}

export interface StartResult {
  /** 小組賽模式會寫低邊個入邊組；其他模式原封不動擺返出嚟。 */
  players: Player[]
  matches: Match[]
}

/**
 * 開波：由選手名單排出第一批場次。
 *
 * knockout 同 poolsThenKnockout 要 rng（抽籤／抽組）；另外兩個唔使。
 * 兩個混合模式開波嗰陣只係排循環階段 —— 籤表要等循環打完先砌得出，
 * 因為種子係用成績決定。
 */
export function startTournament(t: Tournament, rng: () => number): StartResult {
  switch (t.mode) {
    case 'roundRobin':
    case 'groupThenKnockout':
      return { players: t.players, matches: mergeSchedule(t.matches, t.players) }
    case 'knockout':
      return {
        players: t.players,
        matches: propagate(generateBracket(drawOrder(t.players, rng))),
      }
    case 'poolsThenKnockout': {
      const k = t.poolCount ?? 0
      // 一入咗分就唔可以重抽 —— 重抽會令已經打咗嘅場次變成跨組對戰，
      // 成個小組賽即刻報廢。所以之後撳「補返新場次」淨係補遲到嗰啲人。
      //
      // 但係未入分之前每次都要重抽。呢度本來睇「有冇人已經有組」，
      // 咁就出事：抽完 2 組，返去改做 3 組再撳「排賽程」，人人都仲有組，
      // 於是行咗補遲到嗰條路 —— 但冇人要補，結果 C 組空咗、場次仲係 2 組嗰批，
      // 而開賽設定明明應承咗你 3 組。開賽設定啲掣本身都係「入咗分先鎖」，
      // 呢度跟返同一條界先至一致。
      const started = t.matches.some((m) => m.rounds.length > 0)
      const drawn = started ? assignLatecomers(t.players, k) : drawPools(t.players, k, rng)
      return { players: drawn, matches: buildPoolSchedule(t.matches, drawn, k) }
    }
  }
}

/** 循環階段係咪打完晒（groupThenKnockout、poolsThenKnockout 專用）。 */
export function groupStageComplete(t: Tournament): boolean {
  const group = groupMatches(t.matches)
  return group.length > 0 && isTournamentComplete(group)
}

/** 籤表砌咗未。 */
export function hasBracket(t: Tournament): boolean {
  return bracketMatches(t.matches).length > 0
}

/**
 * 循環打完，攞出線嘅人砌籤表。
 *
 * 大循環 + 淘汰：種子順序 = 總排名，所以第 1 名對最後一個入圍嘅。
 * 小組賽 + 淘汰：交叉搵 —— 各組第 1 名排一梯次、各組第 2 名排下一梯次。
 */
export function buildCut(t: Tournament): Match[] {
  const seeds = cutSeeds(t)
  if (seeds.length < 2) return t.matches
  return [...groupMatches(t.matches), ...propagate(generateBracket(seeds))]
}

function cutSeeds(t: Tournament): string[] {
  if (t.mode === 'poolsThenKnockout') {
    if (t.poolCount === null || t.advancePerPool === null) return []
    // 有組拆唔掂就唔准砌 —— 唔擋嘅話會靜靜雞照排序攞頭幾個，
    // 而排序最後 fallback 係個名，即係「邊個出線」變成睇個名點串。
    if (tiesPending(t.players, t.matches, t.poolCount, t.advancePerPool)) return []
    return poolSeedOrder(t.players, t.matches, t.poolCount, t.advancePerPool)
  }
  if (t.cutSize === null) return []
  return computeStandings(t.players, groupMatches(t.matches), t.headToHead)
    .slice(0, t.cutSize)
    .map((r) => r.playerId)
}

/**
 * 邊一場係「而家應該打」嗰場。
 *
 * 跳過對手未定嘅場次 —— 淘汰賽入面後面幾輪一開始就係咁，
 * 唔跳過嘅話控制台會 show 一場你根本打唔到嘅比賽。
 */
export function nextPlayable(matches: Match[]): Match | null {
  const ready = matches.filter((m) => m.aId !== null && m.bId !== null)
  return ready.find((m) => m.rounds.length === 0) ?? null
}

/** 呢個模式有冇排名表可以睇。 */
export function hasStandings(mode: TournamentMode): boolean {
  return mode !== 'knockout'
}

/**
 * 邊幾組喺出線線上面分唔開。
 *
 * 介面唔使識分模式：唔係小組賽、或者設定未齊，一律返吉。
 */
export function poolTies(t: Tournament): TieState[] {
  if (t.mode !== 'poolsThenKnockout') return []
  if (t.poolCount === null || t.advancePerPool === null) return []
  return tieStates(t.players, t.matches, t.poolCount, t.advancePerPool)
}

/** 排下一次加賽，返返成個新場次表。冇嘢要排就原封不動。 */
export function addTiebreak(t: Tournament): Match[] {
  if (t.mode !== 'poolsThenKnockout') return t.matches
  if (t.poolCount === null || t.advancePerPool === null) return t.matches
  const more = nextTiebreak(t.players, t.matches, t.poolCount, t.advancePerPool)
  return more.length === 0 ? t.matches : [...t.matches, ...more]
}
