# 排名改制 + 極限勝出次數 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 排名鏈改成「勝場 → 得分 → 分差 → 極限勝出次數」，對賽成績退到最尾變成可開可閂嘅選項，極限勝出次數喺排名表、加賽表、入分版三個地方睇得到。

**Architecture:** 排名邏輯全部集中喺 `engine/standings.ts` 一個純 function；極限次數嘅數法集中喺 `engine/rules.ts` 兩個 helper，三個顯示位各自餵唔同批場次入去，但數法只寫一次。對賽成績用「小循環」實作 —— 淨係攞並列嗰班人之間打完咗嘅場次重計，兩個人嘅時候自動退化成「邊個贏過邊個」，所以唔使為兩人／三人寫兩條 code path。選項 `headToHead` 存喺 `Tournament` 上面，由 UI 一路傳落 engine，engine 唔會自己去攞 tournament。

**Tech Stack:** TypeScript（strict）、React 19、Vite、Vitest。冇後端，資料存 localStorage。

## Global Constraints

- 全部介面文字、註釋、commit message 一律用**廣東話口語**，唔用書面語。
- 排名嘅硬規矩：**未打完嘅場次一分都唔計**。`wins` / `pointsFor` / `diff` / `xtremeWins` 全部只計 `matchWinnerId(m) !== null` 嘅場次。唯一例外係入分版嗰個淡色 `+N`，佢叫嘅係 `xtremeInMatch` 唔係 `xtremeWins`。
- 極限次數只數**計入分數嗰啲 round**（同 `matchScore` 同一條界線，行 `scoredRounds`）。唔可以喺兩處各寫一次條界線。
- `headToHead` default 係 `false`。舊檔／舊備份冇呢個 field 一律當 `false`。
- 排序最後一層 fallback 一律係 `x.name.localeCompare(y.name, 'zh-HK')`，但**個名唔算「分得開」** —— 只影響顯示次序，唔影響 `rank` / `tied`。
- 每個 task 做完 `npm test` 同 `npm run typecheck` 都要綠先可以 commit。
- 唔好動淘汰賽（`bracket` stage）嘅任何邏輯。

## File Structure

| 檔案 | 責任 |
|---|---|
| `src/engine/rules.ts` | 一場之內嘅嘢：分數、贏家、極限次數。**新增** `scoredRounds` / `xtremeInMatch` / `xtremeWins` |
| `src/engine/standings.ts` | 排名鏈同小循環。**唯一**一個知道「點排名次」嘅地方 |
| `src/engine/types.ts` | `StandingRow.xtremeWins`、`Tournament.headToHead` |
| `src/engine/pools.ts` | 分組、交叉種子、加賽。傳 `headToHead` 落 `computeStandings`；加賽鏈加極限 |
| `src/engine/tournament.ts` | 賽事層 facade，由 `Tournament` 攞 `headToHead` 餵落 engine |
| `src/storage/storage.ts` | 讀寫同驗證 `headToHead` |
| `src/ui/components/Standings.tsx` | 排名表「⚡」欄 |
| `src/ui/components/TiebreakResult.tsx` | 加賽表「⚡」欄 |
| `src/ui/Setup.tsx` | 「同分點拆」開關 |
| `src/ui/Console.tsx` | 入分版名下面嘅 `⚡ 2 +1`、`.rlog` 極限標實 |
| `src/ui/styles/app.css` | `.rlog__item--x`、`.side__xt` |

---

### Task 1: 極限次數嘅數法（`rules.ts`）

**Files:**
- Modify: `src/engine/rules.ts:40-63`（`matchScore` 上面加 `scoredRounds`，下面加兩個數極限嘅 function）
- Test: `src/engine/rules.test.ts`

**Interfaces:**
- Consumes: 現有嘅 `FINISH_POINTS`、`MATCH_TARGET`、`isReady`、`matchWinnerId`
- Produces:
  - `scoredRounds(match: Match): RoundResult[]`
  - `xtremeInMatch(match: Match, playerId: string): number`
  - `xtremeWins(matches: Match[], playerId: string): number`

- [ ] **Step 1: 寫住會 fail 嘅測試**

喺 `src/engine/rules.test.ts` 最尾加：

```ts
describe('極限勝出次數', () => {
  it('數自己以極限贏嗰啲 round', () => {
    const m = match([
      { w: 'a', f: 'xtreme' }, // a 3
      { w: 'b', f: 'spin' }, // b 1
      { w: 'a', f: 'spin' }, // a 4，打完
    ])
    expect(xtremeInMatch(m, 'p1')).toBe(1)
    expect(xtremeInMatch(m, 'p2')).toBe(0)
  })

  it('輸咗嗰場入面自己贏嘅極限照數', () => {
    const m = match([
      { w: 'b', f: 'xtreme' }, // b 3
      { w: 'a', f: 'xtreme' }, // a 3
      { w: 'b', f: 'spin' }, // b 4，b 贏
    ])
    expect(xtremeInMatch(m, 'p1')).toBe(1)
    expect(xtremeInMatch(m, 'p2')).toBe(1)
  })

  it('夠 4 分之後嗰啲 round 唔數，同 matchScore 同一條界線', () => {
    const m = match([
      { w: 'a', f: 'xtreme' }, // a 3
      { w: 'a', f: 'xtreme' }, // a 6，打完
      { w: 'a', f: 'xtreme' }, // 呢個唔應該存在，唔數
      { w: 'b', f: 'xtreme' }, // 同上
    ])
    expect(matchScore(m)).toEqual({ a: 6, b: 0 })
    expect(scoredRounds(m)).toHaveLength(2)
    expect(xtremeInMatch(m, 'p1')).toBe(2)
    expect(xtremeInMatch(m, 'p2')).toBe(0)
  })

  it('對手未定嘅場次乜都數唔到', () => {
    const m = { ...match([{ w: 'a', f: 'xtreme' }]), bId: null }
    expect(scoredRounds(m)).toEqual([])
    expect(xtremeInMatch(m, 'p1')).toBe(0)
  })

  it('xtremeWins 加埋多場，但未打完嘅場唔計', () => {
    const done = match([
      { w: 'a', f: 'xtreme' },
      { w: 'a', f: 'spin' }, // a 4，打完
    ])
    const live = match([{ w: 'a', f: 'xtreme' }]) // a 3，未夠 4

    expect(xtremeWins([done], 'p1')).toBe(1)
    expect(xtremeWins([live], 'p1')).toBe(0)
    expect(xtremeWins([done, live], 'p1')).toBe(1)
    // 打緊嗰場要靠 xtremeInMatch 先數到 —— 入分版嗰個 +N 就係咁嚟。
    expect(xtremeInMatch(live, 'p1')).toBe(1)
  })

  it('冇場次就係 0', () => {
    expect(xtremeWins([], 'p1')).toBe(0)
  })
})
```

同時喺 `src/engine/rules.test.ts` 頂嗰個 import 加 `scoredRounds`、`xtremeInMatch`、`xtremeWins`：

```ts
import {
  FINISH_POINTS,
  MATCH_TARGET,
  matchKey,
  matchScore,
  matchStatus,
  matchWinnerId,
  pointsToWin,
  scoredRounds,
  xtremeInMatch,
  xtremeWins,
} from './rules'
```

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/engine/rules.test.ts`
Expected: FAIL，`scoredRounds is not a function` 之類（或者 TS 報 import 唔存在）

- [ ] **Step 3: 實作**

喺 `src/engine/rules.ts`，將現有 `matchScore`（line 52-63）**整個換走**，變成：

```ts
/**
 * 真係計入分數嗰啲 round。
 *
 * 一到 4 分就停 —— 手改過嘅檔可能多咗 round，唔可以當佢哋存在。
 * 分數同極限次數兩樣嘢都要跟同一條界線，所以喺呢度出一次，
 * 唔好喺兩處各自寫多次：寫兩次就一定有一日會出現
 * 「總分冇變但極限次數升咗」。
 */
