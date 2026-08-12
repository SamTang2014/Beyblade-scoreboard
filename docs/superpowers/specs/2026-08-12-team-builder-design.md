# 砌隊 — 設計

日期：2026-08-12
狀態：用戶已批（逐格揀、成品版三粒掣 share/copy/download、有隊名、唔存嘢）

## 目標

比賽規則：同一隊入面唔准重複用同一件零件。俾選手賽前用零件資料庫砌自己隊陀螺
（3 隻打 3on3，或者 4 隻俾對手禁 1），砌嘅過程直接幫佢守規則，砌完出一張分享卡
（圖）或者文字記錄。**網站唔存任何嘢** —— 成品靠 share／copy／download 帶走。

## 用戶流程

兩步：

1. **砌隊版**（route `#/team`）：揀格式（3 隻／4 隻）→ 入隊名 → 逐隻陀螺逐格揀零件
2. **成品版**（同一版嘅第二個狀態，唔另開 route）：預覽張分享卡＋三粒掣
   （Share／Copy／Download）＋「返去改」

入口：主頁 hero 嗰排掣加粒「砌隊」。頂欄用零件版嗰款全局簡版（←、標題「砌隊」、深淺色掣）。

## 一隻陀螺

| 格 | 必要？ | 揀盤內容 |
|---|---|---|
| 戰刃 | 必要 | 全部 blade（搜尋＋類型／階級篩選，重用 `parts.ts` 嘅 `searchBlades`） |
| 固鎖 | 必要 | kind=ratchet 嘅零件（搜尋＋階級篩選） |
| 軸心 | 必要 | kind=bit |
| 輔助戰刃 | 可留空 | kind=assist，多個「唔要」選項清空 |

資料嚟自現成嘅 `usePartsData()`（零件版嗰套 fetch＋cache，唔使新寫）。

## 重複規則（核心）

同隊之內：

- **固鎖／軸心／輔助戰刃**：照名對，同名即重複（`9-60` 就係 `9-60`）
- **戰刃**：對「本體名」——唔同顏色版／金屬塗層版／聯乘版係同一件零件。
  `bladeIdentity(name)` 剝法：
  1. trim 之後**斬咗第一個空格開始嘅所有嘢**
     （`魔導神杖 金屬塗層:燦金` → `魔導神杖`；`蒼穹龍騎士 金屬塗層:白色 日本職業足球聯盟版` → `蒼穹龍騎士`）
  2. 剝走**結尾嘅顏色括號**：`(` 或 `（` 開頭、內容每隻字都喺顏色字集
     `綠紅藍黑黃紫白金青粉銀橙灰` 入面、長度 1–2 字先剝
     （`魔導神杖(綠)` → `魔導神杖`；**`蒼穹龍騎士(左)` 唔剝** —— 左轉版係另一隻刃）
- 出唔出得：**硬性唔俾**（用戶已揀）。做法係喺揀盤度預防 —— 用咗嘅項目變灰、
  標明「第 N 隻用咗」，撳唔到。因為凈係揀盤先入到嘢，所以唔會有「砌完先發現犯規」

真實 case（測試要用）：

- `UX-03 魔導神杖`、`BXH-09 魔導神杖 金屬塗層:燦金`、`BX-35-04 魔導神杖(綠)` → 同一件
- `BX-34 蒼穹龍騎士(左)` 同 `CX-08-06 蒼穹龍騎士` → **唔同**件
- `BX-48-01 蒼穹龍騎士(黑)` 同 `CX-08-06 蒼穹龍騎士` → 同一件

## 資料模型（`src/lib/team.ts`，純邏輯）

```ts
export interface Combo {
  blade: BladeRow | null
  ratchet: PartRow | null
  bit: PartRow | null
  assist: PartRow | null   // null = 冇裝
}
export type TeamSize = 3 | 4
export interface Team { name: string; size: TeamSize; combos: Combo[] }  // combos.length === size

export function emptyTeam(size: TeamSize): Team
export function resizeTeam(team: Team, size: TeamSize): Team   // 3→4 加空隻；4→3 斬走最尾嗰隻
export function bladeIdentity(name: string): string
/** slot 係 'blade' 時 key 係 bladeIdentity；其他 slot 係零件名。
    return Map<key, 第幾隻陀螺(0起計)>，except 嗰隻唔計（改緊嗰隻自己）。 */
export function takenKeys(team: Team, slot: 'blade' | 'ratchet' | 'bit' | 'assist', except: number): Map<string, number>
export function isComplete(team: Team): boolean   // 每隻 blade+ratchet+bit 齊晒
export function teamText(team: Team): string
```

