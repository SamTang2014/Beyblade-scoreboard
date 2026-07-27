# 陀螺單循環計分板 — 設計文件

日期：2026-07-27

## 一句話

一個純前端網站，幫人用圓周法排單循環賽程、逐round入 Beyblade X 分、即時睇排名。介面全用廣東話口語。

## 決策紀錄

以下每項都經過討論確認，唔好喺實作時擅自改：

| 項目 | 決定 | 理由 |
|---|---|---|
| 後端 | **冇** | 觀眾睇主持人部機／電視，唔需要跨裝置同步。刪走 server、DB、API、認證、離線同步五個子系統 |
| 資料儲存 | localStorage | 冇後端下唯一持久化方式。必須配對匯出／匯入 |
| 賽制 | 單循環（round-robin）only | 唔做淘汰賽、瑞士制、雙循環 |
| 排程演算法 | 圓周法（circle method） | 1號固定，其餘順時針輪轉；單數人數補一個 BYE |
| 計分制 | Beyblade X 官方 | 自旋 1、出界 2、爆裂 2、極限 3；先到 4 分贏成場 |
| 語言 | 廣東話口語 only | 唔做語言切換、唔做英文版 |
| 登入 | 冇 | 冇跨裝置需求就冇嘢要鎖 |
| 中途加人 | 准，已打完嘅結果保留 | 只補未打過嘅配對，插喺賽程尾 |
| 人數 | 彈性，介面自適應 | 4 人到 30 人都要好睇 |

## 排名規則（依次比較）

1. 勝場數
2. 對賽成績（只限兩人同分；睇佢哋嗰場邊個贏）
3. 總得分（成個賽事攞過幾多分）
4. 得失分差（得分 − 失分）
5. 仍然相同 → 顯示「並列」，唔自動分先後

輪空（BYE）唔計入任何一項。

## 架構

```
src/
  engine/
    schedule.ts      排賽程(選手[], 已打過嘅配對[]) → 場次[]
    standings.ts     計排名(選手[], 場次[]) → 排名列[]
    rules.ts         Beyblade X 計分常數同 finish type 定義
    types.ts         Tournament / Player / Match / RoundResult
  storage/
    storage.ts       localStorage 讀寫 + 匯出／匯入 JSON
  ui/                React 畫面
```

**核心設計原則：`engine/` 入面全部係純function** — 唔掂 localStorage、唔掂 React、唔掂 DOM。入咩出咩。所以圓周法同排名 tiebreak 可以用 Vitest 直接跑幾十個 case 驗證，唔使開瀏覽器。

`schedule.ts` 嘅 signature 帶 `已打過嘅配對` 參數，令「中途加人」唔需要第二套邏輯：加人後攞齊名單重排，已打過嘅 skip 咗，剩低嘅補喺後面。

## 資料模型

```ts
Tournament { id, name, createdAt, players[], matches[], updatedAt }
Player     { id, name, seat }              // seat = 圓周法入面嘅固定位置
Match      { id, round, order, aId, bId, rounds[], status }
RoundResult{ seq, winnerId, finish }       // finish: 'spin'|'over'|'burst'|'xtreme'
```

**每 round 結果先係唯一真相。** 場次比分同排名一律即場由 `rounds[]` 計出嚟，唔另外儲存 — 咁就冇可能出現總分同逐round對唔上嘅情況。

## 畫面

1. **主頁** — 「開場新賽事」+ 我打過嘅賽事list + 匯入
2. **開賽設定** — 賽事名 + 逐個打選手名 → 排賽程
3. **控制台** — 而家打緊邊場、四粒 finish 掣、撳返轉頭、下一場預告、跳去任何一場改分
4. **展示模式** — 全螢幕大字，排名榜 + 而家打緊。接電視用
5. **對戰矩陣** — 橫直都係選手名嘅交叉表，對角線劃走

## 錯誤處理

- 撳錯 finish → 「撳返轉頭」可連撳，逐 round 撤銷
- 改已完成嘅場次 → 准，改完排名即時重算
- localStorage 滿／寫入失敗 → 明確彈錯誤，叫用戶匯出備份
- 匯入格式唔啱 → 拒絕並講明邊度唔啱，唔覆蓋現有資料
- 少於 2 個選手 → 唔准排賽程

## 資料遺失風險（必須處理）

清除瀏覽器資料、無痕視窗、換機、換browser 都會令資料消失。緩解：
- 控制台常駐「匯出備份」掣，down 一個 JSON 檔
- 賽事打完自動提示匯出一次
- 主頁可以匯入返

## 測試

- `engine/schedule.test.ts` — 雙數／單數人數、每人對齊所有人剛好一次、冇人同一輪打兩場、中途加人只補未打配對
- `engine/standings.test.ts` — 每條 tiebreak 規則獨立驗、並列情況、BYE 唔計分
- `storage/storage.test.ts` — 來回序列化、拒絕壞格式

## 做嘅次序

1. 專案骨架 + 型別
2. `engine/` 純function + 測試（未有UI，邏輯已驗證）
3. 視覺系統（design tokens、字體、顏色）
4. 控制台（最重要嘅畫面）
5. 主頁 + 開賽設定
6. 展示模式 + 對戰矩陣
7. 匯出／匯入
8. `npm run build` → copy `dist/` 上 UAT server

## 明確唔做

淘汰賽、瑞士制、雙循環、多擂台、登入、跨裝置同步、英文版、賽事歷史統計、選手個人檔案、陀螺配件紀錄。
