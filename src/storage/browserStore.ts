import { useCallback, useRef, useState } from 'react'
import { createStore, type KeyValueStore } from './storage'
import { newId } from '../lib/id'
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

  const update = useCallback((change: (t: Tournament) => Tournament) => {
    const current = latest.current
    if (current === null) return
    try {
      const saved = store.save(change(current))
      latest.current = saved
      setTournament(saved)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '存唔到落瀏覽器。')
    }
  }, [])

  return { tournament, update, error }
}
