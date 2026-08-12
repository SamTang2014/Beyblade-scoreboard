# 零件搜尋版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 頂欄加「零件」tab，搜尋一張公開 Google Sheet 嘅 Beyblade X 零件資料庫（戰刃＋固鎖＋軸心＋輔助戰刃），打字搜＋chip 篩選。

**Architecture:** 純前端。開版時 browser 直接 fetch 兩個 gviz CSV endpoint（已實測 CORS 通），解析成 typed rows，localStorage 做 stale-while-revalidate cache。純邏輯（CSV 解析、搜尋、篩選）擺 `src/lib/parts.ts`；fetch＋cache＋hook 擺 `src/lib/partsData.ts`；UI 擺 `src/ui/Parts.tsx`。

**Tech Stack:** React 19 + TypeScript + Vite，vitest。**唔加任何新 dependency。**

**Spec:** `docs/superpowers/specs/2026-08-12-parts-search-design.md`（讀咗先開工，入面有實測過嘅 CSV 陷阱）

## Global Constraints

- 介面文字全部廣東話口語（唔係書面語）。零件叫法跟張 sheet：戰刃／固鎖／軸心／輔助戰刃
- 註解風格跟 repo 現有：廣東話，寫「點解」唔寫「做乜」，淨係寫 code 本身睇唔出嘅限制
- Commit message 風格跟 git log：`零件版：<做咗乜>`，一句廣東話
- **淨係 commit，唔好 push**
- 每個 task 完成後跑 `npx vitest run` 同 `npx tsc --noEmit`（repo script：`npm test` / `npm run typecheck`），全綠先 commit
- 資料源 spreadsheet id：`1TBHOpcsv25bBfWERq14CBIy4P1G7j-qpPhmclx_nTWI`

---

### Task 1: CSV 解析＋row mapping（`src/lib/parts.ts`）

**Files:**
- Create: `src/lib/parts.ts`
- Test: `src/lib/parts.test.ts`

**Interfaces (Produces):**

```ts
export interface BladeRow {
  id: string; name: string; type: string; tier: string
  ratchet: string; bit: string; assist: string
  source: string; img: string; combo: string
}
export interface PartRow {
  name: string; kind: 'ratchet' | 'bit' | 'assist'; tier: string; img: string
}
/** 解 CSV 做二維陣列。要食到：引號欄、引號內嵌逗號、內嵌換行、"" 轉義、CRLF。 */
export function parseCsv(raw: string): string[][]
/** database tab → BladeRow[]。必要欄 header 搵唔到就 return null（俾上層當 fetch 失敗）。 */
export function parseBlades(rows: string[][]): BladeRow[] | null
/** 零件圖鑑 tab → PartRow[]。同上。 */
export function parseParts(rows: string[][]): PartRow[] | null
```

**規則（spec 有詳細）：**
- 欄位對位用 header 文字 `startsWith`，唔用死位置。Blades 必要欄（header 起頭）：`型號`、`中文名稱`、`類型`、`階級`、`原裝固鎖`、`原裝軸心`、`原裝輔助戰刃`、`來源產品`、`圖片網址`、`建議配置`。注意 assist 欄 header 喺 sheet 度係斷咗嘅 `原裝輔助戰刃 (Assist Blade`（冇閂括號）——所以先要用 startsWith。
- Parts 必要欄：`原裝固鎖、軸心`（名）、`分類`、`圖片網址`、`階級`。
- Blades：型號空嘅行剷走（sheet 有 70 行 placeholder）。Parts：名空嘅行剷走；`分類` 唔係 ratchet/bit/assist 嘅行剷走。
- 所有欄 trim。

- [ ] **Step 1: 寫 failing tests** —— fixture 用真實行（下面全部係 sheet 真實資料形狀）：

