// Background music's choices besides a single track, SHUFFLE and `playlist:<id>` (main/music.ts):
// the library played quietly under the menus. Saved as config.music.

/** Every song in the library, shuffled ("shuffle", the old choice, means this now). */
export const BG_LIBRARY = 'library'
/** Liked songs, shuffled. */
export const BG_LIKED = 'liked'
/** A Claude radio station from one of your liked songs, made again once a day. */
export const BG_STATION = 'station'
/** An album: `album:<index id>`. */
export const BG_ALBUM = 'album:'
