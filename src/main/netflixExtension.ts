import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { BROWSER } from './appSetup'

// vaporTV for Netflix (extensions/netflix), which lets the D-pad move around Netflix's
// website. Chrome installs it because a policy says to (setup writes it, with the admin
// password), from an update file pointing at the .crx. Both live in Chrome's own Flatpak
// folder, the one place its sandbox can read them; vaporTV refreshes them each start, so
// a new version of the extension reaches Chrome with a new vaporTV.

/** Chrome's Flatpak merges this host folder into its own policies. */
export const NETFLIX_POLICY = '/etc/opt/chrome/policies/managed/vaportv.json'
const STAGE = join(homedir(), '.var', 'app', BROWSER, 'vaportv')
const UPDATES = join(STAGE, 'netflix-updates.xml')
const CRX = join(STAGE, 'vaportv-netflix.crx')

interface Packed {
  id: string
  version: string
}

/** The packed extension shipped beside the app (scripts/pack-extension.mjs; package.json extraResources). */
function packedFile(file: string): string {
  return app.isPackaged ? join(process.resourcesPath, 'netflix', file) : join(app.getAppPath(), 'build', 'netflix', file)
}

async function packed(): Promise<Packed | null> {
  return readFile(packedFile('extension.json'), 'utf8').then(
    (text) => JSON.parse(text) as Packed,
    () => null
  )
}

/** The policy setup writes: Chrome installs the extension, and keeps it, from the update file. */
export async function netflixPolicy(): Promise<string | null> {
  const info = await packed()
  if (!info) return null
  return JSON.stringify({ ExtensionInstallForcelist: [`${info.id};file://${UPDATES}`] }, null, 2) + '\n'
}

/** Whether the policy in place is this one (so setup needn't ask for the password again). */
export async function netflixPolicyCurrent(): Promise<boolean> {
  const want = await netflixPolicy()
  return !!want && (await readFile(NETFLIX_POLICY, 'utf8').catch(() => '')) === want
}

/** Puts this version's .crx and update file where Chrome reads them. Only once Chrome is installed. */
export async function stageNetflixExtension(): Promise<void> {
  const info = await packed()
  if (!info || !existsSync(join(homedir(), '.var', 'app', BROWSER))) return
  const updates = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${info.id}'>
    <updatecheck codebase='file://${CRX}' version='${info.version}' />
  </app>
</gupdate>
`
  if ((await readFile(UPDATES, 'utf8').catch(() => '')) === updates && existsSync(CRX)) return
  await mkdir(STAGE, { recursive: true })
  // The .crx before the update file that names its version, so Chrome never finds one without the other.
  await copyFile(packedFile('vaportv-netflix.crx'), CRX)
  await writeFile(UPDATES, updates)
}
