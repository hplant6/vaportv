import type { ReactNode } from 'react'
import { useNow } from './useNow'

/** Top right: `before` (the power button), then the time, with the battery (where there is one) under am/pm. */
export function Clock({ before, battery }: { before?: ReactNode; battery?: ReactNode }) {
  const now = useNow()
  const hours = now.getHours()
  const time = `${hours % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className="clock display">
      {before}
      <span className="time">{time}</span>
      <span className="clock-side">
        <span className="meridiem">{hours < 12 ? 'am' : 'pm'}</span>
        {battery}
      </span>
    </div>
  )
}
