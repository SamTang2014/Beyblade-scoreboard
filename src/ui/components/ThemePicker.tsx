import { useTheme } from '../../lib/useTheme'
import type { ThemePref } from '../../lib/theme'

/**
 * 場地燈光。
 *
 * 唔叫「主題」、唔用月光太陽圖示 —— 呢個 app 兩個色調有實際理由：
 * 比賽通常喺商場、模型店呢啲光猛地方，主持人攞住部電話企喺度撳；
 * 夜場、或者部機擺喺暗角落就要熄燈。所以標籤講嘅係場地，唔係顏色。
 *
 * 粒方格用返擂台嗰條斜線劈開光暗兩邊 —— 同一個結構，換咗個用途。
 * 「跟部機」半光半暗，因為佢真係兩樣都可能。
 */

const OPTIONS: { pref: ThemePref; label: string }[] = [
  { pref: 'auto', label: '跟部機' },
  { pref: 'light', label: '光猛' },
  { pref: 'dark', label: '熄燈' },
]

export function ThemePicker() {
  const { pref, setPref } = useTheme()

  return (
    <div className="field">
      <span className="field__label">場地燈光</span>
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
          「跟部機」會跟你部機嘅日夜設定自動轉。「電視」嗰版永遠熄燈 ——
          嗰度係俾人隔遠望嘅。
        </span>
      </p>
    </div>
  )
}
