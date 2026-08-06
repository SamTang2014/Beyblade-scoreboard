/**
 * 「我最後知嘅遠端版本」，逐場賽事記一個。
 *
 * ⚠⚠ 呢個唔係優化，係一個真 bug 嘅修補。
 *
 * 冇咗佢，`version` 每次 mount 都由 `null` 開始 —— 即係第一次 poll 一定會
 * 攞成份遠端資料返嚟然後 `adopt`，**唔理佢係咪比本機嗰份舊**。
 *
 * 實際出過事嘅情形：
 *   1. 主辦喺開賽設定揀「認真」→ 開始直播
 *      （呢刻推上去嗰份 `matches: []`，因為「規模」喺「排賽程」上面）
 *   2. 加人 → 排賽程 → 本機有咗成個賽程
 *   3. 俾第二部機搶咗入分位 → 推唔上去
 *   4. reload 一次 → `version` 歸零 → poll 攞返步驟 1 嗰個舊 snapshot
 *   5. **成個賽程冇咗**，入分版變返「仲未排賽程。去加選手同排賽程」
 *
 * 記住個版本之後，poll 會用 `since=<記住嗰個>` 去問，遠端冇行前過就
 * 乜都唔會派落嚟，本機嘅嘢就唔會俾一份舊資料蓋走。
 */

const PREFIX = 'beyblade-scoreboard/v/'

export function knownVersion(tournamentId: string): number | null {
  try {
    const raw = localStorage.getItem(PREFIX + tournamentId)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export function rememberVersion(tournamentId: string, v: number): void {
  try {
    localStorage.setItem(PREFIX + tournamentId, String(v))
  } catch {
    // 記唔到就退返去舊行為（每次 mount 重新拉）—— 唔值得為咗呢個擋住入分。
  }
}

/** 換咗場、或者條 link 死咗，就唔好再攞住個舊版本號去問。 */
export function forgetVersion(tournamentId: string): void {
  try {
    localStorage.removeItem(PREFIX + tournamentId)
  } catch {
    // 同上。
  }
}
