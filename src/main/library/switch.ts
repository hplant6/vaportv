import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface SwitchGame {
  /** `switch:<folder or file name>`, stable across rescans. */
  id: string
  title: string
  /** 16-hex-digit Switch title id of the base game, when the file name carries one. */
  titleId?: string
  /** The file Ryujinx should open: the base game, not an update or DLC. */
  path: string
}

const GAME_FILE = /\.(nsp|nsz|xci|xcz)$/i
// "Bayonetta [010076F0049A2000][v0][BASE].nsp" → name, title id, version, kind
const TAGGED = /^(.*?)\s*\[([0-9A-Fa-f]{16})\](?:\[v\d+\])?(?:\[(BASE|UPD|DLC)\])?/

/**
 * A readable title from a release folder or file name: "Astral.Chain.NSW-VENOM",
 * "Bloodstained_Ritual_of_the_Night_NSW-VENOM", "Cruisn_Blast.xci".
 */
export function cleanTitle(name: string): string {
  return (
    name
      .replace(GAME_FILE, '')
      // Release-group and region tags: NSW-VENOM, _NSW-HR, .retail-Rakuvfinhel, _MULTI, _JPN
      .replace(/[._ ](NSW|Switch|retail|MULTI|JPN|USA|US|EUR|PROPER)([._ -].*)?$/i, '')
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Picks the base game out of a game folder's files. */
function baseFile(files: string[]): { file: string; title?: string; titleId?: string } | null {
  const games = files.filter((f) => GAME_FILE.test(f))
  for (const file of games) {
    const tagged = TAGGED.exec(file)
    if (!tagged) continue
    const [, name, titleId, kind] = tagged
    // Base titles end in 000; updates end in 800 and DLC elsewhere.
    if (kind === 'BASE' || (!kind && titleId.toUpperCase().endsWith('000'))) {
      return { file, title: name.trim(), titleId: titleId.toUpperCase() }
    }
  }
  // Cartridge dumps (.xci) are a single file holding the whole game. Otherwise a
  // lone untagged file is the game; tagged updates and DLC never are.
  const untagged = games.filter((f) => !TAGGED.test(f))
  const cart = games.find((f) => /\.(xci|xcz)$/i.test(f)) ?? (untagged.length === 1 ? untagged[0] : undefined)
  return cart ? { file: cart } : null
}

/**
 * Switch games under `root`: one per folder (base game plus its updates/DLC), or a
 * loose game file. `titles` overrides names by folder or file name.
 */
export async function scanSwitch(root: string, titles: Record<string, string> = {}): Promise<SwitchGame[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const games: SwitchGame[] = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const files = await readdir(join(root, entry.name)).catch(() => [] as string[])
      const base = baseFile(files)
      if (!base) continue
      games.push({
        id: `switch:${entry.name}`,
        title: titles[entry.name] ?? base.title ?? cleanTitle(entry.name),
        titleId: base.titleId,
        path: join(root, entry.name, base.file)
      })
    } else if (GAME_FILE.test(entry.name)) {
      const tagged = TAGGED.exec(entry.name)
      if (tagged?.[3] && tagged[3] !== 'BASE') continue
      games.push({
        id: `switch:${entry.name}`,
        title: titles[entry.name] ?? tagged?.[1]?.trim() ?? cleanTitle(entry.name),
        titleId: tagged?.[2]?.toUpperCase(),
        path: join(root, entry.name)
      })
    }
  }
  return games.sort((a, b) => a.title.localeCompare(b.title))
}
