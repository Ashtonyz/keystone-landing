/**
 * Generates the Scaffold icon set. No dependencies — raw PNG encoding via
 * node:zlib, and an ICO container wrapping PNGs.
 *
 *   node tools/make-icons.mjs
 *
 * The mark is the nav's diamond, inverted onto an accent tile so it stays
 * visible against both light and dark browser chrome (a near-black icon
 * disappears into a dark tab strip).
 */

import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Straight from assets/base.css: --accent, and the btn-accent foreground.
const ACCENT = [0xee, 0xb3, 0x5c, 0xff]
const INK    = [0x17, 0x10, 0x08, 0xff]

const CORNER_RADIUS = 0.22 // of the tile
const DIAMOND_HALF  = 0.30 // half-diagonal, of the tile
const SS = 4               // supersampling factor for antialiasing

/** Rounded-rect coverage test in unit space (0..1). */
function inTile(x, y) {
  const r = CORNER_RADIUS
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

/** Diamond (square rotated 45°) centred in unit space. */
function inDiamond(x, y) {
  return Math.abs(x - 0.5) + Math.abs(y - 0.5) <= DIAMOND_HALF
}

/** Render one RGBA buffer at `size`, supersampled then box-filtered. */
function render(size) {
  const px = Buffer.alloc(size * size * 4)
  const step = 1 / (size * SS)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let tile = 0
      let mark = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x * SS + sx + 0.5) * step
          const v = (y * SS + sy + 0.5) * step
          if (inTile(u, v)) tile++
          if (inDiamond(u, v)) mark++
        }
      }

      const n = SS * SS
      const tileA = tile / n
      const markA = mark / n

      // Composite: ink diamond over accent tile, the whole thing masked by
      // the tile's own alpha so the rounded corners stay transparent.
      const i = (y * size + x) * 4
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round(ACCENT[c] * (1 - markA) + INK[c] * markA)
      }
      px[i + 3] = Math.round(255 * tileA)
    }
  }
  return px
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8    // bit depth
  ihdr[9] = 6    // colour type: RGBA
  ihdr[10] = 0   // deflate
  ihdr[11] = 0   // adaptive filtering
  ihdr[12] = 0   // no interlace

  // Each scanline is prefixed with its filter type (0 = None).
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO container holding PNG images (supported everywhere that matters). */
function encodeIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)              // reserved
  header.writeUInt16LE(1, 2)              // type: icon
  header.writeUInt16LE(entries.length, 4)

  const dir = Buffer.alloc(16 * entries.length)
  let offset = header.length + dir.length

  entries.forEach(({ size, png }, i) => {
    const o = i * 16
    dir[o] = size >= 256 ? 0 : size       // 0 means 256
    dir[o + 1] = size >= 256 ? 0 : size
    dir[o + 2] = 0                        // palette size
    dir[o + 3] = 0                        // reserved
    dir.writeUInt16LE(1, o + 4)           // colour planes
    dir.writeUInt16LE(32, o + 6)          // bits per pixel
    dir.writeUInt32BE
    dir.writeUInt32LE(png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += png.length
  })

  return Buffer.concat([header, dir, ...entries.map(e => e.png)])
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Scaffold">
  <rect width="64" height="64" rx="14" fill="#eeb35c"/>
  <path d="M32 12.8 51.2 32 32 51.2 12.8 32Z" fill="#171008"/>
</svg>
`

mkdirSync(join(root, 'assets'), { recursive: true })

const png = (n) => encodePng(n, render(n))

writeFileSync(join(root, 'favicon.svg'), svg)
writeFileSync(join(root, 'favicon.ico'), encodeIco(
  [16, 32, 48].map(size => ({ size, png: png(size) }))
))
writeFileSync(join(root, 'apple-touch-icon.png'), png(180))
writeFileSync(join(root, 'assets/icon-192.png'), png(192))
writeFileSync(join(root, 'assets/icon-512.png'), png(512))

console.log('wrote favicon.svg, favicon.ico, apple-touch-icon.png, assets/icon-{192,512}.png')
