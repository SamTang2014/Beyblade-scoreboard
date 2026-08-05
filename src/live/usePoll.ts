import { useEffect, useRef, useState } from 'react'
import type { LiveClient } from './remote'
import type { Tournament } from '../engine/types'

/**
 * 隔幾耐拉一次。
 *
 * 3 秒 —— 觀眾睇到嘅分會慢主辦大約 1–4 秒（一次 Google 來回大約 0.2–1 秒）。
 * 再密啲對體感冇乜分別，但就多咗一倍請求。
 */
export const POLL_MS = 3_000

const MAX_MS = 30_000

/** 連續失敗就愈等愈耐，封頂 30 秒 —— 場地 wifi 斷咗都唔好狂打。 */
export function nextDelay(fails: number): number {
  if (fails <= 0) return POLL_MS
  return Math.min(MAX_MS, POLL_MS * 2 ** fails)
}

export type PollState = 'loading' | 'live' | 'offline' | 'bad-token' | 'error'

/**
 * 一路拉，拉到有新版本就交出嚟。
 *
 * **個 tab 收埋就完全停。** 冇人睇緊嘅嘢唔值得繼續拉。
 * （⚠ 坐緊入分位嗰部機唔係咁 —— 佢收埋 tab 都要照續期。呢個分別喺 sync.ts。）
 */
export function usePoll(
  client: LiveClient,
  onData: (t: Tournament, v: number) => void,
): { state: PollState; fails: number; refresh: () => void } {
  const [state, setState] = useState<PollState>('loading')
  const [failCount, setFailCount] = useState(0)
  const version = useRef<number | null>(null)
  const fails = useRef(0)
  const timer = useRef<number | null>(null)
  const stopped = useRef(false)
  /** 個 effect 入面嗰個 `tick`。`refresh` 要行返佢，唔可以另起爐灶。 */
  const tickRef = useRef<((fresh?: boolean) => Promise<void>) | null>(null)
  const cb = useRef(onData)
  cb.current = onData

  useEffect(() => {
    stopped.current = false

    async function tick(fresh = false): Promise<void> {
      if (stopped.current) return
      if (document.hidden) {
        schedule(POLL_MS)
        return
      }

      const r = await client.get(version.current, fresh)
      if (stopped.current) return

      if (!r.ok) {
        if (r.err === 'bad-token') {
          setState('bad-token')
          return // 唔使再試 —— 條 link 錯咗，等幾耐都唔會啱
        }
        fails.current += 1
        setFailCount(fails.current)
        setState(r.err === 'network' ? 'offline' : 'error')
        schedule(nextDelay(fails.current))
        return
      }

      fails.current = 0
      setFailCount(0)
      setState('live')
      version.current = r.v
      if (r.t !== null) cb.current(r.t, r.v)
      schedule(POLL_MS)
    }

    function schedule(ms: number): void {
      if (stopped.current) return
      timer.current = window.setTimeout(() => void tick(), ms)
    }

    tickRef.current = tick
    void tick()

    // 切返出嚟即刻拉一次，唔使等下一個週期。
    const onVisible = (): void => {
      if (!document.hidden) {
        if (timer.current !== null) clearTimeout(timer.current)
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped.current = true
      tickRef.current = null
      if (timer.current !== null) clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [client])

  return {
    state,
    fails: failCount,
    /**
     * 手動再拉一次。
     *
     * ⚠⚠ 一定要行返個 `tick`，唔可以自己另外叫一次 `client.get`。
     *
     * 之前呢度係咁寫嘅：clear 咗 timer，然後跑一個 one-shot `get`。個 timer
     * 係成條 poll 鏈**唯一**嘅延續，而 one-shot 兩條分支都冇再 `schedule()` ——
     * 即係撳完「再試」之後，個 poll 就永遠死咗。成功嘅話仲衰啲：畫面出咗新資料、
     * 狀態顯示「同步咗」，但之後一世都唔會再更新。電視版擺喺投影機度冇人掂，
     * 連 `visibilitychange` 都唔會救到佢。
     *
     * 呢個 function 之前冇任何 caller（`nextDelay` 先係 usePoll 唯一有測試
     * 覆蓋嘅嘢），係加咗粒「再試」掣先至走出嚟。所以做完要人手試一次：
     * 熄 wifi → 撳再試 → 開返 wifi → 確認個表會繼續跳。
     */
    refresh: () => {
      if (timer.current !== null) clearTimeout(timer.current)
      version.current = null // 迫佢攞返成份
      fails.current = 0
      setFailCount(0)
      void tickRef.current?.(true)
    },
  }
}
