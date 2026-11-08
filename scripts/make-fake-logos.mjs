#!/usr/bin/env node
/**
 * Generate simple PNG logos for the fake-gitlab fixture tree.
 *
 * Every folder (group or project) gets a `logo.png` with the entity's initials
 * on a deterministic colored tile. The seeder uploads these files as the
 * group/project avatar on GitLab.
 *
 * Usage:
 *   node scripts/make-fake-logos.mjs           # only create missing logos
 *   node scripts/make-fake-logos.mjs --force   # regenerate every logo
 */

import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const SIZE = 96
const RADIUS = 22
const SCALE = 9
const LETTER_GAP = 4

const PALETTE = ['#e24329', '#1f9d55', '#2f6fed', '#7b5cf0', '#c2185b', '#0f9b8e', '#d97706']

// Tiny 3x5 font, limited to the letters used by the fixture names.
const GLYPHS = {
  A: ['010', '101', '111', '101', '101'],
  C: ['011', '100', '100', '100', '011'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  L: ['100', '100', '100', '100', '111'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  W: ['101', '101', '101', '111', '101'],
}

const args = new Set(process.argv.slice(2))
const FORCE = args.has('--force') || args.has('-f')
const root = resolve(process.cwd(), process.env.FAKE_GITLAB_DIR ?? 'fake-gitlab')

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let value = n
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[n] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(pixels) {
  const stride = SIZE * 4
  const raw = Buffer.alloc((stride + 1) * SIZE)
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    )
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(SIZE, 0)
  header.writeUInt32BE(SIZE, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function colorFor(name) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hexToRgb(PALETTE[hash % PALETTE.length])
}

function initialsFor(name) {
  const words = name.split(/[^a-z0-9]+/i).filter(Boolean)
  const letters =
    words.length > 1 ? `${words[0][0]}${words[1][0]}` : `${name.slice(0, 2)}`.replace(/[^a-z0-9]/gi, '')
  return (letters || name.slice(0, 1) || '?').toUpperCase().slice(0, 2)
}

function insideRoundedRect(x, y) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false
  const half = SIZE / 2
  const cx = x < RADIUS ? RADIUS : x >= SIZE - RADIUS ? SIZE - RADIUS - 1 : half
  const cy = y < RADIUS ? RADIUS : y >= SIZE - RADIUS ? SIZE - RADIUS - 1 : half
  if (cx === half || cy === half) return true
  return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2
}

function drawLogo(name) {
  const [red, green, blue] = colorFor(name)
  const pixels = new Uint8Array(SIZE * SIZE * 4)

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!insideRoundedRect(x, y)) continue
      const offset = (y * SIZE + x) * 4
      pixels[offset] = red
      pixels[offset + 1] = green
      pixels[offset + 2] = blue
      pixels[offset + 3] = 255
    }
  }

  const letters = initialsFor(name).split('')
  const textWidth = letters.length * 3 * SCALE + (letters.length - 1) * LETTER_GAP
  const textHeight = 5 * SCALE
  const startX = Math.round((SIZE - textWidth) / 2)
  const startY = Math.round((SIZE - textHeight) / 2)

  letters.forEach((letter, index) => {
    const glyph = GLYPHS[letter] ?? ['111', '101', '101', '101', '111']
    const originX = startX + index * (3 * SCALE + LETTER_GAP)

    glyph.forEach((row, rowIndex) => {
      for (let column = 0; column < 3; column += 1) {
        if (row[column] !== '1') continue
        for (let dy = 0; dy < SCALE; dy += 1) {
          for (let dx = 0; dx < SCALE; dx += 1) {
            const x = originX + column * SCALE + dx
            const y = startY + rowIndex * SCALE + dy
            if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue
            if (!insideRoundedRect(x, y)) continue
            const offset = (y * SIZE + x) * 4
            pixels[offset] = 255
            pixels[offset + 1] = 255
            pixels[offset + 2] = 255
            pixels[offset + 3] = 255
          }
        }
      }
    })
  })

  return encodePng(pixels)
}

function walk(directory) {
  const logo = join(directory, 'logo.png')
  if (FORCE || !existsSync(logo)) {
    writeFileSync(logo, drawLogo(basename(directory)))
    console.log(`${FORCE ? '~' : '+'} ${logo.slice(process.cwd().length + 1)}`)
  }

  const children = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name))

  for (const child of children) walk(join(directory, child.name))
}

if (!existsSync(root)) {
  console.error(`Fixture folder not found: ${root}`)
  process.exit(1)
}

walk(root)
console.log('\nLogos ready. Run `npm run seed:fake-gitlab` to upload them.')
