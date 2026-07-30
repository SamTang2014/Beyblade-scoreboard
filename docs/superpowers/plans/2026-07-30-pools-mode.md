# 小組賽 + 淘汰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加第四個賽制 `poolsThenKnockout`：全部人隨機分幾組、每組組內打單循環、每組頭 N 名交叉搵入淘汰賽。

**Architecture:** 組別寫喺 `Player.pool` 上面（1 起計，null = 未分組）。新引擎檔 `engine/pools.ts` 全部係純 function，逐組排賽程時直接用返現有 `generateSchedule` / `mergeSchedule`，唔重寫排程邏輯。籤表種子分梯次（各組第 1 名、各組第 2 名…）再行一個修補 pass 避免同組首圈撞返。

**Tech Stack:** TypeScript 5.9（strict）、React 19、Vite 7、Vitest 3。冇後端，資料喺 localStorage。

## Global Constraints

- **介面文字一律廣東話口語**，唔用書面語、唔用大陸講法（例：用「電視」唔用「投屏」）。
- **`engine/` 全部係純 function**：唔掂 storage、唔掂 React、唔掂 DOM、唔自己搵隨機數（rng 由外面傳入）。
- **註解用廣東話**，寫「點解」多過寫「做咩」，同現有檔案一致。
- **舊存檔一定要讀得返**：`parseTournament` 讀到冇嘅新欄位一律當 `null`，唔准拋 error。
- **匯出檔 `EXPORT_VERSION` 維持 1**：新欄位純粹係加。
- **內部 mode 名 `groupThenKnockout` 唔准改**（改咗要遷移已存嘅賽事）；淨係改佢嘅 UI label 做「大循環 + 淘汰」。
- **`stage: 'group'` = 循環階段**（兩個混合模式都用）；**`pool` = 小組**。呢兩個詞唔可以撈亂。
- 每個 task 做完要 `npm test` 同 `npm run typecheck` 兩樣都過先 commit。
- Commit message 用廣東話，結尾加 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。

---

## File Structure

| 檔 | 做咩 | 動作 |
|---|---|---|
| `src/engine/types.ts` | `Player.pool`、`Tournament.poolCount/advancePerPool`、新 mode | 改 |
| `src/engine/pools.ts` | 分組數學、抽組、逐組賽程、逐組排名、交叉種子 | **新** |
| `src/engine/pools.test.ts` | 上面嗰個嘅測試 | **新** |
| `src/engine/schedule.ts` | `byesInRound` 新規則 | 改 |
| `src/engine/tournament.ts` | `startTournament` 新簽名、`buildCut` 分流、`canStart`、label／hint | 改 |
| `src/storage/storage.ts` | 讀寫同驗證新欄位 | 改 |
| `src/ui/Setup.tsx` | 賽制掣、兩行 chip、預覽、名單組別章 | 改 |
| `src/ui/Table.tsx` | 逐組排名表、冠軍 bug | 改 |
| `src/ui/Board.tsx` | 逐組排名榜、冠軍 bug | 改 |
| `src/ui/Matrix.tsx` | 逐組交叉表 | 改 |
| `src/ui/Schedule.tsx` | 轉盤組別掣、場次標組別 | 改 |
| `src/ui/Console.tsx` | 標題加組別、`cutPending` 加新模式 | 改 |
| `src/ui/Bracket.tsx` | 「砌籤表」文案分模式 | 改 |
| `src/ui/styles/app.css` | 組別章、逐組表格排版 | 改 |
| `README.md` | 四個賽制 | 改 |

---

### Task 1: 型別 + 存檔

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/storage/storage.ts`
- Modify: `src/ui/Setup.tsx:31`（`addPlayer` 加 `pool: null`）
- Test: `src/storage/storage.test.ts`
- Modify（純粹補 `pool: null` 令 TS 過）：`src/engine/tournament.test.ts:18`、`src/engine/standings.test.ts:7`、`src/engine/bracket.test.ts:21`、`src/engine/schedule.test.ts:19,183,197,207,216-217,229-230,262`

**Interfaces:**
- Produces: `Player.pool: number | null`；`Tournament.poolCount: number | null`；`Tournament.advancePerPool: number | null`；`TournamentMode` 多咗 `'poolsThenKnockout'`。

- [ ] **Step 1: 寫失敗嘅測試**

喺 `src/storage/storage.test.ts` 尾加：

```ts
describe('小組賽欄位', () => {
  it('舊檔冇 pool / poolCount / advancePerPool 都讀得返', () => {
    const t = parseTournament({
      id: 't1',
      name: '舊賽事',
      createdAt: 1,
      updatedAt: 2,
      players: [{ id: 'a', name: '阿明', seat: 0 }],
      matches: [],
    })
    expect(t.players[0]!.pool).toBeNull()
    expect(t.poolCount).toBeNull()
    expect(t.advancePerPool).toBeNull()
  })

  it('新欄位讀得返', () => {
    const t = parseTournament({
      id: 't1',
      name: '小組賽',
      createdAt: 1,
      updatedAt: 2,
      mode: 'poolsThenKnockout',
      poolCount: 3,
      advancePerPool: 2,
      players: [
        { id: 'a', name: '阿明', seat: 0, pool: 1 },
        { id: 'b', name: '阿強', seat: 1, pool: 3 },
      ],
      matches: [],
    })
    expect(t.mode).toBe('poolsThenKnockout')
    expect(t.poolCount).toBe(3)
    expect(t.advancePerPool).toBe(2)
    expect(t.players.map((p) => p.pool)).toEqual([1, 3])
  })

  it('組別超出咗組數就當未分組', () => {
    const t = parseTournament({
      id: 't1',
      name: '爛檔',
      createdAt: 1,
      updatedAt: 2,
      mode: 'poolsThenKnockout',
      poolCount: 2,
      advancePerPool: 1,
      players: [
        { id: 'a', name: '阿明', seat: 0, pool: 5 },
        { id: 'b', name: '阿強', seat: 1, pool: 0 },
        { id: 'c', name: '阿華', seat: 2, pool: 1.5 },
      ],
      matches: [],
    })
    expect(t.players.map((p) => p.pool)).toEqual([null, null, null])
  })

  it('新模式匯出入返都齊', () => {
    const kv = fakeKv()
    const store = createStore({ kv, now: () => 1, newId: () => 'x' })
    const made = store.create('小組賽')
    store.save({ ...made, mode: 'poolsThenKnockout', poolCount: 2, advancePerPool: 2 })
    const back = parseExportFile(store.exportJson(made.id)).tournaments[0]!
    expect(back.mode).toBe('poolsThenKnockout')
    expect(back.poolCount).toBe(2)
    expect(back.advancePerPool).toBe(2)
  })
})
```

`fakeKv` 用返 `storage.test.ts` 本身已有嘅 helper（睇檔案頂）。如果佢個名唔同，用返檔案入面現有嗰個。

- [ ] **Step 2: 跑測試，確認會 fail**

Run: `npm test -- storage`
Expected: FAIL，`pool` / `poolCount` undefined、`mode 「poolsThenKnockout」唔認得`。

- [ ] **Step 3: 改型別**

`src/engine/types.ts`：

```ts
export interface Player {
  id: string
  name: string
  /** 加入次序，用嚟決定圓周法入面嘅固定位置。加人之後唔會變。 */
  seat: number
  /**
   * 第幾組，1 起計（1 = A 組）。null = 未分組，或者根本唔係小組賽模式。
   *
   * 組別擺喺選手身上而唔係賽事身上擺個 id 陣列 —— 除名一個人佢就自動離組，
   * 唔使另外去個陣列度剷返佢。漏咗剷就會排出一場「對住一個唔存在嘅人」嘅比賽。
   */
  pool: number | null
}

export type TournamentMode =
  | 'roundRobin'
  | 'knockout'
  | 'groupThenKnockout'
  | 'poolsThenKnockout'

export interface Tournament {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  mode: TournamentMode
  /** groupThenKnockout 專用：幾多人入籤表。其他模式係 null。 */
  cutSize: number | null
  /** poolsThenKnockout 專用：分幾多組。其他模式係 null。 */
  poolCount: number | null
  /** poolsThenKnockout 專用：每組出幾多個入籤表。其他模式係 null。 */
  advancePerPool: number | null
  players: Player[]
  matches: Match[]
}
```

- [ ] **Step 4: 改 storage**

`src/storage/storage.ts`：

`MODES` 加新模式：

```ts
const MODES: TournamentMode[] = [
  'roundRobin',
  'knockout',
  'groupThenKnockout',
  'poolsThenKnockout',
]
```

選手 parse 加 `pool`：

```ts
    return {
      id: str(p.id, `第 ${i + 1} 個選手嘅 id`),
      name: str(p.name, `第 ${i + 1} 個選手個名`),
      seat: num(p.seat, `第 ${i + 1} 個選手嘅位置`),
      // 舊檔冇 pool，一律當未分組。
      pool: positiveInt(p.pool),
    }
```

加個 helper（擺喺 `optionalStr` 隔籬）：

```ts
/** 1 起計嘅正整數，唔係就當冇。舊檔、爛值都行呢條路。 */
function positiveInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null
}
```

`parseTournament` 尾段：

```ts
  const poolCount = positiveInt(v.poolCount)
  const advancePerPool = positiveInt(v.advancePerPool)

  // 組別超出咗組數就當未分組 —— 下次排賽程會塞佢入人最少嗰組，
  // 好過排出一場指住一個唔存在嘅組嘅比賽。
  const grouped =
    poolCount === null
      ? players.map((p) => (p.pool === null ? p : { ...p, pool: null }))
      : players.map((p) => (p.pool !== null && p.pool > poolCount ? { ...p, pool: null } : p))

  return {
    id: str(v.id, '賽事 id'),
    name: text(v.name, '賽事名'),
    createdAt: num(v.createdAt, '建立時間'),
    updatedAt: num(v.updatedAt, '更新時間'),
    // 舊檔案冇 mode，一律當單循環 —— 之前存嘅賽事唔會爛。
    mode: parseMode(v.mode),
    cutSize: typeof v.cutSize === 'number' && Number.isFinite(v.cutSize) ? v.cutSize : null,
    poolCount,
    advancePerPool,
    players: grouped,
    matches,
  }
```

注意：`players` 個 const 之前係喺上面 build 嘅；`matches` parse 用嘅 `known` set 唔受影響（id 冇變）。

`create()` 加兩格：

```ts
        mode: 'roundRobin',
        cutSize: null,
        poolCount: null,
        advancePerPool: null,
```

- [ ] **Step 5: 補齊全部 Player literal**

`npm run typecheck` 會逐個指出邊度差咗 `pool`。逐個加 `pool: null`：

- `src/ui/Setup.tsx:31` — `{ id: newId(), name, seat, pool: null }`
- `src/engine/tournament.test.ts:18` — helper 加 `pool: null`
- `src/engine/standings.test.ts:7` — 同上
- `src/engine/bracket.test.ts:21` — 同上
- `src/engine/schedule.test.ts` — helper 同 6 處 inline literal（`新仔` / `新女`）全部加 `pool: null`
- `src/storage/storage.test.ts:52-53` — 呢兩個係餵入 parser 嘅 raw 資料，**唔使加**（就係要測舊檔）；如果佢哋係 `Player` type 就要加。

`tournament.test.ts` 個 `tournament()` helper 加：

```ts
    cutSize,
    poolCount: null,
    advancePerPool: null,
