import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SystemStats } from '../shared/types'

// The box's CPU and GPU load and temperatures, for the top bar's corners. Read from Linux's
// /proc and /sys: k10temp/zenpower/coretemp for the CPU, an amdgpu card for the GPU (its busy
// percentage and its "edge" sensor). Anything missing (another GPU, or Windows) is null.

const HWMON = '/sys/class/hwmon'
const DRM = '/sys/class/drm'

const read = (path: string): Promise<string> =>
  readFile(path, 'utf8').then(
    (text) => text.trim(),
    () => ''
  )

const number = (text: string): number | null => (text === '' || !Number.isFinite(Number(text)) ? null : Number(text))

/** Idle and total jiffies across all cores, from /proc/stat's first line. */
async function cpuTimes(): Promise<{ idle: number; total: number } | null> {
  const line = (await read('/proc/stat')).split('\n')[0]
  if (!line?.startsWith('cpu ')) return null
  const fields = line.split(/\s+/).slice(1).map(Number)
  // idle + iowait count as idle.
  return { idle: fields[3] + (fields[4] ?? 0), total: fields.reduce((a, b) => a + b, 0) }
}

let lastTimes: { idle: number; total: number } | null = null

/** CPU use since the last call; the first call samples twice, a moment apart. */
async function cpuUsage(): Promise<number | null> {
  if (!lastTimes) {
    lastTimes = await cpuTimes()
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const now = await cpuTimes()
  if (!now || !lastTimes) return null
  const total = now.total - lastTimes.total
  const idle = now.idle - lastTimes.idle
  lastTimes = now
  return total > 0 ? Math.round((100 * (total - idle)) / total) : null
}

/** The first hwmon sensor whose driver is one of `names`, preferring the labelled input. */
async function hwmonTemp(names: string[], label?: string): Promise<number | null> {
  for (const dir of await readdir(HWMON).catch(() => [] as string[])) {
    const root = join(HWMON, dir)
    if (!names.includes(await read(join(root, 'name')))) continue
    if (label) {
      for (const file of await readdir(root).catch(() => [] as string[])) {
        if (!/^temp\d+_label$/.test(file) || (await read(join(root, file))) !== label) continue
        const value = number(await read(join(root, file.replace('_label', '_input'))))
        if (value !== null) return Math.round(value / 1000)
      }
    }
    const value = number(await read(join(root, 'temp1_input')))
    if (value !== null) return Math.round(value / 1000)
  }
  return null
}

/** The busy percentage of the first card that reports one (amdgpu does). */
async function gpuUsage(): Promise<number | null> {
  for (const card of await readdir(DRM).catch(() => [] as string[])) {
    if (!/^card\d+$/.test(card)) continue
    const value = number(await read(join(DRM, card, 'device', 'gpu_busy_percent')))
    if (value !== null) return value
  }
  return null
}

export async function systemStats(): Promise<SystemStats> {
  const [cpu, cpuTemp, gpu, gpuTemp] = await Promise.all([
    cpuUsage(),
    hwmonTemp(['k10temp', 'zenpower', 'coretemp'], 'Tctl'),
    gpuUsage(),
    hwmonTemp(['amdgpu'], 'edge')
  ])
  return { cpuUsage: cpu, cpuTemp, gpuUsage: gpu, gpuTemp }
}