export function scoredRounds(match: Match): RoundResult[] {
  if (!isReady(match)) return []
  const out: RoundResult[] = []
  let a = 0
  let b = 0
  for (const r of match.rounds) {
    if (a >= MATCH_TARGET || b >= MATCH_TARGET) break
    if (r.winnerId === match.aId) a += FINISH_POINTS[r.finish]
    else if (r.winnerId === match.bId) b += FINISH_POINTS[r.finish]
    out.push(r)
  }
  return out
}

export function matchScore(match: Match): MatchScore {
  let a = 0
  let b = 0
  for (const r of scoredRounds(match)) {
    const pts = FINISH_POINTS[r.finish]
    if (r.winnerId === match.aId) a += pts
    else if (r.winnerId === match.bId) b += pts
  }
  return { a, b }
}

/** 一場入面某人以極限贏咗幾多個 round。打緊嘅場都數得到。 */
export function xtremeInMatch(match: Match, playerId: string): number {
  return scoredRounds(match).filter((r) => r.winnerId === playerId && r.finish === 'xtreme').length
}

/**
 * 多場加埋。**未打完嘅場唔計** —— 同排名表其他數（勝場、得分、分差）同一條界線，
 * 唔係排名會打到一半跳嚟跳去。
 *
 * 餵咩場次就數咩場次：排名表餵小組場、加賽表餵嗰次加賽嘅場。
 */
export function xtremeWins(matches: Match[], playerId: string): number {
  return matches.reduce(
    (n, m) => n + (matchWinnerId(m) === null ? 0 : xtremeInMatch(m, playerId)),
    0,
  )
}
```

同時將檔案第 1 行嘅 import 加 `RoundResult`：

```ts
import type { FinishType, Match, MatchStatus, RoundResult } from './types'
```

註：`matchWinnerId` 定義喺 `scoredRounds` 下面，但 function declaration 有 hoisting，`xtremeWins` 叫得到。

- [ ] **Step 4: 行測試，確認全部綠**

Run: `npm test && npm run typecheck`
Expected: PASS。`rules.test.ts` 原有嗰批測試（`matchScore` 相關）一定要照樣過 —— 佢哋就係 `scoredRounds` 冇改到行為嘅證據。

- [ ] **Step 5: Commit**

```bash
git add src/engine/rules.ts src/engine/rules.test.ts
git commit -m "數極限勝出次數：抽 scoredRounds，分數同極限次數共用同一條界線"
```

---

### Task 2: 新排名鏈 + 小循環（`standings.ts`）

**Files:**
- Modify: `src/engine/types.ts:83-100`（`StandingRow` 加 `xtremeWins`）
- Modify: `src/engine/standings.ts`（整個排名部分重寫）
- Test: `src/engine/standings.test.ts`

**Interfaces:**
- Consumes: Task 1 嘅 `xtremeInMatch`；現有 `matchScore` / `matchWinnerId`
- Produces:
  - `StandingRow.xtremeWins: number`
  - `computeStandings(players: Player[], matches: Match[], headToHead?: boolean): StandingRow[]` —— 第三個參數 default `false`，所以未改嘅 caller 照 compile

- [ ] **Step 1: 改 type**

`src/engine/types.ts`，`StandingRow` 入面 `diff` 下面加：

```ts
  /** 得失分差。 */
  diff: number
  /** 極限勝出次數。同分嗰陣用嚟拆並列。 */
  xtremeWins: number
```

- [ ] **Step 2: 改寫現有測試 + 寫新測試**

`src/engine/standings.test.ts`：

**(a)** 頂部 import 加 `FinishType`、`RoundResult` 同新 helper：

```ts
import { describe, expect, it } from 'vitest'
import { completedCount, computeStandings, isTournamentComplete } from './standings'
import { matchKey } from './rules'
import type { FinishType, Match, Player, RoundResult } from './types'
```

**(b)** 喺現有 `inProgress`（line 35-49）下面加一個可以砌精準 round 嘅 helper：

```ts
/**
 * 逐 round 砌一場，測極限次數同精準分數嗰陣用。
 * `['a:xtreme', 'b:spin', 'a:spin']` = a 極限、b 轉贏、a 轉贏。
 */
function rounds(aId: string, bId: string, spec: string[]): Match {
  const rs: RoundResult[] = spec.map((s) => {
    const [side, finish] = s.split(':')
    return { winnerId: side === 'a' ? aId : bId, finish: finish as FinishType }
  })
  return {
    id: matchKey(aId, bId),
    stage: 'group',
    round: 1,
    order: 1,
    aId,
    bId,
    aFrom: null,
    bFrom: null,
    rounds: rs,
  }
}
```

**(c)** 將現有嘅 `it('第 2 條：啱啱兩個人同勝場，對賽成績蓋過總得分', ...)`（line 67-90）**整個換走**。新排名鏈之下得分行先，所以呢個 case 嘅結論啱啱相反：

```ts
  it('第 2 條：同勝場就比總得分，對賽成績唔再蓋過佢', () => {
    // p1 同 p2 都係 2 勝 1 負，p1 贏咗 p2，但 p2 總得分高過 p1。
    // 舊規則 p1 排前（贏過你）；新規則 p2 排前（打得靚啲）。
    const ms = [
      played('p1', 'p2', 'p1', 3),
      played('p1', 'p3', 'p1', 3),
      played('p4', 'p1', 'p4', 0),
      played('p2', 'p3', 'p2', 0),
      played('p2', 'p4', 'p2', 0),
      played('p3', 'p4', 'p3', 0),
    ]

    const rows = computeStandings(players(4), ms)
    const p1 = rows.find((r) => r.playerId === 'p1')!
    const p2 = rows.find((r) => r.playerId === 'p2')!
    expect(p1.wins).toBe(2)
    expect(p2.wins).toBe(2)
    expect(p2.pointsFor).toBeGreaterThan(p1.pointsFor)
    expect(order(rows).slice(0, 2)).toEqual(['p2', 'p1'])

    // 開咗選項都一樣 —— 得分已經分到高低，根本輪唔到對賽成績。
    expect(order(computeStandings(players(4), ms, true)).slice(0, 2)).toEqual(['p2', 'p1'])
  })
```

**(d)** 現有 `it('第 4 條：同勝場、同總得分、又未打過對方，就比得失分差', ...)` 個名改做 `第 3 條`，內容唔使改。

**(e)** 喺 `describe('排名規則')` 入面，`第 5 條` 嗰個測試上面，加極限次數嘅測試：

```ts
  it('第 4 條：勝場、得分、分差都一樣，就比極限勝出次數', () => {
    // p1 同 p2 都係贏一場 4-1、輸一場 1-4，但 p1 靠極限攞分。
    const rows = computeStandings(players(4), [
      rounds('p1', 'p3', ['a:xtreme', 'b:spin', 'a:spin']), // p1 4-1，1 次極限
      rounds('p4', 'p1', ['a:xtreme', 'b:spin', 'a:spin']), // p1 1-4
      rounds('p2', 'p3', ['a:spin', 'a:spin', 'b:spin', 'a:spin', 'a:spin']), // p2 4-1，0 次極限
      rounds('p4', 'p2', ['a:spin', 'a:spin', 'b:spin', 'a:spin', 'a:spin']), // p2 1-4
    ])

    const p1 = rows.find((r) => r.playerId === 'p1')!
    const p2 = rows.find((r) => r.playerId === 'p2')!
    expect([p1.wins, p1.pointsFor, p1.diff]).toEqual([p2.wins, p2.pointsFor, p2.diff])
    expect(p1.xtremeWins).toBe(1)
    expect(p2.xtremeWins).toBe(0)
    // p4 兩場全贏，佢喺最前 —— 呢度只關心 p1 同 p2 之間邊個排前。
    expect(p1.rank).toBeLessThan(p2.rank)
    expect(p1.tied).toBe(false)
    expect(p2.tied).toBe(false)
  })
