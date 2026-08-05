# 即時分享：private sheet 做 database — 設計文件

日期：2026-08-05

## 一句話

主辦喺自己 Google Drive 開一張**private sheet**，綁一段 Apps Script deploy 成 Web App；個 app 靠嗰條網址讀寫。主辦派兩條 link 出去：一條可以入分，一條淨係睇，實時跳。

## 點解係呢個方案

| | Firebase／Supabase | **Apps Script + private sheet** | Snapshot link |
|---|---|---|---|
| 邊個孭 quota | **你** | 每個主辦自己 | 冇 |
| 即時 | ✓ | ✓ | ✗ |
| 主辦要設定 | 冇 | 一次過 3–5 分鐘 | 冇 |
| 張 sheet 會唔會漏俾人 | — | **唔會** | — |

決定性嗰點唔係數字，係**邊個孭 quota**。Firebase 之下，每一個用呢個 app 嘅人都食你個 project 嘅額度，你要管 dashboard、管升 plan、人哋啲資料喺你手。Apps Script 之下你嘅暴露係結構上嘅零。

而且 README 第一句就係「冇後端。唔使 server、唔使 database、唔使登入」。加個要你營運嘅 Firebase 就係推翻咗佢；Apps Script 條路個 app 仍然係一堆靜態檔。

## 整體形狀

```
主辦部機                          觀眾／第二個 admin
   │                                    │
   │ POST {k, base, t}                  │ GET ?k=…&since=…
   ▼                                    ▼
      https://script.google.com/…/exec
                  │
        Apps Script（以主辦身份執行）
                  │
        主辦 Drive 入面一張 private sheet
```

張 sheet 由頭到尾**冇 share 過俾任何人**。外面淨係打得到段 script，而段 script 睇 token 決定俾唔俾你做嘢。

## 兩條 link

```
…/Beyblade-scoreboard/#/live/<base64url({"s":<scriptId>,"k":<token>})>
```

| | 睇賽程／排名／電視 | 入分 | 改設定 |
|---|---|---|---|
| 主辦（本機） | ✓ | ✓ | ✓ |
| 入分 link（edit token） | ✓ | ✓ | ✓ |
| 觀眾 link（view token） | ✓ | ✗ | ✗ |

入分 link **同主辦完全一樣**，唔做權限分級。觀眾寫唔到嘢係段 script 擋（server side），唔係前端收埋粒掣。

只放 `scriptId`（`AKfycb…` 嗰橛）唔放成條網址，慳返約 40 字元；客戶端砌返 `https://script.google.com/macros/s/<id>/exec`。

## 段 script 嘅合約

**GET** `?k=<token>&since=<version>`（`since` 可以唔傳；`&fresh=1` 跳過 cache）

| 情況 | 回應 |
|---|---|
| Token 啱、`since` 等於目前版本 | `{ok:true, role, v}` —— **唔會開張 sheet** |
| Token 啱、有更新 | `{ok:true, role, v, t}` |
| Token 唔啱 | `{ok:false, err:'bad-token'}` |

**POST**，body 係 `text/plain` 入面一段 JSON。**一定要用 `text/plain`** —— 用 `application/json` 會觸發 CORS preflight，而 Apps Script 唔識答 `OPTIONS`。

| Body | 回應 |
|---|---|
| `{k, base, t}` | `{ok:true, v}` |
| 同上但 `base` 唔等於目前版本 | `{ok:false, err:'conflict', v, t}` |
| `k` 係 view token | `{ok:false, err:'read-only'}` |
| `{action:'init', edit, view, t}` | `{ok:true, v:1}` |
| 同上但張 sheet 已經有 token 而且冇畀啱 edit token | `{ok:false, err:'already-init'}` |

`init` 喺兩種情況下接受：張 sheet 未有 token（第一次），或者請求同時帶住現有嘅 edit token（換另一場賽事上去）。所以 **Apps Script 嗰輪設定一世做一次**，之後每場新賽事貼返同一條網址就得。

