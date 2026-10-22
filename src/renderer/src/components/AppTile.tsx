import type { AppItem } from '../../../shared/types'
import { startLaunch } from '../launch'
import { APP_SETUP_EVENT } from './AppSetupDialog'

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
  const needsSetup = app.state ? !app.state.ready : false
  return (
    <button
      className={`app-tile${needsSetup ? ' needs-setup' : ''}`}
      tabIndex={-1}
      data-focusable=""
      {...(isDefault ? { 'data-focus-default': '' } : {})}
      aria-label={app.name}
      data-app-id={app.id}
      onFocus={onFocus}
      onClick={(e) =>
        needsSetup
          ? window.dispatchEvent(new CustomEvent(APP_SETUP_EVENT, { detail: { app, tile: e.currentTarget } }))
          : startLaunch('app', app.id, app.name, `${app.name} isn't set up on this computer yet`)
      }
    >
      {app.tile ? (
        <img src={app.tile} alt="" />
      ) : (
        // No art yet (it comes from SteamGridDB, with a key): its name over vaporTV's static.
        <span className="app-tile-name display">{app.name}</span>
      )}
      {needsSetup && <span className="app-setup-badge display">Set up</span>}
      {showFavorite && app.favorite && (
        <span className="favorite-star" aria-label="Favourite">
          ★
        </span>
      )}
    </button>
  )
}
