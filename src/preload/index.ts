import { contextBridge, ipcRenderer } from 'electron'
import type { GooglePhotosProgress, SteamTvApi } from '../shared/types'

const api: SteamTvApi = {
  getHome: () => ipcRenderer.invoke('home:get'),
  getWeather: () => ipcRenderer.invoke('weather:get'),
  getSunTimes: () => ipcRenderer.invoke('sun:get'),
  launch: (kind, id, name) => ipcRenderer.invoke('launch', kind, id, name),
  quit: () => ipcRenderer.invoke('quit'),
  power: (action) => ipcRenderer.invoke('power', action),
  stepVolume: (direction) => ipcRenderer.invoke('volume:step', direction),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getAvailableTabs: () => ipcRenderer.invoke('tabs:available'),
  getSteamTab: () => ipcRenderer.invoke('steam-tab:get'),
  setSteamCollections: (ids) => ipcRenderer.invoke('settings:steamCollections', ids),
  setTabLayout: (tab, layout) => ipcRenderer.invoke('settings:tabLayout', tab, layout),
  setRecentsLayout: (tab, layout) => ipcRenderer.invoke('settings:recentsLayout', tab, layout),
  setFavoritesLayout: (layout) => ipcRenderer.invoke('settings:favoritesLayout', layout),
  setSteamGridDbKey: (key) => ipcRenderer.invoke('settings:steamGridDbKey', key),
  setMusic: (file) => ipcRenderer.invoke('settings:music', file),
  setMusicVolume: (volume) => ipcRenderer.invoke('settings:musicVolume', volume),
  getBackdrop: () => ipcRenderer.invoke('backdrop:get'),
  setBackdrop: (style) => ipcRenderer.invoke('settings:backdrop', style),
  setBackdropTime: (time) => ipcRenderer.invoke('settings:backdropTime', time),
  getMusic: () => ipcRenderer.invoke('music:get'),
  getScreensaver: () => ipcRenderer.invoke('screensaver:get'),
  setScreensaverDelay: (minutes) => ipcRenderer.invoke('settings:screensaverDelay', minutes),
  setScreensaverStyle: (style) => ipcRenderer.invoke('settings:screensaverStyle', style),
  setScreensaverSources: (sources) => ipcRenderer.invoke('settings:screensaverSources', sources),
  setSleepOnControllerOff: (on) => ipcRenderer.invoke('settings:sleepOnControllerOff', on),
  toggleFavoriteApp: (id) => ipcRenderer.invoke('apps:favorite', id),
  setControls: (controls) => ipcRenderer.invoke('settings:controls', controls),
  setSleepWarning: (on) => ipcRenderer.invoke('settings:sleepWarning', on),
  art: {
    search: (id, query) => ipcRenderer.invoke('art:search', id, query),
    covers: (id, gameId) => ipcRenderer.invoke('art:covers', id, gameId),
    choose: (id, gameId, cover) => ipcRenderer.invoke('art:choose', id, gameId, cover),
    reset: (id) => ipcRenderer.invoke('art:reset', id)
  },
  setup: {
    status: () => ipcRenderer.invoke('setup:status'),
    install: (options) => ipcRenderer.invoke('setup:install', options),
    uninstall: () => ipcRenderer.invoke('setup:uninstall'),
    gamingMode: () => ipcRenderer.invoke('setup:gamingMode'),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, line: string): void => callback(line)
      ipcRenderer.on('setup:progress', listener)
      return () => ipcRenderer.removeListener('setup:progress', listener)
    }
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
  getGameCubeTab: () => ipcRenderer.invoke('gamecube-tab:get'),
  getDreamcastTab: () => ipcRenderer.invoke('dreamcast-tab:get'),
  toggleFavorite: (id) => ipcRenderer.invoke('favorite:toggle', id),
  onClosing: (callback) => {
    const listener = (_event: unknown, state: { active: boolean; name?: string }): void => callback(state)
    ipcRenderer.on('closing', listener)
    return () => ipcRenderer.removeListener('closing', listener)
  },
  onArtUpdated: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('art:updated', listener)
    return () => ipcRenderer.removeListener('art:updated', listener)
  },
  logInput: (line) => ipcRenderer.send('input:log', line)
}

contextBridge.exposeInMainWorld('steamtv', api)