## 張 sheet 點擺

一個 tab 叫 `data`，A 欄係標籤（俾主辦自己撳入去望嗰陣睇得明），B 欄係值：

| | A | B |
|---|---|---|
| 1 | `edit` | edit token |
| 2 | `view` | view token |
| 3 | `version` | 整數，每次成功寫入 +1 |
| 4 | `chunks` | 分咗幾段 |
| 5+ | `data 1`, `data 2`… | JSON 分段，每段最多 40,000 字 |

**點解要分段：** Google 一格上限 50,000 字元。實測 16 人單循環打完係 38.7 KB，20 人（190 場）就會超過。唔分段就會靜靜雞截斷 —— 唔係報錯，係啲資料無聲無息冇咗。

## 版本同衝突

段 script 每次成功寫入就 `version + 1`。客戶端推嘅時候帶住「我見到嘅版本」做 `base`。

`update(t => 新 t)` 本來就係一個 function（`browserStore.ts` 已經係咁），所以衝突處理係：

1. 本機即刻套用、寫落 localStorage、畫面即刻更新
2. 個改動 function 入隊，推上去（`base` = 我最後知嘅版本）
3. 段 script 話 `conflict` → 攞返佢俾我嗰份最新，**喺最新嗰份上面重跑晒隊入面嘅 function**，再推
4. 最多試 3 次；仲係唔得就報錯，本機資料唔會冇

同一時間只准一個請求喺途中，多個改動排隊合併。

## Cache：慳延遲，唔係救命

段 script 用 `CacheService` 記住 `{v, edit, view}`（TTL 6 小時）。`since` 等於 cache 入面個版本就即刻答，**唔使開張 sheet** —— 由 300–500ms 變 ~50ms。

因為所有寫入都經段 script，寫嗰陣順手更新 cache，所以 cache 唔會落後。唯一會令佢過期嘅係**手動改張 sheet** —— 所以個 app 有個「重新同步」會加 `&fresh=1` 跳過 cache。

**要更正之前講錯咗嘅嘢：** 我一度話消費者帳戶每日 90 分鐘 script 執行時間會爆。查實咗，嗰個 90 分鐘係 **trigger** 嘅每日上限，web app（`doGet`／`doPost`）唔計入去，而且文件冇列明 web app 嘅每日呼叫上限。真正存在嘅係「同時執行 30 條」—— 每次呼叫約 0.3 秒、隔 3 秒 poll，要平均撞到 30 條需要大約 400 個觀眾。所以 cache 係值得做嘅優化，唔係做唔到就死。

真正影響體驗嘅係**延遲**：每次 poll 都係去 Google 嘅一個來回，觀眾睇到嘅分數會慢主辦大約 1–4 秒。

## Poll

隔 3 秒。個 tab 收埋（`document.hidden`）就**完全停**，切返出嚟即刻拉一次。斷網退避重試。

## 三種模式

| 模式 | 點入 | 資料喺邊 |
|---|---|---|
| 主辦 | 本來就係，開咗直播 | localStorage + 推上去 |
| 入分 link | `#/live/<edit payload>` | 第一次拉完存落**佢自己嘅** localStorage，之後同主辦一模一樣 |
| 觀眾 link | `#/live/<view payload>` | **淨係喺記憶體**，唔會污染佢部機嘅賽事列表 |

入分 link 第一次開：拉 → 存落 localStorage（連 `live` 設定）→ 跳去 `#/t/<id>`。之後佢就係一個主辦。

存嗰陣**用返嗰場賽事本身個 id**。如果佢部機已經有同一個 id（即係佢之前開過同一條 link），直接蓋過 —— 遠端嗰份係權威，本機嗰份只係 cache。

