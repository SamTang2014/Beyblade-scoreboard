import { bracketMatches, groupMatches, mergeSchedule } from './schedule'
import { drawOrder, generateBracket, propagate } from './bracket'
import { computeStandings, isTournamentComplete } from './standings'
import type { Match, Tournament, TournamentMode } from './types'

/**
 * 三個模式共用嘅入口。
 *
 * 每個模式落到最後都係「一堆 Match」，所以介面唔使識分模式 ——
 * 佢淨係讀 stage 同 aFrom/bFrom 就砌到畫面。
 */

export const MODE_LABEL: Record<TournamentMode, string> = {
  roundRobin: '單循環',
  knockout: '純淘汰',
  groupThenKnockout: '循環 + 淘汰',
}

export const MODE_HINT: Record<TournamentMode, string> = {
  roundRobin: '人人都要同其他所有人打一次，分數最高嗰個贏。',
  knockout: '隨機抽籤，輸咗就出局，一路打到剩返一個。',
  groupThenKnockout: '先打晒單循環，成績最好嗰幾個再打淘汰賽爭冠軍。',
}

/** 呢個模式而家排唔排到賽程。 */
export function canStart(mode: TournamentMode, playerCount: number, cutSize: number | null): boolean {
  if (playerCount < 2) return false
  if (mode !== 'groupThenKnockout') return true
  return cutSize !== null && cutSize >= 2 && cutSize <= playerCount
}

/** 「循環 + 淘汰」可以揀嘅入圍人數。 */
export function cutOptions(playerCount: number): number[] {
  return [2, 4, 8, 16].filter((n) => n <= playerCount)
}

/**
 * 開波：由選手名單排出第一批場次。
 *
 * knockout 要 rng（隨機抽籤）；另外兩個模式唔使。
 * groupThenKnockout 只係排循環階段 —— 籤表要等循環打完先砌得出，
 * 因為種子係用排名決定。
 */
export function startTournament(t: Tournament, rng: () => number): Match[] {
  switch (t.mode) {
    case 'roundRobin':
    case 'groupThenKnockout':
      return mergeSchedule(t.matches, t.players)
    case 'knockout':
      return propagate(generateBracket(drawOrder(t.players, rng)))
  }
}

/** 循環階段係咪打完晒（groupThenKnockout 專用）。 */
export function groupStageComplete(t: Tournament): boolean {
  const group = groupMatches(t.matches)
  return group.length > 0 && isTournamentComplete(group)
}

/** 籤表砌咗未。 */
export function hasBracket(t: Tournament): boolean {
  return bracketMatches(t.matches).length > 0
}

/**
 * 循環打完，攞頭 cutSize 名砌籤表。
 *
 * 種子順序 = 排名順序，所以第 1 名對最後一個入圍嘅、第 2 名對第 3 名 ——
 * 打咗成個循環先，用返成績做種子最公道，唔使再抽籤。
 */
export function buildCut(t: Tournament): Match[] {
  if (t.cutSize === null) return t.matches
  const rows = computeStandings(t.players, groupMatches(t.matches))
  const seeds = rows.slice(0, t.cutSize).map((r) => r.playerId)
  if (seeds.length < 2) return t.matches
  return [...groupMatches(t.matches), ...propagate(generateBracket(seeds))]
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
