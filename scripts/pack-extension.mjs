// Packs vaporTV for Netflix (extensions/netflix) into a signed .crx for Chrome to install:
// build/netflix/vaportv-netflix.crx, plus build/netflix/extension.json (its id, version and
// a hash of the sources it was packed from, so a release can tell it's out of date).
//
//   node scripts/pack-extension.mjs
//
// Chrome names an extension after its signing key, so the key never changes: it lives
// outside the repo, in ~/.config/vaportv/extension-key.pem (or $VAPORTV_EXTENSION_KEY).
// Lose it and every installed copy is orphaned; keep a backup.
//
// The .crx is CRX3: "Cr24", version 3, a protobuf header with the key and an RSA-SHA256
// signature, then a zip of the extension. Both are written here, so packing needs no Chrome.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

const SOURCE = 'extensions/netflix'
const OUT = 'build/netflix'
const KEY = process.env.VAPORTV_EXTENSION_KEY ?? join(homedir(), '.config', 'vaportv', 'extension-key.pem')

/** The files in the release build: manifest.json and what its content scripts name (not manifest.dev.json or debug.js). */
export async function sourceFiles() {
  const manifest = JSON.parse(await readFile(join(SOURCE, 'manifest.json'), 'utf8'))
  const named = manifest.content_scripts.flatMap((s) => [...(s.js ?? []), ...(s.css ?? [])])
  return ['manifest.json', ...new Set(named)]
}

/** A hash of the release build's files, recorded beside the .crx. */
export async function sourceHash() {
  const hash = createHash('sha256')
  for (const file of await sourceFiles()) hash.update(file).update('\0').update(await readFile(join(SOURCE, file)))
  return hash.digest('hex')
}

/** A zip of `files` ([name, contents]), deflated, with fixed dates so the same sources make the same zip. */
function zip(files) {
  const local = []
  const central = []
  let offset = 0
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name)
    const packed = deflateRawSync(data, { level: 9 })
    const fields = (header) => {
      header.writeUInt16LE(20, 4) // version needed
      header.writeUInt16LE(0, 6) // flags
      header.writeUInt16LE(8, 8) // deflate
      header.writeUInt16LE(0, 10) // time 00:00
      header.writeUInt16LE(0x21, 12) // date 1980-01-01
      header.writeUInt32LE(crc32(data), 14)
      header.writeUInt32LE(packed.length, 18)
      header.writeUInt32LE(data.length, 22)
      header.writeUInt16LE(nameBytes.length, 26)
    }
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    fields(head)
    local.push(head, nameBytes, packed)
    // The central directory's entry is the local header shifted by two bytes, plus a few more fields.
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4) // version made by
    const shifted = Buffer.alloc(30)
    fields(shifted)
    shifted.copy(entry, 6, 4, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)
    offset += head.length + nameBytes.length + packed.length
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, dir, end])
}

/** Protobuf: a length-delimited field. */
function field(number, bytes) {
  const varint = (n) => {
    const out = []
    for (; n > 0x7f; n >>>= 7) out.push((n & 0x7f) | 0x80)
    out.push(n)
    return Buffer.from(out)
  }
  return Buffer.concat([varint((number << 3) | 2), varint(bytes.length), bytes])
}

/** Chrome's id for a key: the first 16 bytes of its SHA-256, written with the letters a–p. */
function extensionId(publicKey) {
  return [...createHash('sha256').update(publicKey).digest().subarray(0, 16)]
    .map((b) => String.fromCharCode(97 + (b >> 4), 97 + (b & 15)))
    .join('')
}

async function main() {
  const key = createPrivateKey(await readFile(KEY).catch(() => {
    throw new Error(`No signing key at ${KEY}. It's the one every installed copy is tied to; restore it from your backup.`)
  }))
  const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' })
  const manifest = JSON.parse(await readFile(join(SOURCE, 'manifest.json'), 'utf8'))
  const archive = zip(await Promise.all((await sourceFiles()).map(async (f) => [f, await readFile(join(SOURCE, f))])))

  const crxId = createHash('sha256').update(publicKey).digest().subarray(0, 16)
  const signedData = field(1, crxId)
  const length = Buffer.alloc(4)
  length.writeUInt32LE(signedData.length)
  const signature = sign('sha256', Buffer.concat([Buffer.from('CRX3 SignedData\0'), length, signedData, archive]), key)
  const header = Buffer.concat([field(2, Buffer.concat([field(1, publicKey), field(2, signature)])), field(10000, signedData)])
  const prefix = Buffer.alloc(12)
  prefix.write('Cr24', 0)
  prefix.writeUInt32LE(3, 4)
  prefix.writeUInt32LE(header.length, 8)

  await mkdir(OUT, { recursive: true })
  await writeFile(join(OUT, 'vaportv-netflix.crx'), Buffer.concat([prefix, header, archive]))
  const info = { id: extensionId(publicKey), version: manifest.version, source: await sourceHash() }
  await writeFile(join(OUT, 'extension.json'), JSON.stringify(info, null, 2) + '\n')
  console.log(`packed vaporTV for Netflix ${info.version} (${info.id})`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
