import { describe, expect, it } from 'vitest'
import { moveSection, normalize, resolveSections, setHidden, setStyle, type TabSection } from './tabSections'

const lists = ['all', 'recent', 'favorites', 'playlist:p1']

describe('a tab’s sections', () => {
  it('start from the tab’s old layout: Spotlight on top, a grid at the bottom', () => {
    expect(resolveSections(lists, undefined, 'spotlight').map((s) => `${s.id}:${s.style}`)).toEqual([
      'all:spotlight',
      'recent:carousel',
      'favorites:carousel',
      'playlist:p1:carousel'
    ])
    expect(resolveSections(lists, undefined, 'rows').map((s) => `${s.id}:${s.style}`)).toEqual([
      'recent:carousel',
      'favorites:carousel',
      'playlist:p1:carousel',
      'all:posters'
    ])
    expect(resolveSections(lists, undefined, 'grid').at(-1)).toEqual({ id: 'all', style: 'wide' })
  })

  it('keep the saved order, drop lists that are gone and add new ones as carousels above the grid', () => {
    const saved: TabSection[] = [
      { id: 'favorites', style: 'spotlight' },
      { id: 'playlist:gone', style: 'carousel' },
      { id: 'recent', style: 'carousel', hidden: true },
      { id: 'all', style: 'wide' }
    ]
    expect(resolveSections(lists, saved, 'rows')).toEqual([
      { id: 'favorites', style: 'spotlight' },
      { id: 'recent', style: 'carousel', hidden: true },
      { id: 'playlist:p1', style: 'carousel' },
      { id: 'all', style: 'wide' }
    ])
  })

  it('have one grid at most, always last', () => {
    expect(
      normalize([
        { id: 'a', style: 'posters' },
        { id: 'b', style: 'carousel' },
        { id: 'c', style: 'wide' }
      ])
    ).toEqual([
      { id: 'b', style: 'carousel' },
      { id: 'c', style: 'carousel' },
      { id: 'a', style: 'posters' }
    ])
  })

  it('give a new grid the bottom, and the old grid becomes a carousel', () => {
    const sections = resolveSections(lists, undefined, 'rows')
    const next = setStyle(sections, 'recent', 'wide')
    expect(next.at(-1)).toEqual({ id: 'recent', style: 'wide' })
    expect(next.find((s) => s.id === 'all')?.style).toBe('carousel')
  })

  it('move up and down, but not past the grid', () => {
    const sections = resolveSections(lists, undefined, 'rows')
    expect(moveSection(sections, 'favorites', -1).map((s) => s.id)).toEqual(['favorites', 'recent', 'playlist:p1', 'all'])
    expect(moveSection(sections, 'playlist:p1', 1)).toBe(sections)
    expect(moveSection(sections, 'recent', -1)).toBe(sections)
  })

  it('keep at least one showing', () => {
    let sections: TabSection[] | null = [
      { id: 'all', style: 'spotlight' },
      { id: 'recent', style: 'carousel' }
    ]
    sections = setHidden(sections, 'recent', true)
    expect(sections?.find((s) => s.id === 'recent')?.hidden).toBe(true)
    expect(setHidden(sections!, 'all', true)).toBeNull()
  })
})
