import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/nowhere' } }))

const { cleanTranscript, roomLevel } = await import('./voice')

describe('roomLevel', () => {
  it('takes the quieter end, so talking straight away does not raise the room', () => {
    // Seven quiet frames, three of speech.
    expect(roomLevel([-40, -41, -39, -40, -42, -40, -41, -20, -18, -19])).toBe(-41)
  })

  it('is the floor with nothing measured', () => {
    expect(roomLevel([])).toBe(-45)
  })
})

describe('cleanTranscript', () => {
  it("drops whisper's notes and the final stop", () => {
    expect(cleanTranscript(' [BLANK_AUDIO] What is the weather (music) today.\n')).toBe('What is the weather today')
  })
})
