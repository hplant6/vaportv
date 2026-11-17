import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/nowhere', getPath: () => '/tmp' }, protocol: {}, net: {} }))

const { readPicks } = await import('./claudeSearch')

describe('readPicks', () => {
  it('reads the picks and whether to start the first', () => {
    expect(readPicks('{"picks":[4,2],"start":true}', 10)).toEqual({ picks: [4, 2], start: true })
    expect(readPicks('{"picks":[4],"start":false}', 10)).toEqual({ picks: [4], start: false })
  })

  it('finds the JSON inside a fence or words', () => {
    expect(readPicks('Here you go:\n```json\n{"picks": [1]}\n```', 5)).toEqual({ picks: [1], start: false })
  })

  it('drops lines that are not in the library, repeats and non-numbers', () => {
    expect(readPicks('{"picks":[3,3,"2",99,-1,1.5],"start":true}', 5)).toEqual({ picks: [3, 2], start: true })
  })

  it('never starts with nothing picked, and gives up on a reply that is not JSON', () => {
    expect(readPicks('{"picks":[],"start":true}', 5)).toEqual({ picks: [], start: false })
    expect(readPicks('Sorry, I am not sure.', 5)).toBeNull()
    expect(readPicks('{"start":true}', 5)).toBeNull()
  })
})
