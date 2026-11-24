import { useEffect, useState } from 'react'

// The plastic sleeves vaporTV lays over album covers (Now playing's cover; the Music tab's, when
// its Customize window turns them on): the overlays in private/sleeves.json, on Henry's box only
// (a public build has none, and shows covers bare).

export type Sleeve = { url: string; turn: number }

let list: Promise<string[]> | null = null

/** The sleeves there are, asked for once. */
export function sleeveList(): Promise<string[]> {
  list ??= fetch(new URL('private/sleeves.json', document.baseURI).href)
    .then((res) => (res.ok ? (res.json() as Promise<string[]>) : []))
    .catch(() => [])
  return list
}

/** The sleeves, once known ([] until then, and in a public build). */
export function useSleeveList(): string[] {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    let live = true
    void sleeveList().then((got) => live && setNames(got))
    return () => {
      live = false
    }
  }, [])
  return names
}

const at = (name: string, turn: number): Sleeve => ({ url: new URL(`private/${name}`, document.baseURI).href, turn: turn * 90 })

/** A sleeve at random, and a random quarter turn of it: not `last` again, when there's a choice. */
export function randomSleeve(names: string[], last: Sleeve | null): Sleeve | null {
  if (!names.length) return null
  for (;;) {
    const sleeve = at(names[Math.floor(Math.random() * names.length)], Math.floor(Math.random() * 4))
    if (!last || sleeve.url !== last.url || sleeve.turn !== last.turn) return sleeve
  }
}

/** A sleeve and turn picked by `key` (an album's id): mixed across a grid, the same each time it's drawn. */
export function sleeveFor(key: string, names: string[]): Sleeve | null {
  if (!names.length) return null
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  h >>>= 0
  return at(names[h % names.length], Math.floor(h / names.length) % 4)
}
