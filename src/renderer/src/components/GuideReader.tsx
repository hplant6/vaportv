import QRCode from 'qrcode'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Block, Inline } from '../../../shared/markdown'
import { GUIDES, guideImage } from '../guides'
import { focus, OWN_DIRECTION_EVENT, TRAP_CLOSE_EVENT, TRAP_TAB_EVENT, type Direction } from '../input/focus'
import { play } from '../input/sounds'
import { OverStage } from './GooglePhotos'

// Settings → Help → a guide: read full screen. Up and down scroll, L1 and R1 go to the
// other guides, B closes. The QR code opens the same guide on GitHub, on a phone, where
// links work and commands can be copied.

/** Opens a guide (detail: { file, from }: the guide, and the row to come back to). */
export const OPEN_GUIDE_EVENT = 'steamtv:guide'

/** How far one press scrolls, and a held one each repeat. */
const STEP = 240

/** Mounted once in App; shows the guide while one is open. */
export function GuideReader() {
  const [open, setOpen] = useState<{ index: number; from: HTMLElement | null } | null>(null)
  useEffect(() => {
    const onOpen = (event: Event): void => {
      const { file, from } = (event as CustomEvent<{ file: string; from?: HTMLElement }>).detail
      const index = GUIDES.findIndex((g) => g.file === file)
      if (index >= 0) setOpen({ index, from: from ?? null })
    }
    window.addEventListener(OPEN_GUIDE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, onOpen)
  }, [])
  if (!open) return null
  return (
    <OverStage>
      <Reader
        index={open.index}
        onStep={(step) => setOpen({ ...open, index: (open.index + step + GUIDES.length) % GUIDES.length })}
        onClose={() => {
          if (open.from?.isConnected) requestAnimationFrame(() => focus(open.from!))
          setOpen(null)
        }}
      />
    </OverStage>
  )
}

function Reader({ index, onStep, onClose }: { index: number; onStep: (step: number) => void; onClose: () => void }) {
  const guide = GUIDES[index]
  const surface = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLDivElement>(null)
  // Where the page is headed: presses add up while it's still gliding there.
  const target = useRef(0)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    if (surface.current) focus(surface.current)
  }, [])

  useEffect(() => {
    target.current = 0
    page.current?.scrollTo({ top: 0 })
    setQr(null)
    QRCode.toDataURL(guide.url, { margin: 1, width: 320, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [guide.url])

  useEffect(() => {
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      const el = page.current
      if (!el || (direction !== 'up' && direction !== 'down')) return
      const max = el.scrollHeight - el.clientHeight
      const next = Math.max(0, Math.min(max, target.current + (direction === 'down' ? STEP : -STEP)))
      if (next === target.current) return
      target.current = next
      el.scrollTo({ top: next, behavior: 'smooth' })
    }
    const onTab = (event: Event): void => {
      if (GUIDES.length < 2) return
      play('move')
      onStep((event as CustomEvent<number>).detail)
    }
    window.addEventListener(OWN_DIRECTION_EVENT, onDirection)
    window.addEventListener(TRAP_TAB_EVENT, onTab)
    window.addEventListener(TRAP_CLOSE_EVENT, onClose)
    return () => {
      window.removeEventListener(OWN_DIRECTION_EVENT, onDirection)
      window.removeEventListener(TRAP_TAB_EVENT, onTab)
      window.removeEventListener(TRAP_CLOSE_EVENT, onClose)
    }
  }, [onStep, onClose])

  return (
    <div className="dialog-backdrop guide-backdrop">
      <div className="guide-surface" ref={surface} tabIndex={-1} data-focusable="" data-focus-trap="" data-own-directions="">
        <div className="dialog-panel guide-panel">
          <div className="guide-page" ref={page}>
            <article className="guide-article">{guide.blocks.map(renderBlock)}</article>
          </div>
        </div>
        <aside className="dialog-panel guide-side">
          {qr ? <img className="guide-qr" src={qr} alt="" /> : <div className="guide-qr guide-qr-waiting" />}
          <p className="guide-side-text">Scan to read this guide on your phone, with links that open and commands you can copy.</p>
          <p className="guide-side-hint">
            {GUIDES.length > 1 && <>L1 / R1 · other guides ({index + 1} of {GUIDES.length})<br /></>}
            B · back
          </p>
        </aside>
      </div>
    </div>
  )
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case 'heading': {
      const Tag = (['h1', 'h2', 'h3'] as const)[block.level - 1]
      return (
        <Tag key={key} className={block.level === 1 ? 'display' : undefined}>
          {renderInline(block.children)}
        </Tag>
      )
    }
    case 'paragraph':
      return <p key={key}>{renderInline(block.children)}</p>
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag key={key}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </Tag>
      )
    }
    case 'image': {
      const src = guideImage(block.src)
      return src ? <img key={key} className="guide-image" src={src} alt={block.alt} /> : null
    }
    case 'quote':
      return (
        <p key={key} className="guide-tip">
          {renderInline(block.children)}
        </p>
      )
    case 'table':
      return (
        <table key={key} className="guide-table">
          <thead>
            <tr>
              {block.head.map((cell, i) => (
                <th key={i}>{renderInline(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'code':
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      )
  }
}

function renderInline(parts: Inline[]): ReactNode {
  return parts.map((part, i) => {
    switch (part.kind) {
      case 'text':
        return <Fragment key={i}>{part.text}</Fragment>
      case 'strong':
        return <strong key={i}>{renderInline(part.children)}</strong>
      case 'em':
        return <em key={i}>{renderInline(part.children)}</em>
      case 'code':
        return <code key={i}>{part.text}</code>
      // Links can't be followed from here (the QR code opens the guide where they can):
      // shown as words, underlined so it's clear there's one.
      case 'link':
        return (
          <span key={i} className="guide-link">
            {renderInline(part.children)}
          </span>
        )
    }
  })
}
