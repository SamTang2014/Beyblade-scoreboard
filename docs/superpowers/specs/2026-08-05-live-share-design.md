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

| | 睇到咩 | 入分、改設定 | 收得返入分位 |
|---|---|---|---|
| 主辦（本機） | 全部頁 | 要坐住個位 | **✓ 隨時** |
| 入分 link（edit token） | 全部頁 | 要坐住個位 | 要等過期 |
| 觀眾 link（view token） | **淨係電視版** | ✗ | ✗ |

觀眾嗰邊淨係出電視版 —— 佢入嚟就係想望住個分跳，唔使成套 tab。（想俾佢揀睇賽程、
排名嗰啲，係另一件事，唔喺呢一期。）

入分 link **同主辦完全一樣**，唔做權限分級 —— 佢入到分、改到設定、砌到籤表。唯一分別係主辦收得返個位而佢要等（見「入分位」）。

觀眾寫唔到嘢係段 script 擋（server side），唔係前端收埋粒掣。

只放 `scriptId`（`AKfycb…` 嗰橛）唔放成條網址，慳返約 40 字元；客戶端砌返 `https://script.google.com/macros/s/<id>/exec`。

## 段 script 嘅合約

**GET** `?k=<token>&since=<version>`（`since` 可以唔傳；`&fresh=1` 跳過 cache）

| 情況 | 回應 |
|---|---|
| Token 啱、`since` 等於目前版本 | `{ok:true, role, v}` —— **唔會開張 sheet** |
| Token 啱、有更新 | `{ok:true, role, v, t}`，edit token 額外有 `view` |
| Token 唔啱 | `{ok:false, err:'bad-token'}` |

### ⚠ 推上去嗰份賽事資料，`live` 一定要係 `null`

`Tournament.live` 入面有**兩個 token**。如果原封不動推上張 sheet，`doGet` 就會連
token 一齊交俾 view token 嗰個人 —— 任何觀眾讀一讀 JSON 就攞到入分權，成個
兩 token 設計即刻報廢。

所以：**推之前一定要 `{...t, live: null}`**。

咁樣入分 link 嗰部機點知自己嘅 `live`？由條 link 本身砌返：`scriptId` 同 `edit`
喺 payload 入面。`view` 就靠 GET 嗰陣段 script 額外派返 —— **淨係派俾 edit token**。

**POST**，body 係 `text/plain` 入面一段 JSON。**一定要用 `text/plain`** —— 用 `application/json` 會觸發 CORS preflight，而 Apps Script 唔識答 `OPTIONS`。

| Body | 回應 |
|---|---|
| `{k, who, t}` | `{ok:true, v}` |
| 同上但個位喺第二部機度 | `{ok:false, err:'not-holder', holder, until}` |
| `k` 係 view token | `{ok:false, err:'read-only'}` |
| `{action:'claim', k, who, force}` | `{ok:true, until}` 或者 `{ok:false, err:'held', until}` |
| `{action:'release', k, who}` | `{ok:true}` |
| `{action:'init', edit, view, t}` | `{ok:true, v:1}` |
| 同上但張 sheet 已經有 token 而且冇畀啱 edit token | `{ok:false, err:'already-init'}` |

`who` 係部機自己 generate 嘅一個隨機 id（存喺 localStorage，換場都唔變）。

`force:true` 淨係主辦部機用得 —— 見下面。

`init` 喺兩種情況下接受：張 sheet 未有 token（第一次），或者請求同時帶住現有嘅 edit token（換另一場賽事上去）。所以 **Apps Script 嗰輪設定一世做一次**，之後每場新賽事貼返同一條網址就得。

**要做到「貼返同一條網址就得」，部機一定要記住個 edit token，唔淨係記 scriptId。**
新開嘅賽事 `live` 係 `null`，冇 token 就冇嘢攞去認證，`init` 一定俾人拒絕
（張 sheet 有舊 token，你畀個新生成嘅，對唔上）。所以 `savedScriptId` 要變成
`savedSheet(): { scriptId, edit } | null`。

