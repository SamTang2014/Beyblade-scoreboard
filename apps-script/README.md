# 段 script

`Code.gs` 貼落主辦自己張 Google Sheet 嘅 Apps Script 度。呢段嘢以主辦身份執行，
所以掂得到嗰張**從來冇 share 過**嘅 sheet；外面啲人淨係打得到段 script。

## 點裝

1. 開一張新 Google Sheet。**唔好 share 俾任何人** —— 個 app 唔使佢 share 都讀到
2. Extensions → Apps Script
3. 貼晒 `Code.gs` 落去，蓋走原本嗰個 `myFunction`
4. Deploy → New deployment → 類型揀 **Web app**
5. Execute as：**Me**
6. Who has access：**Anyone**
7. Deploy → 授權 → copy 條網址（`https://script.google.com/macros/s/…/exec`）
8. 貼返落個 app 嘅開賽設定（揀咗「認真」場先會出）

**第 5 同第 6 步一定要行啱。** Execute as 揀錯，段 script 掂唔到你張 sheet；
Who has access 揀錯，觀眾撳條 link 會俾佢叫登入。

## 改完之後

段 code 嘅**邏輯**有自動測試守住：

```
npx vitest run src/live/appsScript.test.ts
```

嗰個測試讀返呢度個真檔案，stub 走 Google 嗰五樣嘢（SpreadsheetApp、CacheService、
LockService、ContentService、Date）再行真嘅 `doGet` / `doPost`。所以「段 script
冇得測試」唔啱 —— 測唔到嘅淨係 deploy 同權限，邏輯本身測得晒。

改完之後除咗跑嗰個測試，仲要重新 deploy（**New version**，唔係新 deployment），
再行一次下面呢張清單 —— 呢啲係 stub 測唔到嘅嘢。

## 人手測試清單（deploy 之後行）

- [ ] 第一次 init：張新 sheet 自動生出 `data` tab，A 欄有標籤，B1／B2 有 token，B3 = 1
- [ ] 觀眾 link 開到，睇到分
- [ ] 觀眾 link 改條 URL 亂試（`k` 改成 edit token 以外嘅嘢）→ 見到「呢條 link 唔啱」
- [ ] **打開觀眾嗰個 GET 嘅 response，確認冇任何 `edit-` 開頭嘅 token**
- [ ] 主辦入分 → 觀眾嗰邊 3 秒內見到
- [ ] 入分 link 開到，見到「入分位喺第二部機」，入分掣灰咗
- [ ] 主辦收返個位 → 入分 link 嗰部機即刻鎖
- [ ] 主辦熄咗 app 等 5 分鐘 → 入分 link 嗰部撳到「接手入分」
- [ ] 主辦熄屏 2 分鐘再開 → 個位仲喺佢度
- [ ] 20 人賽事打完（190 場）→ 張 sheet B6 應該 ≥ 2，拉返落嚟資料完整
- [ ] 手動改張 sheet B3（版本）→ 客戶端撳「重新同步」拉到新嘢
- [ ] 熄 wifi → 撳「再試」→ 開返 wifi → 個表要繼續跳

## 張 sheet 入面有咩

| | A | B |
|---|---|---|
| 1 | `edit` | 入分 token |
| 2 | `view` | 觀眾 token |
| 3 | `version` | 整數，每次成功寫入 +1 |
| 4 | `holder` | 而家邊部機坐緊入分位 |
| 5 | `heldUntil` | 個位幾時到期 |
| 6 | `chunks` | 份資料分咗幾段 |
| 7+ | `data 1`… | 份 JSON |

**A 欄啲標籤特登寫到人睇得明**，因為主辦部機冇咗嘅時候，佢要自己開張 sheet
抄返 B1 個 edit token 去救返場賽事。呢個係唯一嘅救援路。