```

**(f)** 檔案最尾加成個小循環嘅 describe：

```ts
describe('對賽成績（小循環）', () => {
  /**
   * 三個人並列嘅時候拆唔拆得開，睇個組有冇其他人。
   *
   * 三個人自己一組打成回圈：佢哋之間嘅場次**就係**全部場次，所以內部數字
   * 一定等於整體數字 —— 主鏈已經全同，內部就實全同，點拆都拆唔開。
   * 要拆得開，個組一定要大過並列嗰班人（下面用 5 個人，p4／p5 食走個差額）。
   */

  it('兩個人並列：閂咗就並列，開咗就贏過對方嗰個排前', () => {
    // p2 贏 p3 4-1、p4 贏 p2 4-1、p3 贏 p1 4-1。
    // p2 同 p3 都係 1 勝 1 負、5 分、失 5 分、分差 0、1 次極限。
    const ms = [
      rounds('p2', 'p3', ['b:spin', 'a:xtreme', 'a:spin']), // p2 4-1，p2 一次極限
      rounds('p4', 'p2', ['b:spin', 'a:xtreme', 'a:spin']), // p4 4-1
      rounds('p3', 'p1', ['b:spin', 'a:xtreme', 'a:spin']), // p3 4-1，p3 一次極限
    ]

    const off = computeStandings(players(4), ms)
    const p2off = off.find((r) => r.playerId === 'p2')!
    const p3off = off.find((r) => r.playerId === 'p3')!
    expect([p2off.wins, p2off.pointsFor, p2off.diff, p2off.xtremeWins]).toEqual([
      p3off.wins,
      p3off.pointsFor,
      p3off.diff,
      p3off.xtremeWins,
    ])
    expect(p2off.rank).toBe(p3off.rank)
    expect(p2off.tied).toBe(true)
    expect(p3off.tied).toBe(true)

    const on = computeStandings(players(4), ms, true)
    const p2on = on.find((r) => r.playerId === 'p2')!
    const p3on = on.find((r) => r.playerId === 'p3')!
    expect(p2on.rank).toBeLessThan(p3on.rank)
    expect(p2on.tied).toBe(false)
    expect(p3on.tied).toBe(false)
  })

  it('兩個人並列但未打過對方：開咗都仲係並列', () => {
    const rows = computeStandings(
      players(4),
      [
        played('p1', 'p2', 'p1', 0),
        played('p1', 'p3', 'p1', 0),
        played('p2', 'p4', 'p2', 1),
        played('p3', 'p4', 'p3', 1),
        // p2 vs p3 未打
      ],
      true,
    )
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4])
    expect(rows.map((r) => r.tied)).toEqual([false, true, true, false])
  })

  /**
   * 5 個人一組。p1／p2／p3 三個主鏈四樣全同（2 勝 2 負、10 分、失 10 分、
   * 分差 0、1 次極限），而佢哋之間打成回圈。p4 全輸、p5 全贏，食走個差額。
   *
   * 佢哋之間嗰三場（m1／m2／m3）計出嚟：
   *   內部勝場   p1 1、p2 1、p3 1      ← 拆唔開
   *   內部分差   p1 +2、p2 −1、p3 −1   ← 拆到 p1
   *   內部極限   p2 1、p3 0            ← 再拆到 p2 同 p3
   *
   * 一個 fixture 同時試到小循環第 2 層同第 3 層。
   */
  const FIVE: Match[] = [
    // p1／p2／p3 之間嘅回圈
    rounds('p1', 'p2', ['a:spin', 'a:spin', 'a:spin', 'a:spin']), // p1 4-0
    rounds('p2', 'p3', ['b:spin', 'a:xtreme', 'a:spin']), // p2 4-1，p2 一次極限
    rounds('p3', 'p1', ['b:spin', 'b:spin', 'a:spin', 'a:spin', 'a:spin', 'a:spin']), // p3 4-2
    // 三個都贏 p4
    rounds('p1', 'p4', ['b:spin', 'b:spin', 'a:xtreme', 'a:spin']), // p1 4-2，p1 一次極限
    rounds('p2', 'p4', ['b:spin', 'a:spin', 'a:spin', 'a:spin', 'a:spin']), // p2 4-1
    rounds('p3', 'p4', ['a:xtreme', 'a:spin']), // p3 4-0，p3 一次極限
    // 三個都輸俾 p5
    rounds('p1', 'p5', ['b:spin', 'b:spin', 'b:spin', 'b:spin']), // p5 4-0
    rounds('p2', 'p5', ['a:spin', 'a:spin', 'b:spin', 'b:spin', 'b:spin', 'b:spin']), // p5 4-2
    rounds('p3', 'p5', ['a:spin', 'b:spin', 'b:spin', 'b:spin', 'b:spin']), // p5 4-1
    rounds('p4', 'p5', ['b:spin', 'b:spin', 'b:spin', 'b:spin']), // p5 4-0
  ]

  it('三個人主鏈四樣全同：閂咗三個一齊並列', () => {
    const rows = computeStandings(players(5), FIVE)
    const three = ['p1', 'p2', 'p3'].map((id) => rows.find((r) => r.playerId === id)!)
    for (const r of three) {
      expect([r.wins, r.pointsFor, r.pointsAgainst, r.diff, r.xtremeWins]).toEqual([2, 10, 10, 0, 1])
      expect(r.tied).toBe(true)
    }
    expect(new Set(three.map((r) => r.rank)).size).toBe(1)
  })

  it('開咗：內部分差拆到 p1，內部極限再拆到 p2 同 p3', () => {
    const rows = computeStandings(players(5), FIVE, true)
    const of = (id: string) => rows.find((r) => r.playerId === id)!
    // p5 四場全勝排最前，跟住先到呢三個。
    expect(of('p1').rank).toBeLessThan(of('p2').rank)
    expect(of('p2').rank).toBeLessThan(of('p3').rank)
    for (const id of ['p1', 'p2', 'p3']) expect(of(id).tied).toBe(false)
  })

  it('三個人自己一組打成回圈：內部同整體一模一樣，開咗都拆唔開', () => {
    const cycle = [
      rounds('p1', 'p2', ['b:spin', 'a:xtreme', 'a:spin']), // p1 4-1
      rounds('p2', 'p3', ['b:spin', 'a:xtreme', 'a:spin']), // p2 4-1
      rounds('p3', 'p1', ['b:spin', 'a:xtreme', 'a:spin']), // p3 4-1
    ]
    for (const headToHead of [false, true]) {
      const rows = computeStandings(players(3), cycle, headToHead)
      expect(rows.every((r) => r.rank === 1)).toBe(true)
      expect(rows.every((r) => r.tied)).toBe(true)
    }
  })

  it('小循環淨係計並列嗰班人之間嘅場次', () => {
    // p1 贏 p2、p2 贏 p3、p3 贏 p1，三個都贏 p4 —— 但 p3 贏 p4 嗰場俾人攞咗 2 分，
    // 所以 p3 分差細過另外兩個，主鏈已經拆咗佢出嚟。並列嘅只有 p1 同 p2，
    // 小循環就只會翻佢哋之間嗰一場，唔關 p3、p4 事。
    const ms = [
      played('p1', 'p2', 'p1', 0),
      played('p2', 'p3', 'p2', 0),
      played('p3', 'p1', 'p3', 0),
      played('p1', 'p4', 'p1', 0),
      played('p2', 'p4', 'p2', 0),
      played('p3', 'p4', 'p3', 2),
    ]

    const off = computeStandings(players(4), ms)
    const p1off = off.find((r) => r.playerId === 'p1')!
    const p2off = off.find((r) => r.playerId === 'p2')!
    expect(p1off.rank).toBe(p2off.rank)
    expect(p1off.tied).toBe(true)

    const on = computeStandings(players(4), ms, true)
    const rank = (id: string) => on.find((r) => r.playerId === id)!.rank
    expect(rank('p1')).toBeLessThan(rank('p2')) // p1 贏過 p2
    expect(rank('p2')).toBeLessThan(rank('p3')) // p3 分差細，主鏈已經輸咗
  })
})
```

- [ ] **Step 3: 行測試，確認佢 fail**

Run: `npx vitest run src/engine/standings.test.ts`
Expected: FAIL —— 新測試全部唔過，`第 2 條` 嗰個亦都 fail（舊實作仲係對賽成績行先）

- [ ] **Step 4: 重寫 `standings.ts`**

`src/engine/standings.ts` 由第 1 行到 `computeStandings` 完結（line 131）**整段換走**：

```ts
import { matchScore, matchWinnerId, xtremeInMatch } from './rules'
import type { Match, Player, StandingRow } from './types'

