import type { SteamTvApi } from '../../shared/types'

declare global {
  interface Window {
    steamtv: SteamTvApi
  }
}