換場會**整死舊嗰兩條 link**（張 sheet 得一場賽事），所以要確認一次先做。

## 張 sheet 點擺

一個 tab 叫 `data`，A 欄係標籤（俾主辦自己撳入去望嗰陣睇得明），B 欄係值：

| | A | B |
|---|---|---|
| 1 | `edit` | edit token |
| 2 | `view` | view token |
| 3 | `version` | 整數，每次成功寫入 +1 |
| 4 | `holder` | 而家邊部機坐緊入分位（`who`），冇人就吉 |
| 5 | `heldUntil` | 個位幾時到期（epoch ms） |
| 6 | `chunks` | 分咗幾段 |
| 7+ | `data 1`, `data 2`… | JSON 分段，每段最多 40,000 字 |

**A 欄啲標籤要人睇得明**，因為主辦部機冇咗嘅時候，佢會自己開張 sheet 睇返 B1 攞個 edit token 救返場賽事。呢個係唯一嘅救援路，唔可以寫到啲人睇唔明。

**點解要分段：** Google 一格上限 50,000 字元。實測 16 人單循環打完係 38.7 KB，20 人（190 場）就會超過。唔分段就會靜靜雞截斷 —— 唔係報錯，係啲資料無聲無息冇咗。

## 入分位：同一時間得一個人入到分

**呢個係最重要嘅決定。** 一場賽事只有一個「入分位」，坐緊個位嗰部機先寫得到嘢。所以兩個人同時改同一場賽事呢件事**唔會發生**，衝突合併嗰套嘢一律唔使做。

```
阿明開入分版  → 坐低個位（5 分鐘）
              → 每 60 秒續期
阿強撳入分 link → 段 script 話「位有人坐緊」
              → 佢照樣睇到實時畫面，但入分掣全部灰
```

佔位係**段 script 擋**。阿強改條 URL、開 devtools 都寫唔到嘢。

### 有效期同心跳

| | |
|---|---|
| 個位有效期 | **5 分鐘** |
| 續期 | 每 60 秒一次，另外每次入分都順手續 |
| 個 tab 收埋 | **照續**（同觀眾 poll 相反）|

**個到期時間一律用客戶端自己個鐘算**（`Date.now() + 5 分鐘`），段 script 返嘅
`until` 淨係做參考。唔統一嘅話：部機個鐘快過 server 超過 5 分鐘，段 script 派返
嗰個 `until` 喺客戶端睇落已經過咗期，個介面就會一路鎖住，但心跳其實成功緊 ——
查極都查唔到。段 script 嗰邊自己用自己個鐘做真正嘅裁判，本來就一致。

**點解係 5 分鐘唔係 60 秒：** 一個 round 打 3–5 分鐘，即係入分嗰個人本來就會有幾分鐘乜都唔撳 —— 用「幾耐冇入過分」做準，就會喺人哋等緊個 round 打完嗰陣拎走佢個位。

而且主辦部電話好大機會會熄屏。**熄屏唔止係 throttle —— iOS Safari 係直接暫停晒 JS**，一個 timer 都唔會跑。所以個有效期唔可以靠「心跳照跑」嚟撐，要靠佢本身夠長，長到食得起一段真實嘅暫停。5 分鐘食得起熄屏兩三分鐘；60 秒一定跌位。

（觀眾嗰邊照舊：個 tab 收埋就完全停 poll。呢條例外淨係俾坐緊個位嗰部機。）

### 主辦收得返，入分 link 要等

主辦同入分 link 唔對等，因為張 sheet 係主辦嘅：

| | 攞個位 |
|---|---|
| **主辦**（本機有 `live` 設定嗰部） | **隨時收得返**，撳一下（有確認）。唔使等 |
| 入分 link | 要等現任嗰個過期（最多 5 分鐘） |

咁樣兩邊死機都有出路：