```

- [ ] **Step 6: 跑測試，確認全部過**

Run: `npm test && npm run typecheck`
Expected: PASS，281 + 4 個測試。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
型別：選手加組別、賽事加組數同每組出線人數

新模式 poolsThenKnockout 入型別同存檔驗證。舊檔冇呢啲欄一律當 null，
組別超出組數就當未分組 —— 好過排出一場指住一個唔存在嘅組嘅比賽。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 分組數學 + 抽組 + 遲到分配

**Files:**
- Create: `src/engine/pools.ts`
- Test: `src/engine/pools.test.ts`

**Interfaces:**
- Consumes: `Player`（Task 1 加咗 `pool`）、`drawOrder` from `./bracket`。
- Produces:
  - `poolOptions(playerCount: number): number[]`
  - `poolSizes(playerCount: number, poolCount: number): number[]`
  - `advanceOptions(playerCount: number, poolCount: number): number[]`
  - `poolLabel(pool: number): string`
  - `drawPools(players: Player[], poolCount: number, rng: () => number): Player[]`
  - `assignLatecomers(players: Player[], poolCount: number): Player[]`
  - `poolsOf(players: Player[], poolCount: number): Player[][]`

- [ ] **Step 1: 寫失敗嘅測試**

Create `src/engine/pools.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  advanceOptions,
  assignLatecomers,
  drawPools,
  poolLabel,
  poolOptions,
  poolSizes,
  poolsOf,
} from './pools'
import type { Player } from './types'

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `選手${i + 1}`,
    seat: i,
    pool: null,
  }))
}

/** 定死嘅假 rng：每次都揀最後一個，即係完全唔洗牌。 */
const noShuffle = () => 0.999999

describe('揀得幾多組', () => {
  it('每組最少 2 個人', () => {
    expect(poolOptions(3)).toEqual([])
    expect(poolOptions(4)).toEqual([2])
    expect(poolOptions(6)).toEqual([2, 3])
    expect(poolOptions(12)).toEqual([2, 3, 4, 5, 6])
  })
})

describe('每組幾多人', () => {
  it('夾得啱就人人一樣', () => {
    expect(poolSizes(12, 3)).toEqual([4, 4, 4])
  })

  it('夾唔啱就早啲嘅組多一個', () => {
    expect(poolSizes(13, 3)).toEqual([5, 4, 4])
    expect(poolSizes(14, 3)).toEqual([5, 5, 4])
  })

  it('加埋一定等於總人數', () => {
    for (let n = 4; n <= 30; n++) {
      for (const k of poolOptions(n)) {
        expect(poolSizes(n, k).reduce((a, b) => a + b, 0)).toBe(n)
      }
    }
  })
})

describe('每組出得幾多個', () => {
  it('最多就係最細嗰組嘅人數', () => {
    expect(advanceOptions(12, 3)).toEqual([1, 2, 3]) // 4 人一組
    expect(advanceOptions(13, 4)).toEqual([1, 2, 3]) // 4/3/3/3
    expect(advanceOptions(9, 4)).toEqual([1, 2]) // 3/2/2/2
    expect(advanceOptions(4, 2)).toEqual([1, 2]) // 2/2
  })
})

describe('組別個名', () => {
  it('1 = A、2 = B、3 = C', () => {
    expect(poolLabel(1)).toBe('A')
    expect(poolLabel(2)).toBe('B')
    expect(poolLabel(3)).toBe('C')
  })
})

describe('抽組', () => {
  it('組人數啱', () => {
    const drawn = drawPools(players(13), 3, noShuffle)
    const sizes = [1, 2, 3].map((k) => drawn.filter((p) => p.pool === k).length)
    expect(sizes.sort((a, b) => b - a)).toEqual([5, 4, 4])
  })

  it('每個人啱啱一組，冇人漏', () => {
    const drawn = drawPools(players(11), 4, noShuffle)
    expect(drawn.every((p) => p.pool !== null && p.pool >= 1 && p.pool <= 4)).toBe(true)
    expect(drawn).toHaveLength(11)
  })

  it('同一個假 rng 出同一個結果', () => {
    const a = drawPools(players(9), 3, noShuffle).map((p) => p.pool)
    const b = drawPools(players(9), 3, noShuffle).map((p) => p.pool)
    expect(a).toEqual(b)
  })

  it('唔同 rng 出唔同結果', () => {
    const a = drawPools(players(9), 3, noShuffle).map((p) => p.pool)
    const b = drawPools(players(9), 3, () => 0).map((p) => p.pool)
    expect(a).not.toEqual(b)
  })

  it('唔會郁到原本個陣列', () => {
    const base = players(6)
    drawPools(base, 2, noShuffle)
    expect(base.every((p) => p.pool === null)).toBe(true)
  })
})

describe('遲到加人', () => {
  it('入人最少嗰組', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 0, pool: 1 },
      { id: 'b', name: '阿華', seat: 1, pool: 1 },
      { id: 'c', name: '阿強', seat: 2, pool: 2 },
      { id: 'd', name: '阿 May', seat: 3, pool: null },
    ]
    expect(assignLatecomers(roster, 2).find((p) => p.id === 'd')!.pool).toBe(2)
  })

  it('打和就入組號細嗰個', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 0, pool: 1 },
      { id: 'b', name: '阿強', seat: 1, pool: 2 },
      { id: 'c', name: '阿 May', seat: 2, pool: null },
    ]
    expect(assignLatecomers(roster, 2).find((p) => p.id === 'c')!.pool).toBe(1)
  })

  it('一次過加幾個，逐個派，唔會全部塞落同一組', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 0, pool: 1 },
      { id: 'b', name: '阿強', seat: 1, pool: 2 },
      { id: 'c', name: '新仔', seat: 2, pool: null },
      { id: 'd', name: '新女', seat: 3, pool: null },
    ]
    const after = assignLatecomers(roster, 2)
    expect(after.find((p) => p.id === 'c')!.pool).toBe(1)
    expect(after.find((p) => p.id === 'd')!.pool).toBe(2)
  })

  it('已經有組嘅一個都唔郁', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 0, pool: 2 },
      { id: 'b', name: '阿 May', seat: 1, pool: null },
    ]
    expect(assignLatecomers(roster, 2).find((p) => p.id === 'a')!.pool).toBe(2)
  })
})

describe('逐組攞人', () => {
  it('按組號分開，組內按入座次序', () => {
    const roster: Player[] = [
      { id: 'a', name: '阿明', seat: 2, pool: 1 },
      { id: 'b', name: '阿強', seat: 0, pool: 1 },
      { id: 'c', name: '阿華', seat: 1, pool: 2 },
    ]
    const pools = poolsOf(roster, 2)
    expect(pools[0]!.map((p) => p.id)).toEqual(['b', 'a'])
    expect(pools[1]!.map((p) => p.id)).toEqual(['c'])
  })

  it('未分組嘅唔會出現', () => {
    const roster: Player[] = [{ id: 'a', name: '阿明', seat: 0, pool: null }]
    expect(poolsOf(roster, 2)).toEqual([[], []])
  })
})
```

- [ ] **Step 2: 跑測試，確認會 fail**

Run: `npm test -- pools`
Expected: FAIL，`Cannot find module './pools'`。

- [ ] **Step 3: 寫實作**

Create `src/engine/pools.ts`：

```ts
import { drawOrder } from './bracket'
import type { Player } from './types'

/**
 * 小組賽。
 *
 * 同「大循環 + 淘汰」（`groupThenKnockout`）唔同：嗰個係全部人打一個大循環，
 * 呢個係分開幾組、淨係同組內嘅人打。12 個人打大循環要 66 場，分 3 組得 18 場 ——
 * 呢個就係開呢個模式嘅原因。
 *
 * 詞彙：`stage: 'group'` 係「循環階段」（兩個混合模式都用），`pool` 先係「小組」。
 *
 * 純 function：唔掂 storage、唔掂 React、唔掂 DOM、唔自己搵隨機數。
 */

/** 揀得幾多組。每組最少 2 個人，唔係嗰組根本冇得打。 */
export function poolOptions(playerCount: number): number[] {
  return [2, 3, 4, 5, 6].filter((n) => playerCount >= n * 2)
}

/** 每組幾多人。夾唔啱就早啲嘅組多一個：(13, 3) → [5, 4, 4]。 */
export function poolSizes(playerCount: number, poolCount: number): number[] {
  if (poolCount < 1) return []
  const base = Math.floor(playerCount / poolCount)
  const extra = playerCount % poolCount
  return Array.from({ length: poolCount }, (_, i) => base + (i < extra ? 1 : 0))
}

/** 每組出得幾多個。最多就係最細嗰組嘅人數 —— 唔可以出多過組入面有嘅人。 */
export function advanceOptions(playerCount: number, poolCount: number): number[] {
  const sizes = poolSizes(playerCount, poolCount)
  if (sizes.length === 0) return []
  const smallest = Math.min(...sizes)
  return [1, 2, 3].filter((k) => k <= smallest)
}

/** 1 → 「A」、2 → 「B」…… 介面一律用字母叫組別，唔叫「第 1 組」。 */
export function poolLabel(pool: number): string {
  return String.fromCharCode(64 + pool)
}

/**
 * 隨機抽組。
 *
 * 洗完牌一人一組派落去（第 i 個入第 (i % 組數) + 1 組），
 * 所以組同組最多爭一個人，而且早啲嘅組多嗰一個 —— 同 `poolSizes` 對得返。
 *
 * rng 由外面傳入，所以測試餵固定假 rng 就有固定結果。
 */
export function drawPools(players: Player[], poolCount: number, rng: () => number): Player[] {
  if (poolCount < 1) return players.map((p) => ({ ...p, pool: null }))
  const order = drawOrder(players, rng)
  const assigned = new Map(order.map((id, i) => [id, (i % poolCount) + 1]))
  return players.map((p) => ({ ...p, pool: assigned.get(p.id) ?? null }))
}

/**
 * 未分組嘅人塞落人最少嗰組，打和就入組號細嗰個。
 *
 * 賽事開咗之後加人行呢條路 —— **唔可以重抽**，重抽會令已經打咗嘅場次
 * 變成跨組對戰，成個小組賽即刻報廢。
 */
export function assignLatecomers(players: Player[], poolCount: number): Player[] {
  if (poolCount < 1) return players.map((p) => ({ ...p }))

  const inRange = (pool: number | null): pool is number =>
    pool !== null && pool >= 1 && pool <= poolCount

  const size = Array.from({ length: poolCount }, () => 0)
  for (const p of players) if (inRange(p.pool)) size[p.pool - 1]! += 1

  const out = players.map((p) => ({ ...p }))
  // 跟入座次序逐個派，所以同一份名單永遠出同一個結果。
  for (const p of [...out].sort((x, y) => x.seat - y.seat)) {
    if (inRange(p.pool)) continue
    let pick = 0
    for (let i = 1; i < poolCount; i++) if (size[i]! < size[pick]!) pick = i
    p.pool = pick + 1
    size[pick]! += 1
  }
  return out
}

/** 逐組嘅選手，index 0 = 第 1 組。組內按入座次序，未分組嘅唔會出現。 */
export function poolsOf(players: Player[], poolCount: number): Player[][] {
  return Array.from({ length: Math.max(0, poolCount) }, (_, i) =>
    players.filter((p) => p.pool === i + 1).sort((x, y) => x.seat - y.seat),
  )
}
```

- [ ] **Step 4: 跑測試，確認過**

Run: `npm test -- pools && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/engine/pools.ts src/engine/pools.test.ts
git commit -m "$(cat <<'EOF'
小組賽引擎：分組數學、抽組、遲到分配

抽組用返 bracket.ts 現有嘅 Fisher–Yates，rng 由外面傳入。
遲到加人淨係塞入人最少嗰組，唔重抽 —— 重抽會令打咗嘅場次變成跨組對戰。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 逐組排賽程 + 「呢輪唞」新規則

