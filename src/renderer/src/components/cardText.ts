// How a card writes when a game was played and for how long (the cards, the Spotlight layout, a game's details).

/** 11/05/26 from 2026-11-05. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${month}/${day}/${year.slice(2)}`
}

/** 45m, 3h 20m, then whole hours (126h) once the minutes stop mattering. */
export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 10 && minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours.toLocaleString()}h`
}
