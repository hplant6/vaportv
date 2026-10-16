import { app, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Dev aid: STEAMTV_SCREENSHOT=<file.png> captures the window and quits.
 * STEAMTV_KEYS="Right,Right,Down" presses those keys first ("Wait" pauses a second).
 * STEAMTV_BACKDROP_ONLY=1 hides the UI, to see the backdrop on its own.
 * STEAMTV_SCREENSAVER=1 starts the screensaver (as Settings' Preview does).
 * STEAMTV_EVAL="js" runs in the page after the keys, e.g. to click something.
 */
export function screenshotMode(): string | undefined {
  return process.env.STEAMTV_SCREENSHOT
}

export async function captureAndQuit(win: BrowserWindow, path: string): Promise<void> {
  await wait(1500)
  if (process.env.STEAMTV_SCREENSAVER) {
    await win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('steamtv:screensaver', { detail: 'preview' }))`)
  }
  if (process.env.STEAMTV_BACKDROP_ONLY) await win.webContents.insertCSS('.stage > :not(.stage-canvas) { visibility: hidden; }')
  for (const keyCode of (process.env.STEAMTV_KEYS ?? '').split(',').filter(Boolean)) {
    // "Wait" pauses, e.g. for a screen to load its content before the next key.
    if (keyCode === 'Wait') {
      await wait(1000)
      continue
    }
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await wait(150)
  }
  if (process.env.STEAMTV_EVAL) {
    await win.webContents.executeJavaScript(process.env.STEAMTV_EVAL)
    await wait(1500)
  }
  await wait(800)
  const image = await win.webContents.capturePage()
  await writeFile(path, image.toPNG())
  app.quit()
}
