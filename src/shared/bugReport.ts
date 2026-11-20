// A bug report as a GitHub "new issue" link, for Settings → General → Report a problem
// (main/bugReport.ts adds the system details and makes the QR code). What went wrong, and
// the title, are typed on the phone; the link fills in the rest. A QR code holds under
// 3 KB and gets hard to scan off a TV well before that, so the log part is cut to fit:
// its error lines first, then the latest lines.
//
// The issue is public, so what's personal in the log is taken out first: the label of each
// button pressed (file and folder names, Wi-Fi networks, Bluetooth devices, playlists), what
// voice search heard, what the Claude app asked to run or change (commands, file paths), the
// names of network shares, and the box's address on the home network. The log on the box
// keeps them, for looking into over ssh.

const NEW_ISSUE = 'https://github.com/hplant6/vaportv/issues/new'
/** Longest link put in the code: dense enough to scan off a TV across a room. */
const MAX_URL = 2000
/** Error lines kept ahead of the latest ones. */
const MAX_ERROR_LINES = 8
const ERROR_LINE = /error|fail|couldn'?t|can'?t|exited|crash|uncaught|refused|denied|not found|timed? ?out/i

/** A log line with what's personal taken out (see above), and the home folder as ~. */
export function scrub(line: string, home: string): string {
  return line
    .split(home)
    .join('~')
    .replace(/\b(select|favorite) (?!key$|nothing$).+$/, '$1 (a button)')
    .replace(/\bvoice: heard "(.*)"/, (_, text: string) => `voice: heard ${text.split(/\s+/).filter(Boolean).length} words`)
    // Which tool, but not the command or file it was for.
    .replace(/\bclaude: asks to use (\S+?):? .*$/, 'claude: asks to use $1')
    .replace(/\bclaude login: phone page on .+$/, 'claude login: phone page on (the box)')
    .replace(/\bshares: (mounted|removed) .+$/, 'shares: $1 (a share)')
    // A share that wouldn't mount: its name out, and any //computer/share in what went wrong.
    .replace(/\bshares: (?!fetching |rclone ready)[^:]+: (.*)$/, (_, why: string) => `shares: (a share): ${why.replace(/\/\/[^\s:]+/g, '(a share)')}`)
}

/** Error lines, then the latest, in the log's order, each once, scrubbed for a public report. */
export function pickLogLines(raw: string[], latest: number, home: string): string[] {
  // Scrubbed first, so a label that reads like an error ("Crash Bandicoot") isn't kept as one.
  const lines = raw.map((line) => scrub(line, home))
  const keep = new Set<number>()
  const errors = lines.flatMap((line, i) => (ERROR_LINE.test(line) ? [i] : [])).slice(-MAX_ERROR_LINES)
  for (const i of errors) keep.add(i)
  for (let i = Math.max(0, lines.length - latest); i < lines.length; i++) keep.add(i)
  return [...keep].sort((a, b) => a - b).map((i) => lines[i])
}

export function issueBody(system: string[], log: string[]): string {
  const parts = ['### What happened', '', '<!-- What went wrong, and what were you doing? -->', '', '', '### System', '', ...system.map((s) => `- ${s}`)]
  parts.push('', '### Full details', '', '<!-- Optional, but it helps most: on the TV, choose Add details, scan its code, and attach the vaportv-details.txt it downloads here. -->')
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
