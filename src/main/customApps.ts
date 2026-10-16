import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { AppItem } from '../shared/types'
import type { Config } from './config'
import home from '../../fixtures/home.json'
import { artUrl } from './library/art'

// App tiles of the user's own, beyond the built-in ones (config `customApps`): a name,
// the Steam shortcut it opens, and a tile picture kept in ~/.config/steamtv/tiles.

export const CUSTOM_TILES = join(homedir(), '.config', 'steamtv', 'tiles')

export interface CustomApp {
  id: string
  name: string
  /** Name(s) of the Steam shortcut it opens (default its name). */
  shortcuts: string[]
  /** The tile's page URL, if it has a picture. */
  tile?: string
}

export function customApps(config: Config): CustomApp[] {
  return (config.customApps ?? [])
    .filter((app) => app?.id && app.name)
    .map((app) => ({
      id: app.id,
      name: app.name,
      shortcuts: [app.shortcut ?? app.name].flat(),
      // Only from the tiles folder, whatever the config says.
      tile: app.tile ? artUrl(join(CUSTOM_TILES, basename(app.tile))) : undefined
    }))
}

export function customAppItems(config: Config): AppItem[] {
  return customApps(config).map((app) => ({ id: app.id, name: app.name, tile: app.tile ?? '' }))
}

/** Every app tile: the built-in ones, then your own. */
export const appCatalog = (config: Config): AppItem[] => [...home.apps, ...home.moreApps, ...customAppItems(config)]

/** The custom app a Steam shortcut belongs to, by its name. */
export function customAppFor(config: Config, shortcutName: string): CustomApp | undefined {
  const name = shortcutName.toLowerCase()
  return customApps(config).find((app) => app.shortcuts.some((s) => s.toLowerCase() === name))
}
