# 砌隊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `#/team` 砌隊版：用零件資料庫砌 3／4 隻陀螺一隊（同隊零件唔准重複），成品出分享卡 PNG／文字，三粒掣 Share／Copy／Download。

**Architecture:** 純前端、唔存嘢。純邏輯（隊伍模型、重複規則、文字輸出）喺 `src/lib/team.ts`；canvas 出卡喺 `src/lib/teamCard.ts`；UI 一個 `src/ui/Team.tsx`（砌隊／成品兩個內部狀態）。零件資料重用現成 `usePartsData()`＋`searchBlades`／`searchParts`。

**Tech Stack:** React 19 + TypeScript + Vite，vitest。**唔加新 dependency。**

**Spec:** `docs/superpowers/specs/2026-08-12-team-builder-design.md`（必讀 —— 剝名規則、teamText 釘死格式、三粒掣 fallback 全部喺入面）

## Global Constraints

- 介面文字全部廣東話口語；註解跟 repo 風格（廣東話，寫「點解」）
- Commit message：`砌隊：<做咗乜>`；結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- **淨係 commit，唔好 push**
- 每個 task 完：`npx vitest run`＋`npx tsc --noEmit` 全綠先 commit
- 唔落 localStorage／sessionStorage（唯一例外：現成嘅零件資料 cache 係 `partsData.ts` 自己嘅事，唔關呢度）

---

### Task 1: 隊伍模型＋重複規則＋文字輸出（`src/lib/team.ts`）

**Files:**
- Create: `src/lib/team.ts`
- Test: `src/lib/team.test.ts`

**Interfaces (Produces):**

```ts
import type { BladeRow, PartRow } from './parts'

export interface Combo {
  blade: BladeRow | null
  ratchet: PartRow | null
  bit: PartRow | null
  assist: PartRow | null
}
export type TeamSize = 3 | 4
export interface Team { name: string; size: TeamSize; combos: Combo[] }
export type Slot = 'blade' | 'ratchet' | 'bit' | 'assist'

export function emptyTeam(size: TeamSize): Team
export function resizeTeam(team: Team, size: TeamSize): Team
export function bladeIdentity(name: string): string
export function takenKeys(team: Team, slot: Slot, except: number): Map<string, number>
export function isComplete(team: Team): boolean
export function teamText(team: Team): string
```

**規則全部喺 spec「重複規則」「資料模型」兩節，照跟。** 要點：
- `bladeIdentity`：斬第一個空格後所有嘢 → 再剝結尾顏色括號（半形 `()` 同全形 `（）` 都要；內容 1–2 隻字、隻隻喺 `綠紅藍黑黃紫白金青粉銀橙灰` 先剝；`(左)` 唔剝）
- `takenKeys`：slot='blade' 用 `bladeIdentity(blade.name)` 做 key，其他 slot 用 `part.name`；`except` 嗰隻 combo 跳過；空格（null）唔入 Map
- `teamText`：格式對全文（spec 有樣板）；3 隻＝`格式：3on3`，4 隻＝`格式：4隻禁1`；序號 ①②③④

- [ ] **Step 1: failing tests** —— fixture 用真名：

