// A film, show or episode as a playlist keeps it: media:<account>:<item>, beside the games'
// own ids (steam:…, snes:…), so a playlist can hold both.

export const mediaKey = (source: string, id: string): string => `media:${source}:${id}`

/** The account and item a playlist's media id names; null for a game's. */
export function parseMediaKey(key: string): { source: string; id: string } | null {
  const m = /^media:([^:]+):(.+)$/.exec(key)
  return m ? { source: m[1], id: m[2] } : null
}
