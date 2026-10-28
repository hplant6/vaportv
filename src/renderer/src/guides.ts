import { guideIndex, guideTitle, parseMarkdown, type Block } from '../../shared/markdown'

// The guides in docs/guides, built into vaporTV: the same Markdown GitHub shows, so the
// two never disagree. Their order is the index's (docs/guides/README.md).

const sources = import.meta.glob<string>('../../../docs/guides/*.md', { query: '?raw', import: 'default', eager: true })
const images = import.meta.glob<string>('../../../docs/guides/images/*', { query: '?url', import: 'default', eager: true })

const GITHUB = 'https://github.com/hplant6/vaportv/blob/main/docs/guides/'

export interface Guide {
  file: string
  title: string
  /** What it covers, in a few words (from the index). */
  blurb: string
  blocks: Block[]
  /** The guide on GitHub, for reading it on a phone. */
  url: string
}

const byFile = new Map(Object.entries(sources).map(([path, text]) => [path.split('/').pop() ?? path, text]))

export const GUIDES: Guide[] = guideIndex(byFile.get('README.md') ?? '').flatMap(({ file, blurb }) => {
  const text = byFile.get(file)
  if (!text) return []
  const blocks = parseMarkdown(text)
  return [{ file, title: guideTitle(blocks), blurb, blocks, url: GITHUB + file }]
})

/** A picture a guide links to (images/x.webp), as the page can load it. */
export function guideImage(src: string): string | undefined {
  return images[`../../../docs/guides/${src.replace(/^\.\//, '')}`]
}
