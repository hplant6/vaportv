import { describe, expect, it } from 'vitest'
import { guideIndex, guideTitle, parseInline, parseMarkdown } from './markdown'

describe('parseMarkdown', () => {
  it('reads headings, wrapped paragraphs, lists, pictures, tips and code', () => {
    const blocks = parseMarkdown(
      [
        '# Streaming apps',
        '',
        'Watch Netflix',
        'from the couch.',
        '',
        '1. Open **Apps**.',
        '2. Press A',
        '   on the tile.',
        '',
        '- one',
        '- two',
        '',
        '![The Apps tab](images/apps.webp)',
        '',
        '> **Tip:** hold Select.',
        '',
        '```',
        'flatpak list',
        '```'
      ].join('\n')
    )
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'list', 'image', 'quote', 'code'])
    expect(blocks[1]).toEqual({ kind: 'paragraph', children: [{ kind: 'text', text: 'Watch Netflix from the couch.' }] })
    expect(blocks[2]).toMatchObject({ ordered: true, items: [[{ text: 'Open ' }, { kind: 'strong' }, { text: '.' }], [{ text: 'Press A on the tile.' }]] })
    expect(blocks[3]).toMatchObject({ ordered: false })
    expect(blocks[4]).toEqual({ kind: 'image', src: 'images/apps.webp', alt: 'The Apps tab' })
    expect(blocks[6]).toEqual({ kind: 'code', text: 'flatpak list' })
  })

  it('skips HTML comments', () => {
    expect(parseMarkdown('<!-- note -->\nHi')).toEqual([{ kind: 'paragraph', children: [{ kind: 'text', text: 'Hi' }] }])
  })
})

describe('parseInline', () => {
  it('reads code, bold, italic and links', () => {
    expect(parseInline('Run `ls`, **then** *wait* [here](https://x.y).')).toEqual([
      { kind: 'text', text: 'Run ' },
      { kind: 'code', text: 'ls' },
      { kind: 'text', text: ', ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'then' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'wait' }] },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: 'https://x.y', children: [{ kind: 'text', text: 'here' }] },
      { kind: 'text', text: '.' }
    ])
  })

  it('leaves underscores inside words alone', () => {
    expect(parseInline('custom_apps and _this_')).toEqual([
      { kind: 'text', text: 'custom_apps and ' },
      { kind: 'em', children: [{ kind: 'text', text: 'this' }] }
    ])
  })
})

describe('guides', () => {
  it('takes the title from the first heading', () => {
    expect(guideTitle(parseMarkdown('Intro\n\n# Apps\n\n## More'))).toBe('Apps')
  })

  it('lists guides as the index links them, once each, with the words after the link', () => {
    expect(guideIndex('1. [A](streaming-apps.md): Netflix, **Kodi** and the rest\n2. [B](./emulators.md)\n[again](streaming-apps.md)')).toEqual([
      { file: 'streaming-apps.md', blurb: 'Netflix, Kodi and the rest' },
      { file: 'emulators.md', blurb: '' }
    ])
  })
})
