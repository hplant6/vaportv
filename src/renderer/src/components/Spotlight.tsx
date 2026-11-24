import { useEffect, useState } from 'react'
import type { RecentItem, SpotlightDetails } from '../../../shared/types'
import { CardRow } from './CardRow'
import { backdropOf, factsOf } from './spotlightParts'

// A game tab's Spotlight sections: a banner in the page, about two rows tall, showing the game the
// cursor's on (or was last on; until then the section's first). Its picture (a hero banner where
// there is one, else its own art, softened) fills the banner, fading out at its edges, with the
// game's logo or name, a line of facts and its description at the top, and the section's list as
// one carousel along the bottom. It scrolls with the page like any other section. The details (a
// Steam game's hero, logo and store description) are asked for once the cursor settles, and kept.

/** The cursor has to rest this long before the details are asked for (not on every card passed). */
const SETTLE_MS = 150

const known = new Map<string, Promise<SpotlightDetails>>()

function details(id: string): Promise<SpotlightDetails> {
  let found = known.get(id)
  if (!found) {
    found = window.steamtv.spotlight(id).catch(() => ({}))
    known.set(id, found)
  }
  return found
}

/** The item's details, once the cursor's settled on it ({} until then, and for ones without). */
function useDetails(item: RecentItem | null): SpotlightDetails {
  const [shown, setShown] = useState<{ id: string; details: SpotlightDetails } | null>(null)
  useEffect(() => {
    if (!item) return
    let live = true
    const timer = setTimeout(() => details(item.id).then((d) => live && setShown({ id: item.id, details: d })), SETTLE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [item])
  return shown && item && shown.id === item.id ? shown.details : {}
}

interface Layer {
  url: string
  soft: boolean
  key: number
}

let layerKey = 0

/** The banner's picture for a game: its hero, else its own art softened. */
export function SpotlightBackdrop({ item }: { item: RecentItem | null }) {
  const d = useDetails(item)
  const picture = item ? backdropOf(item, d) : null
  return <SpotlightPicture url={picture?.url} soft={picture?.soft ?? false} />
}

/** A banner's picture (a game's, or the Video tab's): a new one fades in over the last once it's loaded, so it never flashes. */
export function SpotlightPicture({ url, soft }: { url: string | undefined; soft: boolean }) {
  const [layers, setLayers] = useState<Layer[]>([])
  useEffect(() => {
    if (!url) return
    let live = true
    const img = new Image()
    img.src = url
    img
      .decode()
      .catch(() => undefined)
      .then(() => {
        // The one before stays under it while it fades in; older ones go.
        if (live) setLayers((now) => (now[now.length - 1]?.url === url ? now : [...now.slice(-1), { url, soft, key: ++layerKey }]))
      })
    return () => {
      live = false
    }
  }, [url, soft])
  return (
    <div className="spotlight-backdrop" aria-hidden="true">
      {layers.map((layer) => (
        <div key={layer.key} className={`spotlight-picture${layer.soft ? ' soft' : ''}`} style={{ backgroundImage: `url("${layer.url}")` }} />
      ))}
      <div className="spotlight-shade" />
    </div>
  )
}

/** The game's name (or logo), facts and description, over the picture. */
function SpotlightInfo({ item }: { item: RecentItem | null }) {
  const d = useDetails(item)
  const [logoFailed, setLogoFailed] = useState<string | null>(null)
  if (!item) return <div className="spotlight-info" />
  const logo = d.logo && logoFailed !== d.logo ? d.logo : null
  return (
    <div className="spotlight-info" key={item.id}>
      {logo ? (
        <img className="spotlight-logo" src={logo} alt={item.title} onError={() => setLogoFailed(logo)} />
      ) : (
        <h2 className="spotlight-title display">{item.title}</h2>
      )}
      <p className="spotlight-facts">{factsOf(item).join('  ·  ')}</p>
      {d.description && <p className="spotlight-description">{d.description}</p>}
    </div>
  )
}

interface Props {
  /** The element id the bar jumps to. */
  id: string
  title: string
  items: RecentItem[]
  logos: Record<string, string>
  memoryKey: string
  hasDefault: boolean
  /** The first section: it stays under the toolbar rather than coming to the top. */
  first: boolean
  /** The cursor's on one of its cards: it becomes the one shown. */
  onFocusItem: (item: RecentItem) => void
  /** The card the cursor's on, when it's in this section. */
  focused: RecentItem | null
}

/** A Spotlight section: the focused game's name and description over the screen, and its list as a carousel. */
export function SpotlightSection({ id, title, items, logos, memoryKey, hasDefault, first, onFocusItem, focused }: Props) {
  // Until the cursor's in it, its first game's shown.
  const shown = focused && items.some((i) => i.id === focused.id) ? focused : (items[0] ?? null)
  return (
    <section id={id} className={`spotlight${first ? ' first' : ''}`}>
      <SpotlightBackdrop item={shown} />
      {/* The section's name heads the banner (not its row), and stays put as the game changes. */}
      <h2 className="section-label display spotlight-label">{title}</h2>
      <SpotlightInfo item={shown} />
      <CardRow className="spotlight-row" title={title} items={items} logos={logos} memoryKey={memoryKey} hasDefault={hasDefault} onItemFocus={onFocusItem} />
    </section>
  )
}
