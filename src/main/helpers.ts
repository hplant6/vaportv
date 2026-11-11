// Background programs vaporTV runs for itself (the virtual keyboard and controller). They're
// children of vaporTV like the games it launches, so closing "what vaporTV launched" must
// know to leave them be, and vaporTV quitting must take them with it: one left running
// (xprop's -spy, idle outside gamescope) keeps Steam's reaper for vaporTV alive, and Steam
// then won't start vaporTV again (AppError_16) until it's gone.

interface Helper {
  pid?: number
  on(event: 'exit', listener: () => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

const helpers = new Map<number, Helper>()

/** Notes a helper, and forgets it when it exits. */
export function ownHelper(child: Helper): void {
  const pid = child.pid
  if (pid === undefined) return
  helpers.set(pid, child)
  child.on('exit', () => helpers.delete(pid))
}

export const isOwnHelper = (pid: number): boolean => helpers.has(pid)

/** Stops every helper still running, as vaporTV quits. */
export function stopHelpers(): void {
  for (const child of helpers.values()) {
    try {
      child.kill('SIGTERM')
    } catch {
      // Already gone.
    }
  }
  helpers.clear()
}
