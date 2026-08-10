import { useEffect, useSyncExternalStore } from 'react'
import { getPref, resolveTheme, setPref, subscribePref, type Theme, type ThemePref } from './theme'

const SYSTEM_DARK = '(prefers-color-scheme: dark)'

function subscribeSystem(fn: () => void): () => void {
  const mq = window.matchMedia(SYSTEM_DARK)
  mq.addEventListener('change', fn)
  return () => mq.removeEventListener('change', fn)
}

/**
 * 深淺色接落 DOM。
 *
 * ⚠ **一定要喺 App 度叫一次**，唔可以淨係喺個 picker 度叫。個 picker 只喺主頁
 * 出現，如果得佢叫，你企喺入分版嗰陣就冇人聽住部機嘅日夜轉 —— 揀咗「跟部機」
 * 但天黑咗個 app 都唔會跟。
 *
 * 兩個地方叫都冇問題：個偏好放咗喺 module store，唔係各自 useState。
 */
export function useTheme(): {
  pref: ThemePref
  theme: Theme
  setPref: (p: ThemePref) => void
} {
  const pref = useSyncExternalStore(subscribePref, getPref, getPref)
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(SYSTEM_DARK).matches,
    () => false,
  )

  const theme = resolveTheme(pref, systemDark)

  useEffect(() => {
    /*
      主題落喺 `<html>`，唔落喺 `<body>` —— 電視版會喺 body 度加 `.is-dark`
      強制熄燈。兩個 class 各有各嘅位就唔會打交：離開電視版嗰陣 body 嗰個
      拆走，html 嗰個照留。
    */
    document.documentElement.classList.toggle('is-dark', theme === 'dark')
    /*
      手機瀏覽器嘅頂欄／底欄會用呢個色。唔跟住轉嘅話，深色主題之下
      個瀏覽器框仲係淺灰，成部機睇落好似冇裝好。
    */
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0c0d12' : '#e3e5e9')
  }, [theme])

  return { pref, theme, setPref }
}
