import type { LiveClient, PushResult } from './remote'
import type { Tournament } from '../engine/types'

/**
 * 推送隊列。
 *
 * **入分永遠唔會等網絡** —— 呢個係 README 第一句嘅承諾。所以 `push` 係
 * 同步嘅、即刻返，真正嘅網絡活動喺背後做。
 *
 * 隊入面最多得一份嘢：最新嗰份已經包含晒之前所有改動，所以推最新就夠。
 * 主辦入分入得密嗰陣，唔合併就會排一條長龍。
 */
export function createQueue(client: LiveClient, who: string, onResult?: (r: PushResult) => void) {
  let waiting: Tournament | null = null
  let busy = false
  /** 跌咗位／條 link 死咗就唔好死撞 —— 段 script 一樣會拒絕，等人處理咗先。 */
  let blocked = false

  async function drain(): Promise<void> {
    if (busy || blocked) return
    const t = waiting
    if (t === null) return

    busy = true
    try {
      const r = await client.push(t, who)
      onResult?.(r)
      if (r.ok) {
        // 推期間可能又有新改動入咗隊 —— 咁就唔好清走佢。
        if (waiting === t) waiting = null
      } else if (r.err === 'not-holder' || r.err === 'read-only' || r.err === 'bad-token') {
        // bad-token = 張 sheet 換咗場（舊 token 死咗）。死撞冇用，
        // 而且唔停低嘅話個狀態會一路顯示「同步緊」，講緊大話。
        blocked = true
      }
      // network 之類：留喺隊度，下次再推。
    } finally {
      busy = false
    }
  }

  return {
    push(t: Tournament): void {
      waiting = t
    },
    pending(): number {
      return waiting === null ? 0 : 1
    },
    /** 攞返個位之後叫，解除死撞保護。 */
    unblock(): void {
      blocked = false
    },
    drain,
  }
}

export type PushQueue = ReturnType<typeof createQueue>
