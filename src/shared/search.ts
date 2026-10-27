// Finding games and apps by name, for the search screen, typed or spoken. Spoken words
// come back from speech recognition as it hears them ("halo two", "final fantasy 7"),
// so names are compared after evening out numbers, Roman numerals, symbols and spacing.

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  ii: '2',
  iii: '3',
  iv: '4',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
  xi: '11',
  xii: '12',
  xiii: '13'
}

/** Words that, said first, ask for the top match to start ("play Halo", "open Netflix"). */
const START_WORDS = /^(?:play|launch|start|open|run)\s+(.+)$/i

/** Lower case, no accents or symbols, numbers as digits: the words to compare. */
export function searchWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => NUMBER_WORDS[word] ?? word)
}

/** What was asked for, and whether it asked to start it. */
export function parseQuery(text: string): { query: string; start: boolean } {
  const trimmed = text.trim()
  const asked = START_WORDS.exec(trimmed)
  return asked ? { query: asked[1].trim(), start: true } : { query: trimmed, start: false }
}

/** Edits to turn one word into another, up to `max` (more is reported as max + 1). */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[b.length]
}

/** How well one asked-for word matches a title's word: 1 exactly, less for a start or a near miss, 0 not. */
function wordScore(asked: string, word: string, last: boolean): number {
  if (asked === word) return 1
  // The last word may be cut short while typing ("zel" for Zelda).
  if (last && word.startsWith(asked)) return 0.8
  if (asked.length >= 4 && distance(asked, word, asked.length >= 7 ? 2 : 1) <= (asked.length >= 7 ? 2 : 1)) return 0.7
  return 0
}

/** 0 (no match) to 100 (the same name). */
export function matchScore(query: string, title: string): number {
  const asked = searchWords(query)
  const words = searchWords(title)
  if (!asked.length || !words.length) return 0
  const joinedAsked = asked.join('')
  const joined = words.join('')
  if (joinedAsked === joined) return 100
  let total = 0
  let matched = 0
  asked.forEach((a, i) => {
    const best = Math.max(...words.map((w) => wordScore(a, w, i === asked.length - 1)))
    if (best) matched++
    total += best
  })
  const coverage = total / asked.length
  // Every asked-for word found: closer to 90 the more of the title it covers.
  if (matched === asked.length) return Math.round(60 + 30 * coverage * Math.min(1, asked.length / words.length))
  // Run together or split differently ("streetfighter", "pac man"): compare without spaces.
  if (joinedAsked.length >= 4 && joined.includes(joinedAsked)) return 55
  // Some of the words: worth showing if most are there.
  return coverage >= 0.5 ? Math.round(50 * coverage) : 0
}

/** Things matching `query`, best first; ties keep their order (most recently played first). */
export function search<T>(query: string, things: T[], name: (thing: T) => string, minScore = 30): { thing: T; score: number }[] {
  return things
    .map((thing, index) => ({ thing, index, score: matchScore(query, name(thing)) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ thing, score }) => ({ thing, score }))
}

/** Whether the best result is clear enough to start straight away when asked to. */
export function clearWinner(results: { score: number }[]): boolean {
  const [first, second] = results
  return !!first && first.score >= 75 && (!second || first.score - second.score >= 10)
}