**Files:**
- Modify: `src/engine/pools.ts`
- Modify: `src/engine/schedule.ts:207-216`（`byesInRound`）
- Test: `src/engine/pools.test.ts`、`src/engine/schedule.test.ts`

**Interfaces:**
- Consumes: `poolsOf` (Task 2)、`generateSchedule` / `mergeSchedule` / `groupMatches` / `bracketMatches` from `./schedule`。
- Produces: `buildPoolSchedule(existing: Match[], players: Player[], poolCount: number): Match[]`

- [ ] **Step 1: 寫失敗嘅測試**

喺 `src/engine/pools.test.ts` 加（同時 import `buildPoolSchedule`、`type Match`、`matchKey` from `./rules`、`groupMatches`/`inPlayOrder` from `./schedule`）：

```ts
describe('逐組排賽程', () => {
  function drawn(n: number, k: number): Player[] {
    // 唔洗牌，所以 p1 → 第 1 組、p2 → 第 2 組…… 好對數。
    return drawPools(players(n), k, noShuffle)
  }

  it('冇跨組對戰', () => {
    const roster = drawn(12, 3)
    const poolOf = new Map(roster.map((p) => [p.id, p.pool]))
    const ms = buildPoolSchedule([], roster, 3)
    expect(ms.length).toBeGreaterThan(0)
    for (const m of ms) {
      expect(poolOf.get(m.aId!)).toBe(poolOf.get(m.bId!))
    }
  })

  it('每組場數 = n(n−1)/2', () => {
    const ms = buildPoolSchedule([], drawn(12, 3), 3)
    expect(ms).toHaveLength(3 * 6) // 每組 4 人 → 6 場
  })

  it('組人數唔平均都啱', () => {
    const ms = buildPoolSchedule([], drawn(13, 3), 3)
    expect(ms).toHaveLength(10 + 6 + 6) // 5 人組 10 場，兩個 4 人組各 6 場
  })

  it('同一輪冇人打兩場', () => {
    const ms = buildPoolSchedule([], drawn(13, 3), 3)
    for (const round of new Set(ms.map((m) => m.round))) {
      const seen = new Set<string>()
      for (const m of ms.filter((x) => x.round === round)) {
        expect(seen.has(m.aId!)).toBe(false)
        expect(seen.has(m.bId!)).toBe(false)
        seen.add(m.aId!)
        seen.add(m.bId!)
      }
    }
  })

  it('同一輪入面按組別 A→B→C 編次序，同組嘅連住一齊', () => {
    const roster = drawn(12, 3)
    const poolOf = new Map(roster.map((p) => [p.id, p.pool!]))
    const first = buildPoolSchedule([], roster, 3)
      .filter((m) => m.round === 1)
      .sort((x, y) => x.order - y.order)
    // 每組 4 個人 → 每組每輪 2 場，3 組加埋第 1 輪就 6 場。
    expect(first.map((m) => m.order)).toEqual([1, 2, 3, 4, 5, 6])
    expect(first.map((m) => poolOf.get(m.aId!))).toEqual([1, 1, 2, 2, 3, 3])
  })

  it('遲到加人：補返嗰組嘅新場次，打咗嘅一場都唔郁', () => {
    const roster = drawn(8, 2)
    const before = buildPoolSchedule([], roster, 2).map((m, i) =>
      i === 0 ? { ...m, rounds: [{ winnerId: m.aId!, finish: 'xtreme' as const }] } : m,
    )
    const withNew = assignLatecomers(
      [...roster, { id: 'late', name: '阿 May', seat: 8, pool: null }],
      2,
    )
    const after = buildPoolSchedule(before, withNew, 2)

    // 舊場次連分數原封不動。
    for (const old of before) {
      const same = after.find((m) => m.id === old.id)
      expect(same).toBeDefined()
      expect(same!.rounds).toEqual(old.rounds)
    }
    // 阿 May 補返同組其他 4 個人嘅場次。
    expect(after.filter((m) => m.aId === 'late' || m.bId === 'late')).toHaveLength(4)
  })

  it('除名之後，佢嘅場次一齊消失', () => {
    const roster = drawn(8, 2)
    const before = buildPoolSchedule([], roster, 2)
    const left = roster.filter((p) => p.id !== 'p1')
    const after = buildPoolSchedule(before, left, 2)
    expect(after.some((m) => m.aId === 'p1' || m.bId === 'p1')).toBe(false)
  })

  it('淘汰階段嘅場次原封不動擺返出去', () => {
    const roster = drawn(4, 2)
    const bracket: Match = {
      id: 'b1m1',
      stage: 'bracket',
      round: 1,
      order: 1,
      aId: 'p1',
      bId: 'p2',
      aFrom: null,
      bFrom: null,
      rounds: [],
    }
    const after = buildPoolSchedule([...buildPoolSchedule([], roster, 2), bracket], roster, 2)
    expect(after.filter((m) => m.stage === 'bracket')).toEqual([bracket])
  })
})
```

喺 `src/engine/schedule.test.ts` 加：

```ts
describe('呢輪唞（小組賽）', () => {
  it('打完咗嘅組唔會顯示「唞」', () => {
    // A 組 2 個人（1 輪打完），B 組 4 個人（3 輪）。
    const roster: Player[] = [
      { id: 'a1', name: 'A1', seat: 0, pool: 1 },
      { id: 'a2', name: 'A2', seat: 1, pool: 1 },
      { id: 'b1', name: 'B1', seat: 2, pool: 2 },
      { id: 'b2', name: 'B2', seat: 3, pool: 2 },
      { id: 'b3', name: 'B3', seat: 4, pool: 2 },
      { id: 'b4', name: 'B4', seat: 5, pool: 2 },
    ]
    const matches: Match[] = [
      mk('a1', 'a2', 1),
      mk('b1', 'b2', 1),
      mk('b3', 'b4', 1),
      mk('b1', 'b3', 2),
      mk('b2', 'b4', 2),
    ]
    expect(byesInRound(matches, roster, 1)).toEqual([])
    // 第 2 輪 A 組冇場次 —— 佢哋係打完咗，唔係唞。
    expect(byesInRound(matches, roster, 2)).toEqual([])
  })

  it('同組入面真係有人唞就照講', () => {
    const roster: Player[] = [
      { id: 'a1', name: 'A1', seat: 0, pool: 1 },
      { id: 'a2', name: 'A2', seat: 1, pool: 1 },
      { id: 'a3', name: 'A3', seat: 2, pool: 1 },
    ]
    expect(byesInRound([mk('a1', 'a2', 1)], roster, 1).map((p) => p.id)).toEqual(['a3'])
  })
})
```

`mk` helper（如果 `schedule.test.ts` 未有就加喺檔案頂）：

```ts
function mk(aId: string, bId: string, round: number): Match {
  return {
    id: matchKey(aId, bId),
    stage: 'group',
    round,
    order: 1,
    aId,
    bId,
    aFrom: null,
    bFrom: null,
    rounds: [],
  }
}
```

- [ ] **Step 2: 跑測試，確認會 fail**

Run: `npm test -- pools schedule`
Expected: FAIL，`buildPoolSchedule` 唔存在；「打完咗嘅組唔會顯示唞」返咗 A 組兩個人。

- [ ] **Step 3: 寫 `buildPoolSchedule`**

`src/engine/pools.ts` 頂加 import：

```ts
import { bracketMatches, groupMatches, mergeSchedule } from './schedule'
import type { Match, Player } from './types'
```

檔尾加：

```ts
/**
 * 逐組排／補賽程。
 *
 * 每組各自行圓周法 —— 直接用返 `mergeSchedule`，餵入去嘅淨係嗰組嘅人同嗰組嘅場次。
 * 咁樣中途加人嘅處理（舊場次一場唔郁、同一輪冇人打兩場）自動繼承落嚟，
 * 唔使喺呢度重寫一次排程邏輯。
 *
 * 輪次對齊：每組自己嘅第 1 輪就係全場第 1 輪。人少嗰組早幾輪打完就冇咗場次 ——
 * 呢個係啱嘅，`byesInRound` 會知佢哋係打完唔係唞。
 */
export function buildPoolSchedule(
  existing: Match[],
  players: Player[],
  poolCount: number,
): Match[] {
  const poolOf = new Map(players.map((p) => [p.id, p.pool]))
  const group = groupMatches(existing)

  const built: Match[] = []
  for (const [i, pool] of poolsOf(players, poolCount).entries()) {
    // 兩邊都要仲喺呢組先算數 —— 除咗名嘅、或者組別俾人改到唔合理嘅，
    // 喺呢度自然咁跌咗出去。
    const mine = group.filter(
      (m) =>
        m.aId !== null &&
        m.bId !== null &&
        poolOf.get(m.aId) === i + 1 &&
        poolOf.get(m.bId) === i + 1,
    )
    built.push(...mergeSchedule(mine, pool))
  }

  return [...renumber(built, poolOf), ...bracketMatches(existing)]
}

/**
 * 同一輪入面按組別 A→B→C 重編次序。
 *
 * 唔重編嘅話，兩組喺同一輪都會有一場 `order: 1`，`inPlayOrder` 排出嚟嘅
 * 次序就靠 sort 穩定性頂住 —— 睇落 work，但補一次人就會跳位。
 */
function renumber(matches: Match[], poolOf: Map<string, number | null>): Match[] {
  const sorted = [...matches].sort(
    (x, y) =>
      x.round - y.round ||
      (poolOf.get(x.aId ?? '') ?? 0) - (poolOf.get(y.aId ?? '') ?? 0) ||
      x.order - y.order ||
      x.id.localeCompare(y.id),
  )

  let round = 0
  let order = 0
  return sorted.map((m) => {
    if (m.round !== round) {
      round = m.round
      order = 0
    }
    order += 1
    return { ...m, order }
  })
}
```

- [ ] **Step 4: 改 `byesInRound`**

`src/engine/schedule.ts` 換走現有嗰個：

```ts
/**
 * 邊個喺呢輪冇得打。
 *
 * 小組賽度唔可以淨係睇「有冇場次」：A 組 4 個人 3 輪打完，B 組 5 個人打到第 5 輪，
 * 咁 A 組全部人喺第 4、5 輪就會顯示「唞」—— 但佢哋係打完咗，唔係唞。
 *
 * 所以要同組有人喺嗰輪有場次，先當佢係唞。其他模式全部人 `pool` 都係 null，
 * 即係大家同一組，行為同以前一模一樣。
 */
export function byesInRound(matches: Match[], players: Player[], round: number): Player[] {
  const poolOf = new Map(players.map((p) => [p.id, p.pool]))
  const playing = new Set<string>()
  const busyPools = new Set<number | null>()

  for (const m of groupMatches(matches)) {
    if (m.round !== round) continue
    for (const pid of [m.aId, m.bId]) {
      if (pid === null) continue
      playing.add(pid)
      busyPools.add(poolOf.get(pid) ?? null)
    }
  }

  return seated(players).filter((p) => !playing.has(p.id) && busyPools.has(p.pool))
}
```

- [ ] **Step 5: 跑測試，確認全部過**

