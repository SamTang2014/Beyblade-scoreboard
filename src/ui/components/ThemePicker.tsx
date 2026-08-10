import { useTheme } from '../../lib/useTheme'
import type { ThemePref } from '../../lib/theme'

/**
 * 深淺色。
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