/**
 * 排名比較次序（同 spec 一致，唔好擅自改）：
 *
 *   1. 勝場數
 *   2. 總得分
 *   3. 得失分差
 *   4. 極限勝出次數
 *   5. 對賽成績 —— 淨係 `headToHead` 開咗先做，見下面 `miniLeague`
 *   6. 仲係一樣 → 並列，唔自動分先後
 *
 * 未打完嘅場次一律唔計，所以排名唔會打到一半跳嚟跳去。
 *
 * 排序最後 fallback 係個名，但**個名唔算「分得開」** —— 佢淨係令顯示次序
 * 定死，唔會令兩個樣樣一樣嘅人變咗有高低。
 *
 * 純 function：入咩出咩，冇 side effect。
 */

interface Acc {
  player: Player
  played: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  xtremeWins: number
}

/** 小循環入面一個人嘅內部成績。 */
interface MiniRow {
  wins: number
  diff: number
  xtreme: number
}

export function computeStandings(
  players: Player[],
  matches: Match[],
  headToHead = false,
): StandingRow[] {
  const acc = new Map<string, Acc>()
  for (const p of players) {
    acc.set(p.id, {
      player: p,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      xtremeWins: 0,
    })
  }

  /** 真係入咗數嘅場次。小循環要重新翻呢批，所以順手留低。 */
  const counted: Match[] = []

  for (const m of matches) {
    // 淨係循環階段入排名表。淘汰賽睇籤表；加賽係用嚟拆並列嘅，
    // 計咗入去就會篡改返個排名表本身，變成「因為並列所以打，打完就唔並列」。
    if (m.stage !== 'group') continue
    if (m.aId === null || m.bId === null) continue // 對手未定

    const winnerId = matchWinnerId(m)
    if (winnerId === null) continue // 未打完，唔計

    const a = acc.get(m.aId)
    const b = acc.get(m.bId)
    if (!a || !b) continue // 場次入面有唔存在嘅選手，跳過

    const { a: sa, b: sb } = matchScore(m)
    a.played += 1
    b.played += 1
    a.pointsFor += sa
    a.pointsAgainst += sb
    b.pointsFor += sb
    b.pointsAgainst += sa
    a.xtremeWins += xtremeInMatch(m, m.aId)
    b.xtremeWins += xtremeInMatch(m, m.bId)

    if (winnerId === m.aId) {
      a.wins += 1
      b.losses += 1
    } else {
      b.wins += 1
      a.losses += 1
    }

    counted.push(m)
  }

  const rows: StandingRow[] = [...acc.values()].map((r) => ({
    playerId: r.player.id,
    name: r.player.name,
    played: r.played,
    wins: r.wins,
    losses: r.losses,
    pointsFor: r.pointsFor,
    pointsAgainst: r.pointsAgainst,
    diff: r.pointsFor - r.pointsAgainst,
    xtremeWins: r.xtremeWins,
    rank: 0,
    tied: false,
  }))

  rows.sort(
    (x, y) =>
      y.wins - x.wins ||
      y.pointsFor - x.pointsFor ||
      y.diff - x.diff ||
      y.xtremeWins - x.xtremeWins ||
      x.name.localeCompare(y.name, 'zh-HK'),
  )

  // 第 5 條：主鏈四樣全同嗰班人，開個小循環出嚟再拆。
  // index i 喺呢個 set 入面 = 小循環將 i 同 i-1 分咗高低。
  const brokenByMini = new Set<number>()
  if (headToHead) {
    for (let start = 0; start < rows.length; ) {
      let end = start + 1
      while (end < rows.length && sameMain(rows[start]!, rows[end]!)) end += 1

      if (end - start >= 2) {
        const block = rows.slice(start, end)
        const mini = miniLeague(
          block.map((r) => r.playerId),
          counted,
        )
        block.sort((x, y) => {
          const mx = mini.get(x.playerId)!
          const my = mini.get(y.playerId)!
          return (
            my.wins - mx.wins ||
            my.diff - mx.diff ||
            my.xtreme - mx.xtreme ||
            x.name.localeCompare(y.name, 'zh-HK')
          )
        })
        for (let i = 0; i < block.length; i++) rows[start + i] = block[i]!
        for (let i = 1; i < block.length; i++) {
          const prev = mini.get(block[i - 1]!.playerId)!
          const cur = mini.get(block[i]!.playerId)!
          if (prev.wins !== cur.wins || prev.diff !== cur.diff || prev.xtreme !== cur.xtreme) {
            brokenByMini.add(start + i)
          }
        }
      }

      start = end
    }
  }

  // 名次：分得開就 +1，分唔開就同上面共用同一個名次。
  const separated: boolean[] = rows.map((row, i) => {
    if (i === 0) return true
    if (!sameMain(rows[i - 1]!, row)) return true
    return brokenByMini.has(i)
  })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    row.rank = separated[i] ? i + 1 : rows[i - 1]!.rank
    row.tied = !separated[i] || (i + 1 < rows.length && !separated[i + 1])
  }

  return rows
}

/** 主鏈四樣數字全部一樣先至輪到小循環。 */
function sameMain(a: StandingRow, b: StandingRow): boolean {
  return (
    a.wins === b.wins &&
    a.pointsFor === b.pointsFor &&
    a.diff === b.diff &&
    a.xtremeWins === b.xtremeWins
  )
}

/**
 * 小循環：淨係攞呢班人**之間**打完咗嘅場次，重新計一次。
 *
 * 兩個人嘅時候呢條式自動退化成「邊個贏過邊個」—— 贏嗰個內部勝場 1 > 0。
 * 所以兩人同三人共用呢一條 code path，唔使分開寫。
 *
 * 唔遞迴：拆完仲有人一樣就係並列，唔會喺並列嗰班人入面再開多個小循環。
 */
function miniLeague(ids: string[], matches: Match[]): Map<string, MiniRow> {
  const inBlock = new Set(ids)
  const stat = new Map<string, MiniRow>(ids.map((id) => [id, { wins: 0, diff: 0, xtreme: 0 }]))

  for (const m of matches) {
    if (m.aId === null || m.bId === null) continue
    if (!inBlock.has(m.aId) || !inBlock.has(m.bId)) continue

    const a = stat.get(m.aId)!
    const b = stat.get(m.bId)!
    const { a: sa, b: sb } = matchScore(m)
    a.diff += sa - sb
    b.diff += sb - sa
    a.xtreme += xtremeInMatch(m, m.aId)
    b.xtreme += xtremeInMatch(m, m.bId)
    if (matchWinnerId(m) === m.aId) a.wins += 1
    else b.wins += 1
  }

  return stat
}
```

`isTournamentComplete` 同 `completedCount`（原本 line 133-141）**唔動**，留返喺檔案最尾。

註：`matchKey` 唔再用得着，所以由 import 度剷走咗 —— 唔剷 TS 會報 unused。

- [ ] **Step 5: 行測試，確認全部綠**

Run: `npm test && npm run typecheck`
Expected: PASS。`pools.test.ts` / `tiebreak.test.ts` 有機會因為排名次序變咗而 fail —— 如果 fail，睇清楚係「新規則之下本來就應該係咁」定係真係有 bug。改測試之前一定要人手核一次新規則之下嘅正確答案。

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/standings.ts src/engine/standings.test.ts
git commit -m "排名鏈改成 勝場→得分→分差→極限；對賽成績退到最尾，用小循環拆"
```

