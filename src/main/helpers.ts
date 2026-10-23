// Background programs vaporTV runs for itself (the virtual keyboard and controller). They're
// children of vaporTV like the games it launches, so closing "what vaporTV launched" must
// know to leave them be.

const pids = new Set<number>()

/** Notes a helper, and forgets it when it exits. */
export function ownHelper(child: { pid?: number; on(event: 'exit', listener: () => void): unknown }): void {
  const pid = child.pid
  if (pid === undefined) return
  pids.add(pid)
  child.on('exit', () => pids.delete(pid))
}

export const isOwnHelper = (pid: number): boolean => pids.has(pid)
