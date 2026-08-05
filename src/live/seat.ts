import type { ClaimResult, PushResult } from './remote'

/**
 * 入分位。一場賽事同一時間只有一部機坐得到，坐緊嗰部先寫得到嘢。
 *
 * 所以「兩個人同時改同一場賽事」呢件事根本唔會發生 —— 冇衝突要合併。
 *
 * 純 reducer，唔掂 timer、唔掂 fetch —— 所以全部規則測得到。
 * 接線係 sync.ts 嘅事。
 */

/**
 * 個位坐得幾耐。
 *
 * **5 分鐘唔係求其揀嘅。** 一個 round 打 3–5 分鐘，即係入分嗰個人本來就會
 * 有幾分鐘乜都唔撳 —— 短過呢個就會喺人哋等緊個 round 打完嗰陣拎走佢個位。
 *
 * 而且主辦部電話好大機會會熄屏。⚠ 熄屏唔止係 throttle —— iOS Safari 係
 * 直接暫停晒 JS，一個 timer 都唔跑。所以個有效期唔可以靠「心跳照跑」嚟撐，
 * 要靠佢本身夠長，長到食得起一段真實嘅暫停。
 */
export const LEASE_MS = 5 * 60 * 1000

export const HEARTBEAT_MS = 60 * 1000

export type Seat =
  /** 未攞過，或者攞唔到（網絡爆咗）。 */
  | { kind: 'none' }
  | { kind: 'mine'; until: number }
  | { kind: 'theirs'; until: number }
  /** 本來係我嘅，俾人收咗。 */
  | { kind: 'lost' }

/**
 * `now` 由外面傳入（`Date.now()`）—— 個到期時間一律用**客戶端自己個鐘**算。
 *
 * ⚠ 唔好用段 script 返嗰個 `r.until`。嗰個係 server 個鐘度嘅絕對時間，而
 * `canEdit` 係攞客戶端個鐘去比。兩個鐘差超過 5 分鐘，個介面就會一路顯示
 * 「過咗期」但心跳其實成功緊 —— 用家見到入分掣灰晒，查極都查唔到點解。
 *
 * 段 script 嗰邊自己用自己個鐘做真正裁判，本來就一致；亂嘅只係客戶端撈埋兩個鐘。
 */
export function afterClaim(r: ClaimResult, now: number): Seat {
  if (r.ok) return { kind: 'mine', until: now + LEASE_MS }
  if (r.err === 'held') return { kind: 'theirs', until: r.until ?? 0 }
  // 網絡爆咗／段 script 出事 —— 唔知邊個坐緊，唔好扮自己坐緊。
  return { kind: 'none' }
}

export function afterPush(cur: Seat, r: PushResult, now: number): Seat {
  if (r.ok) {
    // 段 script 推嘢嗰陣順手續期，所以本機都推返 —— 一樣用客戶端個鐘。
    return { kind: 'mine', until: now + LEASE_MS }
  }
  if (r.err === 'not-holder') return { kind: 'lost' }
  // network / read-only / 其他 —— 個位好可能仲喺我度，唔好亂改狀態。
  return cur
}

/**
 * 過咗期就當冇位。
 *
 * 段 script 一樣會拒絕，所以前端唔好扮做得到 —— 唔係主辦入完一堆分
 * 先發現原來全部推唔上去。
 */
export function canEdit(s: Seat, now: number): boolean {
  return s.kind === 'mine' && s.until > now
}

export function dueForHeartbeat(s: Seat, lastBeat: number, now: number): boolean {
  if (s.kind !== 'mine') return false
  return now - lastBeat >= HEARTBEAT_MS
}

export function seatLabel(s: Seat, now: number): string {
  switch (s.kind) {
    case 'mine':
      return s.until > now ? '你入緊分' : '個位過咗期，撳返「接手入分」'
    case 'theirs':
      return '入分位而家喺第二部機'
    case 'lost':
      return '主辦收返咗入分位'
    case 'none':
      return '未接手入分'
  }
}
