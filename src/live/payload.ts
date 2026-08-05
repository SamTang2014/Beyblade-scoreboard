/**
 * 分享 link 入面嗰橛嘢。
 *
 * 只放 script id（`AKfycb…` 嗰橛）唔放成條網址 —— 慳返約 40 字元，
 * 條 link 短啲，send 落 WhatsApp 冇咁易斷行。
 */
export interface LivePayload {
  /** Apps Script deployment id。 */
  s: string
  /** edit 定 view token。段 script 睇呢個決定你做到咩。 */
  k: string
}

const PREFIX = 'https://script.google.com/macros/s/'

/** base64url —— 擺得入 URL，冇 `+` `/` `=`。 */
function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string | null {
  try {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function encodePayload(p: LivePayload): string {
  return toBase64Url(JSON.stringify(p))
}

/** 條 link 係人 copy 嚟 copy 去嘅，爛咗好平常 —— 爛就返 null，唔好掟錯。 */
export function decodePayload(raw: string): LivePayload | null {
  const json = fromBase64Url(raw)
  if (json === null) return null
  try {
    const v: unknown = JSON.parse(json)
    if (typeof v !== 'object' || v === null) return null
    const { s, k } = v as Record<string, unknown>
    if (typeof s !== 'string' || s === '') return null
    if (typeof k !== 'string' || k === '') return null
    return { s, k }
  } catch {
    return null
  }
}

export function scriptUrl(scriptId: string): string {
  return `${PREFIX}${scriptId}/exec`
}

/**
 * 主辦貼咩入嚟都收：成條網址、帶住 query 嘅網址、前後有空格、或者淨係個 id。
 *
 * 貼錯嘢係設定流程最易出事嗰步，所以呢度寬鬆啲 —— 但唔似嘢就要老實返 null，
 * 唔好靜靜雞收咗個爛 id，等到「開始直播」先報一個唔知乜嘢錯。
 */
export function parseScriptId(input: string): string | null {
  const s = input.trim()
  if (s === '') return null

  // 有 prefix 就唔使靠長度猜 —— 條網址本身已經係證據。
  if (s.startsWith(PREFIX)) {
    const id = (s.slice(PREFIX.length).split('/')[0] ?? '').trim()
    return /^[A-Za-z0-9_-]+$/.test(id) ? id : null
  }

  // 淨係貼個 id 就冇證據，要靠個樣估。真嘅 deployment id 成 60 個字，
  // 所以要夠長先當佢係 —— 唔係 'helloworld' 都會當啱。
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null
}
