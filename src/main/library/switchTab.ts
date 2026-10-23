import type { LibraryTab } from '../../shared/types'
import { recentsLayout, type Config } from '../config'
import { romRoot } from './emudeck'
import { emulatedTab, fillEmulatedArt, withNames, type EmulatedGame } from './emulated'
import { scanSwitch, type SwitchGame } from './switch'

export function switchRoot(config: Config): string {
  return `${romRoot(config)}/switch`
}

export async function loadSwitchGames(config: Config): Promise<SwitchGame[]> {
  return scanSwitch(switchRoot(config), config.switchTitles)
}

function asEmulated(game: SwitchGame): EmulatedGame {
  // Art is cached by Switch title id when known, else by folder.
  return { id: game.id, title: game.title, platform: 'switch', artKey: `switch:${game.titleId ?? game.id}` }
}

export async function switchGames(config: Config): Promise<EmulatedGame[]> {
  return withNames(config, (await loadSwitchGames(config)).map(asEmulated))
}

export async function loadSwitchTab(config: Config): Promise<LibraryTab> {
  return emulatedTab(await switchGames(config), config.switchLayout ?? 'rows', recentsLayout(config, 'switch'))
}

export function fillSwitchArt(config: Config, onUpdate: () => void): void {
  fillEmulatedArt('switch', config.steamGridDbKey, () => switchGames(config), onUpdate)
}
