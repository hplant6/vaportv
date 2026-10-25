import { describe, expect, it } from 'vitest'
import { cleanClockCorners, CORNER_ROOM, DEFAULT_CLOCK_CORNERS } from './clock'

describe('cleanClockCorners', () => {
  it('keeps the bar as it was when nothing is saved', () => {
    expect(cleanClockCorners(undefined)).toEqual(DEFAULT_CLOCK_CORNERS)
  })

  it('drops unknown layouts', () => {
    expect(cleanClockCorners({ left: ['nope' as never, 'time'], right: ['date'] })).toMatchObject({ left: ['time'], right: ['date'] })
  })

  it('lets both corners show the same layout', () => {
    expect(cleanClockCorners({ left: ['time'], right: ['time'] })).toMatchObject({ left: ['time'], right: ['time'] })
  })

  it('holds no more than a corner has room for', () => {
    expect(cleanClockCorners({ left: ['time', 'date', 'weather'], right: [] }).left).toHaveLength(CORNER_ROOM)
  })

  it('treats a missing corner as empty', () => {
    expect(cleanClockCorners({ left: ['date'] })).toMatchObject({ left: ['date'], right: [] })
  })

  it('reads the CPU and GPU in Celsius unless set to Fahrenheit', () => {
    expect(cleanClockCorners({ left: [] }).sensorUnit).toBe('celsius')
    expect(cleanClockCorners({ left: [], sensorUnit: 'fahrenheit' }).sensorUnit).toBe('fahrenheit')
  })
})
