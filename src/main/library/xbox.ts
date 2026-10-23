import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { cleanNoIntroTitle, type DiscGame } from './discs'

// Original Xbox games: a folder per game ("Halo 2 (USA)/"), holding its disc image (often
// "<name>.1.iso") and a dashboard launcher stub (default.xbe) that's left alone. The
// folder names the game: the image's name is sometimes cut short.

export type XboxGame = DiscGame

export async function scanXbox(root: string, titles: Record<string, string> = {}): Promise<XboxGame[]> {
  const games: XboxGame[] = []
  // A folder holding a disc image is a game; one without is a group (e.g. "PAL/"), looked into once more.
  const walk = async (dir: string, depth: number): Promise<void> => {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true }).catch(() => [])) {
      const rel = dir ? join(dir, entry.name) : entry.name
      if (entry.isFile() && /\.iso$/i.test(entry.name)) {
        games.push({ id: `xbox:${rel}`, title: titles[rel] ?? cleanNoIntroTitle(entry.name), path: join(root, rel), discs: [join(root, rel)] })
        continue
      }
      if (!entry.isDirectory()) continue
      const isos = (await readdir(join(root, rel)).catch(() => [] as string[])).filter((f) => /\.iso$/i.test(f)).sort()
      if (isos.length) {
        const path = join(root, rel, isos[0])
        games.push({ id: `xbox:${rel}`, title: titles[rel] ?? cleanNoIntroTitle(entry.name), path, discs: [path] })
      } else if (depth < 1) await walk(rel, depth + 1)
    }
  }
  await walk('', 0)
  return games.sort((a, b) => a.title.localeCompare(b.title))
}