**Poll 喺入分模式點處理：** 拉到新版本嘅時候，如果本機**冇**改動排緊隊，直接採用；如果**有**，唔採用 —— 留返俾推嗰條路處理（佢會撞到 `conflict`，然後喺最新版上面重跑，結果一樣但唔會整跌你未推嘅嘢）。

## 離線唔可以死

README 應承咗「場地 wifi 幾差都影響唔到入分」。所以**入分永遠唔會等網絡**：寫 localStorage 即刻生效，同步喺背後做，斷咗排隊，重連補推。

TopBar 出個同步狀態：`同步咗` / `同步緊` / `離線（3 個改動未推）` / `出錯`。

## 資料模型改動

`Tournament` 加：

```ts
/** 開咗直播先有。null = 冇分享。 */
live: { scriptId: string; edit: string; view: string } | null
```

舊檔冇呢個 field 一律當 `null`（同 `headToHead` 一樣嘅處理）。

段 script 網址另外存喺 localStorage 一個全域 key（唔喺 Tournament 入面），設定頁預先填返 —— 因為一個主辦一世得一條。

## 設定流程（新頁 `#/t/<id>/share`）

1. 逐步指引：開一張新 sheet → Extensions → Apps Script → 貼段 code → Deploy → Web app → Execute as **Me** → Who has access **Anyone** → copy 條網址
2. 貼條網址入去（如果之前貼過會自動填返）
3. 撳「開始直播」→ app generate 兩個 token → `init` → 存 `live`
4. 出兩條 link，各有 copy 掣

段 `Code.gs` 放喺 repo `apps-script/Code.gs`，設定頁有個「複製段 code」掣。

## 測試

**測得到（vitest）**

- `remote.ts` 餵假 `fetch`：成功、`conflict`、`bad-token`、`read-only`、網絡爆咗、回應唔係 JSON
- 重跑 rebase：兩個排隊嘅改動撞到衝突 → 喺新版上面按次序重跑 → 推啱嘢
- 推到第 3 次仲衝突 → 報錯，本機資料完好
- base64url payload 編碼解碼，包括餵垃圾入去唔會炸
- JSON 分段／重組：39 KB、41 KB、120 KB 都要啱，段數對得返
- 離線：`fetch` 掟錯 → 排隊唔會冇、`update` 照樣即刻返

**測唔到（要人手）**

段 `Code.gs` 跑喺 Google 嘅 runtime，vitest 掂唔到。做兩樣補救：

1. 一份人手測試清單（deploy 一次行一次）
2. 一個 contract test：`LIVE_SCRIPT_URL=… npm run test:live` 打真嘅 deployment 行一轉 init → push → get → conflict → view-token-write-rejected。冇設個 env var 就跳過。

## 分期

呢個 feature 比之前幾個大好多。天然分界線喺「單向」同「雙向」之間：

| 期 | 內容 | 做完之後 |
|---|---|---|
| 一 | 段 script、傳輸層、設定頁、**觀眾 link** | 主辦推、觀眾實時睇。已經有用 |
| 二 | **入分 link**、衝突重跑、離線隊列、同步狀態 | 兩個人一齊入分 |

兩期寫喺同一份 plan、順住做。第一期做完就已經行得通，可以喺嗰度停低試真。

## 明確唔做

| 項目 | 決定 |
|---|---|
| 入分 link 做權限分級 | **唔做**，同主辦完全一樣 |
| 觀眾要 Google 登入 | **唔做** |
| QR code | **唔做**（要多個 library） |
| 一張 sheet 擺多場賽事 | **唔做**。一張 sheet 一場，換場就 re-init（要確認，舊 link 會死） |
| 張 sheet 出多個人睇得明嘅排名 tab | **唔做**（之後先算） |
| 「複製 template sheet」一撳搞掂 | **唔做**。要有人整咗個公開 template 先，v1 用貼 code |
| 喺 app 度刪張 sheet | **唔做** |
| 觀眾互動（留言、反應） | **唔做** |