- 入分 link 嗰個死咗 → 主辦即刻收返個位
- 主辦死咗 → 入分 link 嗰個等最多 5 分鐘接到手

俾人收咗位嗰個即刻見到「主辦收返咗入分位」，入分掣變灰。佢最多得一個改動未推（坐住個位嗰陣係邊入邊推），所以唔會蝕一堆嘢。

### 主辦部機死咗點返嚟

| 情況 | 點救 |
|---|---|
| 部機返生（叉電、reboot、重開瀏覽器） | 一切仲喺 localStorage：賽事、`live` 設定、未推嘅改動。開返個 app → 收返個位 → 繼續 |
| 部機真係冇咗（跌咗、洗咗 browser） | 借部機 → 設定頁「用返舊嘅 sheet」→ 貼 script 網址 + edit token → 拉返成場賽事 → 收返個位 |

第二行行得通，係因為**兩個 token 就寫喺張 sheet B1／B2**，而張 sheet 喺主辦自己個 Drive。即係話**主辦冇可能被永久鎖喺外面**。分享頁要提一句「呢兩條 link 儲返落自己度，換機都用得返」。

### 唯一仲會分岔嘅情況 —— 呢一期唔做

主辦離線超過 5 分鐘、個位過咗期俾人接咗、佢本機又仲有嘢未推 —— 兩邊都有咗新嘢。

**呢個情況呢一期唔處理。** 唔係唔緊要，係範圍問題：要做得好，客戶端要記住
「我最後知嘅版本」同「我離線期間改咗幾多」，再砌一個揀邊份嘅介面。而佢有幾罕見 ——
要主辦離線夠 5 分鐘、同時另一部機接咗手、同時兩邊都真係入咗分。

**而家嘅行為（要老實講）：** 跌咗位嗰部機推唔上去，個隊列會停低（`blocked`），
TopBar 出「入分位喺第二部機」。佢本機資料一條都唔會冇，但**推唔上去**。
撳「收返入分位」就會**用佢部機嗰份蓋過線上嗰份**。

即係話：預設行為係「後嚟收位嗰個贏」。呢個唔理想，但至少係**講得明、預測得到**嘅，
而且冇資料靜靜雞消失。改善方案（攤出兩份俾人揀）留返下一期。

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

**Poll 喺入分模式點處理：** 坐緊個位嗰部機唔會收到「意外嘅新版本」—— 得佢一個寫得到嘢，所以拉返嚟嘅一定係佢自己啱啱推嗰份。**冇坐位嗰部機**（等緊接手嗰個）就照收，同觀眾一樣。

唯一例外係跌咗位又離線嗰個情況，喺上面「唯一仲會分岔嘅情況」處理。

## 離線唔可以死

README 應承咗「場地 wifi 幾差都影響唔到入分」。所以**入分永遠唔會等網絡**：寫 localStorage 即刻生效，同步喺背後做，斷咗排隊，重連補推。

坐緊個位嗰陣斷網，個位會喺 5 分鐘後過期。重連返嚟如果個位仲喺自己度（多數係，因為冇人爭）就直接補推；如果俾人接咗，就行「唯一仲會分岔嘅情況」嗰個揀邊份。

TopBar 出個狀態：`同步咗` / `同步緊` / `離線（3 個改動未推）` / `入分位喺第二部機` / `出錯`。

## 資料模型改動

`Tournament` 加：

```ts
/** 開咗直播先有。null = 冇分享。 */
live: { scriptId: string; edit: string; view: string } | null
```

舊檔冇呢個 field 一律當 `null`（同 `headToHead` 一樣嘅處理）。

段 script 網址另外存喺 localStorage 一個全域 key（唔喺 Tournament 入面），設定頁預先填返 —— 因為一個主辦一世得一條。

部機自己個 id（`who`）都係全域 key，第一次用嘅時候 generate，之後唔變。唔擺落 `Tournament` 入面 —— 佢屬於部機，唔屬於場賽事。

## 設定流程（新頁 `#/t/<id>/share`）

