import { useEffect, useRef, useState } from 'react'
import type { CustomBackdrop } from '../../../shared/types'

/** How long one picture or video takes to fade into the next (or into its own start, looping). */
const FADE_S = 1.5
/** How long a picture holds before the next, when shuffling. */
const PICTURE_S = 60

type Slot = { item: CustomBackdrop; key: number } | null

/**
 * Your own backdrops, filling the screen: one looping, or all of them in random order. Two
 * layers take turns, so each video fades into the next (or into its own start) instead of
 * cutting. Videos play muted, and pause while a game or app is in front, like the music.
 */
export function CustomBackground({ items, start, shuffle }: { items: CustomBackdrop[]; start: string; shuffle: boolean }) {
  const first = items.find((b) => b.file === start) ?? items[0]
  const [slots, setSlots] = useState<[Slot, Slot]>([{ item: first, key: 0 }, null])
  const [front, setFront] = useState(0)
  // The layer fading out: it stays fully up underneath until the one coming in has covered it.
  const [leaving, setLeaving] = useState<number | null>(null)
  const videos = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]
  const fading = useRef(false)
  const nextKey = useRef(1)

  // A new choice in Settings starts over on it; a change to what's shuffled carries on
  // with the one showing, if it's still in.
  const mounted = useRef(false)
  const playlist = items.map((b) => b.url).join('\n')
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (shuffle && fading.current === false && items.some((b) => b.url === slots[front]?.item.url)) return
    setSlots([{ item: first, key: nextKey.current++ }, null])
    setFront(0)
    setLeaving(null)
    fading.current = false
  }, [first.url, shuffle, playlist])

  /** Brings the next one in on the back layer, then fades over to it. */
  const advance = (): void => {
    if (fading.current) return
    fading.current = true
    const current = slots[front]?.item ?? first
    const others = items.filter((b) => b.url !== current.url)
    const next = shuffle && others.length > 0 ? others[Math.floor(Math.random() * others.length)] : current
    const back = 1 - front
    setSlots((s) => {
      const copy: [Slot, Slot] = [s[0], s[1]]
      copy[back] = { item: next, key: nextKey.current++ }
      return copy
    })
    setLeaving(front)
    // Drawn once see-through first, so it has something to fade up from.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setFront(back)
        setTimeout(() => {
          fading.current = false
          setLeaving(null)
          // Covered now: stop it.
          videos[1 - back].current?.pause()
        }, FADE_S * 1000)
      })
    )
  }

  // Videos: start the fade that long before the end. Pictures: after a while, when shuffling.
  const current = slots[front]
  useEffect(() => {
    if (!current) return
    if (current.item.kind === 'image') {
      if (!shuffle || items.length < 2) return
      const timer = setTimeout(advance, PICTURE_S * 1000)
      return () => clearTimeout(timer)
    }
    const el = videos[front].current
    if (!el) return
    const onTime = (): void => {
      if (el.duration && el.duration - el.currentTime <= FADE_S) advance()
    }
    el.addEventListener('timeupdate', onTime)
    // Too short to fade within: just go on when it ends.
    el.addEventListener('ended', advance)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', advance)
    }
  })

  // Paused behind games and apps.
  useEffect(() => {
    const play = (): void => void videos[front].current?.play().catch(() => {})
    const pause = (): void => videos.forEach((v) => v.current?.pause())
    window.addEventListener('focus', play)
    window.addEventListener('blur', pause)
    return () => {
      window.removeEventListener('focus', play)
      window.removeEventListener('blur', pause)
    }
  })

  // In its own stacking layer, so the front layer's z-index stays under the screen above it.
  return (
    <div className="stage-canvas stage-custom-layers">
      {slots.map((slot, i) =>
        !slot ? null : slot.item.kind === 'video' ? (
          <video
            key={slot.key}
            ref={videos[i]}
            className={`stage-custom${i === front ? ' shown front' : i === leaving ? ' shown' : ''}`}
            src={slot.item.url}
            autoPlay
            muted
            playsInline
          />
        ) : (
          <img key={slot.key} className={`stage-custom${i === front ? ' shown front' : i === leaving ? ' shown' : ''}`} src={slot.item.url} alt="" />
        )
      )}
    </div>
  )
}
