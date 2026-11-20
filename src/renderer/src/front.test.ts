import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A stand-in window: focus/blur as events, and main's "in front" and "woke" messages sent by hand. */
function fakeWindow(focused: boolean) {
  const target = new EventTarget()
  let sendFront: (front: boolean) => void = () => {}
  let sendResume: () => void = () => {}
  const win = Object.assign(target, {
    steamtv: {
      onFront: (cb: (front: boolean) => void) => ((sendFront = cb), () => {}),
      onResume: (cb: () => void) => ((sendResume = cb), () => {})
    }
  })
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', { hasFocus: () => focused })
  return {
    focus: () => target.dispatchEvent(new Event('focus')),
    blur: () => target.dispatchEvent(new Event('blur')),
    front: (front: boolean) => sendFront(front),
    resume: () => sendResume()
  }
}

async function load() {
  vi.resetModules()
  return import('./front')
}

describe('front', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('comes back when gamescope shows vaporTV again without a focus event', async () => {
    const box = fakeWindow(true)
    const { isFront, onFrontChange } = await load()
    const seen: boolean[] = []
    onFrontChange((f) => seen.push(f))
    box.blur()
    box.front(false)
    box.front(true)
    expect(isFront()).toBe(true)
    expect(seen).toEqual([false, true])
  })

  it("doesn't believe a stale 'in front' while an app is still opening", async () => {
    const box = fakeWindow(true)
    const { isFront } = await load()
    box.blur()
    box.front(true)
    expect(isFront()).toBe(false)
    // The app never showed a window: believed after a while.
    vi.advanceTimersByTime(11_000)
    box.front(true)
    expect(isFront()).toBe(true)
  })

  it('starts out in front when gamescope says so, though the window has no focus', async () => {
    const box = fakeWindow(false)
    const { isFront } = await load()
    expect(isFront()).toBe(false)
    box.front(true)
    expect(isFront()).toBe(true)
  })

  it('after waking, believes gamescope at once', async () => {
    const box = fakeWindow(true)
    const { isFront } = await load()
    box.blur()
    box.resume()
    box.front(true)
    expect(isFront()).toBe(true)
  })

  it('without gamescope (a desktop), follows the window focus alone', async () => {
    const box = fakeWindow(true)
    const { isFront } = await load()
    box.blur()
    expect(isFront()).toBe(false)
    box.focus()
    expect(isFront()).toBe(true)
  })
})
