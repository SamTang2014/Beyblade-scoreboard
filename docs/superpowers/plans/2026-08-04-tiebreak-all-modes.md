# 加賽擴展到循環賽同大循環 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加賽由「淨係小組賽有」擴展到三個有排名表嘅模式 —— 單循環任何一段並列都打得，大循環出線線並列就擋住唔准砌籤表，一路打到分勝負為止。

**Architecture:** 現有加賽機制（`buildTiebreak` / `rankByTiebreak` / `tiebreaksFor` / `TieState`）已經齊，唔使重寫，只需要三樣：把 `TieState` 由「一組」抽象成「一段並列」（`pool` → `key`，加 `kind`，`slots` 可以係 null）；加一個唔分組嘅並列搜尋器 `rankTieStates`；加一個將加賽次序套返落排名表嘅純 function `applyRankTiebreaks`。`tournament.ts` 做 mode-aware 嗰層，engine 唔識分模式。

**Tech Stack:** TypeScript（strict）、React 19、Vite、Vitest。冇後端，資料存 localStorage。

## Global Constraints

- 全部介面文字、註釋、commit message 一律用**廣東話口語**，唔用書面語。
- 加賽場次 id 一律行 `tb<key>r<次數>m<場次>`。key：小組賽係組號，其他模式係並列嗰個**名次**。
- **並列一定要由未經加賽嘅排名算起**（原始 `computeStandings`）。由已套用加賽結果嗰張表再搵並列，名次會郁，key 命名空間跟住飄，已排咗嘅加賽場次認唔返自己。
- **加賽輪數唔設上限**，一路打到分勝負為止。
- 「分得開」按有冇出線線分兩種：有線（`slots` 係數字）＝ 線上線下唔同就夠；冇線（`slots` 係 null）＝ 每一對相鄰都要唔同。
- 加賽場次係 `stage: 'tiebreak'`，永遠唔會入 `computeStandings`。呢條唔准改。
- 小組賽現有 `tieStates` **唔加**「打完先顯示」嘅 gate —— 唔喺呢份範圍。
- 每個 task 做完 `npm test` 同 `npm run typecheck` 都要綠先可以 commit；掂到 UI 嘅再行 `npm run build`。

## File Structure

| 檔案 | 責任 |
|---|---|
| `src/engine/pools.ts` | 並列嘅搜尋、加賽場次嘅排程同結算。**唯一**知道「邊啲人並列、加賽點計」嘅地方 |
| `src/engine/tournament.ts` | mode-aware 嗰層：邊個模式搵邊種並列。engine 其他部分唔識分模式 |
| `src/ui/components/TiebreakResult.tsx` | 一段加賽嘅結果表，標題同文案按 `kind` / `slots` 變 |
| `src/ui/Bracket.tsx` | 砌籤表之前擋住未拆掂嘅並列（大循環同小組賽共用） |
| `src/ui/Table.tsx` | 單循環：套用加賽次序、出加賽區、冠軍出真名 |
| `src/ui/Board.tsx` | 電視版，同 Table 一樣但唔俾撳 |

---

### Task 1: `TieState` 由「一組」抽象成「一段並列」

純重構，行為一分唔變。先做呢個，等後面兩個 task 唔使一路改一路搬 field 名。

**Files:**
- Modify: `src/engine/pools.ts:405-525`（`TieState`、`tieStates`、`nextTiebreak`）
- Modify: `src/ui/components/TiebreakResult.tsx:29`
- Modify: `src/ui/Board.tsx:103`、`src/ui/Table.tsx:124`、`src/ui/Bracket.tsx:268,271,274`
- Test: `src/engine/tiebreak.test.ts`

**Interfaces:**
- Produces:
  - `TieState` 由 `{ pool: number; ids; slots: number; ... }` 變 `{ key: number; kind: 'pool' | 'rank'; ids; slots: number | null; ... }`
  - `nextTiebreakFor(states: TieState[]): Match[]`
  - `tieStateFor(key, kind, ids, slots, matches): TieState`（module-private）
  - `separated(results: TiebreakRow[], slots: number | null): boolean`（module-private）

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/engine/tiebreak.test.ts` 最尾加：

```ts
describe('TieState 抽象成一段並列', () => {
  it('小組賽出嚟嘅 state：key 係組號、kind 係 pool', () => {
    const [state] = tieStates(ABC, CYCLE, 3, 2)
    expect(state!.key).toBe(3)
    expect(state!.kind).toBe('pool')
    expect(state!.slots).toBe(2)
  })

  it('nextTiebreakFor 由 state 直接排下一批', () => {
    const first = nextTiebreakFor(tieStates(ABC, CYCLE, 3, 2))
    expect(first).toHaveLength(3)
    expect(first.every((m) => m.round === 1)).toBe(true)
    expect(first.every((m) => m.id.startsWith('tb3r1m'))).toBe(true)

    // 同 nextTiebreak 出一模一樣嘅嘢 —— 後者而家淨係一層殼。
    expect(nextTiebreak(ABC, CYCLE, 3, 2)).toEqual(first)
  })

  it('拆掂咗就唔會再排', () => {
    const all = [
      ...CYCLE,
      played('A', 'B', 'tb3r1m1', 'tiebreak'),
      played('A', 'C', 'tb3r1m2', 'tiebreak'),
      played('B', 'C', 'tb3r1m3', 'tiebreak'),
    ]
    expect(nextTiebreakFor(tieStates(ABC, all, 3, 2))).toHaveLength(0)
  })
})
```

頂部 import 加 `nextTiebreakFor`（由 `./pools`）。

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/engine/tiebreak.test.ts`
Expected: FAIL，`nextTiebreakFor` import 唔到、`state.key` 係 `undefined`

- [ ] **Step 3: 改 `TieState`**

`src/engine/pools.ts`，`TieState` 成個換走：

```ts
/** 一段分唔開嘅並列。 */
export interface TieState {
  /**
   * 加賽場次 id 嘅命名空間 key：小組賽係組號，其他模式係並列嗰個名次。
   *
   * ⚠ 名次做 key 有個代價：循環階段嘅分改咗，名次會郁，已排咗嘅加賽場次就會
   * 認唔返自己（變咗孤兒場次，留喺賽程度但唔影響排名）。改分本身已經有警告，
   * 而且孤兒場次係 `stage: 'tiebreak'`，唔會污染排名表，所以接受。
   */
  key: number
  /** 決定介面點寫個標題：'pool' → 「A 組加賽」，'rank' → 「爭第 N 位加賽」。 */
  kind: 'pool' | 'rank'
  /** 分唔開嗰班人（排名次序）。 */
  ids: string[]
  /**
   * 佢哋入面爭緊幾多個出線位。
   * null = 冇出線線，要成班排晒先後（單循環）。
   */
  slots: number | null
  /** 已經排咗幾多次加賽（0 = 未排過）。 */
  attempt: number
  /** 最近嗰次加賽嘅場次。 */
  matches: Match[]
  /** 最近嗰次加賽打完晒未。 */
  played: boolean
  /** 打完之後分唔分得開。 */
  resolved: boolean
  /**
   * 加賽成績，已經排好次序（勝場 → 分差 → 極限）。未打完就係吉。
   *
   * 介面要靠呢啲數畫張表出嚟，唔可以淨係寫一句「邊個邊個出線」。
   */
  results: TiebreakRow[]
}
```

