import { contextBridge, ipcRenderer } from 'electron'
import type { GooglePhotosProgress, SteamTvApi, UpdateState } from '../shared/types'

const api: SteamTvApi = {
  getHome: () => ipcRenderer.invoke('home:get'),
  getWeather: () => ipcRenderer.invoke('weather:get'),
  getSunTimes: () => ipcRenderer.invoke('sun:get'),
  launch: (kind, id, name) => ipcRenderer.invoke('launch', kind, id, name),
  quit: () => ipcRenderer.invoke('quit'),
  power: (action) => ipcRenderer.invoke('power', action),
  sleepBlocker: () => ipcRenderer.invoke('power:sleepBlocker'),
  stepVolume: (direction) => ipcRenderer.invoke('volume:step', direction),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getAvailableTabs: () => ipcRenderer.invoke('tabs:available'),
  getSteamTab: () => ipcRenderer.invoke('steam-tab:get'),
  setSteamCollections: (ids) => ipcRenderer.invoke('settings:steamCollections', ids),
  setTabLayout: (tab, layout) => ipcRenderer.invoke('settings:tabLayout', tab, layout),
  setRecentsLayout: (tab, layout) => ipcRenderer.invoke('settings:recentsLayout', tab, layout),
  setFavoritesLayout: (layout) => ipcRenderer.invoke('settings:favoritesLayout', layout),
  setBraveSearchKey: (key) => ipcRenderer.invoke('settings:braveSearchKey', key),
  setSteamGridDbKey: (key) => ipcRenderer.invoke('settings:steamGridDbKey', key),
  setMusic: (kind, choice) => ipcRenderer.invoke('settings:music', kind, choice),
  setPlaylists: (playlists) => ipcRenderer.invoke('settings:playlists', playlists),
  setMusicVolume: (kind, volume) => ipcRenderer.invoke('settings:musicVolume', kind, volume),
  musicFiles: {
    add: (path, kind) => ipcRenderer.invoke('music:add', path, kind)
  },
  browseFiles: (dir, kind) => ipcRenderer.invoke('files:browse', dir, kind),
  openFile: (path) => ipcRenderer.invoke('files:open', path),
  pasteFile: (source, folder, move) => ipcRenderer.invoke('files:paste', source, folder, move),
  onPasteProgress: (callback) => {
    const listener = (_event: unknown, percent: number): void => callback(percent)
    ipcRenderer.on('files:pasteProgress', listener)
    return () => ipcRenderer.removeListener('files:pasteProgress', listener)
  },
  addBackdrop: (path) => ipcRenderer.invoke('backdrops:add', path),
  removeBackdrop: (file) => ipcRenderer.invoke('backdrops:remove', file),
  setBackdropShuffleOff: (files) => ipcRenderer.invoke('backdrops:shuffleOff', files),
  getBackdrop: () => ipcRenderer.invoke('backdrop:get'),
  setBackdrop: (style, file) => ipcRenderer.invoke('settings:backdrop', style, file),
  setTunnelColors: (colors) => ipcRenderer.invoke('settings:tunnelColors', colors),
  setDriftDirection: (direction) => ipcRenderer.invoke('settings:driftDirection', direction),
  setDriftPreset: (name) => ipcRenderer.invoke('settings:driftPreset', name),
  setBackdropTime: (time) => ipcRenderer.invoke('settings:backdropTime', time),
  getMusic: () => ipcRenderer.invoke('music:get'),
  musicTrackUrl: (file) => ipcRenderer.invoke('music:trackUrl', file),
  getScreensaver: () => ipcRenderer.invoke('screensaver:get'),
  setScreensaverDelay: (minutes) => ipcRenderer.invoke('settings:screensaverDelay', minutes),
  setScreensaverStyle: (style) => ipcRenderer.invoke('settings:screensaverStyle', style),
  setScreensaverClock: (spot) => ipcRenderer.invoke('settings:screensaverClock', spot),
  setScreensaverDetails: (on) => ipcRenderer.invoke('settings:screensaverDetails', on),
  photoTaken: (url) => ipcRenderer.invoke('screensaver:photoTaken', url),
  setScreensaverSources: (sources) => ipcRenderer.invoke('settings:screensaverSources', sources),
  setSleepOnControllerOff: (on) => ipcRenderer.invoke('settings:sleepOnControllerOff', on),
  location: {
    get: () => ipcRenderer.invoke('location:get'),
    search: (query) => ipcRenderer.invoke('location:search', query),
    set: (place) => ipcRenderer.invoke('location:set', place),
    setUnit: (unit) => ipcRenderer.invoke('location:unit', unit)
  },
  getBattery: () => ipcRenderer.invoke('battery:get'),
  getSystemStats: () => ipcRenderer.invoke('system-stats:get'),
  clock: {
    get: () => ipcRenderer.invoke('clock:get'),
    set: (corners) => ipcRenderer.invoke('clock:set', corners)
  },
  tabs: {
    get: () => ipcRenderer.invoke('tabs:settings'),
    set: (arrangement, off) => ipcRenderer.invoke('tabs:set', arrangement, off)
  },
  intro: {
    get: () => ipcRenderer.invoke('intro:get'),
    opening: () => ipcRenderer.invoke('intro:opening'),
    set: (choice) => ipcRenderer.invoke('intro:set', choice)
  },
  updates: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    dismiss: (version) => ipcRenderer.invoke('update:dismiss', version),
    onAvailable: (callback) => {
      const listener = (_event: unknown, state: UpdateState): void => callback(state)
      ipcRenderer.on('update:available', listener)
      return () => ipcRenderer.removeListener('update:available', listener)
    },
    onProgress: (callback) => {
      const listener = (_event: unknown, percent: number): void => callback(percent)
      ipcRenderer.on('update:progress', listener)
      return () => ipcRenderer.removeListener('update:progress', listener)
    }
  },
  welcome: {
    seen: () => ipcRenderer.invoke('welcome:seen'),
    done: () => ipcRenderer.invoke('welcome:done')
  },
  appSetup: {
    install: (id) => ipcRenderer.invoke('appSetup:install', id),
    addToSteam: (ids) => ipcRenderer.invoke('appSetup:addToSteam', ids),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, line: string): void => callback(line)
      ipcRenderer.on('appSetup:progress', listener)
      return () => ipcRenderer.removeListener('appSetup:progress', listener)
    }
  },
  toggleFavoriteApp: (id) => ipcRenderer.invoke('apps:favorite', id),
  setArcadeRowsHidden: (rows) => ipcRenderer.invoke('settings:arcadeRowsHidden', rows),
  setControls: (controls) => ipcRenderer.invoke('settings:controls', controls),
  setSleepWarning: (on) => ipcRenderer.invoke('settings:sleepWarning', on),
  art: {
    search: (id, query) => ipcRenderer.invoke('art:search', id, query),
    covers: (id, gameId) => ipcRenderer.invoke('art:covers', id, gameId),
    choose: (id, gameId, cover) => ipcRenderer.invoke('art:choose', id, gameId, cover),
    reset: (id) => ipcRenderer.invoke('art:reset', id),
    webSearch: (query) => ipcRenderer.invoke('art:webSearch', query),
    libretro: (id, query) => ipcRenderer.invoke('art:libretro', id, query),
    chooseWeb: (id, url, thumb) => ipcRenderer.invoke('art:chooseWeb', id, url, thumb)
  },
  arcadeCores: {
    get: (id) => ipcRenderer.invoke('arcade:cores', id),
    set: (id, core) => ipcRenderer.invoke('arcade:setCore', id, core)
  },
  game: {
    options: (id) => ipcRenderer.invoke('game:options', id),
    rename: (id, name) => ipcRenderer.invoke('game:rename', id, name),
    setEmulator: (id, emulator) => ipcRenderer.invoke('game:setEmulator', id, emulator),
    delete: (id) => ipcRenderer.invoke('game:delete', id)
  },
  setup: {
    status: () => ipcRenderer.invoke('setup:status'),
    install: (options) => ipcRenderer.invoke('setup:install', options),
    uninstall: () => ipcRenderer.invoke('setup:uninstall'),
    gamingMode: () => ipcRenderer.invoke('setup:gamingMode'),
    damage: () => ipcRenderer.invoke('setup:damage'),
    repair: (password) => ipcRenderer.invoke('setup:repair', password),
    dismissRepair: (key) => ipcRenderer.invoke('setup:dismissRepair', key),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, line: string): void => callback(line)
      ipcRenderer.on('setup:progress', listener)
      return () => ipcRenderer.removeListener('setup:progress', listener)
    }
  },
  wifi: {
    status: () => ipcRenderer.invoke('wifi:status'),
    setEnabled: (on) => ipcRenderer.invoke('wifi:enabled', on),
    rescan: () => ipcRenderer.invoke('wifi:rescan'),
    connect: (ssid, password) => ipcRenderer.invoke('wifi:connect', ssid, password),
    forget: (ssid) => ipcRenderer.invoke('wifi:forget', ssid)
  },
  bluetooth: {
    status: () => ipcRenderer.invoke('bluetooth:status'),
    setPowered: (on) => ipcRenderer.invoke('bluetooth:power', on),
    find: () => ipcRenderer.invoke('bluetooth:find'),
    pair: (address) => ipcRenderer.invoke('bluetooth:pair', address),
    connect: (address) => ipcRenderer.invoke('bluetooth:connect', address),
    disconnect: (address) => ipcRenderer.invoke('bluetooth:disconnect', address),
    forget: (address) => ipcRenderer.invoke('bluetooth:forget', address)
  },
  googleDrive: {
    status: () => ipcRenderer.invoke('gdrive:status'),
    folders: () => ipcRenderer.invoke('gdrive:folders'),
    choose: (folder) => ipcRenderer.invoke('gdrive:choose', folder),
    syncNow: () => ipcRenderer.invoke('gdrive:syncNow')
  },
  googlePhotos: {
    status: () => ipcRenderer.invoke('gphotos:status'),
    signIn: () => ipcRenderer.invoke('gphotos:signIn'),
    signOut: () => ipcRenderer.invoke('gphotos:signOut'),
    pick: () => ipcRenderer.invoke('gphotos:pick'),
    cancel: () => ipcRenderer.invoke('gphotos:cancel'),
    clear: () => ipcRenderer.invoke('gphotos:clear'),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: GooglePhotosProgress): void => callback(progress)
      ipcRenderer.on('gphotos:progress', listener)
      return () => ipcRenderer.removeListener('gphotos:progress', listener)
    }
  },
  getSwitchTab: () => ipcRenderer.invoke('switch-tab:get'),
  getPs3Tab: () => ipcRenderer.invoke('ps3-tab:get'),
  getXbox360Tab: () => ipcRenderer.invoke('xbox360-tab:get'),
  getPs2Tab: () => ipcRenderer.invoke('ps2-tab:get'),
  getXboxTab: () => ipcRenderer.invoke('xbox-tab:get'),
  getGameCubeTab: () => ipcRenderer.invoke('gamecube-tab:get'),
  getWiiTab: () => ipcRenderer.invoke('wii-tab:get'),
  getDreamcastTab: () => ipcRenderer.invoke('dreamcast-tab:get'),
  getN64Tab: () => ipcRenderer.invoke('n64-tab:get'),
  getSaturnTab: () => ipcRenderer.invoke('saturn-tab:get'),
  getNesTab: () => ipcRenderer.invoke('nes-tab:get'),
  getSnesTab: () => ipcRenderer.invoke('snes-tab:get'),
  getGenesisTab: () => ipcRenderer.invoke('genesis-tab:get'),
  getSega32xTab: () => ipcRenderer.invoke('sega32x-tab:get'),
  getAmigaTab: () => ipcRenderer.invoke('amiga-tab:get'),
  getWiiUTab: () => ipcRenderer.invoke('wiiu-tab:get'),
  getPsxTab: () => ipcRenderer.invoke('psx-tab:get'),
  getPspTab: () => ipcRenderer.invoke('psp-tab:get'),
  getArcadeTab: () => ipcRenderer.invoke('arcade-tab:get'),
  toggleFavorite: (id) => ipcRenderer.invoke('favorite:toggle', id),
  onClosing: (callback) => {
    const listener = (_event: unknown, state: { active: boolean; name?: string }): void => callback(state)
    ipcRenderer.on('closing', listener)
    return () => ipcRenderer.removeListener('closing', listener)
  },
  onSteamFocus: (callback) => {
    const listener = (_event: unknown, away: boolean): void => callback(away)
    ipcRenderer.on('steam-focus', listener)
    return () => ipcRenderer.removeListener('steam-focus', listener)
  },
  onArtUpdated: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('art:updated', listener)
    return () => ipcRenderer.removeListener('art:updated', listener)
  },
  logInput: (line) => ipcRenderer.send('input:log', line)
}

contextBridge.exposeInMainWorld('steamtv', api)