Run: `npm test && npm run typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/engine/pools.ts src/engine/pools.test.ts src/engine/schedule.ts src/engine/schedule.test.ts
git commit -m "$(cat <<'EOF'
小組賽引擎：逐組排賽程

每組各自行圓周法，直接用返 mergeSchedule —— 中途加人嘅處理自動繼承。
「呢輪唞」改規則：同組有人打緊先當唞，唔係人少嗰組打完之後會被寫成成組人喺度唞。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 逐組排名 + 交叉種子 + 修補 pass

**Files:**
- Modify: `src/engine/pools.ts`
- Test: `src/engine/pools.test.ts`

**Interfaces:**
- Consumes: `computeStandings` from `./standings`、`bracketSize` / `seedSlots` from `./bracket`。
- Produces:
  - `interface PoolTable { pool: number; players: Player[]; rows: StandingRow[] }`
  - `poolStandings(players: Player[], matches: Match[], poolCount: number): PoolTable[]`
  - `poolSeedOrder(players: Player[], matches: Match[], poolCount: number, advancePerPool: number): string[]`
  - `avoidSamePool(seeds: string[], poolOf: Map<string, number | null>, tierOf: Map<string, number>): string[]`

- [ ] **Step 1: 寫失敗嘅測試**

喺 `src/engine/pools.test.ts` 加（import `poolSeedOrder`、`poolStandings`、`generateBracket`/`bracketSize` from `./bracket`）：

```ts
describe('逐組排名', () => {
  /** 一場打到 4 分，指定邊個贏。 */
  function won(aId: string, bId: string, winnerId: string, round: number): Match {
    return {
      id: matchKey(aId, bId),
      stage: 'group',
      round,
      order: 1,
      aId,
      bId,
      aFrom: null,
      bFrom: null,
      rounds: [
        { winnerId, finish: 'xtreme' },
        { winnerId, finish: 'spin' },
      ],
    }
  }

  const roster: Player[] = [
    { id: 'a1', name: 'A1', seat: 0, pool: 1 },
    { id: 'a2', name: 'A2', seat: 1, pool: 1 },
    { id: 'b1', name: 'B1', seat: 2, pool: 2 },
    { id: 'b2', name: 'B2', seat: 3, pool: 2 },
  ]

  it('逐組獨立計，B 組打完唔會郁到 A 組嘅名次', () => {
    const tables = poolStandings(roster, [won('a1', 'a2', 'a1', 1), won('b1', 'b2', 'b2', 1)], 2)
    expect(tables).toHaveLength(2)
    expect(tables[0]!.rows.map((r) => r.playerId)).toEqual(['a1', 'a2'])
    expect(tables[1]!.rows.map((r) => r.playerId)).toEqual(['b2', 'b1'])
    // A 組個表淨係得 A 組嘅人。
    expect(tables[0]!.rows).toHaveLength(2)
  })

  it('組號由 1 起計', () => {
    expect(poolStandings(roster, [], 2).map((t) => t.pool)).toEqual([1, 2])
  })
})

describe('交叉種子', () => {
  /** 砌一批選手，pool 跟住個 id 前綴（a → 1、b → 2、c → 3、d → 4）。 */
  function pooled(spec: string[]): Player[] {
    return spec.map((id, i) => ({
      id,
      name: id.toUpperCase(),
      seat: i,
      pool: id.charCodeAt(0) - 96,
    }))
  }

  /**
   * 砌一批「已經打完」嘅小組場次，令組內名次同 id 尾嗰個數字對得返
   * （a1 排 A 組第 1、a2 排第 2…）。
   */
  function played(roster: Player[]): Match[] {
    const out: Match[] = []
    const byPool = new Map<number, Player[]>()
    for (const p of roster) {
      const list = byPool.get(p.pool!) ?? []
      list.push(p)
      byPool.set(p.pool!, list)
    }
    for (const list of byPool.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const x = list[i]!
          const y = list[j]!
          // 排前面嗰個（尾數細）贏。
          out.push({
            id: matchKey(x.id, y.id),
            stage: 'group',
            round: 1,
            order: 1,
            aId: x.id,
            bId: y.id,
            aFrom: null,
            bFrom: null,
            rounds: [
              { winnerId: x.id, finish: 'xtreme' },
              { winnerId: x.id, finish: 'spin' },
            ],
          })
        }
      }
    }
    return out
  }

  /** 首圈有幾多場係同組內戰。 */
  function samePoolFirstRound(seeds: string[], poolOf: Map<string, number>): number {
    return generateBracket(seeds)
      .filter((m) => m.round === 1)
      .filter((m) => poolOf.get(m.aId!) === poolOf.get(m.bId!)).length
  }

  function run(ids: string[], poolCount: number, advance: number) {
    const roster = pooled(ids)
    const seeds = poolSeedOrder(roster, played(roster), poolCount, advance)
    const poolOf = new Map(roster.map((p) => [p.id, p.pool!]))
    return { seeds, poolOf, clashes: samePoolFirstRound(seeds, poolOf) }
  }

  it('2 組出 2 個：A1 對 B2、B1 對 A2', () => {
    const { seeds } = run(['a1', 'a2', 'b1', 'b2'], 2, 2)
    const first = generateBracket(seeds).filter((m) => m.round === 1)
    const pairs = first.map((m) => [m.aId, m.bId].sort().join('+')).sort()
    expect(pairs).toEqual(['a1+b2', 'a2+b1'])
  })

  it('3 組出 2 個：首圈零同組內戰', () => {
    expect(run(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'], 3, 2).clashes).toBe(0)
  })

  it('4 組出 2 個：首圈零同組內戰', () => {
    const ids = ['a', 'b', 'c', 'd'].flatMap((g) => [1, 2, 3].map((n) => `${g}${n}`))
    expect(run(ids, 4, 2).clashes).toBe(0)
  })

  it('2–4 組 × 每組出 1／2／3：逐個組合首圈都係零同組內戰', () => {
    for (const k of [2, 3, 4]) {
      for (const advance of [1, 2, 3]) {
        // 每組砌 3 個人，咁樣出 1／2／3 個都夠。
        const ids = ['a', 'b', 'c', 'd']
          .slice(0, k)
          .flatMap((g) => [1, 2, 3].map((n) => `${g}${n}`))
        expect(run(ids, k, advance).clashes, `${k} 組出 ${advance} 個`).toBe(0)
      }
    }
  })

  it('修補 pass 唔會搞亂梯次：各組第 1 名全部排喺各組第 2 名之前', () => {
    const { seeds } = run(['a1', 'a2', 'b1', 'b2', 'c1', 'c2'], 3, 2)
    const place = (id: string) => Number(id.slice(1))
    const firstTier = seeds.slice(0, 3).map(place)
    const secondTier = seeds.slice(3).map(place)
    expect(firstTier.every((p) => p === 1)).toBe(true)
    expect(secondTier.every((p) => p === 2)).toBe(true)
  })

  it('入圍人數 = 組數 × 每組出幾多個', () => {
    const ids = ['a', 'b', 'c'].flatMap((g) => [1, 2, 3].map((n) => `${g}${n}`))
    expect(run(ids, 3, 2).seeds).toHaveLength(6)
  })
})
```

- [ ] **Step 2: 跑測試，確認會 fail**

Run: `npm test -- pools`
Expected: FAIL，`poolStandings` / `poolSeedOrder` 唔存在。

- [ ] **Step 3: 寫實作**

`src/engine/pools.ts` 加 import：

```ts
import { bracketSize, drawOrder, seedSlots } from './bracket'
import { computeStandings } from './standings'
import type { Match, Player, StandingRow } from './types'
```

檔尾加：

```ts
export interface PoolTable {
  /** 第幾組，1 起計。 */
  pool: number
  players: Player[]
  rows: StandingRow[]
}

/**
 * 逐組排名。
 *
 * 同一套 tiebreak（`computeStandings` 唔使改），淨係餵入去嘅選手同場次
 * 換成嗰組嘅 —— 所以 B 組打完一場唔會郁到 A 組嘅名次。
 */
export function poolStandings(
  players: Player[],
  matches: Match[],
  poolCount: number,
): PoolTable[] {
  const group = groupMatches(matches)
  return poolsOf(players, poolCount).map((pool, i) => {
    const ids = new Set(pool.map((p) => p.id))
    // 兩邊一定同組，所以查一邊就夠。
    const mine = group.filter((m) => m.aId !== null && ids.has(m.aId))
    return { pool: i + 1, players: pool, rows: computeStandings(pool, mine) }
  })
}

/**
 * 交叉種子。
 *
 * 各組第 1 名排一梯次、各組第 2 名排下一梯次，如此類推；同梯次之間用
 * 總成績（全部小組場次一齊計）分先後。排完再行修補 pass。
 *
 * 點解要梯次：同組嘅人組內已經打過，一入淘汰就重演冇意思。
 */
export function poolSeedOrder(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
): string[] {
  const tables = poolStandings(players, matches, poolCount)
  const globalRank = new Map(
    computeStandings(players, groupMatches(matches)).map((r, i) => [r.playerId, i]),
  )

  const seeds: string[] = []
  const tierOf = new Map<string, number>()

  for (let place = 0; place < advancePerPool; place++) {
    const tier = tables
      .map((t) => t.rows[place]?.playerId)
      .filter((id): id is string => id !== undefined)
      .sort((x, y) => (globalRank.get(x) ?? 0) - (globalRank.get(y) ?? 0))
    for (const id of tier) tierOf.set(id, place)
    seeds.push(...tier)
  }

  const poolOf = new Map(players.map((p) => [p.id, p.pool]))
  return avoidSamePool(seeds, poolOf, tierOf)
}

/**
 * 修補 pass：首圈撞到同組嘅就換位。
 *
 * 郁後面嗰個種子（位序細嗰個唔郁，保住上梯次嘅位），喺**同梯次**入面搵對象換。
 * 換之前兩邊都要 check：換完呢一對唔再同組，而且被抽走嗰個原本嗰對亦唔會變成同組。
 * 逐對按位序掃、候選按種子號由細到大掃，第一個合格就換 —— 所以結果係定死嘅，唔靠隨機。
 *
 * **點解唔用一條死規則：** 試過兩條都唔 work ——
 * 梯次照順序排，3 組出 2 個嗰陣 C 組第 1 會撞返 C 組第 2；
 * 梯次輪轉一格，2 組出 2 個嗰陣 A 組第 1 會撞返 A 組第 2。冇一條固定規則食晒所有組合。
 *
 * 掃到冇嘢再換為止（最多 4 次）—— 換一次可能開返另一對出嚟，一 pass 唔一定收得晒。
 * 真係搵唔到候選就照擺，唔硬拗。
 *
 * ⚠ 呢個 function 淨係管**首圈**。後面幾輪冇得保證：2 組出 3 個嗰陣，
 * A 組第 1 有可能喺第 2 輪撞返啱啱贏咗首圈嘅 A 組第 3。呢個係單淘汰籤表嘅本質。
 */
