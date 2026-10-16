import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { onSteamOS } from './power'

// The system volume, as Steam's own slider sets it: the default PipeWire output.

const exec = promisify(execFile)
const SINK = '@DEFAULT_AUDIO_SINK@'
const STEP = 5

export interface VolumeLevel {
  /** 0–100. */
  level: number
  muted: boolean
}

/** Off the box there's no volume of ours to change; pretend, so the on-screen bar can be tried. */
let pretend = 50

/** `Volume: 0.45` or `Volume: 0.45 [MUTED]`. */
export function parseWpctlVolume(text: string): VolumeLevel | null {
  const match = /Volume:\s*([\d.]+)(\s*\[MUTED\])?/.exec(text)
  if (!match) return null
  return { level: Math.round(Number(match[1]) * 100), muted: !!match[2] }
}

/** Raises (1) or lowers (-1) the volume one step and returns the new level, or null if it couldn't. */
export async function stepVolume(direction: 1 | -1): Promise<VolumeLevel | null> {
  if (!onSteamOS()) {
    pretend = Math.max(0, Math.min(100, pretend + direction * STEP))
    return { level: pretend, muted: false }
  }
  try {
    // Turning it up means wanting to hear it.
    if (direction > 0) await exec('wpctl', ['set-mute', SINK, '0'])
    await exec('wpctl', ['set-volume', '-l', '1.0', SINK, `${STEP}%${direction > 0 ? '+' : '-'}`])
    const { stdout } = await exec('wpctl', ['get-volume', SINK])
    return parseWpctlVolume(stdout)
  } catch (err) {
    console.error('steamtv: volume change failed', err)
    return null
  }
}
