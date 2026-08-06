import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from './remote'
import { createQueue } from './queue'
import { afterClaim, afterPush, canEdit, dueForHeartbeat, HEARTBEAT_MS, type Seat } from './seat'
import { deviceId } from './device'
import { forgetVersion, knownVersion, rememberVersion } from './version'
import { POLL_MS } from './usePoll'
import type { Tournament } from '../engine/types'

export interface SyncStatus {
  label: string
  bad: boolean
}

/**
 * 接線：把佔位狀態機、推送隊列同 timer 駁埋一齊。
 *
 * ⚠ 兩個背景行為要記住，佢哋係相反嘅：
 *   · 觀眾 poll（usePoll）—— `document.hidden` 就完全停
 *   · 坐緊入分位嘅心跳 —— hidden 都照跑
 *
 * 但唔好當「hidden 都照跑」等於「熄屏跌唔到位」：iOS Safari 熄屏係直接
 * 暫停晒 JS，一個 timer 都唔跑。個位捱得過熄屏靠嘅係 5 分鐘有效期夠長。
 */
export function useLiveSync(
  tournament: Tournament | null,
  adopt: (t: Tournament) => void,
): {
  seat: Seat
  status: SyncStatus | undefined
  claim: (force: boolean) => Promise<void>
  onChanged: (t: Tournament) => void
} {
  const live = tournament?.live ?? null
  // 主辦同入分 link 用**同一個** edit token —— 佢哋喺段 script 眼中一模一樣。
  // 唯一分別係 `claim(force)` 嗰個 force，由叫嘅人決定（睇 Console.tsx 嘅 isHost）。
  const scriptId = live?.scriptId ?? null
  const token = live?.edit ?? null
  const who = deviceId()

  const [seat, setSeat] = useState<Seat>({ kind: 'none' })
  const [pending, setPending] = useState(0)
  const [offline, setOffline] = useState(false)
  /** 條 link 死咗（多數係張 sheet 換咗第二場賽事）。 */
  const [dead, setDead] = useState(false)

  /*
    啲 timer 讀 ref 唔讀 state。

    ⚠ 如果個 effect 嘅 dependency 有 `seat`，咁每次 seat 一變就會拆咗個
    interval 再開過 —— 即係個心跳計時器不停由零數起，永遠數唔夠 60 秒，
    心跳就冇跑過。呢個 bug 唔會令任何測試變紅，但個位會靜靜雞過期。
  */
  const seatRef = useRef(seat)
  seatRef.current = seat
  const deadRef = useRef(dead)
  deadRef.current = dead
  const lastBeat = useRef(0)
  /*
    ⚠ 一定要由 storage 讀返，唔可以由 `null` 開始。

    由 null 開始就等於「我乜都唔知」，第一次 poll 會攞成份遠端返嚟然後 adopt ——
    唔理佢係咪比本機舊。實際出過事：主辦開咗直播（推上去嗰份 `matches: []`，
    因為「規模」喺「排賽程」上面）→ 排咗賽程 → 俾人搶咗位推唔上去 → reload
    → poll 攞返個舊 snapshot → 成個賽程冇咗，入分版變返「仲未排賽程」。
  */
  const tid = tournament?.id ?? null
  const version = useRef<number | null>(tid === null ? null : knownVersion(tid))

  const client = useMemo(
    () => (scriptId === null || token === null ? null : createClient(scriptId, token)),
    [scriptId, token],
  )

  const queue = useMemo(
    () =>
      client === null
        ? null
        : createQueue(client, who, (r) => {
            setSeat((cur) => afterPush(cur, r, Date.now()))
            if (r.ok) {
              lastBeat.current = Date.now()
              version.current = r.v
              if (tid !== null) rememberVersion(tid, r.v)
            }
            setOffline(!r.ok && r.err === 'network')
            if (!r.ok && r.err === 'bad-token') setDead(true)
          }),
    [client, who],
  )

  const claim = useCallback(
    async (force: boolean) => {
      if (client === null || queue === null) return
      const r = await client.claim(who, force)
      setSeat(afterClaim(r, Date.now()))
      if (!r.ok && r.err === 'bad-token') setDead(true)
      if (r.ok) {
        lastBeat.current = Date.now()
        queue.unblock()
        void queue.drain().then(() => setPending(queue.pending()))
      }
    },
    [client, who, queue],
  )

  const onChanged = useCallback(
    (t: Tournament) => {
      if (queue === null) return
      // ⚠ 一定要剝走 live —— 入面有兩個 token，推咗上去就會經 doGet
      // 交俾觀眾，任何人讀一讀 JSON 就攞到入分權。
      queue.push({ ...t, live: null })
      setPending(queue.pending())
      void queue.drain().then(() => setPending(queue.pending()))
    },
    [queue],
  )

  // 換咗第二張 sheet（或者第二場賽事）就唔應該仲寫住「link 死咗」。
  useEffect(() => {
    setDead(false)
  }, [client])

  /*
    條 link 死咗（張 sheet 換咗場）就唔好再攞住個舊版本號去問 ——
    嗰個號碼講緊另一場賽事，留住佢只會令下次接返嚟嗰陣諗錯。
  */
  useEffect(() => {
    if (dead && tid !== null) forgetVersion(tid)
  }, [dead, tid])

  /*
    開場先試攞位，**唔 force**。

    就算係主辦都唔好自動搶 —— 佢可能淨係開個 tab 望一望，唔應該靜靜雞
    踢走緊入緊分嗰個人。要搶就撳「收返入分位」，撳嗰下先傳 force。
  */
  useEffect(() => {
    if (client === null) return
    void claim(false)
  }, [client, claim])

  /** 心跳 + 補推。**唔理 document.hidden**。 */
  useEffect(() => {
    if (client === null || queue === null) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      const cur = seatRef.current
      if (dueForHeartbeat(cur, lastBeat.current, now)) {
        void client.claim(who, false).then((r) => {
          setSeat(afterClaim(r, Date.now()))
          if (r.ok) lastBeat.current = Date.now()
        })
      }
      if (queue.pending() > 0 && canEdit(cur, now)) {
        void queue.drain().then(() => setPending(queue.pending()))
      }
    }, HEARTBEAT_MS / 2)
    return () => clearInterval(timer)
  }, [client, queue, who])

  /*
    坐唔到位嗰陣要 poll。

    **冇呢一段，等緊接手嗰部機會望住一份凍結咗嘅賽事** —— 佢見到嘅係第一次
    拉落嚟嗰份，之後主辦入幾多分佢都唔知。

    坐緊位嗰部機唔使 poll：得佢一個寫得到嘢，拉返嚟一定係佢自己啱啱推嗰份。
  */
  useEffect(() => {
    if (client === null) return
    // ⚠ 唔好叫 `dead` —— 上面有個 `dead` state（條 link 死咗），撞名會令
    // 呢度睇落好似有 gate 但其實冇，將來好易改錯。
    let stopped = false

    const tick = async (): Promise<void> => {
      if (stopped || document.hidden) return
      if (deadRef.current) return // 條 link 死咗就唔好再打
      if (canEdit(seatRef.current, Date.now())) return // 我坐緊，唔使拉
      /*
        本機仲有嘢未推就唔好蓋 —— 蓋咗就真係冇咗（隊列淨係喺記憶體，
        reload 一次就消失）。等佢攞返個位、推咗先再收遠端嘅嘢。
      */
      if (queue !== null && queue.pending() > 0) return

      const r = await client.get(version.current)
      if (stopped) return
      setOffline(!r.ok && r.err === 'network')
      if (!r.ok && r.err === 'bad-token') setDead(true)
      if (r.ok) {
        version.current = r.v
        if (tid !== null) rememberVersion(tid, r.v)
        if (r.t !== null) adopt(r.t)
      }
    }

    const timer = window.setInterval(() => void tick(), POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [client, adopt, queue])

  /** 離開之前讓返個位，等下一個人唔使等 5 分鐘。 */
  useEffect(() => {
    if (client === null) return
    const bye = (): void => {
      if (seatRef.current.kind === 'mine') void client.release(who)
    }
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [client, who])

  const status: SyncStatus | undefined =
    live === null
      ? undefined
      : dead
        ? { label: '條分享 link 死咗（張 sheet 換咗場）', bad: true }
        : offline
          ? { label: pending > 0 ? `離線（${pending} 個改動未推）` : '離線', bad: true }
          : seat.kind === 'lost' || seat.kind === 'theirs'
            ? { label: '入分位喺第二部機', bad: true }
            : pending > 0
              ? { label: '同步緊', bad: false }
              : { label: '同步咗', bad: false }

  return { seat, status, claim, onChanged }
}
