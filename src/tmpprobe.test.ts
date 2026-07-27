import { describe, expect, it } from 'vitest'
import { createStore, type KeyValueStore } from './storage/storage'

function fakeKv(): KeyValueStore & { dump: () => string | null } {
  let v: string | null = null
  return {
    getItem: () => v,
    setItem: (_k, val) => {
      v = val
    },
    dump: () => v,
  }
}

describe('probe: empty tournament name', () => {
  it('a tournament saved with an empty name disappears and is erased by the next write', () => {
    const kv = fakeKv()
    let n = 0
    const store = createStore({ kv, newId: () => `t${++n}`, now: () => 1000 })

    const t = store.create('星期六聚會')
    // 主持人喺 Setup 個 input select-all + delete，onChange 直接寫 ''
    const cleared = store.save({
      ...t,
      name: '',
      players: [{ id: 'p1', name: '阿明', seat: 0 }, { id: 'p2', name: '阿強', seat: 1 }],
      matches: [
        { id: 'p1__p2', round: 1, order: 1, aId: 'p1', bId: 'p2', rounds: [{ winnerId: 'p1', finish: 'xtreme' }] },
      ],
    })
    expect(cleared.name).toBe('')
    // 個 record 仲喺 localStorage 度
    expect(kv.dump()).toContain('p1__p2')

    // 但係讀唔返出嚟
    expect(store.get(t.id)).toBeNull()
    expect(store.list()).toEqual([])

    // 而家開多場新賽事 —— 一次 writeAll 就永久刪咗上面嗰場
    store.create('第二場')
    expect(kv.dump()).not.toContain('p1__p2')
    expect(store.list().map((x) => x.name)).toEqual(['第二場'])
  })
})

describe('probe: one corrupt record kills the rest on next write', () => {
  it('drops unparseable entries permanently', () => {
    const kv = fakeKv()
    kv.setItem(
      'beyblade-scoreboard/v1',
      JSON.stringify([
        { id: 'a', name: '好嘅', createdAt: 1, updatedAt: 1, players: [], matches: [] },
        { id: 'b', name: '爛咗', createdAt: 1, updatedAt: 1, players: [{ id: 'p', name: 'x' }], matches: [] },
      ]),
    )
    const store = createStore({ kv, newId: () => 'new', now: () => 2 })
    expect(store.list().map((t) => t.id)).toEqual(['a'])
    store.save({ id: 'a', name: '好嘅', createdAt: 1, updatedAt: 1, players: [], matches: [] })
    expect(kv.dump()).not.toContain('爛咗')
  })
})