export function avoidSamePool(
  seeds: string[],
  poolOf: Map<string, number | null>,
  tierOf: Map<string, number>,
): string[] {
  const out = [...seeds]
  if (out.length < 2) return out

  const size = bracketSize(out.length)
  const slots = seedSlots(size)

  /** 種子號 → 首圈對手嘅種子號。 */
  const rival = new Map<number, number>()
  for (let i = 0; i < size; i += 2) {
    rival.set(slots[i]!, slots[i + 1]!)
    rival.set(slots[i + 1]!, slots[i]!)
  }

  /** 種子號係邊組。號碼超出人數即係輪空，冇組。 */
  const poolAt = (seedNo: number): number | null | undefined =>
    seedNo > out.length ? undefined : (poolOf.get(out[seedNo - 1]!) ?? null)

  const clash = (x: number, y: number): boolean => {
    const px = poolAt(x)
    const py = poolAt(y)
    return px !== undefined && py !== undefined && px === py
  }

  // 換一次可能開返另一對出嚟，所以掃到冇嘢再換為止。
  for (let pass = 0; pass < 4; pass++) {
    let swapped = false

    for (let i = 0; i < size; i += 2) {
      const x = slots[i]!
      const y = slots[i + 1]!
      if (!clash(x, y)) continue

      const keep = Math.min(x, y)
      const move = Math.max(x, y)

      for (let c = 1; c <= out.length; c++) {
        if (c === keep || c === move) continue
        if (tierOf.get(out[c - 1]!) !== tierOf.get(out[move - 1]!)) continue

        const partner = rival.get(c)!
        const mine = out[move - 1]!
        out[move - 1] = out[c - 1]!
        out[c - 1] = mine

        if (!clash(keep, move) && !clash(c, partner)) {
          swapped = true
          break
        }

        // 換唔成，換返轉頭。次序要緊：先寫返 c 個位。
        out[c - 1] = out[move - 1]!
        out[move - 1] = mine
      }
    }

    if (!swapped) break
  }

  return out
}
```

- [ ] **Step 4: 跑測試，確認過**

Run: `npm test -- pools && npm run typecheck`
Expected: PASS。

如果「3 組出 2 個」嗰個仲有 clash，debug 方向：print `seeds` 同 `seedSlots(8)`，確認 `rival` 對得啱、`poolAt` 對輪空返 `undefined`。

- [ ] **Step 5: Commit**

```bash
git add src/engine/pools.ts src/engine/pools.test.ts
git commit -m "$(cat <<'EOF'
小組賽引擎：逐組排名 + 交叉種子

各組第 1 名排一梯次、各組第 2 名排下一梯次，砌完籤表再行修補 pass
避免同組首圈撞返。2–4 組 × 每組出 1／2／3 逐個組合驗過首圈零內戰。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 接落 `tournament.ts`

**Files:**
- Modify: `src/engine/tournament.ts`
- Modify: `src/ui/Setup.tsx:66-76`（`canStart` / `startTournament` 新簽名）
- Test: `src/engine/tournament.test.ts`

**Interfaces:**
- Consumes: Task 2–4 全部 `pools.ts` 嘅 export。
- Produces:
  - `interface StartResult { players: Player[]; matches: Match[] }`
  - `startTournament(t: Tournament, rng: () => number): StartResult`（**簽名改咗**，本來返 `Match[]`）
  - `canStart(t: Tournament): boolean`（**簽名改咗**，本來係 `(mode, playerCount, cutSize)`）
  - `buildCut(t: Tournament): Match[]`（行為按 mode 分流，簽名唔變）

- [ ] **Step 1: 改測試（會 fail）**

`src/engine/tournament.test.ts`：

先改 helper：

```ts
function tournament(
  mode: TournamentMode,
  n: number,
  cutSize: number | null = null,
  poolCount: number | null = null,
  advancePerPool: number | null = null,
): Tournament {
  return {
    id: 't1',
    name: '測試',
    createdAt: 0,
    updatedAt: 0,
    mode,
    cutSize,
    poolCount,
    advancePerPool,
    players: players(n),
    matches: [],
  }
}
```

跟住全部 `startTournament(x, rng)` 改做 `startTournament(x, rng).matches`（第 56、62、69、78、112、122、166、175 行附近）。

`canStart` 嗰個 describe 全部改成餵 Tournament：

```ts
describe('可唔可以開波', () => {
  it('少過 2 個人一定唔得', () => {
    for (const mode of [
      'roundRobin',
      'knockout',
      'groupThenKnockout',
      'poolsThenKnockout',
    ] as TournamentMode[]) {
      expect(canStart(tournament(mode, 1, 4, 2, 2))).toBe(false)
    }
  })

  it('大循環 + 淘汰要有合理嘅入圍人數', () => {
    expect(canStart(tournament('groupThenKnockout', 6, null))).toBe(false)
    expect(canStart(tournament('groupThenKnockout', 6, 8))).toBe(false) // 多過總人數
    expect(canStart(tournament('groupThenKnockout', 6, 4))).toBe(true)
  })

  it('小組賽要有合理嘅組數同出線人數', () => {
    expect(canStart(tournament('poolsThenKnockout', 12, null, null, null))).toBe(false)
    expect(canStart(tournament('poolsThenKnockout', 12, null, 7, 2))).toBe(false) // 冇 7 組呢個選項
    expect(canStart(tournament('poolsThenKnockout', 9, null, 4, 3))).toBe(false) // 最細組得 2 人
    expect(canStart(tournament('poolsThenKnockout', 12, null, 3, 2))).toBe(true)
  })

  it('另外兩個模式唔理入圍人數', () => {
    expect(canStart(tournament('roundRobin', 3))).toBe(true)
    expect(canStart(tournament('knockout', 3))).toBe(true)
  })

  it('入圍人數選項唔會多過總人數', () => {
    expect(cutOptions(3)).toEqual([2])
    expect(cutOptions(8)).toEqual([2, 4, 8])
    expect(cutOptions(20)).toEqual([2, 4, 8, 16])
  })
})
```

再加一個 describe：

```ts
describe('小組賽 + 淘汰', () => {
  function started(n: number, k: number, advance: number) {
    const t = tournament('poolsThenKnockout', n, null, k, advance)
    const r = startTournament(t, rng)
    return { ...t, players: r.players, matches: r.matches }
  }

  it('開波抽組：每個人都有組', () => {
    const t = started(12, 3, 2)
    expect(t.players.every((p) => p.pool !== null)).toBe(true)
  })

  it('開波只排小組賽，籤表要等成績', () => {
    const t = started(12, 3, 2)
    expect(t.matches.every((m) => m.stage === 'group')).toBe(true)
    expect(t.matches).toHaveLength(18)
  })

  it('補返新場次唔會重抽組', () => {
    const t = started(8, 2, 2)
    const before = new Map(t.players.map((p) => [p.id, p.pool]))
    const withLate = {
      ...t,
      players: [...t.players, { id: 'late', name: '阿 May', seat: 8, pool: null }],
    }
    const after = startTournament(withLate, rng)
    for (const p of after.players) {
      if (p.id === 'late') continue
      expect(p.pool).toBe(before.get(p.id))
    }
    expect(after.players.find((p) => p.id === 'late')!.pool).not.toBeNull()
  })

  it('打晒小組賽就砌到籤表，冠軍出到', () => {
    const t = started(8, 2, 2)
    const done = playThrough(t.matches, (m) =>
      Number(m.aId!.slice(1)) < Number(m.bId!.slice(1)) ? m.aId! : m.bId!,
    )
    const played = { ...t, matches: done }
    expect(groupStageComplete(played)).toBe(true)

    const withCut = buildCut(played)
    expect(groupMatches(withCut)).toHaveLength(groupMatches(done).length)
    expect(bracketMatches(withCut)).toHaveLength(3) // 4 個人入籤表

    const finished = playThrough(withCut, (m) => m.aId!)
    expect(bracketMatches(finished).every((m) => matchWinnerId(m) !== null)).toBe(true)
  })

  it('冇設定組數就乜都唔郁', () => {
    const t = started(8, 2, 2)
    expect(buildCut({ ...t, poolCount: null })).toEqual(t.matches)
  })

  it('有排名表', () => {
    expect(hasStandings('poolsThenKnockout')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試，確認會 fail**

Run: `npm test -- tournament`
Expected: FAIL（型別錯 + `poolsThenKnockout` 未 handle）。

- [ ] **Step 3: 改 `tournament.ts`**

```ts
import { bracketMatches, groupMatches, mergeSchedule } from './schedule'
import { drawOrder, generateBracket, propagate } from './bracket'
import {
  advanceOptions,
  assignLatecomers,
  buildPoolSchedule,
  drawPools,
  poolOptions,
  poolSeedOrder,
} from './pools'
import { computeStandings, isTournamentComplete } from './standings'
import type { Match, Player, Tournament, TournamentMode } from './types'

/**
 * 四個模式共用嘅入口。
 *
 * 每個模式落到最後都係「一堆 Match」，所以介面唔使識分模式 ——
 * 佢淨係讀 stage 同 aFrom/bFrom 就砌到畫面。
 *
 * ⚠ 命名陷阱：`groupThenKnockout` 係「大循環 + 淘汰」（全部人打一個大循環），
 * `poolsThenKnockout` 先係「小組賽 + 淘汰」（分開幾組）。
 * 同樣，`stage: 'group'` 係「循環階段」，`pool` 先係「小組」。
 * 內部名唔改 —— 改咗要遷移已經存咗嘅賽事，為咗個名唔抵。
 */

export const MODE_LABEL: Record<TournamentMode, string> = {
  roundRobin: '單循環',
  knockout: '純淘汰',
  groupThenKnockout: '大循環 + 淘汰',
  poolsThenKnockout: '小組賽 + 淘汰',
}

export const MODE_HINT: Record<TournamentMode, string> = {
  roundRobin: '人人都要同其他所有人打一次，分數最高嗰個贏。',
  knockout: '隨機抽籤，輸咗就出局，一路打到剩返一個。',
  groupThenKnockout: '全部人打晒一個大循環，成績最好嗰幾個再打淘汰賽爭冠軍。',
  poolsThenKnockout: '隨機分幾組，組內打循環，每組頭幾名再打淘汰賽爭冠軍。',
}

/** 呢個模式而家排唔排到賽程。 */
export function canStart(t: Tournament): boolean {
  const n = t.players.length
  if (n < 2) return false

  if (t.mode === 'groupThenKnockout') {
    return t.cutSize !== null && t.cutSize >= 2 && t.cutSize <= n
  }

  if (t.mode === 'poolsThenKnockout') {
    if (t.poolCount === null || t.advancePerPool === null) return false
    if (!poolOptions(n).includes(t.poolCount)) return false
    return advanceOptions(n, t.poolCount).includes(t.advancePerPool)
  }

  return true
}
```

`startTournament` 換成：

```ts
export interface StartResult {
  /** 小組賽模式會寫低邊個入邊組；其他模式原封不動擺返出嚟。 */
  players: Player[]
  matches: Match[]
}

/**
 * 開波：由選手名單排出第一批場次。
 *
 * knockout 同 poolsThenKnockout 要 rng（抽籤／抽組）；另外兩個唔使。
 * 兩個混合模式開波嗰陣只係排循環階段 —— 籤表要等循環打完先砌得出，
 * 因為種子係用成績決定。
 */
export function startTournament(t: Tournament, rng: () => number): StartResult {
  switch (t.mode) {
    case 'roundRobin':
    case 'groupThenKnockout':
      return { players: t.players, matches: mergeSchedule(t.matches, t.players) }
    case 'knockout':
      return {
        players: t.players,
        matches: propagate(generateBracket(drawOrder(t.players, rng))),
      }
    case 'poolsThenKnockout': {
      const k = t.poolCount ?? 0
      // 第一次排賽程先抽組。之後撳「補返新場次」係補遲到嗰啲人，唔可以重抽 ——
      // 重抽會令已經打咗嘅場次變成跨組對戰，成個小組賽即刻報廢。
      const drawn = t.players.some((p) => p.pool !== null)
        ? assignLatecomers(t.players, k)
        : drawPools(t.players, k, rng)
      return { players: drawn, matches: buildPoolSchedule(t.matches, drawn, k) }
    }
  }
}
```

`buildCut` 換成：

```ts
/**
 * 循環打完，攞出線嘅人砌籤表。
 *
 * 大循環 + 淘汰：種子順序 = 總排名，所以第 1 名對最後一個入圍嘅。
 * 小組賽 + 淘汰：交叉搵 —— 各組第 1 名排一梯次、各組第 2 名排下一梯次。
 */