- [ ] **Step 4: 抽 `separated` 同 `tieStateFor`，`tieStates` 改用佢哋**

`src/engine/pools.ts`，`tieStates`（原本 line 438-471）成個換走：

```ts
/**
 * 加賽打完之後分唔分得開。
 *
 * 有出線線：線上面同線下面嗰兩個唔同就夠 —— 唔關事嗰啲分唔開都唔使再打。
 * 冇出線線（單循環）：每一對相鄰都要唔同，因為冇線可劃，要排晒先後。
 */
function separated(results: TiebreakRow[], slots: number | null): boolean {
  const differ = (a: TiebreakRow, b: TiebreakRow) =>
    a.wins !== b.wins || a.diff !== b.diff || a.xtreme !== b.xtreme

  if (slots === null) {
    return results.every((r, i) => i === 0 || differ(results[i - 1]!, r))
  }

  const above = results[slots - 1]
  const below = results[slots]
  // 線根本唔喺呢班人中間 —— 冇嘢要拆。
  if (above === undefined || below === undefined) return true
  return differ(above, below)
}

/**
 * 由已排咗嘅加賽場次，砌出一段並列嘅狀態。
 *
 * 小組賽同唔分組嘅模式共用呢個 —— 佢哋唯一嘅分別係「邊班人並列」點搵，
 * 搵到之後點排加賽、點結算完全一樣。
 */
function tieStateFor(
  key: number,
  kind: 'pool' | 'rank',
  ids: string[],
  slots: number | null,
  matches: Match[],
): TieState {
  // 排到第幾次。冇排過就係 0。
  let attempt = 0
  while (tiebreaksFor(matches, key, attempt + 1).length > 0) attempt += 1

  const mine = attempt === 0 ? [] : tiebreaksFor(matches, key, attempt)
  const played = mine.length > 0 && mine.every((m) => matchWinnerId(m) !== null)

  let resolved = false
  let results: TiebreakRow[] = []
  if (played) {
    results = rankByTiebreak(ids, mine)
    resolved = separated(results, slots)
  }

  return { key, kind, ids, slots, attempt, matches: mine, played, resolved, results }
}

/** 每組睇一睇出線線上面有冇並列。冇並列嘅組唔會出現喺結果入面。 */
export function tieStates(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
  headToHead = false,
): TieState[] {
  const out: TieState[] = []
  for (const table of poolStandings(players, matches, poolCount, headToHead)) {
    const tie = tiedAtCut(table.rows, advancePerPool)
    if (tie === null) continue
    out.push(tieStateFor(table.pool, 'pool', tie.ids, tie.slots, matches))
  }
  return out
}
```

- [ ] **Step 5: 抽 `nextTiebreakFor`**

`src/engine/pools.ts`，`nextTiebreak`（原本 line 489-502）成個換走：

```ts
/**
 * 由並列狀態排下一批加賽場次。
 *
 * 未排過就排第 1 次；已經排咗而且打完但仲分唔開，就排下一次。
 * 打緊嗰次未打完就唔排 —— 唔係會排咗一堆冇人打嘅場次出嚟。
 *
 * 唔設輪數上限：一路分唔開就一路排得落去，打到分勝負為止。
 */
export function nextTiebreakFor(states: TieState[]): Match[] {
  const out: Match[] = []
  for (const s of states) {
    if (s.resolved) continue
    if (s.attempt === 0) out.push(...buildTiebreak(s.key, s.ids, 1))
    else if (s.played) out.push(...buildTiebreak(s.key, s.ids, s.attempt + 1))
  }
  return out
}

/** 小組賽嘅殼：搵齊各組並列，再排下一批。 */
export function nextTiebreak(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
  headToHead = false,
): Match[] {
  return nextTiebreakFor(tieStates(players, matches, poolCount, advancePerPool, headToHead))
}
```

- [ ] **Step 6: 四個 UI caller 改 field 名**

跑 `grep -rn "\.pool" src/ui` 搵齊，逐個改：

`src/ui/components/TiebreakResult.tsx:29`：
```tsx
  const heading = `${poolLabel(tie.key)} 組加賽${tie.attempt > 1 ? `（第 ${tie.attempt} 次）` : ''}`
```

`src/ui/Board.tsx:103` 同 `src/ui/Table.tsx:124`（兩個一模一樣）：
```tsx
                  const tie = ties.find((t) => t.key === table.pool)
```

`src/ui/Bracket.tsx:268,271,274`：
```tsx
        const rows = tables.find((t) => t.pool === s.key)?.rows ?? []
        const tiedRows = rows.filter((r) => s.ids.includes(r.playerId))
        return (
          <section key={s.key} className="stack">
            <div className="verdict chamfer">
              <div>
                <span className="u-eyebrow">{poolLabel(s.key)} 組分唔開</span>
```

註：`tables` 係 `PoolTable[]`，佢哋嘅 `.pool` **唔改名** —— 嗰個真係組號。改嘅淨係 `TieState`。

- [ ] **Step 7: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: 全綠。呢個 task 一分行為都冇改，所以現有測試一隻都唔應該要改。

- [ ] **Step 8: Commit**

```bash
git add src/engine/pools.ts src/engine/tiebreak.test.ts src/ui/components/TiebreakResult.tsx src/ui/Board.tsx src/ui/Table.tsx src/ui/Bracket.tsx
git commit -m "TieState 由「一組」抽象成「一段並列」，加賽排程抽做 nextTiebreakFor"
```

---

### Task 2: `rankTieStates` —— 唔分組嘅模式搵並列

**Files:**
- Modify: `src/engine/pools.ts`（`tieStates` 下面加）
- Test: `src/engine/tiebreak.test.ts`

**Interfaces:**
- Consumes: Task 1 嘅 `tieStateFor`、`TieState`
- Produces: `rankTieStates(players: Player[], matches: Match[], headToHead: boolean, cut: number | null): TieState[]`

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/engine/tiebreak.test.ts`。用返檔入面現成嘅 `group` / `played`。

**先**喺**檔案 scope**（現有 `CYCLE` 定義下面）加兩個共用 fixture —— Task 3 都要用，所以唔好收埋喺 describe 入面：

```ts
/** 冇組別嘅選手 —— 單循環同大循環都係咁。 */
function flat(names: string[]): Player[] {
  return names.map((name, i) => ({ id: name, name, seat: i, pool: null }))
}

