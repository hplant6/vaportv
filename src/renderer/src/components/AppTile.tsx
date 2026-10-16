import type { AppItem } from '../../../shared/types'
import { startLaunch } from '../launch'

export function AppTile({ app, isDefault, onFocus }: { app: AppItem; isDefault: boolean; onFocus?: () => void }) {
  return (
    <button
      className="app-tile"
      tabIndex={-1}
      data-focusable=""
      {...(isDefault ? { 'data-focus-default': '' } : {})}
      aria-label={app.name}
      onFocus={onFocus}
      onClick={() => startLaunch('app', app.id, app.name, `${app.name} isn't set up on this computer yet`)}
    >
      <img src={app.tile} alt="" />
    </button>
  )
}
