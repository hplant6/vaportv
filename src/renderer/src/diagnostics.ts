// Report a problem's snapshot, the page's side: each part of the page that has state worth
// seeing when something's gone wrong (the music, the backdrop, the screen, focus) registers a
// function saying what it's doing. They're only called when a report opens, so they cost
// nothing until then. Plain values only (states, kinds, counts): no titles, file names or labels.

type Provider = () => unknown
const providers = new Map<string, Provider>()

/** Adds a part to the snapshot under `name` (a later registration under the same name replaces it). Returns a remove function. */
export function registerDiagnostics(name: string, provider: Provider): () => void {
  providers.set(name, provider)
  return () => {
    if (providers.get(name) === provider) providers.delete(name)
  }
}

/** Every part's state now; one that throws says so instead of spoiling the rest. */
export function collectDiagnostics(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, provider] of providers) {
    try {
      out[name] = provider()
    } catch (err) {
      out[name] = { error: String(err) }
    }
  }
  return out
}

/** An element described for the snapshot without its text: tag, classes and data- markers. */
export function describeElement(el: Element | null): string | null {
  if (!el) return null
  if (el === document.body) return 'body (nothing focused)'
  const classes = [...el.classList].slice(0, 4).join('.')
  const marks = [...el.attributes]
    .filter((a) => a.name.startsWith('data-') && a.name !== 'data-focusable' && a.value.length <= 24 && /^[\w:-]*$/.test(a.value))
    .slice(0, 4)
    // An id says which game or film it is (as a title would): only its kind ("steam:…") is kept.
    .map((a) => (!a.value ? a.name : a.name.endsWith('-id') && a.value.includes(':') ? `${a.name}=${a.value.split(':')[0]}:…` : `${a.name}=${a.value}`))
  return [el.tagName.toLowerCase() + (classes ? `.${classes}` : ''), ...marks].join(' ')
}