const FOUR = flat(['A', 'B', 'C', 'D'])

/**
 * A 贏 B、B 贏 C、C 贏 A，三個都贏 D。
 * A／B／C 全部 2 勝 1 負、8 分、失 4 分、2 次極限 —— 主鏈四樣全同，並列第 1。
 * D 三場全輸，第 4。
 */
const TOP3: Match[] = [
  group('A', 'B'),
  group('B', 'C'),
  group('C', 'A'),
  group('A', 'D'),
  group('B', 'D'),
  group('C', 'D'),
]
```

跟住喺檔尾加：

```ts
describe('唔分組嘅並列（rankTieStates）', () => {
  it('循環未打完就返吉，就算而家全部人並列', () => {
    expect(rankTieStates(FOUR, [], false, null)).toEqual([])
    expect(rankTieStates(FOUR, TOP3.slice(0, 3), false, null)).toEqual([])
  })

  it('一段都冇並列就返吉', () => {
    // A 贏晒、B 贏 C 同 D、C 贏 D、D 全輸 —— 勝場 3/2/1/0。
    const clear = [
      group('A', 'B'),
      group('A', 'C'),
      group('A', 'D'),
      group('B', 'C'),
      group('B', 'D'),
      group('C', 'D'),
    ]
    expect(rankTieStates(FOUR, clear, false, null)).toEqual([])
  })

  it('單循環：三個人並列第 1 → 一個 state，key 係 1、冇出線線', () => {
    const [s] = rankTieStates(FOUR, TOP3, false, null)
    expect(s!.key).toBe(1)
    expect(s!.kind).toBe('rank')
    expect(s!.slots).toBeNull()
    expect(s!.ids.sort()).toEqual(['A', 'B', 'C'])
    expect(s!.attempt).toBe(0)
  })

  it('單循環：兩段並列 → 兩個 state，key 分別係並列嗰個名次', () => {
    // A 贏 C、A 贏 D、B 贏 C、B 贏 D；A 同 B 未打過，C 同 D 都未打過。
    // → A／B 並列第 1（2 勝、8 分、失 0 分、2 次極限），C／D 並列第 3。
    const ms = [group('A', 'C'), group('A', 'D'), group('B', 'C'), group('B', 'D')]
    const states = rankTieStates(FOUR, ms, false, null)
    expect(states.map((s) => s.key)).toEqual([1, 3])
    expect(states[0]!.ids.sort()).toEqual(['A', 'B'])
    expect(states[1]!.ids.sort()).toEqual(['C', 'D'])
  })

  it('兩段並列各自有自己嘅命名空間，加賽 id 唔會撞', () => {
    const ms = [group('A', 'C'), group('A', 'D'), group('B', 'C'), group('B', 'D')]
    const more = nextTiebreakFor(rankTieStates(FOUR, ms, false, null))
    // 兩段各 2 個人 = 各 1 場。
    expect(more.map((m) => m.id).sort()).toEqual(['tb1r1m1', 'tb3r1m1'])
  })

  it('單循環冇出線線：加賽拆到頭嗰個但後面兩個一樣，唔算拆掂', () => {
    // 加賽又打成回圈，但贏嘅場數唔同分：A 贏 B 4-0、B 贏 C 4-1、C 贏 A 4-2。
    // 內部分差 A +2、B −1、C −1；勝場同極限次數三個都一樣。
    // → A 同 B 分得開，但 B 同 C 分唔開。
    const tb = [
      played('A', 'B', 'tb1r1m1', 'tiebreak', 0),
      played('C', 'A', 'tb1r1m2', 'tiebreak', 2),
      played('B', 'C', 'tb1r1m3', 'tiebreak', 1),
    ]
    const [s] = rankTieStates(FOUR, [...TOP3, ...tb], false, null)
    expect(s!.results.map((r) => r.id)).toEqual(['A', 'B', 'C'])
    expect(s!.results.map((r) => r.diff)).toEqual([2, -1, -1])
    expect(s!.resolved).toBe(false)
  })

  it('大循環有出線線：同一批加賽，線上線下分得開就算拆掂', () => {
    // 同上面一模一樣嘅加賽，但頭 1 名入籤表 → 線喺 A 同 B 中間，佢哋分得開。
    const tb = [
      played('A', 'B', 'tb1r1m1', 'tiebreak', 0),
      played('C', 'A', 'tb1r1m2', 'tiebreak', 2),
      played('B', 'C', 'tb1r1m3', 'tiebreak', 1),
    ]
    const [s] = rankTieStates(FOUR, [...TOP3, ...tb], false, 1)
    expect(s!.slots).toBe(1)
    expect(s!.resolved).toBe(true)
  })

  it('一路分唔開就一路排得落去，三輪都唔會撞 id', () => {
    /** 加賽又打成回圈、全部 4-0 —— 勝場、分差、極限全部一樣，實拆唔掂。 */
    const round = (attempt: number): Match[] => [
      played('A', 'B', `tb1r${attempt}m1`, 'tiebreak'),
      played('B', 'C', `tb1r${attempt}m2`, 'tiebreak'),
      played('C', 'A', `tb1r${attempt}m3`, 'tiebreak'),
    ]

    let all: Match[] = [...TOP3, ...round(1)]
    for (const next of [2, 3]) {
      const states = rankTieStates(FOUR, all, false, null)
      expect(states[0]!.attempt).toBe(next - 1)
      expect(states[0]!.resolved).toBe(false)

      const more = nextTiebreakFor(states)
      expect(more).toHaveLength(3)
      expect(more.every((m) => m.round === next)).toBe(true)
      // `buildTiebreak` 出嘅 id 就係 `round(next)` 嗰批，直接用打完咗嘅版本頂上。
      expect(more.map((m) => m.id).sort()).toEqual(round(next).map((m) => m.id).sort())
      all = [...all, ...round(next)]
    }

    const ids = all.filter((m) => m.stage === 'tiebreak').map((m) => m.id)
    expect(new Set(ids).size).toBe(9)
  })

  it('單循環：包尾兩個並列都要出 state', () => {
    // A 贏晒 3 場；B、C、D 之間打成回圈，全部 4-0 → B/C/D 並列第 2。
    const ms = [
      group('A', 'B'),
      group('A', 'C'),
      group('A', 'D'),
      group('B', 'C'),
      group('C', 'D'),
      group('D', 'B'),
    ]
    const states = rankTieStates(FOUR, ms, false, null)
    expect(states).toHaveLength(1)
    expect(states[0]!.key).toBe(2)
    expect(states[0]!.ids.sort()).toEqual(['B', 'C', 'D'])
  })

  it('大循環：出線線上下分得開就返吉', () => {
    // 勝場 3/2/1/0，頭 2 名入籤表 —— 第 2 同第 3 分得開。
    const clear = [
      group('A', 'B'),
      group('A', 'C'),
      group('A', 'D'),
      group('B', 'C'),
      group('B', 'D'),
      group('C', 'D'),
    ]
    expect(rankTieStates(FOUR, clear, false, 2)).toEqual([])
  })

  it('大循環：頭 2 名入籤表，三個並列第 1 → 三個爭 2 個位', () => {
    const [s] = rankTieStates(FOUR, TOP3, false, 2)
    expect(s!.kind).toBe('rank')
    expect(s!.key).toBe(1)
    expect(s!.slots).toBe(2)
    expect(s!.ids.sort()).toEqual(['A', 'B', 'C'])
  })

  it('大循環：並列嗰班全部喺線之上就唔使拆', () => {
    // 頭 3 名入籤表，三個並列第 1 —— 三個都入到。
    expect(rankTieStates(FOUR, TOP3, false, 3)).toEqual([])
  })

  it('大循環：循環未打完就返吉', () => {
    expect(rankTieStates(FOUR, TOP3.slice(0, 3), false, 2)).toEqual([])
  })
})
```

頂部 import 加 `rankTieStates`（由 `./pools`；`nextTiebreakFor` Task 1 已經加咗）。`Player` 同 `Match` type 已經 import 咗。

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/engine/tiebreak.test.ts`
Expected: FAIL，`rankTieStates is not a function`

