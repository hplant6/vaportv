import { useEffect, useState } from 'react'

/** Current time, re-rendering on each minute boundary. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = (): void => {
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60_000 - (Date.now() % 60_000) + 50)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  return now
}
