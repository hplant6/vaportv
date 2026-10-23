import { net, protocol } from 'electron'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mediaType, serveMedia } from './mediaRange'

// Local art (Steam's library cache, custom grid images) is served to the page
// through this scheme rather than file://, and only from the allowed roots.
const SCHEME = 'steamtv-art'

export function artUrl(path: string): string {
  return `${SCHEME}://local/${encodeURIComponent(path)}`
}

/** Call before app ready. */
export function registerArtScheme(): void {
  // stream: audio/video elements (background music) can only play from a scheme marked streamable.
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, stream: true } }])
}

/** Call after app ready. `roots` returns the directories art may come from. */
export function handleArtScheme(roots: () => string[]): void {
  protocol.handle(SCHEME, (request) => {
    const path = resolve(decodeURIComponent(new URL(request.url).pathname.slice(1)))
    const allowed = roots().some((root) => path.startsWith(resolve(root) + sep))
    if (!allowed) return new Response('not found', { status: 404 })
    // Audio and video with byte ranges, so they can seek and loop; pictures as they are.
    const type = mediaType(path)
    if (type) return serveMedia(path, type, request.headers.get('range'))
    return net.fetch(pathToFileURL(path).toString())
  })
}
