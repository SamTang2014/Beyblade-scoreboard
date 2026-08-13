import { assistLabel, bladeIdentity, type Combo, type Team } from './team'

/**
 * 出張分享卡（PNG）。
 *
 * 1080×1350 係 4:5 —— IG／小紅書貼得落唔會俾人切走個底。呢張卡係「帶得走
 * 嘅成品」：個網站唔存隊伍，所以出到嚟嗰張圖就係用戶唯一嘅記錄。
 *
 * 色值全部寫死：canvas 讀唔到 CSS custom property，所以呢度係 tokens.css
 * `.is-dark` 嗰套嘅硬 copy。改主題色記得兩邊一齊改。
 */

// 對應 tokens.css `.is-dark`：--floor / --slab / --ink / --ink-soft / --line / --accent(金)
const FLOOR = '#0c0d12'
const SLAB = '#16181f'
const INK = '#f4f5f7'
const INK_SOFT = '#a2a9ba'
const LINE = '#2b2f3b'
const GOLD = '#ffc046'

const W = 1080
const H = 1350

/** 一張相 load 唔到唔可以拖冧成張卡，所以 fail 同 timeout 都返 null 由上面畫灰格。 */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (src === '') return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    // i.ibb.co 出 `access-control-allow-origin: *`，唔加呢句畫落 canvas
    // 會污染咗塊 canvas，toBlob 直接掟 SecurityError。
    img.crossOrigin = 'anonymous'
    const done = (v: HTMLImageElement | null) => {
      clearTimeout(timer)
      resolve(v)
    }
    // 唔設限就會有張死 link 吊住成個 Promise.all，個掣一世轉圈。
    const timer = setTimeout(() => done(null), 5000)
    img.onload = () => done(img)
    img.onerror = () => done(null)
    img.src = src
  })
}

/** 塞得落個框就照塞，塞唔落按比例縮 —— 唔可以拉變形，啲刃靠個樣認。 */
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  box: number,
): void {
  const scale = Math.min(box / img.width, box / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, x + (box - w) / 2, y + (box - h) / 2, w, h)
}

interface ComboImages {
  blade: HTMLImageElement | null
  ratchet: HTMLImageElement | null
  bit: HTMLImageElement | null
  assist: HTMLImageElement | null
}

async function loadComboImages(c: Combo): Promise<ComboImages> {
  const [blade, ratchet, bit, assist] = await Promise.all([
    loadImage(c.blade?.img ?? ''),
    loadImage(c.ratchet?.img ?? ''),
    loadImage(c.bit?.img ?? ''),
    loadImage(c.assist?.img ?? ''),
  ])
  return { blade, ratchet, bit, assist }
}

export async function renderTeamCard(team: Team): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('畫唔到張卡（個瀏覽器唔支援 canvas）。')

  // 全部相一齊拉，唔好一張等一張 —— 十幾張相排隊 load 隨時半分鐘。
  const images = await Promise.all(team.combos.map(loadComboImages))

  ctx.fillStyle = FLOOR
  ctx.fillRect(0, 0, W, H)

  const pad = 72
  const title = team.name.trim() === '' ? '我隊陀螺' : team.name.trim()

  ctx.fillStyle = GOLD
  ctx.font = '800 76px "PingFang HK", "Noto Sans HK", sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(title, pad, 148)

  ctx.fillStyle = INK_SOFT
  ctx.font = '600 34px "PingFang HK", "Noto Sans HK", sans-serif'
  ctx.fillText(team.size === 3 ? '3on3' : '4 隻禁 1', pad, 200)

  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pad, 236)
  ctx.lineTo(W - pad, 236)
  ctx.stroke()

  // 三隻同四隻共用同一塊地方，行高跟住隻數變 —— 唔係四隻嗰陣會爆出界。
  const top = 276
  const bottom = H - 150
  const rowH = (bottom - top) / team.combos.length
  const box = Math.min(rowH - 24, 190)

  for (const [i, combo] of team.combos.entries()) {
    const y = top + rowH * i
    const shotX = pad
    const shotY = y + (rowH - box) / 2

    ctx.fillStyle = SLAB
    ctx.fillRect(shotX, shotY, box, box)

    const imgs = images[i] ?? null
    if (imgs?.blade != null) {
      drawContain(ctx, imgs.blade, shotX, shotY, box)
    } else {
      // 冇相都要見到個位，唔好留個窿當冇嘢。
      ctx.fillStyle = INK_SOFT
      ctx.font = '600 26px "PingFang HK", "Noto Sans HK", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('冇圖', shotX + box / 2, shotY + box / 2 + 9)
      ctx.textAlign = 'left'
    }

    const textX = shotX + box + 36

    ctx.fillStyle = GOLD
    ctx.font = '800 44px "PingFang HK", "Noto Sans HK", sans-serif'
    ctx.fillText(`${i + 1}`, textX, shotY + 48)

    ctx.fillStyle = INK
    ctx.font = '700 46px "PingFang HK", "Noto Sans HK", sans-serif'
    // 個名太長就淨要本體名（剝走顏色版／塗層嗰截），好過畫到出界。
    const name = combo.blade?.name ?? '？'
    const fitted = ctx.measureText(name).width > W - textX - pad
      ? bladeIdentity(name)
      : name
    ctx.fillText(fitted, textX + 52, shotY + 48)

    ctx.fillStyle = INK_SOFT
    ctx.font = '600 32px "PingFang HK", "Noto Sans HK", sans-serif'
    ctx.fillText(combo.blade?.id ?? '', textX, shotY + 94)

    // 固鎖／軸心／輔助都要有樣睇 —— 淨係得個「9-60」你唔會知隻鎖生成點。
    // 細圖貼住戰刃格個底掃過去，每張側邊跟返個名。
    const THUMB = 84
    const thumbY = shotY + box - THUMB
    const partBits: { img: HTMLImageElement | null; label: string }[] = [
      { img: imgs?.ratchet ?? null, label: combo.ratchet?.name ?? '？' },
      { img: imgs?.bit ?? null, label: combo.bit?.name ?? '？' },
    ]
    if (combo.assist !== null) {
      partBits.push({ img: imgs?.assist ?? null, label: assistLabel(combo.assist.name) })
    }

    let px = textX
    ctx.font = '600 34px "PingFang HK", "Noto Sans HK", sans-serif'
    for (const p of partBits) {
      ctx.fillStyle = SLAB
      ctx.fillRect(px, thumbY, THUMB, THUMB)
      if (p.img !== null) drawContain(ctx, p.img, px, thumbY, THUMB)
      ctx.fillStyle = INK
      ctx.fillText(p.label, px + THUMB + 14, thumbY + THUMB / 2 + 12)
      px += THUMB + 14 + ctx.measureText(p.label).width + 44
    }
  }

  ctx.strokeStyle = LINE
  ctx.beginPath()
  ctx.moveTo(pad, H - 118)
  ctx.lineTo(W - pad, H - 118)
  ctx.stroke()

  ctx.fillStyle = INK_SOFT
  ctx.font = '700 30px "PingFang HK", "Noto Sans HK", sans-serif'
  ctx.fillText('陀螺計分板 · 零件圖鑑', pad, H - 70)
  ctx.font = '500 26px "PingFang HK", "Noto Sans HK", sans-serif'
  ctx.fillText('samtang2014.github.io/Beyblade-scoreboard', pad, H - 32)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('出唔到張圖。'))
      else resolve(blob)
    }, 'image/png')
  })
}