```ts
import { describe, expect, it } from 'vitest'
import { parseBlades, parseCsv, parseParts } from './parts'

const BLADE_HEADER =
  '"型號 (ID)","中文名稱 (Name)","分類 (Category)","類型 (Type)","階級 (Tier)","購買建議 (Buy)","原裝固鎖 (Ratchet)","固鎖階級 (Ratchet Tier)","原裝軸心 (Bit)","軸心階級 (Bit Tier)","原裝輔助戰刃 (Assist Blade","來源產品 (Source)","圖片網址 (Img)","建議配置 (Combo)","2026/08/12 14:56",""'

describe('parseCsv', () => {
  it('引號欄、內嵌逗號、內嵌換行、"" 轉義都食到', () => {
    const raw = '"a","b,c","d\ne","f""g"\r\nplain,2,3,4\n'
    expect(parseCsv(raw)).toEqual([
      ['a', 'b,c', 'd\ne', 'f"g'],
      ['plain', '2', '3', '4'],
    ])
  })
})

describe('parseBlades', () => {
  it('齊欄嘅真實行解到晒每一欄', () => {
    const raw = [
      BLADE_HEADER,
      '"UX-15-01","鮫鯊狂鱗","blade","attack","S+","","4-50","","UF","","","UX-15 鮫鯊狂鱗改造組","https://i.ibb.co/x/a.png","固鎖：1-60 / 1-70, UF | 軸心：K / L","",""',
    ].join('\n')
    const out = parseBlades(parseCsv(raw))!
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      id: 'UX-15-01', name: '鮫鯊狂鱗', type: 'attack', tier: 'S+',
      ratchet: '4-50', bit: 'UF', assist: '',
      source: 'UX-15 鮫鯊狂鱗改造組', img: 'https://i.ibb.co/x/a.png',
      combo: '固鎖：1-60 / 1-70, UF | 軸心：K / L',
    })
  })

  it('建議配置有內嵌換行照解（CX-07 真實情況）', () => {
    const raw = [
      BLADE_HEADER,
      '"CX-07","天馬爆擊","blade","attack","S+","","","","Tr","","A","","https://i.ibb.co/x/b.png","固鎖：7-60, 輔助W\n冠軍配置：9-70, 輔助W, T","",""',
    ].join('\n')
    const out = parseBlades(parseCsv(raw))!
    expect(out[0].combo).toBe('固鎖：7-60, 輔助W\n冠軍配置：9-70, 輔助W, T')
    expect(out[0].assist).toBe('A')
    expect(out[0].ratchet).toBe('')
  })

  it('空型號嘅 placeholder 行剷走', () => {
    const raw = [BLADE_HEADER, '"","","","","-","","","","","","","","","","",""'].join('\n')
    expect(parseBlades(parseCsv(raw))).toEqual([])
  })

  it('必要欄唔見咗 return null', () => {
    const raw = '"型號 (ID)","中文名稱 (Name)"\n"UX-01","蒼龍爆刃"'
    expect(parseBlades(parseCsv(raw))).toBeNull()
  })
})

describe('parseParts', () => {
  const HEADER = '"原裝固鎖、軸心","分類 (Category)","圖片網址 (Img)","階級 (Tier)","","2026/05/22 0:45",""'
  it('ratchet/bit/assist 三種都解到，其他分類剷走', () => {
    const raw = [
      HEADER,
      '"0-60","ratchet","https://i.ibb.co/x/r.webp","A"',
      '"UF","bit","https://i.ibb.co/x/u.webp","S"',
      '"A","assist","https://i.ibb.co/x/s.webp","B"',
      '"junk","other","https://x","C"',
      '"","ratchet","https://x","A"',
    ].join('\n')
    expect(parseParts(parseCsv(raw))).toEqual([
      { name: '0-60', kind: 'ratchet', tier: 'A', img: 'https://i.ibb.co/x/r.webp' },
      { name: 'UF', kind: 'bit', tier: 'S', img: 'https://i.ibb.co/x/u.webp' },
      { name: 'A', kind: 'assist', tier: 'B', img: 'https://i.ibb.co/x/s.webp' },
    ])
  })
  it('必要欄唔見咗 return null', () => {
    expect(parseParts(parseCsv('"乜都唔係","x"\n"0-60","ratchet"'))).toBeNull()
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/parts.test.ts` —— 預期 FAIL（module 未有）
- [ ] **Step 3:** 實作 `src/lib/parts.ts`（純函數，唔掂 DOM／fetch）
- [ ] **Step 4:** `npx vitest run src/lib/parts.test.ts` —— 全綠
- [ ] **Step 5:** Commit：`零件版：CSV 解析同 row mapping`

---

### Task 2: 搜尋＋篩選邏輯（`src/lib/parts.ts` 加落去）

**Files:**
- Modify: `src/lib/parts.ts`
- Test: `src/lib/parts.test.ts`（加 describe）

**Interfaces (Produces):**

```ts
export type KindFilter = 'all' | 'blade' | 'ratchet' | 'bit' | 'assist'
export type TypeFilter = 'all' | 'attack' | 'defense' | 'stamina' | 'balance'
export type GradeFilter = 'all' | 'X' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'unrated'
export interface PartsFilter { kind: KindFilter; type: TypeFilter; grade: GradeFilter }

/** tier 字串 → 級別字頭。'' 同 '-' 係 'unrated'；'S+'→'S'。 */
export function gradeOf(tier: string): Exclude<GradeFilter, 'all'>
export function searchBlades(blades: BladeRow[], query: string, f: PartsFilter): BladeRow[]
export function searchParts(parts: PartRow[], query: string, f: PartsFilter): PartRow[]
```

