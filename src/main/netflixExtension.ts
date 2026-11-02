import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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

/** The policy setup writes: Chrome installs the extension, and keeps it, from the update file; and no site sends notifications. */
export async function netflixPolicy(): Promise<string | null> {
  const info = await packed()
  if (!info) return null
  // Web notifications off: on a TV nobody can click a site's pop-up closed ("New Arrival" from Netflix sat in the
  // corner). Set by policy, so it also overrides a site that was let send them.
  return JSON.stringify({ ExtensionInstallForcelist: [`${info.id};file://${UPDATES}`], DefaultNotificationsSetting: 2 }, null, 2) + '\n'
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
  if ((await readFile(UPDATES, 'utf8').catch(() => '')) !== updates || !existsSync(CRX)) {
    await mkdir(STAGE, { recursive: true })
    // The .crx before the update file that names its version, so Chrome never finds one without the other.
    await copyFile(packedFile('vaportv-netflix.crx'), CRX)
    await writeFile(UPDATES, updates)
  }
  await replaceOlderInstall(info)
}

/** Where Chrome keeps the extensions it has installed: one folder per version, as <version>_<n>. */
const INSTALLED = (id: string): string => join(homedir(), '.var', 'app', BROWSER, 'config', 'google-chrome', 'Default', 'Extensions', id)

/**
 * Chrome looks for a newer version of a policy's extension only every few hours, and never while it's
 * kept running, so a new vaporTV's extension could wait a day (0.2.0 did). With Chrome closed, its copy
 * of an older version is taken away: at its next start Chrome installs the policy's extension afresh,
 * which is the version just staged. Only this extension's folder; nothing else of Chrome's.
 */
async function replaceOlderInstall(info: Packed): Promise<void> {
  const dir = INSTALLED(info.id)
  const versions = await readdir(dir).catch(() => [] as string[])
  if (versions.length === 0 || versions.some((v) => v.split('_')[0] === info.version)) return
  if (await chromeRunning()) return
  await rm(dir, { recursive: true, force: true })
  console.log(`steamtv: Chrome had vaporTV for Netflix ${versions.join(', ')}; it installs ${info.version} when it next starts`)
}

function chromeRunning(): Promise<boolean> {
  return new Promise((resolve) =>
    execFile('flatpak', ['ps', '--columns=application'], (err, stdout) => resolve(!err && stdout.split('\n').some((line) => line.trim() === BROWSER)))
  )
}
