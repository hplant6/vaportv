import type { RecentItem } from '../../../shared/types'
import { startLaunch } from '../launch'
import clock from '../assets/clock.svg'

interface Props {
  item: RecentItem
  logo?: string
  isDefault: boolean
  onFocus: () => void
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${month}/${day}/${year.slice(2)}`
}

/** 45m, 3h 20m, then whole hours (126h) once the minutes stop mattering. */
function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 10 && minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours.toLocaleString()}h`
}

export function RecentCard({ item, logo, isDefault, onFocus }: Props) {
  return (
    <button
      className="recent-card"
      tabIndex={-1}
      data-focusable=""
      data-item-id={item.id}
      {...(isDefault ? { 'data-focus-default': '' } : {})}
      onFocus={onFocus}
      onClick={() => startLaunch('recent', item.id, item.title, `Can't launch ${item.title}`)}
    >
      {item.favorite && <span className="favorite-star" aria-label="Favourite">★</span>}
      <div className="recent-art">
        {item.cover ? (
          <img src={item.cover} alt="" />
        ) : item.wide ? (
          // Only wide art (an app's tile, a video thumbnail): centred over a blurred copy.
          <>
            <img className="recent-art-backdrop" src={item.wide} alt="" />
            <img className="recent-art-centred" src={item.wide} alt="" />
          </>
        ) : (
          <div className="recent-no-art display">
            <span className="no-art-band">{item.title}</span>
          </div>
        )}
      </div>
      <div className="recent-footer">
        <div className="recent-logo">{logo && <img src={logo} alt="" />}</div>
        <div className="recent-text">
          <div className="recent-title">{item.title}</div>
          <div className="recent-date">
            {item.lastPlayed ? formatDate(item.lastPlayed) : 'Unplayed'}
            {item.playtime ? (
              <>
                {/* Total time played, after the date. */}
                <span className="recent-playtime-icon" style={{ maskImage: `url("${clock}")` }} aria-label="Played for" />
                {formatPlaytime(item.playtime)}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  )
}
