// The Arcade tab's carousels, in order. Each can be turned off in Settings → Consoles.
// (Neo Geo sets are found alongside them but shown on a tab of their own.)

export type ArcadeRow = 'recent' | 'favorites' | 'atomiswave' | 'naomi' | 'naomi2' | 'cps' | 'arcade'

export const ARCADE_ROWS: { id: ArcadeRow; name: string }[] = [
  { id: 'recent', name: 'Recently played' },
  { id: 'favorites', name: 'Favorites' },
  { id: 'atomiswave', name: 'Atomiswave' },
  { id: 'naomi', name: 'NAOMI' },
  { id: 'naomi2', name: 'NAOMI 2' },
  { id: 'cps', name: 'CPS' },
  { id: 'arcade', name: 'Arcade' }
]

export const arcadeRowName = (id: ArcadeRow): string => ARCADE_ROWS.find((row) => row.id === id)?.name ?? id
