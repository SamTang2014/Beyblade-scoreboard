/** Beyblade X 官方四種勝法。 */
export type FinishType = 'spin' | 'over' | 'burst' | 'xtreme'

export interface Player {
  id: string
  name: string
  /** 加入次序，用嚟決定圓周法入面嘅固定位置。加人之後唔會變。 */
  seat: number
}

/** 一 round 嘅結果。一場對戰由多個 round 組成。 */
export interface RoundResult {
  winnerId: string
  finish: FinishType
}

export interface Match {
  /**
   * 由對戰雙方 id 排序後組成，例如 `p1__p2`。
   * 單循環入面每對人只會撞一次，所以呢個 key 天然唯一，
   * 而且中途加人重排賽程時，舊場次嘅 id 唔會變 —— 已入嘅分唔會走失。
   */
  id: string
  /** 第幾輪，1 起計。 */
  round: number
  /** 該輪入面第幾場，1 起計。 */
  order: number
  /** 藍邊選手 id。 */
  aId: string
  /** 紅邊選手 id。 */
  bId: string
  rounds: RoundResult[]
}

export interface Tournament {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  players: Player[]
  matches: Match[]
}

export type MatchStatus = 'pending' | 'live' | 'done'

export interface StandingRow {
  playerId: string
  name: string
  /** 打完咗嘅場數（未打完嘅唔計）。 */
  played: number
  wins: number
  losses: number
  /** 總得分。 */
  pointsFor: number
  /** 總失分。 */
  pointsAgainst: number
  /** 得失分差。 */
  diff: number
  /** 名次，1 起計。並列會共用同一個名次。 */
  rank: number
  /** true 代表同上面或下面嘅人分唔到高低。 */
  tied: boolean
}
