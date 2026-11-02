import { rm } from 'node:fs/promises'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The forecast is kept under ~/.cache: a home of its own for the test.
const home = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? '/tmp'}/steamtv-weather-home-${process.pid}`
  process.env.HOME = dir
  return dir
})

const place = vi.hoisted(() => ({ current: { latitude: 33.77, longitude: -118.19, place: 'Long Beach, California, United States', unit: 'fahrenheit' as const } }))
vi.mock('./location', () => ({ getLocation: async () => place.current, onLocationChange: () => {} }))

const ok = (temperature: number) => new Response(JSON.stringify({ current: { temperature_2m: temperature } }), { status: 200 })
const down = () => new Response('busy', { status: 503 })

describe('weather', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterAll(async () => {
    vi.useRealTimers()
    await rm(home, { recursive: true, force: true })
  })

  it('shows the town without a temperature when the service is down and nothing was saved', async () => {
    await rm(home, { recursive: true, force: true })
    vi.stubGlobal('fetch', vi.fn(async () => down()))
    const { getWeather } = await import('./weather')
    expect(await getWeather()).toEqual({ temperature: null, unit: 'fahrenheit', city: 'Long Beach' })
  })

  it('retries once, quickly, before giving up', async () => {
    await rm(home, { recursive: true, force: true })
    const fetch = vi.fn().mockResolvedValueOnce(down()).mockResolvedValueOnce(ok(61))
    vi.stubGlobal('fetch', fetch)
    const { getWeather } = await import('./weather')
    expect(await getWeather()).toEqual({ temperature: 61, unit: 'fahrenheit', city: 'Long Beach' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps the last forecast on disk, and shows it after a restart when the service is down', async () => {
    await rm(home, { recursive: true, force: true })
    vi.stubGlobal('fetch', vi.fn(async () => ok(60)))
    expect((await (await import('./weather')).getWeather())?.temperature).toBe(60)
    // A fresh start an hour later (past the 15 minutes it's fresh for), open-meteo down.
    vi.resetModules()
    vi.setSystemTime(Date.now() + 60 * 60 * 1000)
    vi.stubGlobal('fetch', vi.fn(async () => down()))
    expect(await (await import('./weather')).getWeather()).toEqual({ temperature: 60, unit: 'fahrenheit', city: 'Long Beach' })
  })

  it("doesn't show another place's saved forecast", async () => {
    await rm(home, { recursive: true, force: true })
    vi.stubGlobal('fetch', vi.fn(async () => ok(60)))
    await (await import('./weather')).getWeather()
    vi.resetModules()
    place.current = { latitude: 40.59, longitude: -73.66, place: 'Long Beach, New York, United States', unit: 'fahrenheit' }
    vi.stubGlobal('fetch', vi.fn(async () => down()))
    expect((await (await import('./weather')).getWeather())?.temperature).toBeNull()
  })
})
