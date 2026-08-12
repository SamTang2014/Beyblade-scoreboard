import { useTheme } from '../../lib/useTheme'
import type { ThemePref } from '../../lib/theme'

/**
 * 深淺色。兩個控制：主頁用完整版（有「跟部機」），每一版嘅頂欄用快速版。
 *
 * 個標籤用返一般人講開嘅字眼 —— 之前叫「場地燈光／光猛／熄燈」，
 * 概念上啱（呢個 app 兩個色調本來就係為咗場地光暗），但要人諗多一步先明。
 * 設定就係設定，唔使考人。
 *
 * 唯一保留嘅係粒方格：用返擂台嗰條斜線劈開光暗兩邊，「跟部機」半光半暗，
 * 因為佢真係兩樣都可能 —— 呢個唔使解釋都睇得明。
 */

const OPTIONS: { pref: ThemePref; label: string }[] = [
  { pref: 'auto', label: '跟部機' },
  { pref: 'light', label: '淺色' },
  { pref: 'dark', label: '深色' },
]

/**
 * 頂欄嗰粒快速掣。
 *
 * 淨係喺淺／深之間反 —— 唔會 cycle 埋「跟部機」。三個狀態嘅掣撳落去
 * 估唔到下一個係乜；而且撳呢粒掣本身就係一個明確決定，「跟部機」
 * 反而係「唔決定」。想返去自動就去主頁揀。
 *
 * 粒方格用半光半暗嗰個（同主頁「跟部機」同一款）—— 佢**唔講狀態**，
 * 佢講「呢粒係管深淺色嘅」。
 *
 * 試過 show 單色：淺色主題出深方格、深色主題出淺方格。問題係一個淨係得
 * 個色嘅方格好易俾人讀成「而家係咁」而唔係「撳完會咁」，而且每次撳完
 * 粒嘢會跳轉，睇落似壞咗。而家呢個唔郁 —— 反正成版轉色本身已經係
 * 最清楚嘅回應，個掣唔使再講多次。
 *
 * 撳完會點，靠 aria-label 同 title 講清楚。
 */
export function ThemeToggle() {
  const { theme, setPref } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? '轉做深色' : '轉做淺色'

  return (
    <button className="themebtn" title={label} aria-label={label} onClick={() => setPref(next)}>
      <span className="lit lit--auto" aria-hidden="true" />
    </button>
  )
}

export function ThemePicker() {
  const { pref, setPref } = useTheme()

  return (
    <div className="field">
      <span className="field__label">深淺色</span>
      <div className="chips">
        {OPTIONS.map((o) => (
          <button
            key={o.pref}
            className="chip chip--lit chamfer-sm"
            aria-pressed={pref === o.pref}
            onClick={() => setPref(o.pref)}
          >
            <span className={`lit lit--${o.pref}`} aria-hidden="true" />
            {o.label}
          </button>
        ))}
      </div>
      <p className="note">
        <span>·</span>
        <span>
          「跟部機」會跟你部機嘅日夜設定自動轉。「電視」嗰版永遠深色 ——
          嗰度係俾人隔遠望嘅。
        </span>
      </p>
    </div>
  )
}
