/**
 * Copy 一段字，唔 work 就老實講。
 *
 * `navigator.clipboard` **淨係喺 secure context 先有**（HTTPS 或者 localhost）。
 * 主辦好可能喺 LAN IP 上面開個 app（`http://192.168.1.5:5173`）嚟試 ——
 * 嗰個唔算 secure context，粒掣會靜靜雞失敗，佢仲以為 copy 咗。
 *
 * 所以先試新 API，唔得就退返去 `execCommand('copy')`（舊、deprecated，
 * 但喺 plain HTTP 度仲行得），再唔得就返 false 等介面叫人自己揀。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 跌落去下面條路。
  }

  try {
    const box = document.createElement('textarea')
    box.value = text
    // 唔可以 display:none —— 揀唔到嘅嘢 copy 唔到。
    box.style.position = 'fixed'
    box.style.opacity = '0'
    box.style.pointerEvents = 'none'
    document.body.appendChild(box)
    box.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(box)
    return ok
  } catch {
    return false
  }
}
