import { useEffect, useRef } from 'react'
import type { CustomBackdrop } from '../../../shared/types'

/**
 * One of your own backdrops, filling the screen: a picture, or a video playing muted on a
 * loop (paused while a game or app is in front, like the music).
 */
export function CustomBackground({ backdrop }: { backdrop: CustomBackdrop }) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = video.current
    if (!el) return
    const play = (): void => void el.play().catch(() => {})
    const pause = (): void => el.pause()
    window.addEventListener('focus', play)
    window.addEventListener('blur', pause)
    return () => {
      window.removeEventListener('focus', play)
      window.removeEventListener('blur', pause)
    }
  }, [backdrop.url])

  return backdrop.kind === 'video' ? (
    <video ref={video} className="stage-canvas stage-custom" src={backdrop.url} autoPlay muted loop playsInline />
  ) : (
    <img className="stage-canvas stage-custom" src={backdrop.url} alt="" />
  )
}
