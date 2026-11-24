import { describe, expect, it } from 'vitest'
import { artistKey } from './artistPhotos'

describe('artist names', () => {
  it('match ignoring case, accents and punctuation', () => {
    expect(artistKey('Beyoncé')).toBe(artistKey('BEYONCE'))
    expect(artistKey('AC/DC')).toBe(artistKey('ac dc'))
    expect(artistKey('  Tatsuro   Yamashita ')).toBe('tatsuro yamashita')
  })

  it('keep other scripts', () => {
    expect(artistKey('山下達郎')).toBe('山下達郎')
  })
})
