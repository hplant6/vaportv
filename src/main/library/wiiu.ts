import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Wii U games for Cemu, as unpacked title folders ("Name [Game] [0005000010184d00]"):
// code/ holds the .rpx Cemu boots, meta/meta.xml the game's own name.

export interface WiiUGame {
  /** `wiiu:<folder name>` */
  id: string
  title: string
  /** The .rpx Cemu opens. */
  path: string
}

/** The text of an XML element (one level, no attributes needed). */
function xmlText(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml)
  return match?.[1]
}

const ENTITIES: Record<string, string> = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>' }

/**
 * The game's English name from meta.xml ("Mario &amp; Luigi:\nSuperstar Saga" → "Mario & Luigi:
 * Superstar Saga"), without trademark signs; else the folder's name before its tags.
 */
export function wiiUTitle(metaXml: string | null, folder: string): string {
  const raw = metaXml ? xmlText(metaXml, 'longname_en') : undefined
  const fromMeta = raw
    ?.replace(/&(\w+);/g, (all, name: string) => ENTITIES[name] ?? all)
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return fromMeta || folder.replace(/\s*\[.*$/, '').trim()
}

/** The .rpx to boot: the one cos.xml names, else the only (or first) one in code/. */
async function bootFile(dir: string): Promise<string | null> {
  const code = join(dir, 'code')
  const rpxs = (await readdir(code).catch(() => [] as string[])).filter((f) => /\.rpx$/i.test(f)).sort()
  if (rpxs.length === 0) return null
  const named = xmlText((await readFile(join(code, 'cos.xml'), 'utf8').catch(() => '')) ?? '', 'argstr')?.trim()
  const chosen = named && rpxs.find((f) => f.toLowerCase() === named.toLowerCase())
  return join(code, chosen || rpxs[0])
}

/** Every title folder with a bootable .rpx (Cemu's own mlc01 and anything else are skipped), by title. */
export async function scanWiiU(root: string, titles: Record<string, string> = {}): Promise<WiiUGame[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const games = await Promise.all(
    entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map(async (e): Promise<WiiUGame | null> => {
        const dir = join(root, e.name)
        const path = await bootFile(dir)
        if (!path) return null
        const meta = await readFile(join(dir, 'meta', 'meta.xml'), 'utf8').catch(() => null)
        return { id: `wiiu:${e.name}`, title: titles[e.name] ?? wiiUTitle(meta, e.name), path }
      })
  )
  return games.filter((g): g is WiiUGame => g !== null).sort((a, b) => a.title.localeCompare(b.title))
}
