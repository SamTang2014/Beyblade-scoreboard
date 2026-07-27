import type { FinishType, Match, MatchStatus } from './types'

/** Beyblade X 官方分數。 */
export const FINISH_POINTS: Record<FinishType, number> = {
  spin: 1,
  over: 2,
  burst: 2,
  xtreme: 3,
}

/** 先到呢個分數就贏成場。 */
export const MATCH_TARGET = 4

export const FINISH_ORDER: FinishType[] = ['spin', 'over', 'burst', 'xtreme']

export const FINISH_LABEL: Record<FinishType, string> = {
  spin: '轉贏',
  over: '出界',
  burst: '爆咗',
  xtreme: '極限',
}

/** 講返俾人聽點解攞到呢個分。 */
export const FINISH_HINT: Record<FinishType, string> = {
  spin: '對方停咗，你仲轉緊',
  over: '打佢出場',
  burst: '打爆佢',
  xtreme: '極限區擊飛',
}

export function matchKey(aId: string, bId: string): string {
  return [aId, bId].sort().join('__')
}

export interface MatchScore {
  a: number
  b: number
}

/**
 * 由每 round 結果加出總分。分數唔會另外儲存，
 * 所以冇可能出現總分同逐 round 對唔上。
 *
 * 一到 4 分就唔再數落去 —— 就算資料入面多咗 round（例如手動改過嘅檔案），
 * 都唔會出現兩邊同時夠 4 分呢種贏家不明嘅狀態。
 */
/** 兩邊都知道係邊個先打得。淘汰賽等緊上游嘅場次就未夠。 */
export function isReady(match: Match): boolean {
  return match.aId !== null && match.bId !== null
}

export function matchScore(match: Match): MatchScore {
  let a = 0
  let b = 0
  if (!isReady(match)) return { a, b }
  for (const r of match.rounds) {
    if (a >= MATCH_TARGET || b >= MATCH_TARGET) break
    const pts = FINISH_POINTS[r.finish]
    if (r.winnerId === match.aId) a += pts
    else if (r.winnerId === match.bId) b += pts
  }
  return { a, b }
}

/** 打完咗嘅場次返個贏家 id，未打完返 null。 */
export function matchWinnerId(match: Match): string | null {
  const { a, b } = matchScore(match)
  if (a >= MATCH_TARGET) return match.aId
  if (b >= MATCH_TARGET) return match.bId
  return null
}

export function matchStatus(match: Match): MatchStatus {
  if (!isReady(match)) return 'waiting'
  if (matchWinnerId(match) !== null) return 'done'
  return match.rounds.length > 0 ? 'live' : 'pending'
}

/** 仲爭幾多分先贏到。已經贏咗就返 0。 */
export function pointsToWin(match: Match, playerId: string): number {
  const { a, b } = matchScore(match)
  const own = playerId === match.aId ? a : b
  return Math.max(0, MATCH_TARGET - own)
}