- [ ] **Step 3: 實作**

`src/engine/pools.ts`，喺 `tieStates` 後面加：

```ts
/**
 * 唔分組嘅模式（單循環、大循環）嘅並列。
 *
 * `cut` = 頭幾名有意義（大循環入籤表人數）；null = 冇出線線，任何一段並列
 * 都要拆（單循環）。
 *
 * **循環未打完就返吉。** 一場都未打嘅時候全部人並列第 1，唔攔住就會即刻彈
 * 一句「成場人要打加賽」出嚟。小組賽嗰個 `tieStates` 冇呢個 gate —— 佢打到
 * 一半顯示「呢兩個而家並列」係有用資訊，而真正會出事嗰度（砌籤表）本身已經
 * 有 `groupStageComplete` 守住。
 */
export function rankTieStates(
  players: Player[],
  matches: Match[],
  headToHead: boolean,
  cut: number | null,
): TieState[] {
  const group = groupMatches(matches)
  if (!isTournamentComplete(group)) return []

  const rows = computeStandings(players, group, headToHead)

  if (cut !== null) {
    const tie = tiedAtCut(rows, cut)
    if (tie === null) return []
    const first = rows.find((r) => r.playerId === tie.ids[0])!
    return [tieStateFor(first.rank, 'rank', tie.ids, tie.slots, matches)]
  }

  // 任何一段並列都拆。共用同一個名次就係一段。
  const out: TieState[] = []
  for (let i = 0; i < rows.length; ) {
    let end = i + 1
    while (end < rows.length && rows[end]!.rank === rows[i]!.rank) end += 1
    if (end - i >= 2) {
      const ids = rows.slice(i, end).map((r) => r.playerId)
      out.push(tieStateFor(rows[i]!.rank, 'rank', ids, null, matches))
    }
    i = end
  }
  return out
}
```

`src/engine/pools.ts` 第 4 行嘅 import 要加 `isTournamentComplete`：

```ts
import { computeStandings, isTournamentComplete } from './standings'
```

- [ ] **Step 4: 行測試，確認全綠**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/pools.ts src/engine/tiebreak.test.ts
git commit -m "rankTieStates：唔分組嘅模式都搵到並列，循環未打完就唔出聲"
```

---

### Task 3: `applyRankTiebreaks` —— 將加賽次序套返落排名表

**Files:**
- Modify: `src/engine/pools.ts`（`rankTieStates` 後面加）
- Test: `src/engine/tiebreak.test.ts`

**Interfaces:**
- Consumes: Task 1 嘅 `TieState`
- Produces: `applyRankTiebreaks(rows: StandingRow[], states: TieState[]): StandingRow[]`

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/engine/tiebreak.test.ts` 最尾加。`FOUR` 同 `TOP3` Task 2 已經擺咗喺檔案 scope，直接用。

```ts
describe('加賽次序套返落排名表（applyRankTiebreaks）', () => {
  /** 打完三個人嘅加賽，指定名次。全部 4-0。 */
  function tbFor(key: number, order: [string, string][]): Match[] {
    return order.map(([w, l], i) => played(w, l, `tb${key}r1m${i + 1}`, 'tiebreak'))
  }

  it('拆掂咗嘅段：按加賽次序重排，並列解開', () => {
    // 加賽：A 贏晒、B 贏 C、C 全輸 → A、B、C
    const all = [...TOP3, ...tbFor(1, [['A', 'B'], ['A', 'C'], ['B', 'C']])]
    const states = rankTieStates(FOUR, all, false, null)
    expect(states[0]!.resolved).toBe(true)

    const rows = applyRankTiebreaks(computeStandings(FOUR, all), states)
    expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(rows.every((r) => !r.tied)).toBe(true)
  })

  it('拆唔掂嘅段：原封不動，仲係並列', () => {
    // 加賽又打成回圈、全部 4-0 → 勝場、分差、極限全部一樣。
    const all = [...TOP3, ...tbFor(1, [['A', 'B'], ['B', 'C'], ['C', 'A']])]
    const states = rankTieStates(FOUR, all, false, null)
    expect(states[0]!.resolved).toBe(false)

    const raw = computeStandings(FOUR, all)
    expect(applyRankTiebreaks(raw, states)).toEqual(raw)
  })

  it('未排過加賽，張表原封不動', () => {
    const raw = computeStandings(FOUR, TOP3)
    expect(applyRankTiebreaks(raw, rankTieStates(FOUR, TOP3, false, null))).toEqual(raw)
  })

  it('重排唔會影響後面嗰啲人嘅名次', () => {
    // A、B 並列第 1（未打過對方），C 第 3、D 第 4。加賽 A 贏 B。
    const ms = [
      group('A', 'C'),
      group('A', 'D'),
      group('B', 'C'),
      group('B', 'D'),
      group('C', 'D'),
    ]
    const all = [...ms, ...tbFor(1, [['A', 'B']])]
    const states = rankTieStates(FOUR, all, false, null)
    const rows = applyRankTiebreaks(computeStandings(FOUR, all), states)

    expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(rows.find((r) => r.name === 'C')!.tied).toBe(false)
  })

  it('唔會改到入面嗰啲 row（唔 mutate 輸入）', () => {
    const all = [...TOP3, ...tbFor(1, [['A', 'B'], ['A', 'C'], ['B', 'C']])]
    const raw = computeStandings(FOUR, all)
    const snapshot = JSON.parse(JSON.stringify(raw))
    applyRankTiebreaks(raw, rankTieStates(FOUR, all, false, null))
    expect(raw).toEqual(snapshot)
  })

  it('加賽場次一分都唔會入到排名表', () => {
    const all = [...TOP3, ...tbFor(1, [['A', 'B'], ['A', 'C'], ['B', 'C']])]
    expect(computeStandings(FOUR, all)).toEqual(computeStandings(FOUR, TOP3))
  })
})
```

