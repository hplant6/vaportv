// Readers for Valve's KeyValues files. Text VDF holds most of Steam's config
// (localconfig.vdf, appmanifest_*.acf); binary VDF holds shortcuts.vdf.

export type VdfValue = string | number | VdfObject
export interface VdfObject {
  [key: string]: VdfValue
}

/** Parses text VDF. Keys are kept as written; Steam's own casing varies between files. */
export function parseTextVdf(text: string): VdfObject {
  let i = 0
  const n = text.length

  const skip = (): void => {
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++
      else if (c === '/' && text[i + 1] === '/') {
        while (i < n && text[i] !== '\n') i++
      } else break
    }
  }

  const token = (): string => {
    if (text[i] === '"') {
      i++
      let out = ''
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const next = text[i + 1]
          out += next === 'n' ? '\n' : next === 't' ? '\t' : next
          i += 2
        } else out += text[i++]
      }
      i++
      return out
    }
    const start = i
    while (i < n && !/[\s{}"]/.test(text[i])) i++
    return text.slice(start, i)
  }

  const object = (): VdfObject => {
    const obj: VdfObject = {}
    for (;;) {
      skip()
      if (i >= n || text[i] === '}') {
        i++
        return obj
      }
      const key = token()
      skip()
      if (text[i] === '{') {
        i++
        obj[key] = object()
      } else {
        obj[key] = token()
      }
    }
  }

  return object()
}

/** Parses binary VDF (shortcuts.vdf): 0x00 object, 0x01 string, 0x02 uint32, 0x08 end. */
export function parseBinaryVdf(data: Buffer): VdfObject {
  let i = 0

  const cstring = (): string => {
    const end = data.indexOf(0, i)
    if (end < 0) throw new Error('binary VDF: unterminated string')
    const s = data.toString('utf8', i, end)
    i = end + 1
    return s
  }

  const object = (): VdfObject => {
    const obj: VdfObject = {}
    while (i < data.length) {
      const type = data[i++]
      if (type === 0x08) return obj
      const key = cstring()
      if (type === 0x00) obj[key] = object()
      else if (type === 0x01) obj[key] = cstring()
      else if (type === 0x02) {
        obj[key] = data.readUInt32LE(i)
        i += 4
      } else throw new Error(`binary VDF: unknown type 0x${type.toString(16)} at ${i - 1}`)
    }
    return obj
  }

  return object()
}

/** Case-insensitive child lookup, for keys Steam spells inconsistently (AppName/appname, Software/software). */
export function child(obj: VdfObject | undefined, ...path: string[]): VdfValue | undefined {
  let cur: VdfValue | undefined = obj
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined
    const lower = key.toLowerCase()
    const match: string | undefined = Object.keys(cur).find((k) => k.toLowerCase() === lower)
    cur = match === undefined ? undefined : cur[match]
  }
  return cur
}

export function childObject(obj: VdfObject | undefined, ...path: string[]): VdfObject | undefined {
  const v = child(obj, ...path)
  return v && typeof v === 'object' ? v : undefined
}

export function childString(obj: VdfObject | undefined, ...path: string[]): string | undefined {
  const v = child(obj, ...path)
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined
}
