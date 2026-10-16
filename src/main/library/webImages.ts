import { nativeImage } from 'electron'

// Web image search for the Artwork window (Brave Search API): when SteamGridDB has
// nothing good, any picture found on the web can be a game's cover.

export interface WebImage {
  /** The full picture. */
  url: string
  /** Brave's proxied preview, for the results grid. */
  thumb: string
  width?: number
  height?: number
  /** The site it's from. */
  source?: string
}

interface BraveImageResult {
  title?: string
  source?: string
  thumbnail?: { src?: string }
  properties?: { url?: string; width?: number; height?: number }
}

const SEARCH = 'https://api.search.brave.com/res/v1/images/search'

export async function searchWebImages(key: string, query: string): Promise<WebImage[]> {
  const params = new URLSearchParams({ q: query, count: '60', safesearch: 'strict', country: 'US', spellcheck: 'false' })
  const res = await fetch(`${SEARCH}?${params}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    signal: AbortSignal.timeout(15000)
  })
  if (res.status === 401 || res.status === 403 || res.status === 422) throw new Error('Brave turned the API key down. Check it in Settings → Artwork.')
  if (res.status === 429) throw new Error('Brave says too many searches for now. Try again in a little while.')
  if (!res.ok) throw new Error(`Brave Search didn't answer (${res.status}).`)
  const body = (await res.json()) as { results?: BraveImageResult[] }
  return (body.results ?? []).flatMap((r) => {
    const url = r.properties?.url
    const thumb = r.thumbnail?.src
    if (!url || !thumb || !/^https?:/.test(url)) return []
    return [{ url, thumb, width: r.properties?.width, height: r.properties?.height, source: r.source }]
  })
}

const MAX_BYTES = 25 * 1024 * 1024
const COVER = { width: 600, height: 900 }

/**
 * Downloads a picture and crops it to a card cover (2:3, from the centre), as a PNG.
 * Electron decodes JPEG and PNG; anything else asks for another pick.
 */
export async function webCover(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    // Some sites refuse requests that don't look like a browser's.
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36' },
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) throw new Error(`That site wouldn't give the picture (${res.status}). Try another.`)
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('That picture is too big. Try another.')
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_BYTES) throw new Error('That picture is too big. Try another.')
  const image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty()) throw new Error("vaporTV can't read that picture's format (only JPEG and PNG). Try another.")
  const { width, height } = image.getSize()
  return coverCrop(image, width, height).toPNG()
}

function coverCrop(image: Electron.NativeImage, width: number, height: number): Electron.NativeImage {
  const ratio = COVER.width / COVER.height
  const crop =
    width / height > ratio
      ? { x: Math.round((width - height * ratio) / 2), y: 0, width: Math.round(height * ratio), height }
      : { x: 0, y: Math.round((height - width / ratio) / 2), width, height: Math.round(width / ratio) }
  return image.crop(crop).resize({ ...COVER, quality: 'best' })
}
