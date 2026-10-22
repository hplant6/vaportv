import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import type { IntroSettings } from '../shared/types'
import type { Config } from './config'
import { artUrl } from './library/art'

// The intro video played as vaporTV opens: vaporTV's own (shipped in the page's public
// folder), any video in INTRO_FOLDER, or none. Chosen in Settings → General.

export const INTRO_FOLDER = join(homedir(), 'Videos', 'vaporTV Intros')
/** The page-relative path of vaporTV's own intro. */
const DEFAULT_INTRO = 'intro/vaportv.webm'
const VIDEO = new Set(['.mp4', '.webm', '.mkv', '.mov', '.m4v'])

async function folderVideos(): Promise<string[]> {
  const names = await readdir(INTRO_FOLDER).catch(() => [] as string[])
  return names.filter((name) => VIDEO.has(extname(name).toLowerCase()) && !name.startsWith('.')).sort((a, b) => a.localeCompare(b))
}

/** The choices, the one chosen (falling back to vaporTV's if its file has gone), and what to play. */
export async function introSettings(config: Config): Promise<IntroSettings> {
  const videos = await folderVideos()
  const wanted = config.introVideo ?? 'default'
  const choice = wanted === 'off' || wanted === 'default' || videos.includes(wanted) ? wanted : 'default'
  return {
    choice,
    url: choice === 'off' ? null : choice === 'default' ? DEFAULT_INTRO : artUrl(join(INTRO_FOLDER, choice)),
    choices: [
      { id: 'off', name: 'Off' },
      { id: 'default', name: 'vaporTV' },
      // A file's name, without its extension, as its title.
      ...videos.map((name) => ({ id: name, name: name.slice(0, -extname(name).length) }))
    ],
    folder: INTRO_FOLDER.replace(homedir(), '~')
  }
}