頂部 import 加 `applyRankTiebreaks`。

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/engine/tiebreak.test.ts`
Expected: FAIL，`applyRankTiebreaks is not a function`

- [ ] **Step 3: 實作**

`src/engine/pools.ts`，喺 `rankTieStates` 後面加：

```ts
/**
 * 用加賽結果重排排名表入面並列嗰幾段，順手解開 rank／tied。
 * 拆唔掂嗰段原封不動 —— 照顯示並列。
 *
 * 純 function，唔會改到入面嗰啲 row：出嚟嘅係新 object，
 * 因為 caller 好可能仲要攞原本嗰張表做第二件事（例如搵並列）。
 *
 * 單循環攞佢去顯示（張表本身就係最終結果）；大循環攞佢去決定種子
 * （張表照顯示並列，但邊個入籤表要跟加賽）。
 */
export function applyRankTiebreaks(rows: StandingRow[], states: TieState[]): StandingRow[] {
  const out = [...rows]

  for (const s of states) {
    if (!s.resolved) continue
    // 同名次嘅人喺排序之後一定連住，所以搵到第一個就搵到成段。
    const start = out.findIndex((r) => s.ids.includes(r.playerId))
    if (start === -1) continue
    const byId = new Map(out.map((r) => [r.playerId, r]))
    s.results.forEach((r, i) => {
      const row = byId.get(r.id)
      if (row !== undefined) out[start + i] = row
    })
  }

  const resolvedIds = new Set(states.filter((s) => s.resolved).flatMap((s) => s.ids))

  // 重排完要重新畀名次。`row.rank` 仲係原本嗰個（上面冇改過），
  // 所以「原本同名次」就係「本來並列」。
  const sep: boolean[] = out.map((row, i) => {
    if (i === 0) return true
    if (out[i - 1]!.rank !== row.rank) return true
    return resolvedIds.has(row.playerId)
  })

  const final: StandingRow[] = []
  for (let i = 0; i < out.length; i++) {
    const row = out[i]!
    final.push({
      ...row,
      rank: sep[i] ? i + 1 : final[i - 1]!.rank,
      tied: !sep[i] || (i + 1 < out.length && !sep[i + 1]),
    })
  }
  return final
}
```

- [ ] **Step 4: 行測試，確認全綠**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/pools.ts src/engine/tiebreak.test.ts
git commit -m "applyRankTiebreaks：加賽次序套返落排名表，拆掂咗嘅段解開並列"
```

---

### Task 4: `tournament.ts` 做 mode-aware 嗰層

**Files:**
- Modify: `src/engine/tournament.ts:130-142`（`cutSeeds`）、`:165-177`（`poolTies` / `addTiebreak`）
- Modify: `src/ui/Table.tsx:46`、`src/ui/Board.tsx:45`、`src/ui/Bracket.tsx:27`（改名）
- Test: `src/engine/tournament.test.ts`

**Interfaces:**
- Consumes: Task 1 嘅 `nextTiebreakFor`、Task 2 嘅 `rankTieStates`、Task 3 嘅 `applyRankTiebreaks`
- Produces:
  - `standingsTies(t: Tournament): TieState[]`（`poolTies` 改名兼擴充）
  - `addTiebreak(t: Tournament): Match[]`（簽名不變，行為擴到三個模式）

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/engine/tournament.test.ts` 最尾加。用返檔入面現成嘅 `tournament(mode, n, cutSize, ...)` fixture、`rng` 同 `playThrough(matches, pickWinner)`（逐場打，每場 4 個轉贏，贏家由 callback 決定）。

循環階段嘅場次 id 係雙方 id 排序後駁埋（`p1__p2`），所以用個 map 就指定到邊場邊個贏。

```ts
describe('三個模式都搵到並列', () => {
  /** 幫全部未打嘅加賽場次入分，贏家由 id 查表。 */
  function playTb(t: Tournament, winners: Record<string, string>): Tournament {
    return {
      ...t,
      matches: t.matches.map((m) =>
        m.stage === 'tiebreak' && m.rounds.length === 0 && winners[m.id] !== undefined
          ? {
              ...m,
              rounds: Array.from({ length: 4 }, () => ({
                winnerId: winners[m.id]!,
                finish: 'spin' as const,
              })),
            }
          : m,
      ),
    }
  }

  /** 打完循環，贏家由 id 查表。 */
  function playGroup(mode: TournamentMode, cutSize: number | null, winners: Record<string, string>) {
    const base = tournament(mode, 4, cutSize)
    const started = startTournament(base, rng)
    return {
      ...base,
      players: started.players,
      matches: playThrough(started.matches, (m) => winners[m.id]!),
    }
  }

  /**
   * p1 贏 p2、p1 贏 p3、p4 贏 p1、p2 贏 p3、p2 贏 p4、p3 贏 p4。
   * → p1／p2 都係 2 勝 1 負、8 分、失 4 分；p3／p4 都係 1 勝 2 負、4 分、失 8 分。
   *   即係兩段並列：第 1 位兩個、第 3 位兩個。
   */
  const TWO_TIES: Record<string, string> = {
    p1__p2: 'p1',
    p1__p3: 'p1',
    p1__p4: 'p4',
    p2__p3: 'p2',
    p2__p4: 'p2',
    p3__p4: 'p3',
  }

  it('純淘汰冇排名表，一律返吉', () => {
    expect(standingsTies(tournament('knockout', 4))).toEqual([])
  })

  it('單循環未打完唔出聲', () => {
    expect(standingsTies(tournament('roundRobin', 4))).toEqual([])
  })

  it('大循環未揀入籤人數就返吉', () => {
    expect(standingsTies(tournament('groupThenKnockout', 4, null))).toEqual([])
  })

  it('單循環：兩段並列都搵到，冇出線線', () => {
    const states = standingsTies(playGroup('roundRobin', null, TWO_TIES))
    expect(states.map((s) => s.key)).toEqual([1, 3])
    expect(states.every((s) => s.kind === 'rank')).toBe(true)
    expect(states.every((s) => s.slots === null)).toBe(true)
    expect(states.every((s) => !s.resolved)).toBe(true)
  })

  it('單循環：排到加賽 → 打完就拆掂 → 唔會再排', () => {
    const t = playGroup('roundRobin', null, TWO_TIES)
    const before = t.matches.length

    const withTb = { ...t, matches: addTiebreak(t) }
    expect(withTb.matches).toHaveLength(before + 2) // 兩段各兩個人 = 各 1 場
    expect(standingsTies(withTb).every((s) => !s.resolved)).toBe(true)

    const done = playTb(withTb, { tb1r1m1: 'p1', tb3r1m1: 'p3' })
    expect(standingsTies(done).every((s) => s.resolved)).toBe(true)
    expect(addTiebreak(done)).toEqual(done.matches) // 冇嘢要再排
  })
})