---

### Task 3: `headToHead` 上 `Tournament` + 存檔

**Files:**
- Modify: `src/engine/types.ts:64-78`（`Tournament` 加 `headToHead`）
- Modify: `src/storage/storage.ts:131-149`（`create`）同 `:296-308`（`parseTournament`）
- Modify: `src/engine/tournament.ts:136-141`（兩個 `computeStandings` caller）
- Modify: `src/engine/tournament.test.ts:27-46`、`src/engine/pools.lifecycle.test.ts:27-41`（fixture 加 field）
- Test: `src/storage/storage.test.ts`

**Interfaces:**
- Consumes: Task 2 嘅 `computeStandings(players, matches, headToHead?)`
- Produces: `Tournament.headToHead: boolean`

- [ ] **Step 1: 寫住會 fail 嘅測試**

`src/storage/storage.test.ts` 最尾加：

```ts
describe('同分點拆嘅選項', () => {
  it('新賽事 default 係閂', () => {
    const store = createStore({ kv: new FakeKv() })
    expect(store.create('測試').headToHead).toBe(false)
  })

  it('舊檔冇呢個 field 就當閂', () => {
    const t = parseTournament({
      id: 't1',
      name: '舊賽事',
      createdAt: 0,
      updatedAt: 0,
      mode: 'roundRobin',
      players: [],
      matches: [],
    })
    expect(t.headToHead).toBe(false)
  })

  it('唔係 true 嘅垃圾值一律當閂', () => {
    const base = {
      id: 't1',
      name: '賽事',
      createdAt: 0,
      updatedAt: 0,
      mode: 'roundRobin',
      players: [],
      matches: [],
    }
    expect(parseTournament({ ...base, headToHead: 'yes' }).headToHead).toBe(false)
    expect(parseTournament({ ...base, headToHead: 1 }).headToHead).toBe(false)
    expect(parseTournament({ ...base, headToHead: null }).headToHead).toBe(false)
    expect(parseTournament({ ...base, headToHead: true }).headToHead).toBe(true)
  })

  it('匯出再匯入，個值保持住', () => {
    const store = createStore({ kv: new FakeKv() })
    const t = store.create('測試')
    store.save({ ...t, headToHead: true })

    const other = createStore({ kv: new FakeKv() })
    const [back] = other.importJson(store.exportJson(t.id))
    expect(back!.headToHead).toBe(true)
  })
})
```

`FakeKv`、`createStore`、`parseTournament` 三個喺 `storage.test.ts` 頂部已經有，唔使再 import。

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/storage/storage.test.ts`
Expected: FAIL，`headToHead` 係 `undefined`

- [ ] **Step 3: 實作**

**(a)** `src/engine/types.ts`，`Tournament` 入面 `advancePerPool` 下面加：

```ts
  /** poolsThenKnockout 專用：每組出幾多個入籤表。其他模式係 null。 */
  advancePerPool: number | null
  /**
   * 同分點拆：主鏈（勝場 → 得分 → 分差 → 極限次數）四樣全同嗰陣，
   * 使唔使再睇佢哋之間邊個贏過邊個。false = 直接當並列。
   *
   * default false。舊檔冇呢個 field 一樣當 false。
   */
  headToHead: boolean
```

**(b)** `src/storage/storage.ts` `create()`（line 141 附近），`advancePerPool: null,` 下面加：

```ts
        advancePerPool: null,
        headToHead: false,
```

**(c)** `src/storage/storage.ts` `parseTournament` 嘅 return（line 305 附近），`advancePerPool,` 下面加：

```ts
    advancePerPool,
    // 舊檔冇呢個 field，一律當閂。唔係 true 嘅垃圾值都當閂。
    headToHead: v.headToHead === true,
```

**(d)** `src/engine/tournament.ts` line 139 附近，`standings()` 入面：

```ts
  return computeStandings(t.players, groupMatches(t.matches), t.headToHead)
```

同 `cutSeeds()` 入面嗰個（line 138 附近）：

```ts
  return computeStandings(t.players, groupMatches(t.matches), t.headToHead)
    .slice(0, t.cutSize)
    .map((r) => r.playerId)
```

**(e)** `src/engine/tournament.test.ts` 嘅 `tournament()` fixture（line 33-46），`advancePerPool,` 下面加 `headToHead: false,`。

**(f)** `src/engine/pools.lifecycle.test.ts` 嘅 `tour()` fixture（line 27-41），`advancePerPool: 2,` 下面加 `headToHead: false,`（`...over` 要留喺最尾，咁測試先覆蓋到）。

- [ ] **Step 4: 行測試，確認全部綠**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/storage/storage.ts src/storage/storage.test.ts src/engine/tournament.ts src/engine/tournament.test.ts src/engine/pools.lifecycle.test.ts
git commit -m "同分點拆嘅選項上賽事：存檔、讀檔、舊檔當閂"
```

---

### Task 4: 小組同加賽（`pools.ts`）

**Files:**
- Modify: `src/engine/pools.ts:170-176`（`poolStandings`）、`:188-200`（`poolSeedOrder`）、`:386-405`（`rankByTiebreak` / `TiebreakRow`）、`:438-471`（`tieStates`）、`:474-481`（`tiesPending`）、`:489-502`（`nextTiebreak`）、`:505-525`（`applyTiebreaks`）
- Modify: `src/engine/tournament.ts:136`、`:168`（傳 `t.headToHead`）
- Test: `src/engine/tiebreak.test.ts`、`src/engine/pools.test.ts`

**Interfaces:**
- Consumes: Task 2 嘅 `computeStandings(players, matches, headToHead?)`；Task 1 嘅 `xtremeInMatch`；Task 3 嘅 `Tournament.headToHead`
- Produces:
  - `TiebreakRow` 加 `xtreme: number`
  - `poolStandings(players, matches, poolCount, headToHead?): PoolTable[]`
  - `poolSeedOrder(players, matches, poolCount, advancePerPool, headToHead?): string[]`
  - `tieStates(players, matches, poolCount, advancePerPool, headToHead?): TieState[]`
  - `tiesPending(players, matches, poolCount, advancePerPool, headToHead?): boolean`
  - `nextTiebreak(players, matches, poolCount, advancePerPool, headToHead?): Match[]`

  全部新參數 default `false`，所以未改嘅 caller 照 compile。

- [ ] **Step 1: 寫住會 fail 嘅測試**

呢個檔已經有現成 helper，全部用返：`pooled`、`played(winner, loser, id, stage, loserPoints)`、`group`、`ABC`（A/B/C/D 四個人全部 pool 3）、`CYCLE`（A贏B、B贏C、C贏A，全部 4–0，三個都贏埋 D）。

**要留意 `played` 嘅贏法係 `xtreme` + `spin`** —— 即係每個贏家自動有 1 次極限。所以要砌「贏咗但冇極限」就要自己寫一個。

`rankByTiebreak` 而家係 module-private，測試要摸到佢，所以喺 `pools.ts` 將 `function rankByTiebreak` 改成 `export function rankByTiebreak`。

頂部 import 加 `rankByTiebreak`（由 `./pools`）同 `Match` type（已經有就唔使再加）。檔案最尾加：

