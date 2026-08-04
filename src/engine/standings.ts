import { matchScore, matchWinnerId, xtremeInMatch } from './rules'
import type { Match, Player, StandingRow } from './types'

/**
 * 排名比較次序（同 spec 一致，唔好擅自改）：
 *
 *   1. 勝場數
 *   2. 總得分
 *   3. 得失分差
 *   4. 極限勝出次數
 *   5. 對賽成績 —— 淨係 `headToHead` 開咗先做，見下面 `miniLeague`
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

/** 小循環入面一個人嘅內部成績。 */
interface MiniRow {
  wins: number
  diff: number
  xtreme: number
}

export function computeStandings(
  players: Player[],
  matches: Match[],
  headToHead = false,
): StandingRow[] {
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

  rows.sort(
    (x, y) =>
      y.wins - x.wins ||
      y.pointsFor - x.pointsFor ||
      y.diff - x.diff ||
      y.xtremeWins - x.xtremeWins ||
      x.name.localeCompare(y.name, 'zh-HK'),
  )

  // 第 5 條：主鏈四樣全同嗰班人，開個小循環出嚟再拆。
  // index i 喺呢個 set 入面 = 小循環將 i 同 i-1 分咗高低。
  const brokenByMini = new Set<number>()
  if (headToHead) {
    for (let start = 0; start < rows.length; ) {
      let end = start + 1
      while (end < rows.length && sameMain(rows[start]!, rows[end]!)) end += 1

      if (end - start >= 2) {
        const block = rows.slice(start, end)
        const mini = miniLeague(
          block.map((r) => r.playerId),
          counted,
        )
        block.sort((x, y) => {
          const mx = mini.get(x.playerId)!
          const my = mini.get(y.playerId)!
          return (
            my.wins - mx.wins ||
            my.diff - mx.diff ||
            my.xtreme - mx.xtreme ||
            x.name.localeCompare(y.name, 'zh-HK')
          )
        })
        for (let i = 0; i < block.length; i++) rows[start + i] = block[i]!
        for (let i = 1; i < block.length; i++) {
          const prev = mini.get(block[i - 1]!.playerId)!
          const cur = mini.get(block[i]!.playerId)!
          if (prev.wins !== cur.wins || prev.diff !== cur.diff || prev.xtreme !== cur.xtreme) {
            brokenByMini.add(start + i)
          }
        }
      }

      start = end
    }
  }

  // 名次：分得開就 +1，分唔開就同上面共用同一個名次。
  const separated: boolean[] = rows.map((row, i) => {
    if (i === 0) return true
    if (!sameMain(rows[i - 1]!, row)) return true
    return brokenByMini.has(i)
  })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    row.rank = separated[i] ? i + 1 : rows[i - 1]!.rank
    row.tied = !separated[i] || (i + 1 < rows.length && !separated[i + 1])
  }

  return rows
}

/** 主鏈四樣數字全部一樣先至輪到小循環。 */
function sameMain(a: StandingRow, b: StandingRow): boolean {
  return (
    a.wins === b.wins &&
    a.pointsFor === b.pointsFor &&
    a.diff === b.diff &&
    a.xtremeWins === b.xtremeWins
  )
}

/**
 * 小循環：淨係攞呢班人**之間**打完咗嘅場次，重新計一次。
 *
 * 兩個人嘅時候呢條式自動退化成「邊個贏過邊個」—— 贏嗰個內部勝場 1 > 0。
 * 所以兩人同三人共用呢一條 code path，唔使分開寫。
 *
 * 唔遞迴：拆完仲有人一樣就係並列，唔會喺並列嗰班人入面再開多個小循環。
 *
 * 一個要記住嘅結果：如果並列嗰班人**就係成組人**（例如三個人自己一組打成回圈），
 * 佢哋之間嘅場次就係全部場次，內部數字必然等於整體數字 —— 主鏈已經全同，
 * 內部就實全同，點都拆唔開。要拆得開，個組一定要大過並列嗰班人。
 */
function miniLeague(ids: string[], matches: Match[]): Map<string, MiniRow> {
  const inBlock = new Set(ids)
  const stat = new Map<string, MiniRow>(ids.map((id) => [id, { wins: 0, diff: 0, xtreme: 0 }]))

  for (const m of matches) {
    if (m.aId === null || m.bId === null) continue
    if (!inBlock.has(m.aId) || !inBlock.has(m.bId)) continue

    const a = stat.get(m.aId)!
    const b = stat.get(m.bId)!
    const { a: sa, b: sb } = matchScore(m)
    a.diff += sa - sb
    b.diff += sb - sa
    a.xtreme += xtremeInMatch(m, m.aId)
    b.xtreme += xtremeInMatch(m, m.bId)
    if (matchWinnerId(m) === m.aId) a.wins += 1
    else b.wins += 1
  }

  return stat
}

/** 全部場次都打完咗未。 */
export function isTournamentComplete(matches: Match[]): boolean {
  return matches.length > 0 && matches.every((m) => matchWinnerId(m) !== null)
}

/** 打完咗幾多場。 */
export function completedCount(matches: Match[]): number {
  return matches.reduce((n, m) => n + (matchWinnerId(m) !== null ? 1 : 0), 0)
}
