import { useNow } from './useNow'

export function Clock() {
  const now = useNow()
  const hours = now.getHours()
  const time = `${hours % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className="clock display">
      <span className="time">{time}</span>
      <span className="meridiem">{hours < 12 ? 'am' : 'pm'}</span>
    </div>
  )
}
