import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

// Audio and video served with byte ranges, as a web server would. Without them the player
// can't jump about a file: a video with its index at the end (most MP4s straight from an
// editor or stock site) stalls near its end instead of looping, and nothing can seek.

const MEDIA_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac'
}

/** The media type for an audio or video file, or undefined for anything else. */
export function mediaType(path: string): string | undefined {
  return MEDIA_TYPES[extname(path).toLowerCase()]
}

/**
 * A Range header's bytes for a file of `size`: { start, end } (inclusive), null when
 * there's no usable range (send it all), or 'unsatisfiable' when it starts past the end.
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'unsatisfiable' {
  const match = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return null
  // "bytes=-500": the last 500 bytes.
  if (!match[1]) return { start: Math.max(0, size - Number(match[2])), end: size - 1 }
  const start = Number(match[1])
  if (start >= size) return 'unsatisfiable'
  return { start, end: match[2] ? Math.min(Number(match[2]), size - 1) : size - 1 }
}

/** The file, or the part of it the Range header asks for (206). */
export async function serveMedia(path: string, type: string, rangeHeader: string | null): Promise<Response> {
  const size = await stat(path)
    .then((s) => s.size)
    .catch(() => null)
  if (size === null) return new Response('not found', { status: 404 })
  const range = parseRange(rangeHeader, size)
  if (range === 'unsatisfiable') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  const { start, end } = range ?? { start: 0, end: size - 1 }
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) }
  return range
    ? new Response(body, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}` } })
    : new Response(body, { status: 200, headers })
}
