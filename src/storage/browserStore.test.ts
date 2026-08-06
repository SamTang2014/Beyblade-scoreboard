// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tournament } from '../engine/types'

/**
 * 釘住成個直播功能嘅命門：**每次改動都要推上去**。
 *
 * `update()` → `store.save()` → `push.current?.(saved)` → `useLiveSync` 嘅
 * `onChanged` → 隊列 → 段 script。
 *
 * 呢條線斷咗嘅話，所有嘢照樣存落 localStorage、介面一切正常、
 * 全部其他測試照樣綠 —— 但一分都推唔上張 sheet，而觀眾望住一個永遠唔郁
 * 嘅畫面。冇任何其他測試捉得到，所以要專登釘住佢。
 *
 * ⚠ 呢個檔要 jsdom（`renderHook` 要 DOM），全個 project 得佢一個。
 */

const pushed: Tournament[] = []
/** `useTournament` 傳俾 sync 嗰個 `adopt` —— 捉住佢先驗得到。 */
let adopt: ((t: Tournament) => void) | null = null

vi.mock('../live/sync', () => ({
  useLiveSync: (_t: Tournament | null, gotAdopt: (t: Tournament) => void) => {
    adopt = gotAdopt
    return {
      seat: { kind: 'mine', until: Date.now() + 300_000 },
      status: undefined,
      claim: async () => {},
      onChanged: (t: Tournament) => void pushed.push(t),
    }
  },
}))

beforeEach(() => {
  pushed.length = 0
  adopt = null
  localStorage.clear()
})

async function load() {
  const { store, useTournament } = await import('./browserStore')
  return { store, useTournament }
}

describe('每次改動都會推上去', () => {
  it('update() 之後 onChanged 收到最新嗰份', async () => {
    const { store, useTournament } = await load()
    const made = store.create('測試')

    const { result } = renderHook(() => useTournament(made.id))
    act(() => result.current.update((t) => ({ ...t, name: '改咗' })))

    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.name).toBe('改咗')
  })

  it('連續改幾次就推幾次', async () => {
    const { store, useTournament } = await load()
    const made = store.create('測試')

    const { result } = renderHook(() => useTournament(made.id))
    act(() => result.current.update((t) => ({ ...t, name: 'A' })))
    act(() => result.current.update((t) => ({ ...t, name: 'B' })))
    act(() => result.current.update((t) => ({ ...t, name: 'C' })))

    expect(pushed.map((t) => t.name)).toEqual(['A', 'B', 'C'])
  })

  it('推嘅係存咗之後嗰份 —— store.save 補嘅 updatedAt 都要喺入面', async () => {
    const { store, useTournament } = await load()
    const made = store.create('測試')

    const { result } = renderHook(() => useTournament(made.id))
    act(() => result.current.update((t) => ({ ...t, name: '改咗' })))

    expect(pushed[0]!.updatedAt).toBe(store.get(made.id)!.updatedAt)
  })

  it('乜都冇改就唔會推', async () => {
    const { store, useTournament } = await load()
    const made = store.create('測試')
    renderHook(() => useTournament(made.id))
    expect(pushed).toHaveLength(0)
  })
})

/**
 * `adopt` 由遠端拉到新版本覆蓋本機。
 *
 * 張 sheet 上面嗰份 `live` 永遠係 null（推之前剝走咗，唔可以漏 token 俾觀眾），
 * 所以照單全收就會抹走本機個 `live` —— 跟住 sync 靜靜雞死、啲掣反而解鎖、
 * 之後入嘅分永遠推唔上去，而個介面睇落一切正常。
 */
describe('adopt 唔可以抹走本機個 live', () => {
  const LIVE = { scriptId: 'S1', edit: 'edit-a', view: 'view-b' }

  it('遠端嗰份 live 係 null，但本機要保住', async () => {
    const { store, useTournament } = await load()
    const made = store.create('測試')
    store.save({ ...made, live: LIVE })

    const { result } = renderHook(() => useTournament(made.id))
    expect(adopt).not.toBeNull()

    act(() => adopt!({ ...made, name: '遠端改咗', live: null }))

    expect(result.current.tournament!.live).toEqual(LIVE)
    expect(result.current.tournament!.name).toBe('遠端改咗')
    expect(store.get(made.id)!.live).toEqual(LIVE)
  })

  it('本機本來就冇 live（玩下場）就照樣係 null', async () => {
    const { store, useTournament } = await load()
    const made = store.create('測試')

    const { result } = renderHook(() => useTournament(made.id))
    act(() => adopt!({ ...made, name: '遠端改咗', live: null }))

    expect(result.current.tournament!.live).toBeNull()
  })

  it('adopt 唔會反過嚟推上去 —— 唔係兩部機會互相推到天荒地老', async () => {
    const { store, useTournament } = await load()
    const made = store.create('測試')
    store.save({ ...made, live: LIVE })

    renderHook(() => useTournament(made.id))
    act(() => adopt!({ ...made, name: '遠端改咗', live: null }))

    expect(pushed).toHaveLength(0)
  })
})

/**
 * 重演一個真出過事嘅情形（淘汰賽入分版變返「仲未排賽程」）。
 *
 * 開賽設定嘅次序係：規模 → 加人 → 排賽程。所以自然流程係
 * 「先揀認真、開始直播、然後先加人排賽程」—— 即係 `init` 推上去嗰份
 * **`matches: []`**。
 *
 * 之後主辦排咗賽程但俾第二部機搶咗入分位（推唔上去），reload 一次，
 * poll 就會攞返個舊 snapshot 蓋走本機 —— 成個賽程冇咗。
 */
describe('遠端嗰份舊過本機就唔可以蓋走', () => {
  const LIVE = { scriptId: 'S1', edit: 'edit-a', view: 'view-b' }
  const match = {
    id: 'b1m1', stage: 'bracket' as const, round: 1, order: 1,
    aId: 'p1', bId: 'p2', aFrom: null, bFrom: null, rounds: [],
  }
  const players = [
    { id: 'p1', name: '阿明', seat: 0, pool: null },
    { id: 'p2', name: '阿強', seat: 1, pool: null },
  ]

  it('adopt 一份冇賽程嘅舊 snapshot，個賽程唔應該消失', async () => {
    const { store, useTournament } = await load()
    const made = store.create('淘汰賽')

    // 主辦排咗賽程（本機有 match）
    const scheduled = { ...made, mode: 'knockout' as const, players, matches: [match], live: LIVE }
    store.save(scheduled)

    const { result } = renderHook(() => useTournament(made.id))
    expect(result.current.tournament!.matches).toHaveLength(1)

    // 遠端仲係停喺 init 嗰個 snapshot：有人，冇賽程
    act(() => adopt!({ ...made, mode: 'knockout', players, matches: [], live: null }))

    /*
      而家 `adopt` 本身仲係會照收（佢唔知邊份新）—— 真正嘅守衛喺
      `sync.ts`：poll 攞住「我最後知嘅遠端版本」去問，遠端冇行前過就
      根本唔會派資料落嚟，所以 `adopt` 唔會俾人叫到。

      呢個測試釘住嘅係：**`live` 一定要保住**。連 `live` 都冇咗嘅話，
      sync 會靜靜雞死，之後入幾多分都推唔上去，而個介面睇落一切正常。
    */
    expect(result.current.tournament!.live).toEqual(LIVE)
  })
})
