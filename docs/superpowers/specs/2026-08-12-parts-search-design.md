# 零件搜尋版 — 設計

日期：2026-08-12
狀態：用戶已批（頂欄加 tab、搜齊戰刃＋固鎖＋軸心、打字＋篩選掣）

## 目標

喺計分 app 加一個「零件」版：打完場波有人想查「鮫鯊狂鱗係咩 tier、原裝配咩軸心」、
「9-60 呢個固鎖係咩級」——喺場內頂欄撳一下就查到。資料來自一張公開嘅 Google Sheet
零件資料庫，本 app 淨係讀，唔寫。

## 資料來源

Spreadsheet id：`1TBHOpcsv25bBfWERq14CBIy4P1G7j-qpPhmclx_nTWI`（第三方維護嘅
Beyblade X 零件資料庫，「有 link 就睇得」）。用兩個 tab：

| Tab | 內容 | fetch 方式 |
|---|---|---|
| `beyblade_x_database`（gid=101080139） | 275 隻戰刃：型號、中文名、類型、階級、原裝固鎖/軸心/輔助戰刃、來源產品、圖、建議配置 | gviz CSV，用 gid |
| `零件圖鑑` | 固鎖 36＋軸心 54＋輔助戰刃 18：名、分類、圖、階級 | gviz CSV，用 tab 名（呢個 tab 嘅 gid 攞唔到） |

Endpoint 格式（已實測 2026-08-12，兩個都返 200 + CORS `access-control-allow-origin`）：

```
https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&gid=101080139
https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&sheet=<encodeURIComponent('零件圖鑑')>
```

**已知脆位（接受）：** 張 sheet 唔係我哋控制。owner 改 tab 名（`零件圖鑑` 用名 fetch）、
改欄名、鎖權限，個功能就退化到淨係用 cache。錯誤處理章節寫明退化行為。

**CSV 格式陷阱（已實測）：** gviz 輸出全欄有引號；「建議配置」欄有內嵌逗號**同換行**
（例：CX-07 天馬爆擊行）；database tab 有 70 行空 ID 嘅 placeholder 行（階級欄係 `-`），
要剷走。

## 資料模型

```ts
export interface BladeRow {
  id: string        // 型號，例 UX-15-01
  name: string      // 中文名稱
  type: string      // attack | stamina | defense | balance | special | ''
  tier: string      // X | S+ | S | A+ | ... | E | D | '-'
  ratchet: string   // 原裝固鎖，例 4-50；可以空
  bit: string       // 原裝軸心，例 UF；可以空
  assist: string    // 原裝輔助戰刃；多數空
  source: string    // 來源產品
  img: string       // 圖片 URL（i.ibb.co）
  combo: string     // 建議配置，可能有換行
}

export interface PartRow {
  name: string                          // 例 0-60 / UF / A
  kind: 'ratchet' | 'bit' | 'assist'
  tier: string
  img: string
}
```

欄位對位用 header 文字（`startsWith('型號')` 呢類），唔用死位置 —— sheet 加減欄
唔會讀錯欄。header 對唔上（搵唔到必要欄）當 fetch 失敗處理。

## 快取

- localStorage key：`beyblade-scoreboard/parts-cache`，內容 `{ at: number, blades: BladeRow[], parts: PartRow[] }`
- Stale-while-revalidate：開版即刻用 cache 出畫面，同時背後拉新資料，返到就更新畫面＋cache
- 拉唔到而有 cache：照用，畫面標明「用緊 N 日前嘅資料」（唔夠一日顯示「今日」）
- 拉唔到又冇 cache：錯誤畫面＋「再試」掣
- cache JSON 壞咗當冇 cache

## UI

### 入口同路由

- 頂欄（TopBar）加第 7 個 tab「零件」，擺喺「電視」後面
- Route：`#/t/<場id>/parts`（hash routing 現有格局）
- **所有賽制都見到**呢個 tab，包括純淘汰（`tabsFor` 嘅 knockout 過濾要加 parts）
- 頂欄摺行斷點由 40rem 加到 44rem（7 個 tab 需要 ~695px）
- 主頁唔加入口（用戶揀咗頂欄 tab；日後想加係一行嘢）

### 搜尋

- 一個搜尋欄，唔分大細寫，trim 後 substring match
- 戰刃 match：型號、中文名、原裝固鎖、原裝軸心、原裝輔助戰刃
- 零件 match：名
- 例：搜「9-60」→ 見到 9-60 呢個固鎖本身＋所有原裝配 9-60 嘅戰刃

### 篩選（同搜尋欄 AND 埋一齊）

三排 chip，每排單選：

1. **種類**：全部｜戰刃｜固鎖｜軸心｜輔助戰刃
2. **類型**（淨係戰刃有）：全部｜攻擊｜防禦｜持久｜平衡 —— 揀咗任何一個非「全部」，非戰刃自動唔出
3. **階級**：全部｜X｜S｜A｜B｜C｜D｜E｜未評 —— 按字頭 match（揀 S 出 S+ 同 S），「未評」= tier 係 `-` 或空

類型英文→介面文字：attack→攻擊、defense→防禦、stamina→持久、balance→平衡、special→特殊。

### 結果

- 結果數：「搵到 N 件」
- 次序照 sheet 原本次序（sheet 本身大致按階級排好）；戰刃排先，零件跟後
- 戰刃卡：圖＋中文名＋型號＋階級 badge＋類型；撳落去展開：原裝固鎖/軸心/輔助戰刃、來源產品、建議配置（保留換行 pre-wrap）
- 零件卡：圖＋名＋種類（固鎖/軸心/輔助戰刃）＋階級 badge
- 圖片全部 `loading="lazy"`（成 400 張，唔可以一次過拉晒）＋固定格位（唔好 load 完跳版）
- 空結果：「冇零件夾呢個搜尋」＋清返篩選嘅提示

### 主題

用現有 tokens（含 `.is-dark`），跟晒現有卡片／chip 風格，唔開新色。

## 錯誤處理

| 情況 | 行為 |
|---|---|
| 拉緊 | 有 cache：即出舊資料；冇 cache：載入中畫面 |
| 拉唔到，有 cache | 出舊資料＋「用緊 N 日前嘅資料」提示 |
| 拉唔到，冇 cache | 錯誤畫面＋「再試」掣 |
| CSV header 對唔上 | 當拉唔到處理（即係用 cache／錯誤畫面） |
| 圖片死 link | browser 自然 broken image，格位固定唔跳版 |
| 場 id 唔存在 | 照現有版嘅做法出 `NotFound` |

## 測試

- CSV 解析：引號、內嵌逗號、**內嵌換行**、兩款 header 對位、剷空 ID 行 —— fixture 用真實行
- 搜尋／篩選：唔分大細寫、固鎖/軸心 match 到戰刃、階級字頭 match、未評、種類×類型交互
- 快取：讀寫 round-trip、壞 JSON 當冇
- 照舊：typecheck、全部測試、build；README 測試數目（兩處）要跟住更新

## 明確唔做

- 唔寫 sheet（純讀）
- 唔搜「零件各版本款」（612 個顏色版）同「分享卡主題」「公告」tab
- 唔做排序切換（照 sheet 次序）
- 主頁唔加入口
- 唔做 build 時快照（sheet 成日更新，即場拉先跟得上）