`teamText` 格式（釘死，測試對全文）：

```
《隊名》
格式：3on3
① 鮫鯊狂鱗 UX-15-01｜4-50｜UF
② 天馬爆擊 CX-07｜9-70｜T｜輔助 W
③ 魔導神杖 UX-03｜5-70｜DB
——用「陀螺計分板」零件圖鑑砌
https://samtang2014.github.io/Beyblade-scoreboard/
```

- 冇隊名就冇第一行；4 隻嗰陣格式行係 `格式：4隻禁1`，序號去到 ④
- 冇輔助就冇 `｜輔助 …` 嗰截

## 分享卡（`src/lib/teamCard.ts`）

- Canvas 1080×1350（4:5，post 得落社交平台），輸出 PNG blob
- 風格跟 app 深色版：近黑底、金色做隊名同重點、每隻陀螺一行
  （戰刃圖＋戰刃名/型號＋固鎖/軸心/輔助字樣）、底部一行 app 名＋網址
- 戰刃圖用 `crossOrigin='anonymous'` load（i.ibb.co 有 CORS，2026-08-12 實測
  `access-control-allow-origin: *`）；**單張圖 load 唔到就畫個灰格頂住，唔好成張卡出唔到**
- 出圖係 async：`renderTeamCard(team): Promise<Blob>`

## 成品版三粒掣

| 掣 | 行為 | 冇支援嗰陣 |
|---|---|---|
| Share | `navigator.share({ files: [PNG File] })`（先用 `navigator.canShare` 驗） | 唔支援 file share 就 share 文字；連 `navigator.share` 都冇（桌面 Chrome）就收起呢粒掣 |
| Copy | `navigator.clipboard.writeText(teamText(team))`，成功出「copy 咗」提示 | clipboard 唔俾就彈段文字出嚟俾人手動 copy |
| Download | PNG blob 落檔，檔名 `隊名-陀螺隊.png`（冇隊名就 `我隊陀螺.png`） | — |

成品版預覽：張卡 render 完做 object URL 擺入 `<img>`（離開時 revoke）。

## 唔存嘢

- 純 React state，唔落 localStorage／sessionStorage
- 砌隊版有一句提：「呢度唔會存底 —— 砌完記得出卡帶走。」
- 離開版面／refresh 就冇咗，接受

## 錯誤處理

| 情況 | 行為 |
|---|---|
| 零件資料拉緊／拉唔到 | 同零件版一致：cache 頂住＋提示；乜都冇就錯誤畫面＋再試（重用 `usePartsData` 嘅狀態） |
| 未砌齊就想出卡 | 「出卡」掣 disabled＋句仔講埋爭啲乜（「第 2 隻仲爭軸心」） |
| 出圖途中有張零件相 load 唔到 | 嗰格畫灰底，卡照出 |
| share／copy 俾系統拒絕 | 各自 fallback（上表） |

## 測試

- `bladeIdentity`：上面三組真實 case＋淨名冇變化＋全形括號
- `takenKeys`：同名唔同型號戰刃互斥、except 自己嗰隻唔計、輔助 null 唔阻人
- `resizeTeam`：4→3 斬走第 4 隻、3→4 補空
- `isComplete`／`teamText`：對全文（有名冇名、有輔助冇輔助、3 同 4 隻）
- Canvas／share／download 人手驗（node 測試環境冇 canvas）

## 明確唔做

- 唔存隊伍（冇「我啲隊」清單）
- 唔綁賽事／選手
- 唔做 ban 流程（邊隻俾人禁係場邊嘅事，工具淨係砌）
- 唔用張 sheet 嘅「分享卡主題」tab（自己卡自己風格）
- 唔驗「呢個組合裝唔裝到」（規則以外嘅物理相容性唔理）
