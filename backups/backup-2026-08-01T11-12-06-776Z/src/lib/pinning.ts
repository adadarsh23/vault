import type { VaultItem } from './storage'

type PinnableItem = Pick<VaultItem, 'isPinned' | 'pinnedAt' | 'updatedAt'>

const FALLBACK_TIMESTAMP = 0

const normalizeTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? timestamp : FALLBACK_TIMESTAMP
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numericTimestamp = Number(value)
    if (Number.isFinite(numericTimestamp)) {
      return numericTimestamp
    }

    const parsedTimestamp = Date.parse(value)
    if (Number.isFinite(parsedTimestamp)) {
      return parsedTimestamp
    }
  }

  return FALLBACK_TIMESTAMP
}

export const sortPinnedFirst = <T extends PinnableItem>(
  items: readonly T[],
): T[] => {
  if (items.length < 2) {
    return [...items]
  }

  return items
    .map((item, originalIndex) => ({
      item,
      originalIndex,
      isPinned: Boolean(item.isPinned),
      pinnedAt: normalizeTimestamp(item.pinnedAt),
      updatedAt: normalizeTimestamp(item.updatedAt),
    }))
    .sort((left, right) => {
      if (left.isPinned !== right.isPinned) {
        return left.isPinned ? -1 : 1
      }

      if (left.isPinned && right.isPinned) {
        if (left.pinnedAt !== right.pinnedAt) {
          return right.pinnedAt - left.pinnedAt
        }
      }

      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt
      }

      return left.originalIndex - right.originalIndex
    })
    .map(({ item }) => item)
}
