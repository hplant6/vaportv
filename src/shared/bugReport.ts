// A bug report as a GitHub "new issue" link, for Settings → General → Report a problem
// (main/bugReport.ts adds the system details and makes the QR code). A QR code holds under
// 3 KB and gets hard to scan off a TV well before that, so the log part is cut to fit:
// its error lines first, then the latest lines.

const NEW_ISSUE = 'https://github.com/hplant6/vaportv/issues/new'
/** Longest link put in the code: dense enough to scan off a TV across a room. */
const MAX_URL = 2000
/** Error lines kept ahead of the latest ones. */
const MAX_ERROR_LINES = 8
const ERROR_LINE = /error|fail|couldn'?t|can'?t|exited|crash|uncaught|refused|denied|not found|timed? ?out/i
const TITLE_MAX = 70

/** Error lines, then the latest, in the log's order, each once; home folder paths shortened to ~. */
export function pickLogLines(lines: string[], latest: number, home: string): string[] {
  const keep = new Set<number>()
  const errors = lines.flatMap((line, i) => (ERROR_LINE.test(line) ? [i] : [])).slice(-MAX_ERROR_LINES)
  for (const i of errors) keep.add(i)
  for (let i = Math.max(0, lines.length - latest); i < lines.length; i++) keep.add(i)
  return [...keep].sort((a, b) => a - b).map((i) => lines[i].split(home).join('~'))
}

export function issueTitle(description: string): string {
  const first = description.trim().split(/(?<=[.!?])\s|\n/)[0] ?? ''
  if (!first) return 'Bug report from vaporTV'
  return first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX - 1).trimEnd()}…` : first
}

export function issueBody(description: string, system: string[], log: string[]): string {
  const parts = ['### What happened', '', description.trim() || '_(not described)_', '', '### System', '', ...system.map((s) => `- ${s}`)]
  if (log.length) parts.push('', '### Recent log', '', '```', ...log, '```')
  parts.push('', '_Sent from vaporTV’s Report a problem._')
  return parts.join('\n')
}

export function issueUrl(title: string, body: string): string {
  return `${NEW_ISSUE}?${new URLSearchParams({ title, body, labels: 'bug' })}`
}

/** The link with as many log lines as fit, fewest last; how many made it. */
export function fitLog(title: string, description: string, system: string[], lines: string[]): { url: string; logLines: number } {
  for (let n = lines.length; n >= 0; n--) {
    const log = lines.slice(lines.length - n)
    const url = issueUrl(title, issueBody(description, system, log))
    if (url.length <= MAX_URL || n === 0) return { url, logLines: n }
  }
  return { url: issueUrl(title, issueBody(description, system, [])), logLines: 0 }
}
