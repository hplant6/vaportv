// The Arcade tab's systems, in its left bar's order (under Systems). Each can be hidden from
// the bar in Settings → Consoles. (Neo Geo sets are found alongside them but have a tab of their own.)

export type ArcadeList = 'atomiswave' | 'naomi' | 'naomi2' | 'cps1' | 'cps2' | 'cps3' | 'arcade'

/**
 * What Settings saves as hidden: the lists, and what older versions saved there ('recent' and
 * 'favorites', rows the bar now always has; 'cps', the one CPS row the three boards were).
 */
export type ArcadeRow = ArcadeList | 'recent' | 'favorites' | 'cps'

export const ARCADE_LISTS: { id: ArcadeList; name: string }[] = [
  { id: 'atomiswave', name: 'Atomiswave' },
  { id: 'naomi', name: 'NAOMI' },
  { id: 'naomi2', name: 'NAOMI 2' },
  { id: 'cps1', name: 'CPS1' },
  { id: 'cps2', name: 'CPS2' },
  { id: 'cps3', name: 'CPS3' },
  { id: 'arcade', name: 'MAME' }
]

export const arcadeListName = (id: ArcadeList): string => ARCADE_LISTS.find((list) => list.id === id)?.name ?? id

/** Whether `list` is hidden by what's saved (an old 'cps' hides all three boards). */
export function arcadeListHidden(hidden: ArcadeRow[], list: ArcadeList): boolean {
  return hidden.includes(list) || (list.startsWith('cps') && hidden.includes('cps'))
}

/** Saved hidden lists with `list` shown or hidden: an old 'cps' becomes the three boards first. */
export function toggleArcadeList(hidden: ArcadeRow[], list: ArcadeList): ArcadeRow[] {
  const lists = ARCADE_LISTS.map((l) => l.id).filter((id) => arcadeListHidden(hidden, id))
  return lists.includes(list) ? lists.filter((id) => id !== list) : [...lists, list]
}
