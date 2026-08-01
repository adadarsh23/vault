import { describe, expect, it } from 'vitest'
import { sortPinnedFirst } from '../../src/lib/pinning'

type SortableTestItem = {
  id: string
  isPinned?: boolean
  pinnedAt?: number | null
  updatedAt: number
}

const getIds = (items: readonly SortableTestItem[]) => items.map((item) => item.id)

describe('sortPinnedFirst', () => {
  it('sorts pinned items first and prioritizes latest pin timestamps', () => {
    const items: SortableTestItem[] = [
      { id: 'unpinned', isPinned: false, updatedAt: 5000 },
      { id: 'pinned-older', isPinned: true, pinnedAt: 1000, updatedAt: 4000 },
      { id: 'pinned-newer', isPinned: true, pinnedAt: 2000, updatedAt: 3000 },
    ]

    const sorted = sortPinnedFirst(items)

    expect(getIds(sorted)).toEqual(['pinned-newer', 'pinned-older', 'unpinned'])
  })

  it('falls back to updatedAt ordering when pinnedAt is missing', () => {
    const items: SortableTestItem[] = [
      { id: 'recent-update', isPinned: true, pinnedAt: null, updatedAt: 2000 },
      { id: 'older-update', isPinned: true, updatedAt: 1000 },
    ]

    const sorted = sortPinnedFirst(items)

    expect(getIds(sorted)).toEqual(['recent-update', 'older-update'])
  })

  it('keeps ordering deterministic when timestamps are invalid', () => {
    const items: SortableTestItem[] = [
      { id: 'first', isPinned: true, pinnedAt: Number.NaN, updatedAt: Number.NaN },
      { id: 'second', isPinned: true, pinnedAt: Number.POSITIVE_INFINITY, updatedAt: Number.NaN },
    ]

    const sorted = sortPinnedFirst(items)

    expect(getIds(sorted)).toEqual(['first', 'second'])
  })

  it('does not mutate the source array', () => {
    const items: SortableTestItem[] = [
      { id: 'a', updatedAt: 100 },
      { id: 'b', isPinned: true, pinnedAt: 500, updatedAt: 200 },
    ]
    const snapshot = [...items]

    const sorted = sortPinnedFirst(items)

    expect(items).toEqual(snapshot)
    expect(sorted).not.toBe(items)
  })
})
