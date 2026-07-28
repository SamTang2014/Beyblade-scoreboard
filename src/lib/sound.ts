import goShotUrl from '../assets/321-go-shot.mp3'

/**
 * 「3、2、1、Go Shoot!」開波音效。
 *
 * 全個 app 共用一個 <audio>：連撳兩次會由頭播過，唔會兩把聲叠埋。
 * 唔喺 module 頂手就 new，因為 test 行喺 node 度，嗰度冇 Audio。
 */
let clip: HTMLAudioElement | null = null

function element(): HTMLAudioElement | null {
  if (clip !== null) return clip
  if (typeof Audio === 'undefined') return null
  clip = new Audio(goShotUrl)
  clip.preload = 'auto'
  return clip
}

/**
 * 播開波音效。播唔到就當冇事 —— 瀏覽器封咗自動播放、部機收咗聲、
 * 個檔載唔到，全部都唔可以拋 error 出嚟阻住主持人入分。
 */
export function playGoShot(): void {
  const audio = element()
  if (audio === null) return
  try {
    audio.currentTime = 0
    void audio.play().catch(() => {})
  } catch {
    // 冇聲就冇聲，比賽照打。
  }
}