1. 逐步指引：開一張新 sheet → Extensions → Apps Script → 貼段 code → Deploy → Web app → Execute as **Me** → Who has access **Anyone** → copy 條網址
2. 貼條網址入去（如果之前貼過會自動填返）
3. 撳「開始直播」→ app generate 兩個 token → `init` → 存 `live`
4. 出兩條 link，各有 copy 掣

段 `Code.gs` 放喺 repo `apps-script/Code.gs`，設定頁有個「複製段 code」掣。

同一頁下面有個「**用返舊嘅 sheet**」：貼 script 網址 + edit token → 拉返成場賽事。主辦部機冇咗嘅時候行呢條 —— 兩個 token 就寫喺張 sheet B1／B2，佢開自己個 Drive 就抄得返。

## 測試

**測得到（vitest）**

- `remote.ts` 餵假 `fetch`：成功、`not-holder`、`bad-token`、`read-only`、`held`、網絡爆咗、回應唔係 JSON
- 佔位狀態機：攞到位 → 心跳續期 → 續唔到（`held`）→ 入分掣要即刻鎖
- 心跳計時器：`document.hidden` 都要照續（呢個係同觀眾 poll 相反嘅行為，最易寫錯）
- 主辦 `force:true`、入分 link 唔傳 `force`
- 跌咗位又有嘢未推 → 出「揀邊份」，兩個揀法各自要出啱嘅結果
- base64url payload 編碼解碼，包括餵垃圾入去唔會炸
- JSON 分段／重組：39 KB、41 KB、120 KB 都要啱，段數對得返
- 離線：`fetch` 掟錯 → 排隊唔會冇、`update` 照樣即刻返

**測唔到（要人手）**

段 `Code.gs` 跑喺 Google 嘅 runtime，vitest 掂唔到。做兩樣補救：

1. 一份人手測試清單（deploy 一次行一次）
2. 一個 contract test：`LIVE_SCRIPT_ID=… npm run test:live` 打真嘅 deployment 行一轉 init → claim → push → get → 第二部機 claim 俾拒絕 → force claim → view token 寫入俾拒絕。冇設個 env var 就跳過。

## 分期

呢個 feature 比之前幾個大好多。天然分界線喺「單向」同「雙向」之間：

| 期 | 內容 | 做完之後 |
|---|---|---|
| 一 | 段 script、傳輸層、設定頁、**觀眾 link** | 主辦推、觀眾實時睇。已經有用 |
| 二 | **入分 link**、佔位同心跳、離線隊列、同步狀態、救援路 | 兩個人輪流入分 |

兩期寫喺同一份 plan、順住做。第一期做完就已經行得通，可以喺嗰度停低試真。

## 明確唔做

| 項目 | 決定 |
|---|---|
| 入分 link 做權限分級 | **唔做**，同主辦完全一樣 |
| 觀眾要 Google 登入 | **唔做** |
| QR code | **唔做**（要多個 library） |
| 一張 sheet 擺多場賽事 | **唔做**。一張 sheet 一場，換場就 re-init（要確認，舊 link 會死） |
| 兩個人同時入分（自動合併衝突） | **唔做**。一個入分位，輪流坐 |
| 入分 link 都收得返個位 | **唔做**。主辦先收得返 —— 張 sheet 係佢嘅 |
| 個位換咗人嗰陣通知另一部機 | **唔做**。佢下次心跳或者推嘢嗰陣自然發現 |
| 排隊等位（幾個人排住等） | **唔做** |
| 兩邊都行前咗嘅時候攤出嚟俾人揀 | **呢一期唔做**。而家係「收位嗰個蓋過」，見上面 |
| 張 sheet 出多個人睇得明嘅排名 tab | **唔做**（之後先算） |
| 「複製 template sheet」一撳搞掂 | **唔做**。要有人整咗個公開 template 先，v1 用貼 code |
| 喺 app 度刪張 sheet | **唔做** |
| 觀眾互動（留言、反應） | **唔做** |
