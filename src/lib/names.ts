/**
 * 一串名拆做一個個名。
 *
 * 分隔符：換行、逗號（半形全形）、頓號。名入面嘅空格唔郁 ——
 * 「阿 May」係一個名，唔會拆開。串入面自己重複嘅，後嗰個唔要。
 *
 * copy 名單嗰邊出嘅係一行一個名，所以 copy 完 paste 得返入嚟。
 */
export function splitNames(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/[\n\r,，、]+/)) {
    const name = raw.trim()
    if (name !== '' && !out.includes(name)) out.push(name)
  }
  return out
}