**規則：**
- query trim＋toLowerCase，空 query 全 match。
- 戰刃 match 欄：id、name、ratchet、bit、assist（substring，唔分大細寫）。零件 match 欄：name。
- `searchBlades`：`f.kind` 唔係 `all`／`blade` → 回 `[]`。
- `searchParts`：`f.kind === 'blade'` 或 `f.type !== 'all'` → 回 `[]`（類型係戰刃專屬，揀咗類型即係睇緊戰刃）；`f.kind` 係 ratchet/bit/assist 就淨出嗰種。
- grade：`f.grade === 'all'` 全過，否則 `gradeOf(tier) === f.grade`。
- 次序保持入嚟嘅次序（sheet 次序）。

- [ ] **Step 1: 寫 failing tests。**最少覆蓋：
  - 搜 `9-60` match 到 ratchet `9-60` 本身＋原裝固鎖係 `9-60` 嘅戰刃；搜 `ux-15` 唔分大細寫 match `UX-15-01`
  - `gradeOf('S+')==='S'`、`gradeOf('X')==='X'`、`gradeOf('-')==='unrated'`、`gradeOf('')==='unrated'`
  - `f.grade='S'` 出 S 同 S+，唔出 A
  - `f.kind='bit'` 時 `searchBlades` 回 `[]`，`searchParts` 淨出 bit
  - `f.type='attack'` 時 `searchParts` 回 `[]`，`searchBlades` 淨出 attack
  - 空 query＋全 `all` 出晒全部
- [ ] **Step 2:** 跑 —— FAIL
- [ ] **Step 3:** 實作
- [ ] **Step 4:** 跑 —— 全綠
- [ ] **Step 5:** Commit：`零件版：搜尋同篩選邏輯`

---

### Task 3: fetch＋cache＋hook（`src/lib/partsData.ts`）

**Files:**
- Create: `src/lib/partsData.ts`
- Test: `src/lib/partsData.test.ts`

**Interfaces:**
- Consumes: Task 1 嘅 `parseCsv` / `parseBlades` / `parseParts`
- Produces:

```ts
export interface PartsData { at: number; blades: BladeRow[]; parts: PartRow[] }
export function readCache(): PartsData | null   // localStorage 'beyblade-scoreboard/parts-cache'；壞 JSON／唔似樣 → null
export function writeCache(d: PartsData): void  // quota 爆咗吞咗佢（同 repo 現有 storage 做法一致，唔好 crash）
export async function fetchPartsData(now: number): Promise<PartsData>  // 兩個 tab 一齊拉（Promise.all），任何一邊 fail／parse null 就 throw
export type PartsState = 'loading' | 'fresh' | 'stale' | 'error'
export function usePartsData(): { data: PartsData | null; state: PartsState; retry: () => void }
```

**規則：**
- URL（spec 實測過）：
  - `https://docs.google.com/spreadsheets/d/1TBHOpcsv25bBfWERq14CBIy4P1G7j-qpPhmclx_nTWI/gviz/tq?tqx=out:csv&gid=101080139`
  - 同 base，`&sheet=` + `encodeURIComponent('零件圖鑑')`
- `usePartsData` 行為：mount 時 `readCache()` 即出（有就 `data` 即有嘢），同時 `fetchPartsData(Date.now())`；成功 → `data` 換新＋`writeCache`＋state `fresh`；失敗＋有 data → `stale`；失敗＋冇 data → `error`。`retry()` 由 `error`／`stale` 再拉。unmount 之後嘅 setState 要守（跟 repo 現有 hook 做法，用個 flag／AbortController）。
- 測試淨測 `readCache`／`writeCache`（round-trip、壞 JSON、唔啱 shape → null）同 `fetchPartsData`（stub `fetch`：兩邊成功、一邊 404、一邊 header 唔啱 → throw）。hook 唔使 unit test（UI task 會有 smoke test）。測試點 stub localStorage／fetch，跟 `src/lib/theme.test.ts` 同 repo 現有測試嘅做法。

- [ ] **Step 1:** 寫 failing tests（上面範圍）
- [ ] **Step 2:** 跑 —— FAIL
- [ ] **Step 3:** 實作
- [ ] **Step 4:** 跑 —— 全綠
- [ ] **Step 5:** Commit：`零件版：sheet 資料拉取同快取`

---

