# 陀螺計分板

**線上版：https://samtang2014.github.io/Beyblade-scoreboard/**

陀螺單循環賽計分板。圓周法排賽程，Beyblade X 計分，即場出排名。介面全廣東話口語。

**冇後端。** 唔使 server、唔使 database、唔使登入、唔使網絡。整個網站係一堆靜態檔，
資料存喺瀏覽器嘅 localStorage。所以場地 wifi 幾差都影響唔到入分。

## 跑 local demo

```
npm install
npm run dev
```

開 http://localhost:5173 。

## 部署

**已經自動化咗。** `git push` 上 `main` → GitHub Actions typecheck、跑 154 個測試、build、
部署去 GitHub Pages，大約一分鐘。**測試唔過就唔會部署** —— 寧願個網站停喺舊版本，
都好過賽事當日推咗個爛嘅上去。

設定喺 `.github/workflows/deploy.yml`。

**點解揀 GitHub Pages 而唔係自己部 UAT server：** 呢個 app 係六個靜態檔（464 KB），
冇 process、冇 port、冇 database。UAT server 嘅 80／443 已經俾另一個 service 佔咗，
要共用就要改嗰邊嘅 nginx 設定 —— 為咗派六個靜態檔去孭呢個風險唔抵。
GitHub Pages 同嗰部機物理上無關，做錯嘢都影響唔到佢。

想喺本機試 build 出嚟嘅版本：

```
npm run build && npm run preview
```

`dist/` 亦都 copy 得去任何一個 web server 嘅任何一個目錄就用得 —— 用咗相對路徑 base
同 hash routing，擺喺子目錄（例如 `/tools/beyblade/`）都跑得，實測過。

## 其他指令

| 指令 | 做咩 |
|---|---|
| `npm test` | 跑 149 個測試 |
| `npm run test:watch` | 邊改邊跑 |
| `npm run typecheck` | 淨係 typecheck |

## 五個畫面

| 畫面 | 網址 | 用嚟 |
|---|---|---|
| 主頁 | `#/` | 開新賽事、揀返舊賽事、入返備份、刪賽事 |
| 開賽設定 | `#/t/<id>/setup` | 改賽事名、加減選手、排賽程 |
| 控制台 | `#/t/<id>` | 入分。主持人成日開住呢版 |
| 賽程 | `#/t/<id>/schedule` | 圓周法轉盤 + 逐輪場次，撳一撳跳去改任何一場 |
| 排名 | `#/t/<id>/table` | 排名表、down 低備份 |
| 矩陣 | `#/t/<id>/matrix` | 交叉得分表 |
| 電視 | `#/t/<id>/board` | 深色大字，接電視俾一班人睇 |

## 規則

**計分（Beyblade X 官方）**

| 點贏 | 分 |
|---|---|
| 轉贏 Spin Finish | 1 |
| 出界 Over Finish | 2 |
| 爆咗 Burst Finish | 2 |
| 極限 Xtreme Finish | 3 |

先到 4 分贏成場。

**排名（順住比落去）**

1. 勝場數
2. 對賽成績 —— 只喺啱啱兩個人同勝場、而且佢哋嗰場打完咗嘅時候先用
3. 總得分
4. 得失分差
5. 仲係一樣 → 顯示「並列」，唔自動分先後

未打完嘅場次一分都唔計。

**排賽程**

圓周法：選手排成一個圈，第一個位釘死唔郁，其餘每輪順時針行一格，
行到邊個位就同對面嗰位打。單數人數自動補一個輪空位，人人啱啱唞一次。

中途加人：只補未有過嘅配對，插喺賽程最尾，打咗嘅成績一場都唔會郁。

## 架構

```
src/
  engine/     排程同計分。全部係純 function —— 唔掂 storage、唔掂 React、唔掂 DOM
    rules.ts        Beyblade X 分數同場次狀態
    schedule.ts     圓周法 + 中途加人
    standings.ts    排名同 tiebreak
  storage/    localStorage 讀寫、匯出匯入、格式驗證
  lib/        hash router、下載、id
  ui/         React 畫面
```

`engine/` 入面兩個核心 function 唔掂任何外界嘢，所以圓周法排錯冇、排名 tiebreak 啱唔啱，
全部用 Vitest 直接驗到，唔使開瀏覽器撳。出事最貴嗰兩忽嘢隔離到最易測。

場次 id 由對戰雙方 id 排序組成（`p1__p2`）。單循環入面每對人只撞一次，
所以呢個 key 天然唯一 —— 中途加人重排賽程時，舊場次嘅 id 唔會變，已入嘅分唔會走失。

每 round 嘅結果先係唯一真相。場次比分同排名一律即場計出嚟，唔另外儲存，
所以冇可能出現總分同逐 round 對唔上。

## ⚠ 資料喺邊

資料淨係喺你嗰部機、嗰個瀏覽器。以下情況會全部消失：

- 清除瀏覽器資料
- 用無痕視窗（app 會喺主頁提你）
- 換機、換 browser

所以**排名版同控制台都有粒「down 低備份」**，down 個 JSON 落嚟；主頁可以入返。
賽事打完會提你 down 一次。匯入永遠唔會蓋走本身嘅賽事 —— id 撞咗會當新一場加入。

## 刪嘢

刪任何嘢都要撳兩次，第二下嗰粒掣會講明會冇咩：

| 刪咩 | 喺邊 | 點做 |
|---|---|---|
| 一個選手 | 開賽設定 | 撳「除名」。佢打過波嘅話要再撳「真係除？N 場成績會冇」 |
| 一場賽事 | 主頁 | 撳張卡下面「刪除」，確認條 bar 會彈出，順手俾你「先 down 低」備份 |

冇「復原」。冇後端，刪咗就真係冇咗 —— 所以確認嗰陣先擺粒備份掣喺度。
