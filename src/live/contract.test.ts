import { describe, expect, it } from 'vitest'
import { createClient } from './remote'
import { newToken } from './device'
import type { Tournament } from '../engine/types'

/**
 * 打真嘅 Apps Script deployment。
 *
 * 段 `Code.gs` 嘅**邏輯**已經有 `appsScript.test.ts` 守住（stub 走 Google 嗰五個
 * global 再行真嘅 doGet／doPost）。呢度驗嘅係嗰個 stub 驗唔到嘅嘢：
 * 真嘅 HTTP、真嘅 CORS、真嘅 deploy 權限、真嘅 Google Sheets 儲存行為。
 *
 * 改完段 script、重新 deploy 之後行：
 *
 *   LIVE_SCRIPT_ID=AKfycb… npm run test:live
 *
 * ⚠ 會清走張 sheet 上面嘅嘢。用一張專登開嚟測試嘅 sheet。
 */
// 用 import.meta.env 唔用 process.env —— 個 project 冇裝 @types/node，
// 而 vitest 會把 process.env 填入 import.meta.env（vite/client 已經有 type）。
const SCRIPT = (import.meta.env.LIVE_SCRIPT_ID as string | undefined) ?? ''

const t = (name: string): Tournament => ({
  id: 'ct1', name, createdAt: 0, updatedAt: 0,
  mode: 'roundRobin', cutSize: null, poolCount: null, advancePerPool: null,
  headToHead: false, live: null, players: [], matches: [],
})

describe.skipIf(SCRIPT === '')('真 deployment 嘅合約', () => {
  const edit = newToken('edit')
  const view = newToken('view')

  it('行一轉：init → claim → push → get', async () => {
    const admin = createClient(SCRIPT, edit)

    expect((await admin.init(edit, view, t('合約測試'))).ok).toBe(true)
    expect((await admin.claim('devA', true)).ok).toBe(true)
    expect((await admin.push(t('入咗分'), 'devA')).ok).toBe(true)

    const got = await admin.get(null)
    expect(got.ok && got.t?.name).toBe('入咗分')
    expect(got.ok && got.role).toBe('edit')
  }, 60_000)

  it('第二部機攞唔到位，但主辦 force 就攞到', async () => {
    const admin = createClient(SCRIPT, edit)
    await admin.claim('devA', true)

    const other = await admin.claim('devB', false)
    expect(other.ok).toBe(false)
    expect(!other.ok && other.err).toBe('held')

    expect((await admin.claim('devB', true)).ok).toBe(true)
  }, 60_000)

  it('view token 寫唔到嘢', async () => {
    const r = await createClient(SCRIPT, view).push(t('唔應該入到'), 'devC')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.err).toBe('read-only')
  }, 60_000)

  it('token 亂咁畀就拒絕', async () => {
    const r = await createClient(SCRIPT, 'nope').get(null)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.err).toBe('bad-token')
  }, 60_000)

  /**
   * 個安全性重點：**觀眾攞唔到任何 token**。
   *
   * 特登餵一份**帶住 token** 嘅資料上去 —— 即係扮一個剝漏咗嘅客戶端。
   * 段 script 要自己剝走佢（`stripLive_`）。
   *
   * 呢一點好緊要：剝走呢件事如果淨係喺客戶端做，一個寫錯咗嘅 edit-token
   * 客戶端就可以把兩個 token 一次過發佈俾全部觀眾。段 script 係所有寫入
   * 嘅共同樽頸，喺嗰度守先真係守得住。
   */
  it('觀眾攞唔到任何 token，就算客戶端剝漏咗', async () => {
    const admin = createClient(SCRIPT, edit)
    await admin.claim('devA', true)
    await admin.push({ ...t('保安測試'), live: { scriptId: SCRIPT, edit, view } }, 'devA')

    const asViewer = await createClient(SCRIPT, view).get(null)
    expect(asViewer.ok).toBe(true)
    expect(asViewer.ok && asViewer.view).toBeUndefined() // 段 script 唔派
    expect(asViewer.ok && asViewer.t?.live).toBeNull() // 段 script 剝走咗

    const asAdmin = await admin.get(null)
    expect(asAdmin.ok && asAdmin.view).toBe(view) // edit 就派得
  }, 60_000)

  it('大過一格上限嘅資料都推得上、拉得返', async () => {
    const admin = createClient(SCRIPT, edit)
    await admin.claim('devA', true)
    const big = t('x'.repeat(95_000))
    expect((await admin.push(big, 'devA')).ok).toBe(true)
    const got = await admin.get(null)
    expect(got.ok && got.t?.name.length).toBe(95_000)
  }, 60_000)

  /**
   * 一隻 emoji 係兩個 code unit，切得開。個 pad 一定要**計**，唔可以寫死 ——
   * 分段位係喺成份 JSON 嘅第 40,000 位，唔係個名嘅第 40,000 位。
   *
   * `appsScript.test.ts` 已經用假 sheet 驗過同一件事；呢度驗嘅係**真嘅
   * Google Sheets** 有冇動過我哋寫落去嗰隻孤兒 surrogate。
   */
  it('emoji 啱啱切喺分段位都唔會爛', async () => {
    const admin = createClient(SCRIPT, edit)
    await admin.claim('devA', true)

    const nameStartsAt = JSON.stringify(t('')).indexOf('""') + 1
    const exact = 40_000 - 1 - nameStartsAt

    for (const pad of [exact - 1, exact, exact + 1]) {
      const name = 'x'.repeat(pad) + '🌀' + 'y'.repeat(10)
      expect((await admin.push(t(name), 'devA')).ok).toBe(true)
      const got = await admin.get(null, true)
      expect(got.ok && got.t?.name).toBe(name)
    }
  }, 120_000)
})