describe('大循環出線線並列', () => {
  /**
   * p1 贏晒 3 場；p2／p3／p4 打成回圈。
   * → p1 第 1，p2／p3／p4 三個並列第 2。頭 2 名入籤表 = 三個爭最後一個位。
   */
  const CUT_TIE: Record<string, string> = {
    p1__p2: 'p1',
    p1__p3: 'p1',
    p1__p4: 'p1',
    p2__p3: 'p2',
    p3__p4: 'p3',
    p2__p4: 'p4',
  }

  function atTheCut(): Tournament {
    const base = tournament('groupThenKnockout', 4, 2)
    const started = startTournament(base, rng)
    return {
      ...base,
      players: started.players,
      matches: playThrough(started.matches, (m) => CUT_TIE[m.id]!),
    }
  }

  it('三個爭最後一個入籤表位 → 砌唔到籤表', () => {
    const t = atTheCut()
    const [s] = standingsTies(t)
    expect(s!.kind).toBe('rank')
    expect(s!.key).toBe(2)
    expect(s!.slots).toBe(1)
    expect(s!.ids).toHaveLength(3)
    // 呢度本來乜 check 都冇，會靜靜雞按個名攞頭 2 個。
    expect(buildCut(t)).toEqual(t.matches)
  })

  it('打完加賽就砌到，而且種子跟加賽次序唔係跟個名', () => {
    const t = atTheCut()
    const withTb = { ...t, matches: addTiebreak(t) }
    // 三個人 = 3 場：m1 = p2 對 p3、m2 = p2 對 p4、m3 = p3 對 p4。
    // p4 贏晒兩場做加賽第一 —— 佢個名排最後，所以拎到佢就證明唔係靠個名。
    const done = playTb2(withTb, { tb2r1m1: 'p2', tb2r1m2: 'p4', tb2r1m3: 'p4' })
    expect(standingsTies(done)[0]!.resolved).toBe(true)

    const bracket = bracketMatches(buildCut(done))
    expect(bracket.length).toBeGreaterThan(0)
    const inBracket = new Set(
      bracket.flatMap((m) => [m.aId, m.bId]).filter((x): x is string => x !== null),
    )
    expect(inBracket).toEqual(new Set(['p1', 'p4']))
  })

  /** 同上面個 describe 嗰個一樣 —— 兩個 describe 各自要用，抽去檔案 scope。 */
  function playTb2(t: Tournament, winners: Record<string, string>): Tournament {
    return {
      ...t,
      matches: t.matches.map((m) =>
        m.stage === 'tiebreak' && m.rounds.length === 0 && winners[m.id] !== undefined
          ? {
              ...m,
              rounds: Array.from({ length: 4 }, () => ({
                winnerId: winners[m.id]!,
                finish: 'spin' as const,
              })),
            }
          : m,
      ),
    }
  }
})
```

**寫嘅時候記住**：`playTb` 同 `playTb2` 係同一段 code，唔好留兩份 —— 兩個 describe 之前抽一個 `playTiebreaks(t, winners)` 出去檔案 scope，兩邊都叫佢。

`src/engine/tournament.test.ts` 頂部 import 加 `addTiebreak`、`standingsTies`（由 `./tournament`）。`bracketMatches`、`startTournament`、`buildCut`、`Tournament`、`TournamentMode` 已經 import 咗。

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/engine/tournament.test.ts`
Expected: FAIL，`standingsTies` import 唔到

- [ ] **Step 3: 換 `poolTies` 做 `standingsTies`**

`src/engine/tournament.ts`，`poolTies`（line 160-169）成個換走：

```ts
/**
 * 邊幾段並列要拆。介面唔使識分模式。
 *
 * 單循環：任何一段並列都要拆，冇出線線 —— 張表本身就係最終結果。
 * 大循環：淨係出線線嗰段。
 * 小組賽：逐組出線線。
 * 純淘汰：冇排名表，返吉。
 */
export function standingsTies(t: Tournament): TieState[] {
  switch (t.mode) {
    case 'knockout':
      return []
    case 'roundRobin':
      return rankTieStates(t.players, t.matches, t.headToHead, null)
    case 'groupThenKnockout':
      return t.cutSize === null
        ? []
        : rankTieStates(t.players, t.matches, t.headToHead, t.cutSize)
    case 'poolsThenKnockout':
      if (t.poolCount === null || t.advancePerPool === null) return []
      return tieStates(t.players, t.matches, t.poolCount, t.advancePerPool, t.headToHead)
  }
}

/** 排下一次加賽，返返成個新場次表。冇嘢要排就原封不動。 */
export function addTiebreak(t: Tournament): Match[] {
  const more = nextTiebreakFor(standingsTies(t))
  return more.length === 0 ? t.matches : [...t.matches, ...more]
}
```

`src/engine/tournament.ts` 頂部 import 由 `./pools` 加 `applyRankTiebreaks`、`nextTiebreakFor`、`rankTieStates`，剷走 `nextTiebreak`（唔再直接用）。

- [ ] **Step 4: `cutSeeds` 大循環加 gate**

`src/engine/tournament.ts`，`cutSeeds`（line 130-142）成個換走：

```ts
function cutSeeds(t: Tournament): string[] {
  if (t.mode === 'poolsThenKnockout') {
    if (t.poolCount === null || t.advancePerPool === null) return []
    // 有組拆唔掂就唔准砌 —— 唔擋嘅話會靜靜雞照排序攞頭幾個，
    // 而排序最後 fallback 係個名，即係「邊個出線」變成睇個名點串。
    if (tiesPending(t.players, t.matches, t.poolCount, t.advancePerPool, t.headToHead)) return []
    return poolSeedOrder(t.players, t.matches, t.poolCount, t.advancePerPool, t.headToHead)
  }

  if (t.cutSize === null) return []

  // 大循環一樣要擋。呢度本來乜 check 都冇 —— 第 4、5 名並列而頭 4 名入籤表，
  // 就靜靜雞按個名攞頭 4 個。
  const ties = rankTieStates(t.players, t.matches, t.headToHead, t.cutSize)
  if (ties.some((s) => !s.resolved)) return []

  const rows = computeStandings(t.players, groupMatches(t.matches), t.headToHead)
  return applyRankTiebreaks(rows, ties)
    .slice(0, t.cutSize)
    .map((r) => r.playerId)
}
```

