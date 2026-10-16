import type { AppItem } from '../../../shared/types'
import { startLaunch } from '../launch'

export function AppTile({
  app,
  isDefault,
  showFavorite = false,
  onFocus
}: {
  app: AppItem
  isDefault: boolean
  /** Mark favorites with a star (the Apps tab; on Home they all are). */
  showFavorite?: boolean
  onFocus?: () => void
}) {
  return (
    <button
      className="app-tile"
      tabIndex={-1}
      data-focusable=""
      {...(isDefault ? { 'data-focus-default': '' } : {})}
      aria-label={app.name}
      data-app-id={app.id}
      onFocus={onFocus}
      onClick={() => startLaunch('app', app.id, app.name, `${app.name} isn't set up on this computer yet`)}
    >
      <img src={app.tile} alt="" />
      {showFavorite && app.favorite && (
        <span className="favorite-star" aria-label="Favourite">
          ★
        </span>
      )}
    </button>
  )
}