export function buildCut(t: Tournament): Match[] {
  const seeds = cutSeeds(t)
  if (seeds.length < 2) return t.matches
  return [...groupMatches(t.matches), ...propagate(generateBracket(seeds))]
}

function cutSeeds(t: Tournament): string[] {
  if (t.mode === 'poolsThenKnockout') {
    if (t.poolCount === null || t.advancePerPool === null) return []
    return poolSeedOrder(t.players, t.matches, t.poolCount, t.advancePerPool)
  }
  if (t.cutSize === null) return []
  return computeStandings(t.players, groupMatches(t.matches))
    .slice(0, t.cutSize)
    .map((r) => r.playerId)
}
```

`hasStandings` 唔使改（`mode !== 'knockout'` 已經涵蓋新模式）。

- [ ] **Step 4: 改 `Setup.tsx` 兩個呼叫點**

`src/ui/Setup.tsx` `buildSchedule()` 入面：

```ts
    if (!canStart(tournament)) {
```

同埋：

```ts
    update((t) => {
      const started = startTournament(t, Math.random)
      return { ...t, players: started.players, matches: started.matches }
    })
```

（Task 6 會再改呢個 function 嘅 warning 文案，而家淨係令佢 compile 得返。）

- [ ] **Step 5: 跑測試，確認全部過**

Run: `npm test && npm run typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/engine/tournament.ts src/engine/tournament.test.ts src/ui/Setup.tsx
git commit -m "$(cat <<'EOF'
四個賽制共用入口接落小組賽

startTournament 改返一個 { players, matches } —— 小組賽開波要順便寫低邊個入邊組。
canStart 改為食成個 Tournament，唔使再逐個參數傳。
buildCut 按 mode 分流，介面嗰邊唔使識分。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 開賽設定

**Files:**
- Modify: `src/ui/Setup.tsx`
- Modify: `src/ui/styles/app.css`

**Interfaces:**
- Consumes: `poolOptions` / `advanceOptions` / `poolSizes` / `poolLabel` from `../engine/pools`；`MODE_LABEL` / `MODE_HINT` / `canStart` / `startTournament` from `../engine/tournament`。

- [ ] **Step 1: 賽制掣加新模式**

`src/ui/Setup.tsx` 個 modes 陣列同 onClick：

```tsx
            {(
              [
                'roundRobin',
                'knockout',
                'groupThenKnockout',
                'poolsThenKnockout',
              ] as TournamentMode[]
            ).map((m) => (
              <button
                key={m}
                className="mode chamfer-sm"
                aria-pressed={tournament.mode === m}
                disabled={alreadyStarted}
                onClick={() =>
                  update((t) => ({
                    ...t,
                    mode: m,
                    // 轉走某個模式就冇咗嗰個模式嘅設定，唔好留住個舊值。
                    cutSize: m === 'groupThenKnockout' ? (t.cutSize ?? 4) : null,
                    poolCount: m === 'poolsThenKnockout' ? (t.poolCount ?? defaultPools) : null,
                    advancePerPool:
                      m === 'poolsThenKnockout' ? (t.advancePerPool ?? defaultAdvance) : null,
                  }))
                }
              >
```

喺 component 入面（`const count = players.length` 附近）計 default：

```tsx
  const count = players.length
  const pools = poolOptions(count)
  // 預設 2 組、每組出 2 個；人數唔夠就用揀得到嘅第一個。
  const defaultPools = pools.includes(2) ? 2 : (pools[0] ?? null)
  const advances = defaultPools === null ? [] : advanceOptions(count, defaultPools)
  const defaultAdvance = advances.includes(2) ? 2 : (advances[0] ?? null)
```

⚠ `defaultPools` / `defaultAdvance` 要喺 `count` 之後、`return` 之前定義。而家 `const count` 喺 return 上面第 79 行左右，`return` 之前 —— 啱用。

- [ ] **Step 2: 加兩行 chip**

擺喺現有 `{tournament.mode === 'groupThenKnockout' && (...)}` 嗰嚿之後：

```tsx
        {tournament.mode === 'poolsThenKnockout' && (
          <PoolSetup
            count={count}
            poolCount={tournament.poolCount}
            advancePerPool={tournament.advancePerPool}
            locked={alreadyStarted}
            onPools={(n) =>
              update((t) => {
                // 改咗組數，原本嘅出線人數可能已經超出最細嗰組 —— 夾返落合法值。
                const opts = advanceOptions(count, n)
                const keep =
                  t.advancePerPool !== null && opts.includes(t.advancePerPool)
                    ? t.advancePerPool
                    : (opts[opts.length - 1] ?? null)
                return { ...t, poolCount: n, advancePerPool: keep }
              })
            }
            onAdvance={(n) => update((t) => ({ ...t, advancePerPool: n }))}
          />
        )}
```

喺檔案下面（`Preview` 隔籬）加：

```tsx
/** 分幾多組 + 每組出幾多個。兩行 chip，同「入圍人數」嗰行同一個樣。 */
function PoolSetup({
  count,
  poolCount,
  advancePerPool,
  locked,
  onPools,
  onAdvance,
}: {
  count: number
  poolCount: number | null
  advancePerPool: number | null
  locked: boolean
  onPools: (n: number) => void
  onAdvance: (n: number) => void
}) {
  const pools = poolOptions(count)

  if (pools.length === 0) {
    return (
      <div className="field">
        <span className="field__label">分幾多組</span>
        <p className="note note--bad">
          <span>⚠</span>
          <span>至少要有 4 個人先分到組（每組最少 2 個人）。</span>
        </p>
      </div>
    )
  }

  const advances = poolCount === null ? [] : advanceOptions(count, poolCount)
  const sizes = poolCount === null ? [] : poolSizes(count, poolCount)
  const qualifiers = poolCount === null || advancePerPool === null ? 0 : poolCount * advancePerPool

  return (
    <>
      <div className="field">
        <span className="field__label">分幾多組</span>
        <div className="chips">
          {pools.map((n) => (
            <button
              key={n}
              className="chip chamfer-sm"
              aria-pressed={poolCount === n}
              disabled={locked}
              onClick={() => onPools(n)}
            >
              {n} 組
            </button>
          ))}
        </div>
        {sizes.length > 0 && (
          <p className="note">
            <span>·</span>
            <span>
              {count} 個人分 {poolCount} 組 = {sizes.join(' / ')} 人。抽籤決定邊個同邊個一組。
            </span>
          </p>
        )}
      </div>

      <div className="field">
        <span className="field__label">每組出幾多個入籤表</span>
        <div className="chips">
          {advances.map((n) => (
            <button
              key={n}
              className="chip chamfer-sm"
              aria-pressed={advancePerPool === n}
              disabled={locked}
              onClick={() => onAdvance(n)}
            >
              頭 {n} 名
            </button>
          ))}
        </div>
        {qualifiers > 0 && (
          <p className="note">
            <span>·</span>
            <span>
              {qualifiers} 個人入籤表。交叉搵：A 組第 1 對 B 組第 2，同組嘅唔會一入淘汰就撞返。
            </span>
          </p>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 3: 名單出組別章**

`roster__row` 入面，`roster__name` 之後：

```tsx
                    <span className="roster__name">{p.name}</span>
                    {p.pool !== null && (
                      <span className="roster__pool" aria-label={`${poolLabel(p.pool)} 組`}>
                        {poolLabel(p.pool)}
                      </span>
                    )}
```

- [ ] **Step 4: 改 warning 文案同預覽**

`buildSchedule()` 個 warning 分支：

```ts
    if (!canStart(tournament)) {
      if (tournament.mode === 'poolsThenKnockout') {
        setWarning(
          poolOptions(players.length).length === 0
            ? '至少要有 4 個人先分到組（每組最少 2 個人）。'
            : '揀埋分幾多組同每組出幾多個，先排得到賽程。',
        )
        return
      }
      const options = cutOptions(players.length)
      setWarning(
        tournament.cutSize !== null && !options.includes(tournament.cutSize)
          ? `而家得 ${players.length} 個人，入圍人數最多只可以揀頭 ${Math.max(...options)} 名。`
          : '揀埋入圍人數先排得到賽程。',
      )
      return
    }
```

`Preview` 加參數同分支：

```tsx
        <Preview
          mode={tournament.mode}
          count={count}
          cutSize={tournament.cutSize}
          poolCount={tournament.poolCount}
          advancePerPool={tournament.advancePerPool}
        />
```

```tsx
function Preview({
  mode,
  count,
  cutSize,
  poolCount,
  advancePerPool,
}: {
  mode: TournamentMode
  count: number
  cutSize: number | null
  poolCount: number | null
  advancePerPool: number | null
}) {
  const cells: { num: number; label: string }[] = [{ num: count, label: '個人' }]

  if (mode === 'poolsThenKnockout' && poolCount !== null) {
    const sizes = poolSizes(count, poolCount)
    const groupGames = sizes.reduce((n, s) => n + totalMatches(s), 0)
    cells.push({ num: poolCount, label: '組' })
    cells.push({ num: groupGames, label: '場小組賽' })
    if (advancePerPool !== null) {
      const inBracket = poolCount * advancePerPool
      cells.push({ num: inBracket, label: '人入籤表' })
      if (inBracket >= 2) cells.push({ num: bracketRounds(inBracket), label: '輪淘汰' })
    }
  }

  if (mode === 'roundRobin' || mode === 'groupThenKnockout') {
    cells.push({ num: totalRounds(count), label: '輪循環' })
    cells.push({ num: totalMatches(count), label: '場循環' })
  }
  if (mode === 'knockout' || mode === 'groupThenKnockout') {
    const inBracket = mode === 'knockout' ? count : (cutSize ?? 0)
    if (inBracket >= 2) {
      cells.push({ num: bracketRounds(inBracket), label: '輪淘汰' })
      cells.push({ num: inBracket - 1, label: '場淘汰' })
    }
  }

  const oddRoundRobin =
    (mode === 'roundRobin' || mode === 'groupThenKnockout') && count % 2 === 1 && count >= 3
  const byes = mode === 'knockout' ? byeCount(count) : 0

  return (
    // …下面原封不動…
  )
}
```

⚠ `oddRoundRobin` 原本係 `mode !== 'knockout'`，小組賽模式唔啱用（單數人數唔代表有人輪空），所以要改成上面咁樣列明兩個模式。

- [ ] **Step 5: 「補返新場次」嗰句 note 加小組賽版本**

`{alreadyStarted && newMatches > 0 && (...)}` 上面加：

```tsx
        {alreadyStarted && tournament.mode === 'poolsThenKnockout' && (
          <p className="note">
            <span>·</span>
            <span>賽事已經開咗波。而家加嘅人會入人最少嗰組，唔會重新抽組。</span>
          </p>
        )}
```

同時 `newMatches` 個計法（`totalMatches(count) - tournament.matches.length`）喺小組賽度係錯嘅，改成：

```ts
  const newMatches =
    tournament.mode === 'poolsThenKnockout' && tournament.poolCount !== null
      ? poolSizes(count, tournament.poolCount).reduce((n, s) => n + totalMatches(s), 0) -
        tournament.matches.filter((m) => m.stage === 'group').length
      : totalMatches(count) - tournament.matches.length
```

同埋將原本嗰句 note 嘅條件改成 `alreadyStarted && newMatches > 0 && tournament.mode !== 'poolsThenKnockout'`，唔好兩句 note 一齊出。

- [ ] **Step 6: 加 CSS**

`src/ui/styles/app.css` 尾加：

```css
/* 名單入面嘅組別章。細細粒，唔搶「除名」粒掣。 */
.roster__pool {
  display: inline-grid;
  place-items: center;
  min-width: 1.6em;
  padding: 0.1em 0.35em;
  margin-inline-start: var(--sp-2);
  font-size: var(--step--2);
  font-variation-settings: 'wdth' 100, 'wght' 700;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
  background: var(--floor-sunk);
  border: 1px solid var(--line);
}
```

（`--ink-faint`、`--floor-sunk`、`--line`、`--step--2` 全部係 `tokens.css` 現有嘅，
淺色深色兩套都有定義。唔准自己發明新 token。）

- [ ] **Step 7: 手動試**

Run: `npm run dev`，開 http://localhost:5173

1. 開新賽事 → 揀「小組賽 + 淘汰」→ 應該見到兩行 chip
2. 加 12 個人 → 「分幾多組」有 2/3/4/5/6；揀 3 組 → note 寫「12 個人分 3 組 = 4 / 4 / 4 人」
3. 揀「頭 2 名」→ 預覽寫「12 個人 · 3 組 · 18 場小組賽 · 6 人入籤表 · 3 輪淘汰」
4. 揀 2 組 + 頭 3 名 → 預覽跟住變（2 組 · 6 人入籤表 · 3 輪淘汰）
5. 撳「排賽程」→ 返到入分版；返開賽設定，每個名右邊有 A／B／C 章

- [ ] **Step 8: 跑測試 + commit**

```bash
npm test && npm run typecheck
git add src/ui/Setup.tsx src/ui/styles/app.css
git commit -m "$(cat <<'EOF'
開賽設定：揀分幾多組同每組出幾多個

兩行 chip，改組數會自動夾返合法嘅出線人數 —— 唔會出現
「3 組每組出 3 個」但最細組得 2 個人呢種砌唔到嘅組合。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 排名／電視／矩陣逐組顯示 + 冠軍 bug

**Files:**
- Modify: `src/ui/Table.tsx`
- Modify: `src/ui/Board.tsx`
- Modify: `src/ui/Matrix.tsx`
- Modify: `src/ui/components/Standings.tsx`
- Modify: `src/ui/styles/app.css`

**Interfaces:**
- Consumes: `poolStandings` / `poolsOf` / `poolLabel` from `../engine/pools`；`bracketChampion` from `../engine/bracket`。
- Produces: `Standings` 多一個 optional prop `cutAfter?: number`（第幾行之後劃出線線）。

- [ ] **Step 1: `Standings` 加出線線**

`src/ui/components/Standings.tsx`：

```tsx
/**
 * 排名表。頭三個規則睇得出嚟，第 4 條（得失分差）都擺埋，等人查得到。
 *
 * `cutAfter` = 第幾名之後劃條出線線（小組賽用）。
 */
export function Standings({
  rows,
  compact = false,
  cutAfter,
}: {
  rows: StandingRow[]
  compact?: boolean
  cutAfter?: number
}) {
```

`<tr>` 加 attribute：

```tsx
            <tr
              key={r.playerId}
              data-lead={r.rank === 1}
              data-cut={cutAfter !== undefined && i + 1 === cutAfter ? true : undefined}
            >
```

（`rows.map((r) => ...)` 要改成 `rows.map((r, i) => ...)`。）

CSS：

```css
/* 小組賽出線線：線下面嗰啲人打唔到淘汰賽。 */
.stand tr[data-cut] > * {
  border-bottom: 2px solid var(--gold);
}
```

- [ ] **Step 2: `Table.tsx` 逐組 + 修冠軍**

```tsx
import { useTournament, store } from '../storage/browserStore'
import { computeStandings, completedCount, isTournamentComplete } from '../engine/standings'
import { bracketChampion } from '../engine/bracket'
import { poolLabel, poolStandings } from '../engine/pools'
import { downloadJson } from '../lib/download'
import { TopBar } from './components/TopBar'
import { Standings } from './components/Standings'
import { NotFound } from './Setup'

export function Table({ id }: { id: string }) {
  const { tournament } = useTournament(id)
  if (tournament === null) return <NotFound />

  const rows = computeStandings(tournament.players, tournament.matches)
  const done = completedCount(tournament.matches)

  /**
   * 有籤表嘅模式，冠軍一定係淘汰賽冠軍。
   *
   * 原本呢度淨係讀排名第 1 —— 但 computeStandings 唔計淘汰階段，
   * 而 isTournamentComplete 計埋，所以打完成個籤表之後會捧咗
   * 循環賽第一名做冠軍。
   */
  const hasBracketStage = tournament.mode !== 'roundRobin'
  const champId = hasBracketStage ? bracketChampion(tournament.matches) : null
  const champName =
    champId === null ? null : (tournament.players.find((p) => p.id === champId)?.name ?? null)
  const roundRobinChamp =
    !hasBracketStage && isTournamentComplete(tournament.matches)
      ? rows.find((r) => r.rank === 1)
      : undefined

  const pools =
    tournament.mode === 'poolsThenKnockout' && tournament.poolCount !== null
      ? poolStandings(tournament.players, tournament.matches, tournament.poolCount)
      : null
```

冠軍嗰嚿改成：

```tsx
        {champName !== null && (
          <div className="verdict chamfer">
            <div>
              <span className="u-eyebrow">打完喇 · 冠軍</span>
              <div className="verdict__who">{champName}</div>
              <span className="u-eyebrow">淘汰賽冠軍</span>
            </div>
          </div>
        )}

        {roundRobinChamp !== undefined && (
          <div className="verdict chamfer">
            <div>
              <span className="u-eyebrow">打完喇 · 冠軍</span>
              <div className="verdict__who">{roundRobinChamp.name}</div>
              <span className="u-eyebrow u-tab">
                {roundRobinChamp.wins} 勝 {roundRobinChamp.losses} 負 · 總得分{' '}
                {roundRobinChamp.pointsFor}
              </span>
            </div>
            {roundRobinChamp.tied && (
              <p className="note">
                <span>·</span>
                <span>第一位有人並列，四條規則都分唔開。要分先後就要加賽或者抽籤。</span>
              </p>
            )}
          </div>
        )}
```

`<Standings rows={rows} />` 改成：

```tsx
        {pools === null ? (
          <Standings rows={rows} />
        ) : (
          <div className="poolgrid">
            {pools.map((table) => (
              <section key={table.pool}>
                <h2 className="u-eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
                  {poolLabel(table.pool)} 組
                </h2>
                <Standings rows={table.rows} cutAfter={tournament.advancePerPool ?? undefined} />
              </section>
            ))}
          </div>
        )}
```

底下嗰句 note 加一句（小組賽先出）：

```tsx
        {pools !== null && (
          <p className="note">
            <span>·</span>
            <span>
              線上面嗰啲入淘汰賽。組同組唔會互相比較 —— 每組自己排自己嘅名次。
            </span>
          </p>
        )}
```

- [ ] **Step 3: `Board.tsx` 逐組 + 修冠軍**

`championLine` 換成：

```tsx
/**
 * 電視上面寫邊個冠軍。
 *
 * 有籤表嘅模式睇籤表冠軍；純循環先睇排名第 1，而第一位可以有幾個人並列 ——
 * 原本淨係讀 rows[0]，即係喺成班人面前照住個大螢幕，用名字排序隨機捧咗一個做冠軍。
 */
function championLine(tournament: Tournament, rows: StandingRow[]): string {
  if (tournament.mode !== 'roundRobin') {
    const id = bracketChampion(tournament.matches)
    return id === null ? '' : (tournament.players.find((p) => p.id === id)?.name ?? '')
  }
  const top = rows.filter((r) => r.rank === 1)
  if (top.length === 0) return ''
  if (top.length === 1) return top[0]!.name
  return `${top.map((r) => r.name).join('、')}（並列）`
}
```

呼叫嗰度：`{complete ? `打完喇 · 冠軍 ${championLine(tournament, rows)}` : '仲未排賽程'}`
（`complete` 個定義照舊；`import type { StandingRow, Tournament }`、`import { bracketChampion }`。）

排名榜嗰 section：

```tsx
        <section>
          <h2 className="u-eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
            排名榜
          </h2>
          {pools === null ? (
            <Standings rows={rows} compact />
          ) : (
            <div className="poolgrid">
              {pools.map((table) => (
                <div key={table.pool}>
                  <h3 className="u-eyebrow">{poolLabel(table.pool)} 組</h3>
                  <Standings
                    rows={table.rows}
                    compact
                    cutAfter={tournament.advancePerPool ?? undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
```

`pools` 同 `Table.tsx` 一樣咁計。

- [ ] **Step 4: `Matrix.tsx` 逐組**

抽一個 `MatrixTable` 出嚟，然後：

```tsx
  const pools =
    tournament.mode === 'poolsThenKnockout' && tournament.poolCount !== null
      ? poolsOf(tournament.players, tournament.poolCount)
      : null
```

```tsx
      <div className="page page--wide stack">
        {pools === null ? (
          <MatrixTable players={players} matches={tournament.matches} />
        ) : (
          pools.map((pool, i) => (
            <section key={i}>
              <h2 className="u-eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
                {poolLabel(i + 1)} 組
              </h2>
              <MatrixTable players={pool} matches={tournament.matches} />
            </section>
          ))
        )}

        <p className="note">
          <span>·</span>
          <span>每格係橫行嗰個嘅比分。粗體藍色 = 贏咗，灰色 = 輸咗，「·」= 仲未打。</span>
        </p>
        {pools !== null && (
          <p className="note">
            <span>·</span>
            <span>逐組畫 —— 唔同組嘅人根本冇對過，擺埋一張大表會成張都係空格。</span>
          </p>
        )}
      </div>
```

`MatrixTable` 就係本來 `<div className="tablewrap tablewrap--fit">…</div>` 嗰嚿，簽名 `{ players, matches }: { players: Player[]; matches: Match[] }`，入面 `byKey` 由 `matches` 計。

- [ ] **Step 5: CSS**

```css
/* 逐組表格：闊就打橫排，窄就疊落去。 */
.poolgrid {
  display: grid;
  gap: var(--sp-4);
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}
```

- [ ] **Step 6: 手動試 + commit**

Run: `npm run dev`，開一場 8 人分 2 組每組出 2 嘅賽事，打晒小組賽，睇排名版：兩張表、每張第 2 名下面有條線。砌完籤表打到冠軍，排名版最頂應該寫淘汰賽冠軍嗰個名。

順手驗返舊 bug 修好咗：開一場「大循環 + 淘汰」，打晒，砌籤表，打到冠軍 —— 排名版寫嘅應該係籤表冠軍。

```bash
npm test && npm run typecheck
git add src/ui/Table.tsx src/ui/Board.tsx src/ui/Matrix.tsx src/ui/components/Standings.tsx src/ui/styles/app.css
git commit -m "$(cat <<'EOF'
排名／電視／矩陣逐組顯示，順手修冠軍

有籤表嘅模式而家一律睇籤表冠軍。之前排名版讀嘅係 computeStandings 第 1 名，
但嗰個 function 唔計淘汰階段 —— 所以打完成個籤表會捧咗循環賽第一名做冠軍。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 賽程版

**Files:**
- Modify: `src/ui/Schedule.tsx`
- Modify: `src/ui/styles/app.css`

**Interfaces:**
- Consumes: `poolsOf` / `poolLabel` from `../engine/pools`。

- [ ] **Step 1: 轉盤加組別掣**

`Schedule` component 入面：

```tsx
  const [shownRound, setShownRound] = useState(1)
  const [shownPool, setShownPool] = useState(1)

  if (tournament === null) return <NotFound />

  const isPools = tournament.mode === 'poolsThenKnockout' && tournament.poolCount !== null
  const pools = isPools ? poolsOf(tournament.players, tournament.poolCount!) : null
  const poolOf = new Map(tournament.players.map((p) => [p.id, p.pool]))

  // 轉盤一次淨係畫一組 —— 三個圈疊埋一齊邊個都睇唔明。
  const dialPlayers = pools === null ? tournament.players : (pools[shownPool - 1] ?? [])
  const dialMatches =
    pools === null
      ? tournament.matches
      : tournament.matches.filter((m) => m.aId !== null && poolOf.get(m.aId) === shownPool)

  const rounds = [...new Set(inPlayOrder(tournament.matches).map((m) => m.round))]
  const laps = totalRounds(dialPlayers.length)

  const showDial =
    dialPlayers.length >= 2 &&
    (dialMatches.length === 0 || isPureCircleSchedule(dialMatches, dialPlayers))
```

轉盤嗰 section 頂加組別掣：

```tsx
        {showDial && (
          <section>
            {pools !== null && (
              <div className="chips" style={{ justifyContent: 'center', marginBottom: 'var(--sp-3)' }}>
                {pools.map((_, i) => (
                  <button
                    key={i}
                    className="chip chamfer-sm"
                    aria-pressed={shownPool === i + 1}
                    onClick={() => {
                      setShownPool(i + 1)
                      setShownRound(1)
                    }}
                  >
                    {poolLabel(i + 1)} 組
                  </button>
                ))}
              </div>
            )}
            <CircleDial
              players={dialPlayers}
              round={shownRound}
              matches={dialMatches}
              caption="有圈嗰個位釘死唔郁，其餘每過一輪順時針行一格，行到邊個位就同對面嗰位打。藍點紅點就係嗰場邊個企藍邊、邊個企紅邊。"
            />
```

- [ ] **Step 2: 場次標組別**

`RoundBlock` / `MatchRow` 加 `poolOf`：

```tsx
function MatchRow({
  id,
  match,
  tournament,
  poolOf,
}: {
  id: string
  match: Match
  tournament: Tournament
  poolOf: Map<string, number | null> | null
}) {
```

喺 `<a className="mrow">` 入面第一格之前加：

```tsx
      {poolOf !== null && match.aId !== null && poolOf.get(match.aId) != null && (
        <span className="mrow__pool">{poolLabel(poolOf.get(match.aId)!)}</span>
      )}
```

`poolOf` 由 `Schedule` 傳落去（唔係小組賽就傳 `null`）。`RoundBlock` 加同一個 prop 轉手。

- [ ] **Step 3: CSS**

```css
/* 賽程入面嘅組別章。 */
.mrow__pool {
  flex: 0 0 auto;
  padding: 0.05em 0.35em;
  font-size: var(--step--2);
  font-variation-settings: 'wdth' 100, 'wght' 700;
  color: var(--ink-faint);
  background: var(--floor-sunk);
}
```

（`.mrow`（`app.css:1024`）係 `display: flex` 唔係 grid，所以加多一格唔使改 template ——
`.mrow__side` 有 `flex: 1`，個章寫 `flex: 0 0 auto` 就唔會搶位。）

- [ ] **Step 4: 手動試 + commit**

Run: `npm run dev` → 12 人分 3 組 → 賽程版應該見到 A／B／C 三粒掣，撳一撳換轉盤；每場左邊有組別章。

```bash
npm test && npm run typecheck
git add src/ui/Schedule.tsx src/ui/styles/app.css
git commit -m "$(cat <<'EOF'
賽程版：逐組轉盤

三個圈疊埋一齊邊個都睇唔明，所以加咗組別掣，一次畫一組。
每場左邊標返組別，等你唔使記住邊個係邊組。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 入分標題 + 籤表文案

**Files:**
- Modify: `src/ui/Console.tsx`
- Modify: `src/ui/Bracket.tsx`

- [ ] **Step 1: `Console.tsx` 標題加組別**

`stageLabel` 換成：

```tsx
  // 淘汰賽講「決賽」「四強」，唔講「第 3 輪」—— 階段先係人記得住嗰樣嘢。
  // 小組賽再加返組別，唔係主持人分唔清而家叫緊邊組上台。
  const poolNo =
    match.stage === 'group' && match.aId !== null
      ? (tournament.players.find((p) => p.id === match.aId)?.pool ?? null)
      : null
  const stageLabel =
    match.stage === 'bracket'
      ? `${bracketRoundName(match.round, totalBracketRounds(tournament.matches))} · 第 ${match.order} 場`
      : `${poolNo === null ? '' : `${poolLabel(poolNo)} 組 · `}第 ${match.round} 輪 · 全場第 ${position} 場`
```

`cutPending` 加新模式：

```tsx
  // 循環打完但籤表未砌 —— 呢個唔算打完，仲有淘汰賽要打。
  const cutPending =
    (tournament.mode === 'groupThenKnockout' || tournament.mode === 'poolsThenKnockout') &&
    groupStageComplete(tournament) &&
    !hasBracket(tournament)
```

Import `poolLabel`。

- [ ] **Step 2: `Bracket.tsx` 文案分模式**

```tsx
  const brackety = tournament.mode !== 'roundRobin'
  const canBuild =
    (tournament.mode === 'groupThenKnockout' || tournament.mode === 'poolsThenKnockout') &&
    !ready &&
    groupStageComplete(tournament)
```

`NotYet` 入面：

```tsx
  if (canBuild) {
    const pools = tournament.mode === 'poolsThenKnockout'
    return (
      <div className="verdict chamfer">
        <div>
          <span className="u-eyebrow">{pools ? '小組賽打完喇' : '大循環打完喇'}</span>
          <div className="verdict__who">
            {pools
              ? `每組頭 ${tournament.advancePerPool} 名入籤表`
              : `頭 ${tournament.cutSize} 名入籤表`}
          </div>
          <span className="u-eyebrow">
            {pools
              ? '交叉搵：A 組第 1 對 B 組第 2，同組嘅唔會一入淘汰就撞返'
              : '種子跟排名排，第 1 名對最後一個入圍嘅'}
          </span>
        </div>
        <button className="btn btn--primary btn--big chamfer" onClick={onBuild}>
          砌籤表
        </button>
      </div>
    )
  }

  return (
    <p className="empty">
      {tournament.mode === 'poolsThenKnockout' ? (
        <>
          小組賽仲未打完，籤表要等成績出齊先砌得到。
          <br />
          每組頭 {tournament.advancePerPool ?? '？'} 名入籤表。
        </>
      ) : (
        <>
          循環賽仲未打完，籤表要等成績出齊先砌得到。
          <br />
          入圍人數：頭 {tournament.cutSize ?? '？'} 名。
        </>
      )}
    </p>
  )
```

- [ ] **Step 3: 手動試 + commit**

Run: `npm run dev` → 入分版標題應該係「A 組 · 第 1 輪 · 全場第 1 場」。小組賽打完，最後一場之後有粒「去砌籤表」。

```bash
npm test && npm run typecheck
git add src/ui/Console.tsx src/ui/Bracket.tsx
git commit -m "$(cat <<'EOF'
入分標題加組別、籤表文案分模式

主持人望住個標題叫人上台，冇組別就分唔清而家叫緊邊組。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: README + 端對端實跑

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 改 README**

「三個賽制」改「四個賽制」（第 5 行）。

賽制表加一行、順手改返舊嗰個嘅名：

```markdown
| 賽制 | 點運作 |
|---|---|
| **單循環** | 人人都要同其他所有人打一次，分數最高嗰個贏 |
| **純淘汰** | 隨機抽籤，輸咗就出局，一路打到剩返一個 |
| **大循環 + 淘汰** | 全部人打晒一個大循環，成績最好嗰幾個（頭 2／4／8／16 名，開賽時揀）再打淘汰賽 |
| **小組賽 + 淘汰** | 隨機分幾組（開賽時揀 2–6 組），每組組內打單循環，每組頭幾名（1／2／3，開賽時揀）再打淘汰賽 |
```

籤表段落補：

```markdown
- 純淘汰：隨機抽籤，邊個輪空都係隨機
- 大循環 + 淘汰：種子跟循環賽排名，第 1 名對最後一個入圍嘅
- 小組賽 + 淘汰：交叉搵 —— 各組第 1 名排一梯次、各組第 2 名排下一梯次，
  同梯次之間用總成績分先後。砌完會自動調位，令同組嘅首圈唔會撞返。
  （淨係管首圈。之後幾輪冇得保證 —— 邊個贏咗上一場先知，唔會為咗避而重排籤表。）
```

架構段落 `engine/` 加一行：

```
    pools.ts        小組賽：抽組、逐組賽程、逐組排名、交叉種子
```

再加一段：

```markdown
**小組賽點分組：** 撳「排賽程」嗰下隨機抽，抽完釘死。組同組最多爭一個人
（13 個人分 3 組 = 5／4／4）。賽事開咗之後加人**唔會重抽** ——
新嚟嗰個入人最少嗰組，補返佢同組內其他人嘅場次，插喺嗰組賽程最尾。
重抽會令已經打咗嘅場次變成跨組對戰，成個小組賽即刻報廢。
```

測試數目嗰兩處（第 22、45 行嘅「281 個測試」）改成實際數字 —— 跑 `npm test` 睇個總數。

- [ ] **Step 2: 端對端實跑**

Run: `npm run dev`

1. 主頁開新賽事「小組賽測試」
2. 開賽設定揀「小組賽 + 淘汰」、加 12 個人、揀 3 組 + 頭 2 名
3. 撳「排賽程」→ 應該排出 18 場
4. 賽程版：3 粒組別掣、每場有組別章、輪次由 1 到 3
5. 入分版打晒 18 場（每場撳 4 次「極限」就夠 4 分）
6. 排名版：3 張表，每張第 2 名下面有線
7. 矩陣版：3 張細表
8. 籤表版撳「砌籤表」→ 6 個人入 8 人籤表，2 個首圈輪空
9. 檢查首圈兩場**唔係**同組內戰
10. 打晒淘汰賽 → 排名版最頂寫淘汰賽冠軍嗰個名
11. 電視版睇一次：3 張 compact 表打橫排
12. 「down 低備份」→ 主頁「入返備份」→ 入返嚟嘅賽事組別、分數全部一樣

- [ ] **Step 3: 跑齊測試 + commit**

```bash
npm test && npm run typecheck && npm run build
git add README.md
git commit -m "$(cat <<'EOF'
README：四個賽制

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 部署**

`git push` 上 `main` → GitHub Actions typecheck、跑測試、build、部署去 GitHub Pages。
**測試唔過就唔會部署。** 部署完開 https://samtang2014.github.io/Beyblade-scoreboard/ 實跑一次上面第 2、3、8、9 步。

---

## 自查

**Spec coverage：** 抽組（T2）、逐組賽程（T3）、遲到加人（T2 + T3 + T5）、「呢輪唞」新規則（T3）、
逐組排名（T4）、交叉種子 + 修補 pass（T4）、首圈零內戰逐個組合驗（T4 測試）、
`startTournament` 新簽名（T5）、`buildCut` 分流（T5）、`canStart`（T5）、label 改名（T5）、
存檔向後相容（T1）、開賽設定（T6）、排名／電視／矩陣（T7）、賽程（T8）、
入分／籤表（T9）、冠軍 bug（T7）、README（T10）—— 全部 spec 段落都有 task 對得返。

**已知會變嘅 API（執行時留意）：**
`startTournament` 由 `Match[]` 變 `{ players, matches }`、`canStart` 由三個參數變食 `Tournament`、
`Standings` 加 optional `cutAfter`、`byesInRound` 行為改（同組先算唞）。
全部呼叫點喺 T1／T5 已經列晒。
