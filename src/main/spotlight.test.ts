import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/nowhere', getPath: () => '/nowhere' } }))
const { parseSummary, plainText } = await import('./spotlight')

describe('Spotlight details', () => {
  it("reads the store's short description as plain text", () => {
    const body = { '620': { success: true, data: { short_description: 'The &quot;perpetually&quot; grateful <b>Aperture</b> Science&#39;s test&nbsp;chambers.<br>More &#x2014; here' } } }
    expect(parseSummary('620', body)).toBe(`The "perpetually" grateful Aperture Science's test chambers. More — here`)
  })

  it('has nothing for a game the store has nothing on', () => {
    expect(parseSummary('1', { '1': { success: false } })).toBeUndefined()
    expect(parseSummary('1', null)).toBeUndefined()
    expect(parseSummary('1', { '1': { success: true, data: { short_description: '  ' } } })).toBeUndefined()
  })

  it('leaves unknown entities alone', () => {
    expect(plainText('A &bogus; B')).toBe('A &bogus; B')
  })
})
