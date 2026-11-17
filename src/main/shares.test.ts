import { describe, expect, it } from 'vitest'
import { shareNames } from './shares'

describe('shareNames', () => {
  it("reads a computer's shares from rclone, names with spaces kept, admin shares left out", () => {
    const out = '          -1 2000-01-01 00:00:00        -1 Music\n          -1 2000-01-01 00:00:00        -1 My Videos\n          -1 2000-01-01 00:00:00        -1 C$\n          -1 2000-01-01 00:00:00        -1 IPC$\n'
    expect(shareNames(out)).toEqual(['Music', 'My Videos'])
  })
})
