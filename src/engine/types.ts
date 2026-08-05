/** Beyblade X 官方四種勝法。 */
export type FinishType = 'spin' | 'over' | 'burst' | 'xtreme'

export interface Player {
  id: string
  name: string
  /** 加入次序，用嚟決定圓周法入面嘅固定位置。加人之後唔會變。 */
  seat: number
  /**
   * 第幾組，1 起計（1 = A 組）。null = 未分組，或者根本唔係小組賽模式。
   *
   * 組別擺喺選手身上而唔係賽事身上擺個 id 陣列 —— 除名一個人佢就自動離組，
   * 唔使另外去個陣列度剷返佢。漏咗剷就會排出一場「對住一個唔存在嘅人」嘅比賽。
   */
  pool: number | null
}

/** 一 round 嘅結果。一場對戰由多個 round 組成。 */
export interface RoundResult {
  winnerId: string
  finish: FinishType
}

/**
 * 循環階段、加賽、定淘汰階段。純循環全部係 group，純淘汰全部係 bracket。
 *
 * `tiebreak` = 小組賽並列打唔開，嗰幾個人再打嘅加賽。加賽場次唔計入小組排名表 ——
 * 排名表照顯示「並列」，加賽淨係用嚟排並列嗰幾個邊個出線。
 */
export type MatchStage = 'group' | 'bracket' | 'tiebreak'

export interface Match {
  /**
   * 循環階段：由對戰雙方 id 排序後組成，例如 `p1__p2`。
   * 每對人只會撞一次，所以呢個 key 天然唯一，中途加人重排賽程時
   * 舊場次嘅 id 唔會變 —— 已入嘅分唔會走失。
   *
   * 淘汰階段：`b<輪>m<場>`，例如 `b2m1`。因為淘汰賽開賽時根本未知邊個打邊個，
   * 冇得用對戰雙方做 key。兩種 id 唔會撞，pair key 一定含 `__`。
   */
  id: string
  stage: MatchStage
  /** 第幾輪，1 起計。淘汰階段由淘汰賽第一輪重新數起。 */
  round: number
  /** 該輪入面第幾場，1 起計。 */
  order: number
  /** 藍邊選手 id。null = 對手未定，等緊上游場次出結果。 */
  aId: string | null
  /** 紅邊選手 id。null = 對手未定。 */
  bId: string | null
  /** 藍邊等緊邊場嘅贏家。單循環一律 null。 */
  aFrom: string | null
  /** 紅邊等緊邊場嘅贏家。 */
  bFrom: string | null
  rounds: RoundResult[]
}

export type TournamentMode =
  | 'roundRobin'
  | 'knockout'
  | 'groupThenKnockout'
  | 'poolsThenKnockout'

export interface Tournament {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  mode: TournamentMode
  /** groupThenKnockout 專用：幾多人入籤表。其他模式係 null。 */
  cutSize: number | null
  /** poolsThenKnockout 專用：分幾多組。其他模式係 null。 */
  poolCount: number | null
  /** poolsThenKnockout 專用：每組出幾多個入籤表。其他模式係 null。 */
  advancePerPool: number | null
  /**
   * 同分點拆：主鏈（勝場 → 得分 → 分差 → 極限次數）四樣全同嗰陣，
   * 使唔使再睇佢哋之間邊個贏過邊個。false = 直接當並列，交俾加賽處理。
   *
   * default false。舊檔冇呢個 field 一樣當 false。
   */
  headToHead: boolean
  /**
   * 開咗直播先有。null = 「玩下」場，冇分享。
   *
   * `scriptId` 係 Apps Script deployment id；兩個 token 係呢個 app 自己
   * generate、init 嗰陣寫咗落張 sheet 度。段 script 靠 token 判你係邊個。
   *
   * ⚠ 呢舊嘢**永遠唔可以推上張 sheet** —— 入面有兩個 token，推咗就會經
   * `doGet` 交俾觀眾。推之前一定要 `{ ...t, live: null }`。
   */
  live: { scriptId: string; edit: string; view: string } | null
  players: Player[]
  matches: Match[]
}

/** waiting = 兩邊仲有一邊未知係邊個，打唔到住。 */
export type MatchStatus = 'waiting' | 'pending' | 'live' | 'done'

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
  /** 極限勝出次數。同分嗰陣用嚟拆並列。 */
  xtremeWins: number
  /** 名次，1 起計。並列會共用同一個名次。 */
  rank: number
  /** true 代表同上面或下面嘅人分唔到高低。 */
  tied: boolean
}
