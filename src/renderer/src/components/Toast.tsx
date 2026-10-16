import { useEffect, useState } from 'react'

const EVENT = 'steamtv:toast'
const DURATION = 3000

/** Shows a short message at the bottom of the screen; a new one replaces it. */
export function toast(message: string, duration = DURATION): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, duration } }))
}

export function Toast() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onToast = (event: Event): void => {
      const { message, duration } = (event as CustomEvent<{ message: string; duration: number }>).detail
      setMessage(message)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), duration)
    }
    // Whatever launched is now in front; don't greet the return with a stale message.
    const onBlur = (): void => setMessage(null)
    window.addEventListener(EVENT, onToast)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener(EVENT, onToast)
      window.removeEventListener('blur', onBlur)
      clearTimeout(timer)
    }
  }, [])

  return <div className={`toast${message ? ' visible' : ''}`}>{message}</div>
}