```ts
describe('加賽排名加埋極限次數', () => {
  /** 一場打完嘅加賽，贏家撳兩次「爆咗」攞夠 4 分 —— 一次極限都冇。 */
  function noX(winner: string, loser: string, id: string): Match {
    return {
      id,
      stage: 'tiebreak',
      round: 1,
      order: 1,
      aId: winner,
      bId: loser,
      aFrom: null,
      bFrom: null,
      rounds: [
        { winnerId: winner, finish: 'burst' },
        { winnerId: winner, finish: 'burst' },
      ],
    }
  }

  it('勝場同分差都一樣，靠極限次數拆得開', () => {
    // A 贏 B 4–0（極限 + 轉贏），B 贏 A 4–0（兩次爆咗）。
    // 勝場 1:1、分差 0:0，淨係極限次數唔同。
    const rows = rankByTiebreak(
      ['A', 'B'],
      [played('A', 'B', 'tb3r1m1', 'tiebreak'), noX('B', 'A', 'tb3r1m2')],
    )
    expect(rows.map((r) => r.wins)).toEqual([1, 1])
    expect(rows.map((r) => r.diff)).toEqual([0, 0])
    expect(rows.map((r) => r.id)).toEqual(['A', 'B'])
    expect(rows.map((r) => r.xtreme)).toEqual([1, 0])
  })

  it('線上線下靠極限分得開，就唔使再打多一次加賽', () => {
    // 加賽又打成循環、全部 4–0 —— 勝場同分差全部一樣，舊規則要再打過。
    // 而家 C 贏嗰場冇極限，所以 C 包尾，線上（頭 2 個）同線下分得開。
    const all = [
      ...CYCLE,
      played('A', 'B', 'tb3r1m1', 'tiebreak'), // A 4–0，1 次極限
      noX('C', 'A', 'tb3r1m2'), // C 4–0，0 次極限
      played('B', 'C', 'tb3r1m3', 'tiebreak'), // B 4–0，1 次極限
    ]
    const [state] = tieStates(ABC, all, 3, 2)
    expect(state!.played).toBe(true)
    expect(state!.results.map((r) => r.xtreme)).toEqual([1, 1, 0])
    expect(state!.results[2]!.id).toBe('C')
    expect(state!.resolved).toBe(true)
    expect(tiesPending(ABC, all, 3, 2)).toBe(false)
  })
})

describe('小組排名收得到同分點拆嘅選項', () => {
  /**
   * A 贏 B、A 贏 C、B 贏 C、B 贏 D、C 贏 D、D 贏 A。
   *
   * A 同 B 都係 2 勝 1 負、8 分、失 4 分、分差 +4、2 次極限 —— 主鏈四樣全同。
   * A 贏過 B，所以開咗選項先分得開。
   */
  const TWO: Match[] = [
    group('A', 'B'),
    group('A', 'C'),
    group('B', 'C'),
    group('B', 'D'),
    group('C', 'D'),
    group('D', 'A'),
  ]

  const poolRows = (headToHead: boolean) =>
    poolStandings(ABC, TWO, 3, headToHead).find((t) => t.pool === 3)!.rows

  it('兩個人爭一個位：閂咗要打加賽，開咗睇對賽記錄就唔使', () => {
    const off = poolRows(false)
    expect(off.find((r) => r.name === 'A')!.rank).toBe(1)
    expect(off.find((r) => r.name === 'B')!.rank).toBe(1)
    expect(tiesPending(ABC, TWO, 3, 1)).toBe(true)

    const on = poolRows(true)
    expect(on.find((r) => r.name === 'A')!.rank).toBe(1)
    expect(on.find((r) => r.name === 'B')!.rank).toBe(2)
    expect(tiesPending(ABC, TWO, 3, 1, true)).toBe(false)
  })

  it('三個人回圈：內部三樣全同，開咗都仲係並列，加賽照要打', () => {
    // CYCLE 入面每場都 4–0、每個贏家一次極限 → 內部勝場、分差、極限全部一樣。
    for (const headToHead of [false, true]) {
      const rows = poolStandings(ABC, CYCLE, 3, headToHead).find((t) => t.pool === 3)!.rows
      for (const name of ['A', 'B', 'C']) {
        expect(rows.find((r) => r.name === name)!.rank).toBe(1)
      }
    }
    expect(tiesPending(ABC, CYCLE, 3, 2, true)).toBe(true)
  })

  it('poolSeedOrder 收得到個選項', () => {
    expect(poolSeedOrder(ABC, TWO, 3, 2, true).sort()).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 2: 行測試，確認佢 fail**

Run: `npx vitest run src/engine/tiebreak.test.ts`
Expected: FAIL，`rankByTiebreak` import 唔到／`xtreme` 係 `undefined`

- [ ] **Step 3: 實作**

**(a)** `TiebreakRow`（line 405-411）加 `xtreme`：

```ts
/** 加賽入面一個人嘅成績。 */
export interface TiebreakRow {
  id: string
  wins: number
  /** 加賽場次嘅得失分差。 */
  diff: number
  /** 加賽場次嘅極限勝出次數。 */
  xtreme: number
}
```

**(b)** `rankByTiebreak`（line 380-402）換成：

```ts
/**
 * 加賽成績排先後：勝場 → 分差 → 極限次數。
 *
 * 唔用 `computeStandings` —— 嗰個第二層係總得分，但加賽嘅規則係直接跳去分差。
 * 加賽場數少，多一條極限拆得開多啲，唔使動不動就打多一輪。
 */
export function rankByTiebreak(ids: string[], played: Match[]): TiebreakRow[] {
  const stat = new Map(ids.map((id) => [id, { id, wins: 0, diff: 0, xtreme: 0 }]))
  for (const m of played) {
    if (m.aId === null || m.bId === null) continue
    const a = stat.get(m.aId)
    const b = stat.get(m.bId)
    if (!a || !b) continue
    const { a: sa, b: sb } = matchScore(m)
    a.diff += sa - sb
    b.diff += sb - sa
    a.xtreme += xtremeInMatch(m, m.aId)
    b.xtreme += xtremeInMatch(m, m.bId)
    const winner = matchWinnerId(m)
    if (winner === m.aId) a.wins += 1
    else if (winner === m.bId) b.wins += 1
  }
  // 排唔開嘅照留返原本次序，等上面自己判斷分唔分得開。
  return [...stat.values()].sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.xtreme - x.xtreme)
}
```

`pools.ts` 第 1-5 行嗰個 import 要加 `xtremeInMatch`。

**(c)** `tieStates` 入面判斷 `resolved` 嗰行（line 464）加埋極限：

```ts
      // 淨係要線上線下嗰兩個分得開就夠 —— 唔關事嗰啲分唔開都唔使再打。
      resolved =
        above.wins !== below.wins || above.diff !== below.diff || above.xtreme !== below.xtreme