- [ ] **Step 5: 三個 UI caller 改名**

`src/ui/Table.tsx:46`、`src/ui/Board.tsx:45`：
```tsx
  const ties = standingsTies(tournament)
```
`src/ui/Bracket.tsx:27`：
```tsx
  const ties = standingsTies(tournament).filter((s) => !s.resolved)
```
三個檔嘅 import 都由 `poolTies` 改做 `standingsTies`。

- [ ] **Step 6: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/engine/tournament.ts src/engine/tournament.test.ts src/ui/Table.tsx src/ui/Board.tsx src/ui/Bracket.tsx
git commit -m "三個模式都搵得到並列；大循環出線線唔再靜靜雞用個名決定"
```

---

### Task 5: 加賽表同籤表頁支援「爭第 N 位」

**Files:**
- Modify: `src/ui/components/TiebreakResult.tsx`
- Modify: `src/ui/Bracket.tsx:255-300`（`TieBreakers`）

**Interfaces:**
- Consumes: Task 1 嘅 `TieState.kind` / `TieState.slots: number | null`
- Produces: 冇新 API

- [ ] **Step 1: `TiebreakResult` 標題同文案按 kind 變**

`src/ui/components/TiebreakResult.tsx`：

`heading` 嗰行（line 29 附近）換成：

```tsx
  const attemptTag = tie.attempt > 1 ? `（第 ${tie.attempt} 次）` : ''
  const heading =
    tie.kind === 'pool'
      ? `${poolLabel(tie.key)} 組加賽${attemptTag}`
      : `爭第 ${tie.key} 位嘅加賽${attemptTag}`

  // 冇出線線（單循環）就唔係「爭幾多個位」，係要成班排晒先後。
  const goal =
    tie.slots === null
      ? `${tie.ids.length} 個人要排晒先後`
      : `${tie.ids.length} 個人爭 ${tie.slots} 個位`
```

`<h3>` 嗰段換成：

```tsx
      <h3 className="u-eyebrow">
        {heading} · {goal}
      </h3>
```

`<caption>` 換成：

```tsx
            <caption className="sr-only">
              加賽成績。先比勝場，再比分差，最後極限勝出次數。
              {tie.slots === null ? '要排晒先後。' : `頭 ${tie.slots} 個出線。`}
            </caption>
```

「出線」章嗰個 `through` 判斷（line 60 附近）—— 冇出線線嘅時候唔應該掛章：

```tsx
                const through = tie.resolved && tie.slots !== null && i < tie.slots
```

出線線嘅 `data-cut` 一樣：

```tsx
                  <tr key={r.id} data-cut={i + 1 === tie.slots ? true : undefined}>
```
（`tie.slots` 係 null 嘅時候 `i + 1 === null` 永遠假，所以呢行唔使改。）

底下兩句解釋文字換成：

```tsx
      ) : tie.resolved ? (
        <p className="note">
          <span>·</span>
          <span>
            先比加賽勝場，打和就比分差，再打和就比極限勝出次數。
            {tie.slots === null
              ? '而家排晒先後喇。'
              : `線上面 ${tie.slots} 個出線，線下面冇份。`}
          </span>
        </p>
      ) : (
        <p className="note note--bad">
          <span>⚠</span>
          <span>加賽勝場、分差、極限次數全部一樣，仲係分唔開 —— 要再打多一次。</span>
        </p>
      )}
```

- [ ] **Step 2: `TieBreakers` 支援冇分組嘅模式**

`src/ui/Bracket.tsx` 嘅 `TieBreakers`。而家佢由 `tables`（`poolStandings`）攞 rows，大循環根本冇 pools，所以會攞到吉陣列、張表出「仲未有選手」。

`const tables = poolStandings(...)` 嗰段後面加：

```tsx
  // 大循環冇分組，並列嗰班人要由總排名表度搵。
  const overall = computeStandings(
    tournament.players,
    tournament.matches,
    tournament.headToHead,
  )
  const rowsFor = (s: TieState) =>
    s.kind === 'pool' ? (tables.find((t) => t.pool === s.key)?.rows ?? []) : overall
```

`ties.map` 入面嗰兩行換成：

```tsx
        const tiedRows = rowsFor(s).filter((r) => s.ids.includes(r.playerId))
```

`<span className="u-eyebrow">{poolLabel(s.key)} 組分唔開</span>` 換成：

```tsx
                <span className="u-eyebrow">
                  {s.kind === 'pool' ? `${poolLabel(s.key)} 組分唔開` : `第 ${s.key} 位分唔開`}
                </span>
```

`{s.ids.length} 個人爭 {s.slots} 個位` 換成：

```tsx
                <div className="verdict__who">
                  {s.slots === null
                    ? `${s.ids.length} 個人要排晒先後`
                    : `${s.ids.length} 個人爭 ${s.slots} 個位`}
                </div>
```

另外原本嗰句「勝場、得分、失分、分差四樣都一樣」已經過時（排名鏈已經改咗），順手改返：

```tsx
                <span className="u-eyebrow">
                  {s.attempt === 0
                    ? '勝場、得分、分差、極限次數四樣都一樣，要打加賽先分到'
                    : s.played
                      ? `第 ${s.attempt} 次加賽又分唔開`
                      : `第 ${s.attempt} 次加賽打緊`}
                </span>
```

`src/ui/Bracket.tsx` 頂部 import 要加 `computeStandings`（由 `../engine/standings`）同 `TieState` type（由 `../engine/pools`，如果未 import）。

- [ ] **Step 3: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 4: 人手行一次（大循環）**

Run: `npm run dev`

1. 開一場「大循環 + 淘汰」，4 個人，頭 2 名入籤表
2. 打到第 2、3 名並列（例如三個人打成回圈、全部贏第 4 個）
3. 去籤表頁 → 應該見到「第 N 位分唔開」，而唔係「A 組分唔開」，而且**砌唔到籤表**
4. 撳「排加賽」→ 加賽場次出現，入分版打得
5. 打完加賽 → 籤表砌得，種子跟加賽次序

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/TiebreakResult.tsx src/ui/Bracket.tsx
git commit -m "加賽表同籤表頁出返「爭第 N 位」，唔再淨係識講「A 組」"
```

---

