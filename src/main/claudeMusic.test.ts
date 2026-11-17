import { describe, expect, it, vi } from 'vitest'

vi.mock('./claude', () => ({ claudeBin: () => null, toolEnv: () => ({}) }))
vi.mock('./helpers', () => ({ ownHelper: () => undefined }))
vi.mock('./library/art', () => ({ artUrl: (f: string) => f }))

const { readAnswer } = await import('./claudeMusic')
const { fold } = await import('./musicLibrary')

describe('readAnswer', () => {
  it('reads picks and the action, fenced or not', () => {
    expect(readAnswer('```json\n{"picks":[2,0,2],"action":"shuffle"}\n```', 3)).toEqual({ picks: [2, 0], action: 'shuffle' })
  })
  it('drops lines out of range and shows when nothing is left', () => {
    expect(readAnswer('{"picks":[9],"action":"play"}', 3)).toEqual({ picks: [], action: 'show' })
  })
  it('treats an unknown action as show', () => {
    expect(readAnswer('{"picks":[1],"action":"dance"}', 3)).toEqual({ picks: [1], action: 'show' })
  })
  it('gives up on no JSON', () => {
    expect(readAnswer('sorry', 3)).toBeNull()
  })
})

describe('fold', () => {
  it('matches without case or accents', () => {
    expect(fold('Beyoncé – RENAISSANCE')).toBe('beyonce – renaissance')
  })
})