```

**(d)** 五個 function 加 `headToHead` 參數，一路傳落去：

```ts
export function poolStandings(
  players: Player[],
  matches: Match[],
  poolCount: number,
  headToHead = false,
): PoolTable[] {
  const group = groupMatches(matches)
  return poolsOf(players, poolCount).map((pool, i) => {
    const ids = new Set(pool.map((p) => p.id))
    // 兩邊一定同組，所以查一邊就夠。
    const mine = group.filter((m) => m.aId !== null && ids.has(m.aId))
    return { pool: i + 1, players: pool, rows: computeStandings(pool, mine, headToHead) }
  })
}
```

```ts
export function poolSeedOrder(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
  headToHead = false,
): string[] {
  const tables = poolStandings(players, matches, poolCount, headToHead).map((t) => ({
    ...t,
    rows: applyTiebreaks(t, matches, advancePerPool),
  }))
  const globalRank = new Map(
    computeStandings(players, groupMatches(matches), headToHead).map((r, i) => [r.playerId, i]),
  )
  // ……下面唔改
```

```ts
export function tieStates(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
  headToHead = false,
): TieState[] {
  const out: TieState[] = []

  for (const table of poolStandings(players, matches, poolCount, headToHead)) {
  // ……下面唔改
```

```ts
export function tiesPending(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
  headToHead = false,
): boolean {
  return tieStates(players, matches, poolCount, advancePerPool, headToHead).some((s) => !s.resolved)
}
```

```ts
export function nextTiebreak(
  players: Player[],
  matches: Match[],
  poolCount: number,
  advancePerPool: number,
  headToHead = false,
): Match[] {
  const out: Match[] = []
  for (const s of tieStates(players, matches, poolCount, advancePerPool, headToHead)) {
  // ……下面唔改
```

**(e)** `src/engine/tournament.ts` 兩個 caller 加參數：

line 136 附近（`cutSeeds`）：

```ts
    if (tiesPending(t.players, t.matches, t.poolCount, t.advancePerPool, t.headToHead)) return []
    return poolSeedOrder(t.players, t.matches, t.poolCount, t.advancePerPool, t.headToHead)
```

line 168 附近：

```ts
  return tieStates(t.players, t.matches, t.poolCount, t.advancePerPool, t.headToHead)
```

同埋 `tournament.ts` 入面所有 `nextTiebreak(...)` 嘅 caller 都要加 `t.headToHead` —— 用 `grep -n "nextTiebreak" src/engine/tournament.ts` 搵齊佢哋。

- [ ] **Step 4: 行測試，確認全部綠**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/pools.ts src/engine/tournament.ts src/engine/tiebreak.test.ts src/engine/pools.test.ts
git commit -m "加賽排名加埋極限次數；小組排名傳埋同分點拆嘅選項"
```

---

### Task 5: 兩張表加「⚡」欄

**Files:**
- Modify: `src/ui/components/Standings.tsx`
- Modify: `src/ui/components/TiebreakResult.tsx:40-77`、`:111-117`
- Modify: `src/ui/Board.tsx:31`、`:37`
- Modify: `src/ui/Table.tsx:16`、`:37`
- Modify: `src/ui/Bracket.tsx:256-260`

**Interfaces:**
- Consumes: Task 2 嘅 `StandingRow.xtremeWins`；Task 4 嘅 `TiebreakRow.xtreme` 同新 `poolStandings` 簽名
- Produces: 冇新 API

- [ ] **Step 1: 排名表加欄**

`src/ui/components/Standings.tsx`：

檔頂個註釋改成：

```tsx
/**
 * 排名表。四條主規則（勝場、得分、分差、極限次數）全部睇得出嚟，
 * 失分擺埋落去等人查得到。
 *
 * `cutAfter` = 第幾名之後劃條出線線（小組賽用）。
 */
```

`<caption>` 改成：

```tsx
        <caption className="sr-only">
          排名。先比勝場，再比總得分，跟住得失分差，最後極限勝出次數。
        </caption>
```

`<thead>` 入面，`得分` 嗰個 `<th>` 後面加一欄（compact 都要出）：

```tsx
            <th scope="col">得分</th>
            <th scope="col">
              <span aria-hidden="true">⚡</span>
              <span className="sr-only">極限勝出次數</span>
            </th>
            {!compact && <th scope="col">失分</th>}
```

`<tbody>` 入面，`pointsFor` 嗰個 `<td>` 後面加：

```tsx
              <td className="stand__num">{r.pointsFor}</td>
              <td className="stand__num">{r.xtremeWins}</td>
              {!compact && <td className="stand__num">{r.pointsAgainst}</td>}
```

- [ ] **Step 2: 加賽表加欄**

`src/ui/components/TiebreakResult.tsx`：

`<caption>`：

```tsx
            <caption className="sr-only">
              加賽成績。先比勝場，再比分差，最後極限勝出次數。頭 {tie.slots} 個出線。
            </caption>
```

`<thead>` 入面 `分差` 後面加：

```tsx
                <th scope="col">分差</th>
                <th scope="col">
                  <span aria-hidden="true">⚡</span>
                  <span className="sr-only">極限勝出次數</span>
                </th>
```

`<tbody>` 入面分差嗰個 `<td>` 後面加：

```tsx
                    <td className="stand__num">
                      {r.diff > 0 ? '+' : ''}
                      {r.diff}
                    </td>
                    <td className="stand__num">{r.xtreme}</td>
```

底下兩句解釋文字（line 111-122）改成：

```tsx
      ) : tie.resolved ? (
        <p className="note">
          <span>·</span>
          <span>
            先比加賽勝場，打和就比分差，再打和就比極限勝出次數。線上面 {tie.slots} 個出線，
            線下面冇份。
          </span>
        </p>
      ) : (
        <p className="note note--bad">
          <span>⚠</span>
          <span>加賽勝場、分差、極限次數全部一樣，仲係分唔開 —— 要再打多一次。</span>
        </p>
      )}
```

- [ ] **Step 3: 三個頁面傳 `headToHead`**

`src/ui/Board.tsx` line 31 同 37：

```tsx
  const rows = computeStandings(tournament.players, tournament.matches, tournament.headToHead)
```

```tsx
      ? poolStandings(
          tournament.players,
          tournament.matches,
          tournament.poolCount,
          tournament.headToHead,
        )
```

`src/ui/Table.tsx` line 16 同 37：一模一樣嘅兩個改法。

`src/ui/Bracket.tsx` line 256-260：

```tsx
  const tables = poolStandings(
    tournament.players,
    tournament.matches,
    tournament.poolCount ?? 0,
    tournament.headToHead,
  )
```

- [ ] **Step 4: 行測試同 build**

Run: `npm test && npm run build`
Expected: PASS，`tsc --noEmit` 冇錯

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/Standings.tsx src/ui/components/TiebreakResult.tsx src/ui/Board.tsx src/ui/Table.tsx src/ui/Bracket.tsx
git commit -m "排名表同加賽表出埋極限勝出次數"
```

---

### Task 6: Setup 加「同分點拆」開關

**Files:**
- Modify: `src/ui/Setup.tsx`（`poolsThenKnockout` 嗰個 `<PoolSetup>` block 之後、「有邊個打」個 field 之前）

**Interfaces:**
- Consumes: Task 3 嘅 `Tournament.headToHead`；Setup 現有嘅 `update()` 同 `alreadyStarted`
- Produces: 冇新 API

- [ ] **Step 1: 加個 field**

`src/ui/Setup.tsx`，喺 `{tournament.mode === 'poolsThenKnockout' && (<PoolSetup ... />)}` 呢個 block 後面、「有邊個打」嗰個 `<div className="field">` 前面插入：

```tsx
        {/*
          純淘汰賽冇排名表，呢個設定對佢冇意義，唔好出。

          鎖同賽制一樣行 alreadyStarted：打到一半改規則排名會大跳，
          而且如果已經排咗加賽，改完可能原本並列嘅唔再並列 —— 嗰批加賽即刻白打。
        */}
        {tournament.mode !== 'knockout' && (
          <div className="field">
            <span className="field__label">同分點拆</span>
            <div className="chips">
              <button
                className="chip chamfer-sm"
                aria-pressed={!tournament.headToHead}
                disabled={alreadyStarted}
                onClick={() => update((t) => ({ ...t, headToHead: false }))}
              >
                當並列
              </button>
              <button
                className="chip chamfer-sm"
                aria-pressed={tournament.headToHead}
                disabled={alreadyStarted}
                onClick={() => update((t) => ({ ...t, headToHead: true }))}
              >
                睇對賽記錄
              </button>
            </div>
            <p className="note">
              <span>·</span>
              <span>
                排名次序：勝場 → 得分 → 分差 → 極限勝出次數。四樣都一樣嘅時候，
                {tournament.headToHead
                  ? '再睇佢哋之間邊個贏過邊個；仲拆唔開先當並列。'
                  : '就當並列，出線位有並列就打加賽。'}
              </span>
            </p>
          </div>
        )}
```

- [ ] **Step 2: 人手行一次**

Run: `npm run dev`，開一場新賽事去 Setup 頁

確認：
1. 「同分點拆」default 揀住「當並列」
2. 撳「睇對賽記錄」，下面段字跟住變
3. 揀「純淘汰」賽制，成個 field 消失
4. 入咗一場嘅分之後返嚟，兩粒掣都 disabled

- [ ] **Step 3: build**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ui/Setup.tsx
git commit -m "Setup 加「同分點拆」開關，default 當並列"
```

---

### Task 7: 入分版顯示極限次數

**Files:**
- Modify: `src/ui/Console.tsx`（`Side` 嘅 props 同 render、兩個 `<Side>` 嘅 caller）
- Modify: `src/ui/styles/app.css:659-663`（`.side__togo` 附近加 `.side__xt`）、`:739-751`（`.rlog__item` 附近加 `.rlog__item--x`）

**Interfaces:**
- Consumes: Task 1 嘅 `xtremeInMatch` / `xtremeWins`
- Produces: 冇新 API

- [ ] **Step 1: 算個數，傳落 `Side`**

`src/ui/Console.tsx`：

檔頂 import 加 `xtremeInMatch`、`xtremeWins`（跟返檔案本身 `from '../engine/rules'` 嗰個 import block）。

喺兩個 `<Side>` 上面（`<div className="arena">` 之前）加：

```tsx
  /*
    名下面嗰個極限次數，數嘅係**打緊呢場所屬階段**嗰批場次 —— 即係永遠等於
    你而家排緊嗰張表入面嗰個數：小組場對排名表，加賽場對加賽表。
    淘汰賽冇排名表，所以唔出。

    加賽仲要夾埋「同一次加賽」。加賽場次 id 係「tb<組>r<次>m<場>」，
    去到最後一個 m 之前嗰橛就係嗰次加賽嘅 prefix。唔夾嘅話第 2 次加賽
    會撈埋第 1 次嘅數落去。
  */
  const xtScope: Match[] | null = (() => {
    if (match.stage === 'bracket') return null
    const same = tournament.matches.filter((m) => m.stage === match.stage)
    if (match.stage !== 'tiebreak') return same
    const attemptOf = (id: string) => id.slice(0, id.lastIndexOf('m'))
    return same.filter((m) => attemptOf(m.id) === attemptOf(match.id))
  })()
```

兩個 `<Side>` 各自加三個 prop。藍邊：

```tsx
          <Side
            tone="blue"
            label="藍邊"
            name={nameOf(match.aId)}
            score={score.a}
            rounds={match.rounds}
            playerId={match.aId}
            locked={winnerId !== null || needsConfirm}
            meterMax={meterMax}
            xtDone={xtScope === null || match.aId === null ? null : xtremeWins(xtScope, match.aId)}
            xtLive={match.aId === null ? 0 : xtremeInMatch(match, match.aId)}
            settled={winnerId !== null}
            onRecord={record}
          />
```

紅邊一模一樣，`match.aId` 換 `match.bId`、`score.a` 換 `score.b`、`tone`/`label` 換紅邊嗰對。

**點解要 `settled`：** `xtScope` 包含打緊呢場，但 `xtremeWins` 唔數未打完嘅場，所以打緊嗰陣唔會重覆計。一打完，主數即刻食咗呢場，但 `xtLive` **唔會**變返 0（佢數嘅係 round，唔理場次完未）。所以要有個「呢場打完咗未」嘅訊號嚟收起 `+N`。唔可以用 `togo === 0` 代替 —— 輸嗰邊 `togo` 永遠唔會係 0，佢個 `+N` 就會賴死唔走，變成重覆計。

- [ ] **Step 2: `Side` 出個數**

`src/ui/Console.tsx` 嘅 `Side`，props type 入面 `meterMax` 後面加：

```tsx
  /** 呢個階段已經入咗數嘅極限次數。null = 唔顯示（淘汰賽）。 */
  xtDone: number | null
  /** 呢場暫時打咗幾多次極限。 */
  xtLive: number
  /** 呢場打完咗未。打完咗就唔好再出 `+N`，因為 `xtDone` 已經食咗佢。 */
  settled: boolean
```

同埋 destructure 嗰度加 `xtDone,`、`xtLive,`、`settled,`。

`Side` 入面，`.side__togo` 嗰個 `<div>` 後面加：

```tsx
        <div className="side__togo">{togo === 0 ? '贏咗' : `仲爭 ${togo} 分`}</div>

        {/*
          極限勝出次數。前面嗰個係已經入咗數嘅（同排名表一模一樣），
          後面淡色嗰個係呢場暫時打咗幾多次 —— 呢場打完，後面消失、前面加上去。
          唔可以加埋做一個數，否則入分版同排名表會出兩個唔同數。
        */}
        {xtDone !== null && (
          <div className="side__xt">
            <span aria-hidden="true">⚡</span>
            <span className="u-tab">{xtDone}</span>
            {!settled && xtLive > 0 && <span className="side__xt-live u-tab">+{xtLive}</span>}
            <span className="sr-only">
              極限勝出次數 {xtDone} 次{!settled && xtLive > 0 ? `，呢場仲有 ${xtLive} 次` : ''}
            </span>
          </div>
        )}
```

- [ ] **Step 3: `.rlog` 極限標實**

`src/ui/Console.tsx` 嘅 `.rlog` 那段（`mine.map`）改成：

```tsx
            {mine.map((r, i) => (
              <span
                className={`rlog__item${r.finish === 'xtreme' ? ' rlog__item--x' : ''}`}
                key={i}
              >
                {r.finish === 'xtreme' && <span aria-hidden="true">⚡</span>}
                {FINISH_LABEL[r.finish]}
                <span className="rlog__pts u-tab">{FINISH_POINTS[r.finish]}</span>
              </span>
            ))}
```

- [ ] **Step 4: CSS**

`src/ui/styles/app.css`，`.side__togo`（line 659-663）後面加：

```css
/*
 * 極限勝出次數。前面係已入數嘅（同排名表一樣），後面淡色嗰個係呢場暫時打咗幾多次。
 * 兩個數分開擺，就唔會同排名表打交。
 */
.side__xt {
  display: flex;
  align-items: baseline;
  gap: 0.3em;
  margin-top: var(--sp-1);
  font-size: var(--step--1);
  font-variation-settings: 'wdth' 100, 'wght' 700;
}

.side--red .side__xt {
  justify-content: flex-end;
}

.side__xt-live {
  color: var(--ink-soft);
  font-variation-settings: 'wdth' 90, 'wght' 600;
}
```

`.rlog__pts`（line 749-751）後面加：

```css
/* 極限嗰粒標實 —— 佢係拆並列嘅關鍵，唔應該同轉贏一個樣。 */
.rlog__item--x {
  border-width: 2px;
  font-variation-settings: 'wdth' 95, 'wght' 800;
}
```

- [ ] **Step 5: 人手行一次**

Run: `npm run dev`

用一場循環賽：
1. 兩邊名下面出到 `⚡ 0`
2. 撳「極限」入一分 → 嗰邊變 `⚡ 0 +1`，`.rlog` 嗰粒有 ⚡ 而且粗過其他
3. 打完呢場 → 兩邊嘅 `+N` 都消失，贏嗰邊主數升到 `⚡ 1`
4. 去排名頁，「⚡」欄嗰個數同入分版主數一模一樣
5. 開一場純淘汰賽 → 入分版冇 `⚡` 嗰行

- [ ] **Step 6: 行測試同 build**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/ui/Console.tsx src/ui/styles/app.css
git commit -m "入分版出極限勝出次數，逐 round 嗰行標實極限"
```

---

## 收尾檢查

做完七個 task 之後：

- [ ] `npm test && npm run build` 全綠
- [ ] 開一場 4 個人嘅循環賽，砌到 A/B/C 三個 12 分回圈：閂選項見到三個並列第 1，開選項見到小循環拆到（或者照並列，睇內部數字）
- [ ] 開一場小組賽，出線位整個並列出嚟，確認加賽照排、加賽表有「⚡」欄
- [ ] 匯出一份備份、清 localStorage、再匯入 —— `headToHead` 保持住
- [ ] 攞一份**改動之前**匯出嘅舊備份匯入 —— 唔會報錯，`headToHead` 係閂