### Task 6: 單循環排名頁同電視版

**Files:**
- Modify: `src/ui/Table.tsx`
- Modify: `src/ui/Board.tsx`

**Interfaces:**
- Consumes: Task 3 嘅 `applyRankTiebreaks`、Task 4 嘅 `standingsTies` / `addTiebreak`
- Produces: 冇新 API

- [ ] **Step 1: `Table.tsx` 套用加賽次序**

`src/ui/Table.tsx`：

第 13 行嘅 `const { tournament } = useTournament(id)` 改成 `const { tournament, update } = useTournament(id)`。

`const rows = computeStandings(...)` 嗰行（line 16）換成：

```tsx
  const ties = standingsTies(tournament)
  const rawRows = computeStandings(tournament.players, tournament.matches, tournament.headToHead)
  /*
    單循環張表本身就係最終結果，所以打完加賽要重排、解開並列 ——
    唔重排嘅話你打完加賽返嚟睇，兩個人仲係並列第 1，等於冇打過。

    另外兩個模式張表係階段記錄，加賽淨係決定邊個出線，所以照顯示並列。
  */
  const rows = tournament.mode === 'roundRobin' ? applyRankTiebreaks(rawRows, ties) : rawRows
```

原本 line 46 嗰個 `const ties = poolTies(tournament)` 剷走（已經搬咗上去）。

`roundRobinChamp` 嗰段唔使改 —— 佢讀 `rows.find((r) => r.rank === 1)`，而 `rows` 已經係套用完嘅。

- [ ] **Step 2: 冠軍嗰句提示跟住狀態變**

`src/ui/Table.tsx`，`{roundRobinChamp.tied && (...)}` 成段（line 92-97 附近）換成：

```tsx
            {roundRobinChamp.tied &&
              (() => {
                const tie = ties.find((s) => s.ids.includes(roundRobinChamp.playerId))
                if (tie === undefined) return null
                if (tie.attempt === 0) {
                  return (
                    <p className="note">
                      <span>·</span>
                      <span>第一位有人並列，四條規則都分唔開。打加賽先分到邊個係冠軍。</span>
                    </p>
                  )
                }
                return (
                  <p className="note">
                    <span>·</span>
                    <span>
                      {tie.played
                        ? `第 ${tie.attempt} 次加賽又分唔開，要再打多一次。`
                        : `第 ${tie.attempt} 次加賽打緊，打完先知邊個係冠軍。`}
                    </span>
                  </p>
                )
              })()}
```

- [ ] **Step 3: 加賽區（排加賽掣 + 結果表）**

`src/ui/Table.tsx`，`{pools === null ? (<Standings rows={rows} />) : (...)}` 嗰段，把 `pools === null` 嗰邊換成：

```tsx
        {pools === null ? (
          <>
            <Standings rows={rows} />
            {ties.length > 0 && (
              <div className="stack">
                {ties.some((s) => !s.resolved) && !ties.some((s) => s.attempt > 0 && !s.played) && (
                  <button
                    className="btn btn--primary chamfer"
                    onClick={() => update((t) => ({ ...t, matches: addTiebreak(t) }))}
                  >
                    排加賽
                  </button>
                )}
                {ties
                  .filter((s) => s.matches.length > 0)
                  .map((s) => (
                    <TiebreakResult
                      key={s.key}
                      tie={s}
                      players={tournament.players}
                      matchHref={(mid) => `#/t/${id}/m/${mid}`}
                    />
                  ))}
              </div>
            )}
          </>
        ) : (
```

**點解粒掣有兩個條件**：有段拆唔掂（`!s.resolved`）先要排；但如果有段已經排咗而未打完（`attempt > 0 && !played`），就唔好再彈粒掣出嚟叫人再排 —— 同 `Bracket.tsx` 嗰個 `waiting` 一樣嘅道理。

`src/ui/Table.tsx` 頂部 import：由 `../engine/pools` 加 `applyRankTiebreaks`，由 `../engine/tournament` 加 `addTiebreak`（`standingsTies` Task 4 已經改咗）。

- [ ] **Step 4: `Board.tsx` 電視版（唔俾撳）**

`src/ui/Board.tsx`：

`const rows = computeStandings(...)`（line 31）換成同 Table 一樣嘅三行（`ties` / `rawRows` / `rows`），原本 line 45 嗰個 `const ties = standingsTies(tournament)` 剷走。

`pools === null` 嗰邊嘅 `<Standings rows={rows} compact />` 後面加加賽結果表（冇粒掣 —— 電視版撳唔到嘢）：

```tsx
            <Standings rows={rows} compact />
            {ties
              .filter((s) => s.matches.length > 0)
              .map((s) => (
                <TiebreakResult key={s.key} tie={s} players={tournament.players} />
              ))}
```

`src/ui/Board.tsx` 頂部 import 由 `../engine/pools` 加 `applyRankTiebreaks`。

- [ ] **Step 5: 行測試同 build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 6: 人手行一次（單循環）**

Run: `npm run dev`

1. 開一場單循環，4 個人
2. 打到頭兩個並列第 1（例如 A、B 各贏 C 同 D、A 同 B 之間⋯⋯4 個人循環一定會打，所以要靠得分／分差／極限整到一樣）
3. 排名頁：見到並列第 1、冠軍欄寫住「打加賽先分到」、有粒「排加賽」
4. 撳「排加賽」→ 加賽場次出現；粒掣消失（打緊）
5. 入分版打完加賽 → 排名表**重排咗**、並列解開、冠軍出返個真名、下面有加賽結果表
6. 「電視」tab：同樣重排咗，有加賽表，冇粒掣
7. 加賽又打成分唔開 → 粒掣返嚟，撳到排第 2 輪

- [ ] **Step 7: Commit**

```bash
git add src/ui/Table.tsx src/ui/Board.tsx
git commit -m "單循環排名頁同電視版：排得到加賽，打完重排解開並列"
```

---

## 收尾檢查

- [ ] `npm test && npm run build` 全綠
- [ ] 單循環：兩個人並列 → 排加賽 → 打完 → 冠軍出真名
- [ ] 單循環：加賽又分唔開 → 排第 2 輪 → 第 3 輪，一路排得落去
- [ ] 單循環：兩段並列（頭兩個 + 尾兩個）→ 兩批加賽同時出，各自獨立拆
- [ ] 大循環：出線線並列 → 砌唔到籤表 → 打完加賽 → 種子跟加賽次序
- [ ] 小組賽：全部現有行為一分唔變（排加賽、加賽表、砌籤表）
- [ ] 純淘汰：冇排名表，冇加賽區，一切照舊
- [ ] 匯出一份有加賽場次嘅賽事、清 localStorage、再匯入 → 加賽場次同狀態保持住
