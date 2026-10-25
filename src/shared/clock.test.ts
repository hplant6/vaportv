import { describe, expect, it } from 'vitest'
import { cleanClockCorners, CORNER_ROOM, DEFAULT_CLOCK_CORNERS } from './clock'

describe('cleanClockCorners', () => {
  it('keeps the bar as it was when nothing is saved', () => {
    expect(cleanClockCorners(undefined)).toEqual(DEFAULT_CLOCK_CORNERS)
  })

  it('drops unknown layouts and any shown twice', () => {
    expect(cleanClockCorners({ left: ['time', 'nope' as never, 'time'], right: ['time', 'date'] })).toEqual({ left: ['time'], right: ['date'] })
  })

  it('holds no more than a corner has room for', () => {
    expect(cleanClockCorners({ left: ['time', 'date', 'weather'], right: [] }).left).toHaveLength(CORNER_ROOM)
  })

  it('treats a missing corner as empty', () => {
    expect(cleanClockCorners({ left: ['date'] })).toEqual({ left: ['date'], right: [] })
  })
})
