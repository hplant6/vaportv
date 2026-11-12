// A game's genre as the left bar lists it: ES-DE's scrapers give "Shooter / FPV", "Racing,
// Driving", "Shoot'em Up / Vertical"; the bar lists each by its main genre, named plainly.

/** Main genres renamed, as scraped → as listed. */
const NAMES: Record<string, string> = {
  'role playing game': 'Role-Playing',
  rpg: 'Role-Playing',
  "beat'em up": "Beat 'em Up",
  "shoot'em up": "Shoot 'em Up",
  'lightgun shooter': 'Light Gun',
  'casual game': 'Casual',
  'platform game': 'Platform'
}

/** e.g. "Shooter / FPV" → "Shooter", "Racing, Driving" → "Racing"; undefined for nothing usable. */
export function mainGenre(scraped: string | undefined): string | undefined {
  const main = scraped?.split(/\s*[/,]\s*/)[0].replace(/\s+/g, ' ').trim()
  if (!main) return undefined
  return NAMES[main.toLowerCase()] ?? main.charAt(0).toUpperCase() + main.slice(1)
}
