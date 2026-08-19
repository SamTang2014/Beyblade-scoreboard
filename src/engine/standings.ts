import { matchScore, matchWinnerId, xtremeInMatch } from './rules'
import type { Match, Player, StandingRow } from './types'

/**
 * 排名比較次序（同 spec 一致，唔好擅自改）：
 *
 *   1. 勝場數
 *   2. 得失分差
 *   3. 對賽成績 —— 勝場分差都一樣嗰班人，睇佢哋之間邊個贏得多（小循環）
 *   4. 極限勝出次數
 *   5. 總得分
 *   6. 仲係一樣 → 並列，唔自動分先後
 *
 * 未打完嘅場次一律唔計，所以排名唔會打到一半跳嚟跳去。
 *
 * 排序最後 fallback 係個名，但**個名唔算「分得開」** —— 佢淨係令顯示次序定死，
 * 唔會令兩個樣樣一樣嘅人變咗有高低。
 *
 * 純 function：入咩出咩，冇 side effect。
 */

interface Acc {
  player: Player
  played: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  xtremeWins: number
}

export function computeStandings(players: Player[], matches: Match[]): StandingRow[] {
  const acc = new Map<string, Acc>()
  for (const p of players) {
    acc.set(p.id, {
      player: p,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      xtremeWins: 0,
    })
  }

  /** 真係入咗數嘅場次。小循環要重新翻呢批，所以順手留低。 */
  const counted: Match[] = []

  for (const m of matches) {
    // 淨係循環階段入排名表。淘汰賽睇籤表；加賽係用嚟拆並列嘅，
    // 計咗入去就會篡改返個排名表本身，變成「因為並列所以打，打完就唔並列」。
    if (m.stage !== 'group') continue
    if (m.aId === null || m.bId === null) continue // 對手未定

    const winnerId = matchWinnerId(m)
    if (winnerId === null) continue // 未打完，唔計

    const a = acc.get(m.aId)
    const b = acc.get(m.bId)
    if (!a || !b) continue // 場次入面有唔存在嘅選手，跳過

    const { a: sa, b: sb } = matchScore(m)
    a.played += 1
    b.played += 1
    a.pointsFor += sa
    a.pointsAgainst += sb
    b.pointsFor += sb
    b.pointsAgainst += sa
    a.xtremeWins += xtremeInMatch(m, m.aId)
    b.xtremeWins += xtremeInMatch(m, m.bId)

    if (winnerId === m.aId) {
      a.wins += 1
      b.losses += 1
    } else {
      b.wins += 1
      a.losses += 1
    }

    counted.push(m)
  }

  const rows: StandingRow[] = [...acc.values()].map((r) => ({
    playerId: r.player.id,
    name: r.player.name,
    played: r.played,
    wins: r.wins,
    losses: r.losses,
    pointsFor: r.pointsFor,
    pointsAgainst: r.pointsAgainst,
    diff: r.pointsFor - r.pointsAgainst,
    xtremeWins: r.xtremeWins,
    rank: 0,
    tied: false,
  }))

  // 先照 勝場 → 分差 排底。極限／總得分喺呢度淨係做 block 入面嘅初排，
  // 下面對戰執位嗰陣會再排一次，次序一致。
  rows.sort(
    (x, y) =>
      y.wins - x.wins ||
      y.diff - x.diff ||
      y.xtremeWins - x.xtremeWins ||
      y.pointsFor - x.pointsFor ||
      x.name.localeCompare(y.name, 'zh-HK'),
  )

  // 第 3 條：勝場分差全同嗰班人，睇佢哋之間邊個贏得多，
  // 再分唔開先輪到極限（第 4 條）同總得分（第 5 條）。
  const h2h = new Map<string, number>()
  for (let start = 0; start < rows.length; ) {
    let end = start + 1
    while (end < rows.length && samePrimary(rows[start]!, rows[end]!)) end += 1

    if (end - start >= 2) {
      const block = rows.slice(start, end)
      const mini = miniWins(
        block.map((r) => r.playerId),
        counted,
      )
      for (const [id, w] of mini) h2h.set(id, w)
      block.sort(
        (x, y) =>
          mini.get(y.playerId)! - mini.get(x.playerId)! ||
          y.xtremeWins - x.xtremeWins ||
          y.pointsFor - x.pointsFor ||
          x.name.localeCompare(y.name, 'zh-HK'),
      )
      for (let i = 0; i < block.length; i++) rows[start + i] = block[i]!
    }

    start = end
  }

  // 名次：分得開就 +1，分唔開就同上面共用同一個名次。
  // 相鄰兩個勝場分差全同 → 實係同一個 block，h2h 兩邊都有數。
  const separated: boolean[] = rows.map((row, i) => {
    if (i === 0) return true
    const prev = rows[i - 1]!
    if (!samePrimary(prev, row)) return true
    if ((h2h.get(prev.playerId) ?? 0) !== (h2h.get(row.playerId) ?? 0)) return true
    if (prev.xtremeWins !== row.xtremeWins) return true
    return prev.pointsFor !== row.pointsFor
  })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    row.rank = separated[i] ? i + 1 : rows[i - 1]!.rank
    row.tied = !separated[i] || (i + 1 < rows.length && !separated[i + 1])
  }

  return rows
}

/** 勝場同分差都一樣，先至輪到對戰。 */
function samePrimary(a: StandingRow, b: StandingRow): boolean {
  return a.wins === b.wins && a.diff === b.diff
}

/**
 * 小循環：淨係攞呢班人**之間**打完咗嘅場次，數每人贏幾多場。
 *
 * 兩個人嘅時候呢條式自動退化成「邊個贏過邊個」—— 贏嗰個內部勝場 1 > 0。
 * 所以兩人同三人共用呢一條 code path，唔使分開寫。
 *
 * 對戰淨係睇內部勝場，唔會落去內部分差／內部極限 —— 拆唔開就交返俾
 * 主鏈下一級（整體極限、總得分）。三個人打成回圈就係一人一勝，拆唔開。
 * 唔遞迴：拆完之後仲一樣嗰班人，唔會再開第二層小循環。
 */
function miniWins(ids: string[], matches: Match[]): Map<string, number> {
  const inBlock = new Set(ids)
  const wins = new Map<string, number>(ids.map((id) => [id, 0]))

  for (const m of matches) {
    if (m.aId === null || m.bId === null) continue
    if (!inBlock.has(m.aId) || !inBlock.has(m.bId)) continue
    const w = matchWinnerId(m)
    if (w !== null) wins.set(w, wins.get(w)! + 1)
  }

  return wins
}

/** 全部場次都打完咗未。 */
export function isTournamentComplete(matches: Match[]): boolean {
  return matches.length > 0 && matches.every((m) => matchWinnerId(m) !== null)
}

/** 打完咗幾多場。 */
export function completedCount(matches: Match[]): number {
  return matches.reduce((n, m) => n + (matchWinnerId(m) !== null ? 1 : 0), 0)
}
