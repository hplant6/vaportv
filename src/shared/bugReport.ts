// A bug report as a GitHub "new issue" link, for Settings → General → Report a problem
// (main/bugReport.ts adds the system details and makes the QR code). What went wrong, and
// the title, are typed on the phone; the link fills in the rest. A QR code holds under
// 3 KB and gets hard to scan off a TV well before that, so the log part is cut to fit:
// its error lines first, then the latest lines.

const NEW_ISSUE = 'https://github.com/hplant6/vaportv/issues/new'
/** Longest link put in the code: dense enough to scan off a TV across a room. */
const MAX_URL = 2000
/** Error lines kept ahead of the latest ones. */
const MAX_ERROR_LINES = 8
const ERROR_LINE = /error|fail|couldn'?t|can'?t|exited|crash|uncaught|refused|denied|not found|timed? ?out/i

/** Error lines, then the latest, in the log's order, each once; home folder paths shortened to ~. */
export function pickLogLines(lines: string[], latest: number, home: string): string[] {
  const keep = new Set<number>()
  const errors = lines.flatMap((line, i) => (ERROR_LINE.test(line) ? [i] : [])).slice(-MAX_ERROR_LINES)
  for (const i of errors) keep.add(i)
  for (let i = Math.max(0, lines.length - latest); i < lines.length; i++) keep.add(i)
  return [...keep].sort((a, b) => a - b).map((i) => lines[i].split(home).join('~'))
}

export function issueBody(system: string[], log: string[]): string {
  const parts = ['### What happened', '', '<!-- What went wrong, and what were you doing? -->', '', '', '### System', '', ...system.map((s) => `- ${s}`)]
  if (log.length) parts.push('', '### Recent log', '', '```', ...log, '```')
  parts.push('', '_Sent from vaporTV’s Report a problem._')
  return parts.join('\n')
}

/** No title: GitHub asks for one before it submits, so each report gets a real one. */
export function issueUrl(body: string): string {
  return `${NEW_ISSUE}?${new URLSearchParams({ body, labels: 'bug' })}`
}

/** The link with as many log lines as fit, fewest last; how many made it. */
export function fitLog(system: string[], lines: string[]): { url: string; logLines: number } {
  for (let n = lines.length; n > 0; n--) {
    const url = issueUrl(issueBody(system, lines.slice(lines.length - n)))
    if (url.length <= MAX_URL) return { url, logLines: n }
  }
  return { url: issueUrl(issueBody(system, [])), logLines: 0 }
}
