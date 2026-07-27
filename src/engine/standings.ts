import { matchKey, matchScore, matchWinnerId } from './rules'
import type { Match, Player, StandingRow } from './types'

/**
 * 排名比較次序（同 spec 一致，唔好擅自改）：
 *
 *   1. 勝場數
 *   2. 對賽成績 —— 只喺啱啱兩個人同勝場、而且佢哋嗰場打完咗嘅時候先用
 *   3. 總得分
 *   4. 得失分差
 *   5. 仲係一樣 → 並列，唔自動分先後
 *
 * 未打完嘅場次一律唔計，所以排名唔會打到一半跳嚟跳去。
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
}

export function computeStandings(players: Player[], matches: Match[]): StandingRow[] {
  const acc = new Map<string, Acc>()
  for (const p of players) {
    acc.set(p.id, { player: p, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 })
  }

  /** 打完咗嘅對賽成績：pair key → 贏家 id。 */
  const headToHead = new Map<string, string>()

  for (const m of matches) {
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

    if (winnerId === m.aId) {
      a.wins += 1
      b.losses += 1
    } else {
      b.wins += 1
      a.losses += 1
    }

    headToHead.set(matchKey(m.aId, m.bId), winnerId)
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
    rank: 0,
    tied: false,
  }))

  // 第 1、3、4 條規則。第 2 條（對賽成績）要成組人齊咗先判斷，跟住做。
  rows.sort(
    (x, y) =>
      y.wins - x.wins ||
      y.pointsFor - x.pointsFor ||
      y.diff - x.diff ||
      x.name.localeCompare(y.name, 'zh-HK'),
  )

  // 第 2 條：啱啱兩個人同勝場，就睇佢哋嗰場邊個贏，蓋過總得分。
  const decidedByHeadToHead = new Set<number>()
  for (let start = 0; start < rows.length; ) {
    let end = start + 1
    while (end < rows.length && rows[end]!.wins === rows[start]!.wins) end += 1

    if (end - start === 2) {
      const first = rows[start]!
      const second = rows[start + 1]!
      const winnerId = headToHead.get(matchKey(first.playerId, second.playerId))
      if (winnerId !== undefined) {
        if (winnerId === second.playerId) {
          rows[start] = second
          rows[start + 1] = first
        }
        // 記住呢兩個人係分到高低嘅，唔好當佢哋並列。
        decidedByHeadToHead.add(start + 1)
      }
    }

    start = end
  }

  // 名次：分得開就 +1，分唔開就同上面共用同一個名次。
  const separated: boolean[] = rows.map((row, i) => {
    if (i === 0) return true
    const prev = rows[i - 1]!
    if (prev.wins !== row.wins) return true
    if (decidedByHeadToHead.has(i)) return true
    if (prev.pointsFor !== row.pointsFor) return true
    if (prev.diff !== row.diff) return true
    return false
  })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    row.rank = separated[i] ? i + 1 : rows[i - 1]!.rank
    row.tied = !separated[i] || (i + 1 < rows.length && !separated[i + 1])
  }

  return rows
}

/** 全部場次都打完咗未。 */
export function isTournamentComplete(matches: Match[]): boolean {
  return matches.length > 0 && matches.every((m) => matchWinnerId(m) !== null)
}

/** 打完咗幾多場。 */
export function completedCount(matches: Match[]): number {
  return matches.reduce((n, m) => n + (matchWinnerId(m) !== null ? 1 : 0), 0)
}
