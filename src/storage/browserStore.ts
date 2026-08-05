import { useCallback, useRef, useState } from 'react'
import { createStore, type KeyValueStore } from './storage'
import { newId } from '../lib/id'
import { useLiveSync } from '../live/sync'
import type { Tournament } from '../engine/types'

/** 無痕視窗、或者用戶封鎖咗 storage，localStorage 會直接掟錯。 */
function pickKv(): { kv: KeyValueStore; persistent: boolean } {
  try {
    const probe = '__beyblade_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return { kv: window.localStorage, persistent: true }
  } catch {
    const mem = new Map<string, string>()
    return {
      kv: {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => void mem.set(k, v),
      },
      persistent: false,
    }
  }
}

const picked = pickKv()

/** false 代表關咗個 tab 就乜都冇晒，介面要提醒用戶。 */
export const storageIsPersistent = picked.persistent

export const store = createStore({ kv: picked.kv, newId })

/**
 * 一場賽事嘅讀寫。改嘅時候即刻寫返落 storage —— 冇「儲存」掣，
 * 主持人企喺擂台邊入分，冇可能仲要記得撳儲存。
 */
export function useTournament(id: string) {
  const [tournament, setTournament] = useState<Tournament | null>(() => store.get(id))
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(tournament)
  latest.current = tournament

  /*
    呢個 ref 打破一個循環：`useLiveSync` 要 `tournament` 先砌到 client，
    但 `update` 又要叫返 sync 出嚟嘅 `onChanged`。直接寫就會互相等對方。
    Ref 令 `update` 唔使喺定義嗰陣就知 `onChanged` 係乜。
  */
  const push = useRef<((t: Tournament) => void) | null>(null)

  const update = useCallback((change: (t: Tournament) => Tournament) => {
    const current = latest.current
    if (current === null) return
    try {
      const saved = store.save(change(current))
      latest.current = saved
      setTournament(saved)
      setError(null)
      // 存咗落 localStorage **先至**推。同步失敗都唔會整跌本機資料 ——
      // 呢個就係「場地 wifi 幾差都影響唔到入分」嗰句承諾嘅實現。
      push.current?.(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : '存唔到落瀏覽器。')
    }
  }, [])

  /**
   * 由遠端拉到新版本，覆蓋本機。**唔會**反過嚟推上去。
   *
   * ⚠⚠ `live` 一定要保住本機嗰個，唔可以用遠端嗰個。
   *
   * 張 sheet 上面嗰份 `live` **永遠係 null** —— 推之前特登剝走咗，唔可以漏
   * token 俾觀眾。所以照單全收嘅話，本機個 `live` 就會俾 null 蓋走，跟住：
   * client 變 null → sync 靜靜雞死 → `editable` 因為 `live === null` 反而變返
   * true → 啲掣解鎖 → 之後入嘅分全部淨係留喺本機，永遠推唔上去，
   * 而個介面睇落一切正常。
   *
   * 呢個必定會發生：入分 link 嗰部機一等到主辦第一次 push 就中招。
   */
  const adopt = useCallback((t: Tournament) => {
    try {
      const keep = latest.current?.live ?? null
      const saved = store.save({ ...t, live: keep })
      latest.current = saved
      setTournament(saved)
      setError(null)
    } catch (e) {
      // localStorage 爆咗都唔好變成 unhandled rejection。
      setError(e instanceof Error ? e.message : '存唔到落瀏覽器。')
    }
  }, [])

  /*
    Sync 接喺呢度，唔係逐頁接。

    入分係 Console 改，但改設定係 Setup、砌籤表係 Bracket、排加賽係 Table ——
    四頁都會 `update()`。逐頁接就要接四次，漏一頁就會有啲改動靜靜雞唔同步。
    `useTournament` 係佢哋唯一嘅共同入口。
  */
  const live = useLiveSync(tournament, adopt)
  push.current = live.onChanged

  return { tournament, update, error, live }
}