```ts
import { describe, expect, it } from 'vitest'
import { bladeIdentity, emptyTeam, isComplete, resizeTeam, takenKeys, teamText } from './team'
import type { BladeRow, PartRow } from './parts'

function blade(id: string, name: string): BladeRow {
  return { id, name, type: 'attack', tier: 'S', ratchet: '', bit: '', assist: '', source: '', img: '', combo: '' }
}
function part(name: string, kind: PartRow['kind']): PartRow {
  return { name, kind, tier: 'A', img: '' }
}

describe('bladeIdentity', () => {
  it('顏色版／金屬塗層／聯乘版都係同一件', () => {
    expect(bladeIdentity('魔導神杖')).toBe('魔導神杖')
    expect(bladeIdentity('魔導神杖 金屬塗層:燦金')).toBe('魔導神杖')
    expect(bladeIdentity('魔導神杖(綠)')).toBe('魔導神杖')
    expect(bladeIdentity('蒼穹龍騎士 金屬塗層:白色 日本職業足球聯盟版')).toBe('蒼穹龍騎士')
    expect(bladeIdentity('蒼龍爆刃 金屬塗層:珍珠白')).toBe('蒼龍爆刃')
  })
  it('(左) 係另一隻刃，唔剝', () => {
    expect(bladeIdentity('蒼穹龍騎士(左)')).toBe('蒼穹龍騎士(左)')
    expect(bladeIdentity('蒼穹龍騎士(黑)')).toBe('蒼穹龍騎士')
  })
  it('全形括號都認', () => {
    expect(bladeIdentity('魔導神杖（綠）')).toBe('魔導神杖')
  })
})

describe('takenKeys', () => {
  it('同名唔同型號嘅戰刃互斥；改緊嗰隻自己唔計', () => {
    const t = emptyTeam(3)
    t.combos[0].blade = blade('UX-03', '魔導神杖')
    t.combos[1].blade = blade('BXH-09', '魔導神杖 金屬塗層:燦金')
    const taken = takenKeys(t, 'blade', 2)
    expect(taken.get('魔導神杖')).toBe(0)   // 最早嗰隻
    expect(takenKeys(t, 'blade', 0).get('魔導神杖')).toBe(1)
  })
  it('固鎖照名對；空格唔阻人', () => {
    const t = emptyTeam(3)
    t.combos[0].ratchet = part('9-60', 'ratchet')
    expect(takenKeys(t, 'ratchet', 1).get('9-60')).toBe(0)
    expect(takenKeys(t, 'assist', 1).size).toBe(0)
  })
})

describe('隊伍', () => {
  it('resizeTeam 4→3 斬走第 4 隻，3→4 補空隻', () => {
    const t4 = emptyTeam(4)
    t4.combos[3].blade = blade('UX-01', '蒼龍爆刃')
    const t3 = resizeTeam(t4, 3)
    expect(t3.combos).toHaveLength(3)
    expect(resizeTeam(t3, 4).combos[3].blade).toBeNull()
  })
  it('isComplete：每隻要齊 戰刃+固鎖+軸心，輔助可以冇', () => {
    const t = emptyTeam(3)
    expect(isComplete(t)).toBe(false)
    for (const c of t.combos) {
      c.blade = blade('X', '乜刃'); c.ratchet = part('1-60', 'ratchet'); c.bit = part('R', 'bit')
    }
    expect(isComplete(t)).toBe(true)
  })
})

describe('teamText', () => {
  it('齊隊有名有輔助 —— 對全文', () => {
    const t = emptyTeam(3)
    t.name = '爆旋小隊'
    t.combos[0] = { blade: blade('UX-15-01', '鮫鯊狂鱗'), ratchet: part('4-50', 'ratchet'), bit: part('UF', 'bit'), assist: null }
    t.combos[1] = { blade: blade('CX-07', '天馬爆擊'), ratchet: part('9-70', 'ratchet'), bit: part('T', 'bit'), assist: part('W', 'assist') }
    t.combos[2] = { blade: blade('UX-03', '魔導神杖'), ratchet: part('5-70', 'ratchet'), bit: part('DB', 'bit'), assist: null }
    expect(teamText(t)).toBe(
      '《爆旋小隊》\n格式：3on3\n① 鮫鯊狂鱗 UX-15-01｜4-50｜UF\n② 天馬爆擊 CX-07｜9-70｜T｜輔助 W\n③ 魔導神杖 UX-03｜5-70｜DB\n——用「陀螺計分板」零件圖鑑砌\nhttps://samtang2014.github.io/Beyblade-scoreboard/',
    )
  })
  it('冇隊名就冇《》行；4 隻出「格式：4隻禁1」同 ④', () => {
    const t = emptyTeam(4)
    for (const c of t.combos) {
      c.blade = blade('X', '乜刃'); c.ratchet = part('1-60', 'ratchet'); c.bit = part('R', 'bit')
    }
    const text = teamText(t)
    expect(text.startsWith('格式：4隻禁1\n')).toBe(true)
    expect(text).toContain('④')
  })
})
```

（注意：test 入面同隊擺同名固鎖 `1-60` 係為咗簡化 fixture —— `teamText`／`isComplete` 唔驗重複，重複係揀盤層面靠 `takenKeys` 預防，呢個係 spec 講明嘅設計。）

- [ ] **Step 2:** `npx vitest run src/lib/team.test.ts` —— FAIL
- [ ] **Step 3:** 實作 `src/lib/team.ts`
- [ ] **Step 4:** 跑 —— 全綠
- [ ] **Step 5:** Commit：`砌隊：隊伍模型、零件唔准重複規則、文字輸出`

---

### Task 2: 分享卡 canvas（`src/lib/teamCard.ts`）

**Files:**
- Create: `src/lib/teamCard.ts`
- Modify: `src/lib/download.ts`（睇吓現有 `downloadJson` 點做，加個 `downloadBlob(filename: string, blob: Blob): void` 跟同一套路）

**Interfaces:**
- Consumes: Task 1 嘅 `Team`／`isComplete`
- Produces: `export async function renderTeamCard(team: Team): Promise<Blob>`

**要求（spec「分享卡」節）：**
- 1080×1350 canvas，PNG blob 輸出（`canvas.toBlob`，null 就 throw）
- 深色底跟 app 深色版感覺（近黑 `#0c0d12` 一類、金色 `#ffc046` 做隊名／序號重點；直接寫死色值 —— canvas 讀唔到 CSS token，喺註解講明對應邊個 token）
- 每隻陀螺一行：左邊戰刃圖（`new Image()`＋`crossOrigin='anonymous'`，load fail 或者 timeout 5 秒就畫灰格）、右邊戰刃名＋型號大字、下面固鎖／軸心／輔助細字
- 底部：`陀螺計分板 · 零件圖鑑`＋網址細字
- 隊名冇就出「我隊陀螺」
- 全部圖並行 load（`Promise.all`），individual fail 唔可以拖冧成張卡

