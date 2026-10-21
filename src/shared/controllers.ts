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

/** Which maker's button glyphs to show: Xbox's, or a PlayStation or Switch controller's. */
export type ControllerFamily = 'xbox' | 'ps3' | 'ps4' | 'ps5' | 'switch'

const SONY = '054c'
const NINTENDO = '057e'
const PS3_PADS = new Set(['0268'])
const PS5_PADS = new Set(['0ce6', '0df2'])

/** A controller's family from its id ("... Vendor: 054c Product: 0ce6"); Xbox-style if unknown. */
export function controllerFamily(id: string): ControllerFamily {
  const vendor = /Vendor: ([0-9a-f]{4})/i.exec(id)?.[1]?.toLowerCase()
  const product = /Product: ([0-9a-f]{4})/i.exec(id)?.[1]?.toLowerCase() ?? ''
  if (vendor === SONY) return PS3_PADS.has(product) ? 'ps3' : PS5_PADS.has(product) ? 'ps5' : 'ps4'
  if (vendor === NINTENDO) return 'switch'
  return 'xbox'
}

/**
 * The family to show for the controllers connected: the first real one's (Steam's
 * virtual controllers only stand in for them and look like Xbox pads).
 */
export function connectedFamily(pads: { id: string; connected: boolean }[]): ControllerFamily {
  const real = pads.find((p) => p.connected && !STEAM_VIRTUAL.test(p.id))
  return real ? controllerFamily(real.id) : 'xbox'
}
