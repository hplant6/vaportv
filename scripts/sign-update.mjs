// Signs an AppImage for vaporTV's updater: writes <file>.sig, an Ed25519 signature (base64)
// of the file's SHA-256. The updater installs only downloads whose signature checks out
// against the public key written in src/main/updater.ts. Run by scripts/release.sh.
//
//   node scripts/sign-update.mjs dist/vaporTV.AppImage
//
// The key lives outside the repo, in ~/.config/vaportv/update-key.pem (or $VAPORTV_UPDATE_KEY).
// Lose it and installed copies can't update past the last release it signed (each would
// need its AppImage replaced by hand); keep a backup.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const KEY = process.env.VAPORTV_UPDATE_KEY ?? join(homedir(), '.config', 'vaportv', 'update-key.pem')

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/sign-update.mjs <AppImage>')
  process.exit(1)
}

const key = createPrivateKey(
  await readFile(KEY).catch(() => {
    throw new Error(`No update signing key at ${KEY}. It's the one every installed copy trusts; restore it from your backup.`)
  })
)
// A signature from any other key would make every copy refuse the release.
const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64')
if (!(await readFile('src/main/updater.ts', 'utf8')).includes(`'${publicKey}'`)) {
  throw new Error(`${KEY} isn't the key src/main/updater.ts trusts; not signing.`)
}

const hash = createHash('sha256')
for await (const chunk of createReadStream(file)) hash.update(chunk)
await writeFile(`${file}.sig`, sign(null, hash.digest(), key).toString('base64') + '\n')
console.log(`Signed ${file}`)
