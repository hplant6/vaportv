import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/nowhere' } }))

const { describeRequest, describeTool, friendlyError, splitSentences, toolEnv } = await import('./claude')
const { speakable } = await import('./speech')

describe('splitSentences', () => {
  it('hands over finished sentences and keeps the unfinished one', () => {
    expect(splitSentences('It is 12 degrees. Light rain until three')).toEqual([['It is 12 degrees.'], 'Light rain until three'])
  })

  it('waits for the space after a stop, so a decimal point is not an end', () => {
    expect(splitSentences('Pi is about 3.14')).toEqual([[], 'Pi is about 3.14'])
    expect(splitSentences('Pi is about 3.14. Next')).toEqual([['Pi is about 3.14.'], 'Next'])
  })

  it('ends at ! ? and line breaks, closing quotes kept', () => {
    expect(splitSentences('Yes! Really? "Sure." \nok')).toEqual([['Yes!', 'Really?', '"Sure."'], 'ok'])
    expect(splitSentences('First line\nSecond')).toEqual([['First line'], 'Second'])
  })

  it("doesn't end at a title or an initial", () => {
    expect(splitSentences('Ask Dr. Smith about it. Then')).toEqual([['Ask Dr. Smith about it.'], 'Then'])
    expect(splitSentences('Written by J. R. R. Tolkien. More')).toEqual([['Written by J. R. R. Tolkien.'], 'More'])
  })
})

describe('speakable', () => {
  it('drops markdown, links and emoji', () => {
    expect(speakable('**Yes** — see [the docs](https://x.y) 🎉')).toBe('Yes — see the docs')
    expect(speakable('Go to https://example.com now')).toBe('Go to the link now')
    expect(speakable('# Title\n- item')).toBe('Title - item')
  })
})

describe('friendlyError', () => {
  it('says to sign in when Claude Code is not signed in', () => {
    expect(friendlyError('Invalid API key · Please run /login')).toMatch(/Sign in with your phone/)
  })

  it('names a usage limit', () => {
    expect(friendlyError('Claude AI usage limit reached|1794600000')).toMatch(/usage limit/)
  })

  it('keeps other errors short', () => {
    expect(friendlyError('x'.repeat(300))).toHaveLength(201)
  })
})

describe('describeTool and describeRequest', () => {

  it('says what a tool is doing in words', () => {
    expect(describeTool('Read', { file_path: '/home/deck/Projects/vaportv/src/main/claude.ts' })).toBe('Reading claude.ts')
    expect(describeTool('Bash', { command: 'npm run dist', description: 'Build vaporTV' })).toBe('Build vaporTV')
    expect(describeTool('Bash', { command: 'ls' })).toBe('Running a command')
    expect(describeTool('web_search', {})).toBe('Searching the web')
  })

  it('shows the command under the plain description, cut short', () => {
    expect(describeRequest('Bash', { command: 'touch x' }, 'Create x')).toEqual({ description: 'Create x', detail: 'touch x' })
    expect(describeRequest('Bash', { command: 'a'.repeat(300) }).detail).toHaveLength(241)
  })

  it("runs commands outside the AppImage's environment, with vaporTV's Node first", () => {
    const env = toolEnv({ APPDIR: '/tmp/.mount_x', APPIMAGE: '/a', ELECTRON_RUN_AS_NODE: '1', LD_LIBRARY_PATH: '/tmp/.mount_x/usr/lib:/opt/lib', PATH: '/tmp/.mount_x/usr/bin:/usr/bin', HOME: '/home/deck' })
    expect(env.APPDIR).toBeUndefined()
    expect(env.APPIMAGE).toBeUndefined()
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.LD_LIBRARY_PATH).toBe('/opt/lib')
    expect(env.PATH?.split(':')[0]).toMatch(/vaportv-dev\/node\/bin$/)
    expect(env.PATH).not.toContain('.mount_x')
  })
})
