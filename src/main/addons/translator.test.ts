import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/nowhere' } }))

const { addressAs, finalLine, readable, translatorPrompt } = await import('./translator')
const { cleanTranscript } = await import('../voice')

const people = { you: 'Sam', youJa: 'サム', them: 'Aiko', themJa: '愛子さん', context: '', address: 'okaasan', tone: 'polite', voice: 31 } as const

describe('translator', () => {
  it('reads お義母さん as おかあさん, not ぎぼ', () => {
    expect(readable('お義母さん、おはようございます。')).toBe('お母さん、おはようございます。')
  })

  it('calls her what the setting says', () => {
    expect(addressAs({ ...people, address: 'okaasan' })).toBe('お義母さん')
    expect(addressAs({ ...people, address: 'mother' })).toBe('お母さん')
    expect(addressAs({ ...people, address: 'name' })).toBe('愛子さん')
  })

  it('tells the interpreter who is who, how to address her and how politely', () => {
    const polite = translatorPrompt({ ...people })
    expect(polite).toContain('between Sam, who speaks English, and Aiko, who speaks Japanese')
    expect(polite).toContain('call Aiko お義母さん')
    expect(polite).toContain('です・ます')
    expect(translatorPrompt({ ...people, tone: 'casual' })).toContain('casually')
  })

  it('keeps only the translation when Claude second-guessed itself', () => {
    expect(finalLine('ありがとう。\n\nWait — English only.\n\nThank you.')).toBe('Thank you.')
    expect(finalLine('「こんにちは」')).toBe('こんにちは')
  })

  it("drops whisper's full-width notes from Japanese", () => {
    expect(cleanTranscript('（拍手）おはようございます')).toBe('おはようございます')
  })
})