### Task 4: 路由＋頂欄 tab＋零件版 UI

**Files:**
- Modify: `src/lib/router.ts`（Route union 加 `{ name: 'parts'; id: string }`；`SUB` map 加 `parts`）
- Modify: `src/lib/router.test.ts`（加 `#/t/abc/parts` 解析 case，跟現有 case 寫法）
- Modify: `src/ui/components/TopBar.tsx`（`TabName` 加 `'parts'`；`TABS` 喺「電視」後面加 `{ name: 'parts', label: '零件' }`；`tabsFor` 嘅 knockout 過濾加埋 `parts` —— 純淘汰都要見到）
- Modify: `src/ui/App.tsx`（route `parts` → `<Parts key={route.id} id={route.id} />`）
- Create: `src/ui/Parts.tsx`
- Modify: `src/ui/styles/app.css`（零件版樣式）

**Interfaces:**
- Consumes: Task 2 嘅 search／filter、Task 3 嘅 `usePartsData`、現有 `useTournament`／`TopBar`／`NotFound`（睇 `src/ui/Schedule.tsx` 嘅結構照辦）

**`Parts.tsx` 內容（跟 spec UI 章節）：**
- `useTournament(id)`，`null` → `<NotFound />`；`<TopBar id name current="parts" mode={tournament.mode} />`
- 搜尋欄（`<input type="search">`，placeholder 例：`搵零件：名／型號／固鎖／軸心`）
- 三排 chip（單選，樣式重用現有 chip class，睇 `Theme.tsx`／app.css 現有款）：種類（全部｜戰刃｜固鎖｜軸心｜輔助戰刃）、類型（全部｜攻擊｜防禦｜持久｜平衡）、階級（全部｜X｜S｜A｜B｜C｜D｜E｜未評）。種類揀咗固鎖/軸心/輔助戰刃嗰陣，類型排收起（display none 定唔 render 都得——揀咗類型再轉種類要 reset type 做 all，唔好靜靜哋 AND 埋隱藏咗嘅條件）
- 結果：「搵到 N 件」；戰刃卡排先零件卡跟後；戰刃卡撳落去展開（原裝固鎖/軸心/輔助戰刃、來源產品、建議配置 `white-space: pre-wrap`）；零件卡淨係圖＋名＋種類＋階級
- 全部 `<img loading="lazy">`，固定圖格尺寸（唔好 load 完跳版）；`alt` 用零件名
- 狀態畫面：loading（冇 data）→「攞緊零件資料…」；error →「攞唔到零件資料」＋「再試」掣；stale → 資料照出＋一行提示「用緊 N 日前嘅資料」（`Math.floor((Date.now()-at)/86400000)`，0 日顯示「今日」）；類型英文→中文 label 對照跟 spec
- 空結果 →「冇零件夾呢個搜尋」

- [ ] **Step 1:** router test 加 case，跑 —— FAIL
- [ ] **Step 2:** 改 `router.ts`，跑 —— 綠
- [ ] **Step 3:** 改 `TopBar.tsx`＋`App.tsx`＋寫 `Parts.tsx`＋CSS
- [ ] **Step 4:** `npx tsc --noEmit`＋`npx vitest run` 全綠
- [ ] **Step 5:** `npm run dev` 開 `#/t/<求其一個場id>/parts` 手動行一次：搜「9-60」、篩「攻擊＋S」、撳卡展開、轉深色主題睇卡樣（用 headless screenshot 驗都得；**注意 repo 已知陷阱：headless Chrome `--window-size` 低過 500px 會靜靜哋render 500px，窄芒要用 iframe 方法，見 memory**）
- [ ] **Step 6:** Commit：`零件版：頂欄新 tab，搜尋加篩選，資料嚟自零件資料庫 sheet`

---

### Task 5: 頂欄斷點＋README＋收尾

**Files:**
- Modify: `src/ui/styles/app.css`（topbar 摺行斷點 `40rem` → `44rem`——7 個 tab 要 ~695px；搵 `40rem` 嗰個 media block）
- Modify: `README.md`（功能介紹加一句零件搜尋版；「432 個測試」兩處數字更新做新總數——跑 `npx vitest run` 睇最尾行攞真數）

- [ ] **Step 1:** 改斷點＋README
- [ ] **Step 2:** `npx tsc --noEmit`、`npx vitest run`、`npm run build` 三個全過
- [ ] **Step 3:** grep README 確認冇留低舊測試數（`grep -n "個測試" README.md` 兩處都係新數）
- [ ] **Step 4:** Commit：`零件版：頂欄斷點調闊，README 補返`
