// Telling a controller switched off apart from the reshuffling around it.

/** Steam's virtual controllers (Valve's vendor id): Steam swaps them about whenever a real one connects. */
export const STEAM_VIRTUAL = /Vendor: 28de\b/i

/** A controller connecting reshuffles the others for a moment; disconnects this soon after don't count. */
export const CONNECT_SETTLE_MS = 3000

/**
 * Whether a controller disconnecting means it was switched off: a real one (not
 * Steam's), the last real one still connected, and not just after another connected.
 */
export function isSwitchOff(
  gone: { id: string; index: number },
  stillConnected: { id: string; index: number; connected: boolean }[],
  msSinceConnect: number
): boolean {
  if (STEAM_VIRTUAL.test(gone.id)) return false
  if (msSinceConnect < CONNECT_SETTLE_MS) return false
  return !stillConnected.some((p) => p.connected && p.index !== gone.index && !STEAM_VIRTUAL.test(p.id))
}
