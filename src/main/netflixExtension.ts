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

/** Chrome's settings files: each may hold an extension's record (installed version, where) and its checksum. */
const PREFS = ['Preferences', 'Secure Preferences'].map((name) => join(homedir(), '.var', 'app', BROWSER, 'config', 'google-chrome', 'Default', name))

/**
 * Chrome looks for a newer version of a policy's extension only every few hours, and never while it's
 * kept running, so a new vaporTV's extension could wait a day (0.2.0 did). With Chrome closed, its copy
 * of an older version is taken away, folder and record both (with the folder alone gone Chrome thinks it
 * installed and broken, and loads nothing): at its next start Chrome installs the policy's extension
 * afresh, the version just staged. Only this extension's; nothing else of Chrome's.
 */
async function replaceOlderInstall(info: Packed): Promise<void> {
  const dir = INSTALLED(info.id)
  const versions = await readdir(dir).catch(() => [] as string[])
  const recorded = await recordedVersion(info.id)
  const current = versions.some((v) => v.split('_')[0] === info.version) && (recorded === null || recorded === info.version)
  if ((versions.length === 0 && recorded === null) || current) return
  if (await chromeRunning()) return
  await rm(dir, { recursive: true, force: true })
  for (const file of PREFS) await forget(file, info.id)
  console.log(`steamtv: Chrome had vaporTV for Netflix ${versions.join(', ') || recorded}; it installs ${info.version} when it next starts`)
}

/** The version Chrome's settings say it has installed, or null if they don't list it. */
async function recordedVersion(id: string): Promise<string | null> {
  for (const file of PREFS) {
    const prefs = await readFile(file, 'utf8').then((text) => JSON.parse(text), () => null)
    const entry = prefs?.extensions?.settings?.[id]
    if (entry) return entry.manifest?.version ?? (typeof entry.path === 'string' ? (entry.path.split('/').pop() ?? '').split('_')[0] : 'unknown')
  }
  return null
}

/** Takes the extension's record (and its checksum) out of one of Chrome's settings files. */
export async function forget(file: string, id: string): Promise<void> {
  const text = await readFile(file, 'utf8').catch(() => null)
  if (!text) return
  const prefs = JSON.parse(text)
  let changed = false
  if (prefs.extensions?.settings?.[id]) {
    delete prefs.extensions.settings[id]
    changed = true
  }
  if (prefs.protection?.macs?.extensions?.settings?.[id]) {
    delete prefs.protection.macs.extensions.settings[id]
    changed = true
  }
  if (changed) await writeFile(file, JSON.stringify(prefs))
}

function chromeRunning(): Promise<boolean> {
  return new Promise((resolve) =>
    execFile('flatpak', ['ps', '--columns=application'], (err, stdout) => resolve(!err && stdout.split('\n').some((line) => line.trim() === BROWSER)))
  )
}
