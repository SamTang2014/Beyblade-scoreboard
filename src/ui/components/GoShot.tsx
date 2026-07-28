import { playGoShot } from '../../lib/sound'

/**
 * 主持人嗌「3、2、1、Go Shoot!」嗰刻撳嘅掣。
 *
 * 純粹播段聲，唔會郁分數、唔會郁場次狀態 —— 所以想播幾多次都得，
 * 打錯咗、聽唔到、要重嗌，撳過就係。
 */
export function GoShotButton() {
  return (
    <button className="goshot" onClick={playGoShot}>
      <span className="goshot__cue" aria-hidden="true" />
      <span className="goshot__count">3 · 2 · 1</span>
      <span className="goshot__go">GO SHOOT!</span>
      <span className="sr-only">撳一下播開波音效</span>
    </button>
  )
}
