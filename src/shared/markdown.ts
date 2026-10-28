// The guides (docs/guides/*.md) are written for GitHub, and vaporTV shows the same files
// in Settings → Help. This reads the part of Markdown they use: headings, paragraphs,
// lists (one level), tables, pictures on a line of their own, quotes (for tips), fenced code and,
// within a line, bold, italic, code and links. Anything else reads as plain text.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'quote'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] }

const HEADING = /^(#{1,3})\s+(.*)$/
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/
const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const FENCE = /^```/
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

/** A table row's cells: `| a | b |` → ['a', 'b']. */
const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  // Lines that carry on the block above (a wrapped paragraph or list item).
  const continues = (line: string): boolean =>
    line.trim() !== '' && !HEADING.test(line) && !BULLET.test(line) && !NUMBERED.test(line) && !FENCE.test(line) && !line.startsWith('>') && !line.trim().startsWith('|')

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('<!--')) {
      i++
      continue
    }
    if (FENCE.test(line)) {
      const code: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++])
      i++
      blocks.push({ kind: 'code', text: code.join('\n') })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2].trim()) })
      i++
      continue
    }
    const image = IMAGE.exec(line.trim())
    if (image) {
      blocks.push({ kind: 'image', alt: image[1], src: image[2] })
      i++
      continue
    }
    if (line.startsWith('>')) {
      const text: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) text.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push({ kind: 'quote', children: parseInline(text.join(' ').trim()) })
      continue
    }
    if (line.trim().startsWith('|') && TABLE_RULE.test(lines[i + 1] ?? '')) {
      const head = cells(line).map(parseInline)
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]).map(parseInline))
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    const ordered = NUMBERED.test(line)
    if (ordered || BULLET.test(line)) {
      const marker = ordered ? NUMBERED : BULLET
      const items: string[] = []
      while (i < lines.length) {
        const item = marker.exec(lines[i])
        if (item) items.push(item[1])
        else if (items.length && /^\s+\S/.test(lines[i]) && continues(lines[i])) items[items.length - 1] += ' ' + lines[i].trim()
        else break
        i++
      }
      blocks.push({ kind: 'list', ordered, items: items.map((item) => parseInline(item.trim())) })
      continue
    }
    const text = [line.trim()]
    i++
    while (i < lines.length && continues(lines[i]) && !IMAGE.test(lines[i].trim())) text.push(lines[i++].trim())
    blocks.push({ kind: 'paragraph', children: parseInline(text.join(' ')) })
  }
  return blocks
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let plain = ''
  const flush = (): void => {
    if (plain) out.push({ kind: 'text', text: plain })
    plain = ''
  }
  let i = 0
  while (i < text.length) {
    const rest = text.slice(i)
    const code = /^`([^`]+)`/.exec(rest)
    const strong = /^\*\*(.+?)\*\*/.exec(rest)
    const em = /^\*([^*\s][^*]*?)\*/.exec(rest) ?? /^_([^_\s][^_]*?)_(?![A-Za-z0-9])/.exec(rest)
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
    const match = code ?? strong ?? link ?? em
    // An underscore inside a word (snake_case) isn't emphasis.
    const midWord = match === em && rest[0] === '_' && /[A-Za-z0-9]/.test(text[i - 1] ?? '')
    if (!match || midWord) {
      plain += text[i++]
      continue
    }
    flush()
    if (match === code) out.push({ kind: 'code', text: code[1] })
    else if (match === strong) out.push({ kind: 'strong', children: parseInline(strong[1]) })
    else if (match === link) out.push({ kind: 'link', href: link[2], children: parseInline(link[1]) })
    else out.push({ kind: 'em', children: parseInline(match[1]) })
    i += match[0].length
  }
  flush()
  return out
}

/** The words of some inline content, without its formatting. */
export function plainText(inline: Inline[]): string {
  return inline.map((part) => ('children' in part ? plainText(part.children) : part.text)).join('')
}

/** A guide's title: its first heading. */
export function guideTitle(blocks: Block[]): string {
  const heading = blocks.find((b) => b.kind === 'heading')
  return heading?.kind === 'heading' ? plainText(heading.children) : ''
}

/**
 * The guides in docs/guides/README.md, in the order it links to them, each with the
 * words after its link ("[Streaming apps](streaming-apps.md): Netflix, Disney+ and the
 * rest"), which Settings shows beside it.
 */
export function guideIndex(index: string): { file: string; blurb: string }[] {
  const seen = new Set<string>()
  return [...index.matchAll(/\]\(\.?\/?([\w-]+\.md)\)(?:[: \t\u2013\u2014-]+([^\n]*))?/g)].flatMap((m) => {
    if (seen.has(m[1])) return []
    seen.add(m[1])
    return [{ file: m[1], blurb: plainText(parseInline((m[2] ?? '').trim())) }]
  })
}
