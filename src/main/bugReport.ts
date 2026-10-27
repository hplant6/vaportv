import { app } from 'electron'
import { open, readFile } from 'node:fs/promises'
import { homedir, release } from 'node:os'
import QRCode from 'qrcode'
import type { BugReport, BugReportInput } from '../shared/types'
import { EXTRAS } from '../shared/build'
import { fitLog, issueTitle, pickLogLines } from '../shared/bugReport'

// Settings → General → Report a problem: a GitHub "new issue" link with the report filled in,
// shown as a QR code to open on a phone, check, and submit there (vaporTV holds no GitHub
// account, and a public app can't carry a token of its own). The report itself is put
// together in shared/bugReport.ts.

/** How much of the end of the log is looked through. */
const LOG_TAIL_BYTES = 64 * 1024
/** The latest log lines offered (as many as fit go in). */
const LATEST_LINES = 40

async function osName(): Promise<string> {
  const text = await readFile('/etc/os-release', 'utf8').catch(() => '')
  const field = (name: string): string | undefined => new RegExp(`^${name}="?([^"\\n]*)"?$`, 'm').exec(text)?.[1]
  const name = field('PRETTY_NAME') ?? field('NAME') ?? process.platform
  const build = field('BUILD_ID')
  return build ? `${name} (build ${build})` : name
}

/** The last part of a file, as lines (the first, likely cut short, dropped). */
async function tail(path: string, bytes: number): Promise<string[]> {
  const file = await open(path, 'r').catch(() => null)
  if (!file) return []
  try {
    const { size } = await file.stat()
    const start = Math.max(0, size - bytes)
    const buffer = Buffer.alloc(size - start)
    await file.read(buffer, 0, buffer.length, start)
    const lines = buffer.toString('utf8').split('\n').filter(Boolean)
    return start > 0 ? lines.slice(1) : lines
  } finally {
    await file.close()
  }
}

export async function makeBugReport(input: BugReportInput, logPath: string): Promise<BugReport> {
  const system = [
    `vaporTV ${app.getVersion()}${EXTRAS ? '' : ' (public build)'}`,
    `${await osName()}, kernel ${release()}`,
    input.gpu ? `GPU: ${input.gpu}` : null,
    `Screen: ${input.display}`,
    input.controllers.length ? `Controllers: ${input.controllers.join('; ')}` : 'Controllers: none seen'
  ].filter((line): line is string => !!line)
  const lines = input.includeLog ? pickLogLines(await tail(logPath, LOG_TAIL_BYTES), LATEST_LINES, homedir()) : []
  const { url, logLines } = fitLog(issueTitle(input.description), input.description, system, lines)
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 560, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } })
  return { url, qr, logLines }
}
