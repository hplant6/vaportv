// Modals leave as they arrive: when one is taken off the page, however it closed, a still copy
// of it sinks and fades over what's behind (app.css, .dialog-backdrop.leaving), then goes.
// One place for every modal, rather than each holding itself on screen while it leaves.

/** How long the copy stays: the leaving animation's length. */
const LEAVE_MS = 220

function modalsIn(node: HTMLElement): HTMLElement[] {
  if (node.matches('.dialog-backdrop')) return [node]
  return [...node.querySelectorAll<HTMLElement>('.dialog-backdrop')]
}

function leave(modal: HTMLElement): void {
  const copy = modal.cloneNode(true) as HTMLElement
  // Only a picture of it: nothing in it can take the cursor or be pressed.
  for (const el of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
    el.removeAttribute('id')
    el.removeAttribute('data-focus-trap')
    el.removeAttribute('data-focusable')
    el.removeAttribute('tabindex')
  }
  copy.inert = true
  copy.setAttribute('aria-hidden', 'true')
  copy.classList.add('leaving')
  document.body.appendChild(copy)
  setTimeout(() => copy.remove(), LEAVE_MS)
}

export function startModalExits(): void {
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.removedNodes) if (node instanceof HTMLElement && !node.classList.contains('leaving')) modalsIn(node).forEach(leave)
  }).observe(document.body, { childList: true, subtree: true })
}