呢個 module 冇 unit test（node 冇 canvas）——下面 Task 4 人手驗。TypeScript 要過。

- [ ] **Step 1:** 實作
- [ ] **Step 2:** `npx tsc --noEmit` 過
- [ ] **Step 3:** Commit：`砌隊：canvas 出分享卡`

---

### Task 3: 路由＋主頁掣＋砌隊版 UI

**Files:**
- Modify: `src/lib/router.ts`（Route 加 `{ name: 'team' }`；parseHash 認 `#/team`，跟 `#/parts` 嘅做法）
- Modify: `src/lib/router.test.ts`（加 case）
- Modify: `src/ui/App.tsx`（route team → `<Team />`）
- Modify: `src/ui/Home.tsx`（hero 掣排「零件圖鑑」隔離加 `<a className="btn btn--big chamfer" href="#/team">砌隊</a>`）
- Create: `src/ui/Team.tsx`
- Modify: `src/ui/styles/app.css`

**Interfaces:**
- Consumes: Task 1 全部、`usePartsData()`、`searchBlades`／`searchParts`／`PartsFilter`（`parts.ts`）、`Parts.tsx` 入面嗰款全局頂欄做法（睇 `GlobalBar`，砌隊版自己起一個標題「砌隊」嘅）

**砌隊版內容（spec「用戶流程」「一隻陀螺」「重複規則」「唔存嘢」節）：**
- 格式切換：3 隻｜4 隻（chip 兩粒；轉細會斬走第 4 隻 —— 第 4 隻有嘢嗰陣要 confirm 先斬，用 inline 確認唔好用 window.confirm）
- 隊名 input（placeholder「隊名（出卡會顯示）」）
- 每隻陀螺一張卡：四個格掣（戰刃／固鎖／軸心／輔助戰刃），有嘢就顯示名＋細圖，撳開揀盤
- 揀盤：inline 展開（唔好 modal），一個搜尋欄＋階級 chip（戰刃格加埋類型 chip），項目 grid 重用零件版 `.pcard` 樣式；`takenKeys` 入面有嘅項目 disabled＋標「第 N 隻用咗」；輔助格頭位有粒「唔要輔助」清空
- 「出卡」掣：`isComplete` 先 enable，disabled 嗰陣句仔講爭啲乜（搵第一隻未齊嘅：「第 2 隻仲爭軸心」）
- 一句提：「呢度唔會存底 —— 砌完記得出卡帶走。」
- 零件資料 loading／error 處理照零件版做法（重用 `usePartsData` state）

- [ ] **Step 1:** router test 加 `#/team` case，跑 FAIL，改 `router.ts` 到綠
- [ ] **Step 2:** Home 掣＋App 接線＋`Team.tsx` 砌隊 view＋CSS
- [ ] **Step 3:** `npx tsc --noEmit`＋`npx vitest run` 全綠
- [ ] **Step 4:** `npm run dev` 人手行：砌齊 3 隻（試撞零件 —— 用咗嘅要 disabled）、轉 4 隻再轉返 3、輔助留空
- [ ] **Step 5:** Commit：`砌隊：主頁入口、砌隊版、揀盤唔俾重複零件`

---

### Task 4: 成品版三粒掣＋README＋收尾

**Files:**
- Modify: `src/ui/Team.tsx`（加 result view）
- Modify: `README.md`

**成品版（spec「成品版三粒掣」節，fallback 全跟嗰張表）：**
- 撳「出卡」→ `renderTeamCard` → blob object URL 入 `<img>` 預覽（換卡／unmount 要 `URL.revokeObjectURL`）；render 期間出「整緊張卡…」
- 三粒掣：Share（`navigator.canShare({files})` 先驗，fallback share 文字，桌面冇 `navigator.share` 就收起）、Copy（`clipboard.writeText(teamText)`，成功出「copy 咗」，失敗彈段文字俾人手動）、Download（`downloadBlob`，檔名 `<隊名>-陀螺隊.png`，冇名 `我隊陀螺.png`）
- 「返去改」掣返砌隊 view（隊伍 state 保留 —— 兩個 view 同一個 component 嘅 state）
- README：畫面表加 `#/team` 一行＋「砌隊」一段（規則、三粒掣、唔存嘢）；測試總數兩處更新（跑 `npx vitest run` 攞真數）

- [ ] **Step 1:** 實作 result view
- [ ] **Step 2:** 人手驗：出卡見到圖（戰刃相有出）、Copy 文字啱格式、Download 檔名啱；斷網再出卡 —— 灰格頂住照出
- [ ] **Step 3:** README 改埋
- [ ] **Step 4:** `npx tsc --noEmit`＋`npx vitest run`＋`npm run build` 三個全過；`grep -n "個測試" README.md` 兩處係新數
- [ ] **Step 5:** Commit：`砌隊：成品版 share／copy／download，README 補返`
