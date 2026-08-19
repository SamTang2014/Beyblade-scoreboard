/**
 * 攞去 clipboard。true = 成功；false = 兩條路都唔通，caller 要彈手動框出嚟。
 *
 * navigator.clipboard 淨係喺 https 同 localhost 先有 —— 場地部機行 http LAN
 * 位址（例如 172.20.x.x:5173）嗰陣係 undefined。舊法 execCommand 冇呢個限制，
 * 頂得住呢種場合。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard === undefined) throw new Error('冇 clipboard')
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyByExec(text)
  }
}

function copyByExec(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}
