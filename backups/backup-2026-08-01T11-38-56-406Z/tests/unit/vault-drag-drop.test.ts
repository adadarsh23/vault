import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDraggedVaultItem,
  getDraggedVaultItem,
  setDraggedVaultItem,
} from '../../src/lib/vaultDragDrop.ts'

type DragDataTransferLike = {
  effectAllowed: DataTransfer['effectAllowed']
  setData: (format: string, data: string) => void
  getData: (format: string) => string
  types: DataTransfer['types']
}

const createDataTransferMock = (
  initialData: Record<string, string> = {},
  configuredTypes?: string[],
): DragDataTransferLike => {
  const store = new Map(Object.entries(initialData))

  return {
    effectAllowed: 'none',
    setData: (format, data) => {
      store.set(format, data)
    },
    getData: (format) => store.get(format) ?? '',
    get types() {
      if (configuredTypes) {
        return configuredTypes as unknown as DataTransfer['types']
      }

      return Array.from(store.keys()) as unknown as DataTransfer['types']
    },
  }
}

describe('vaultDragDrop', () => {
  beforeEach(() => {
    clearDraggedVaultItem()
    vi.useRealTimers()
  })

  it('writes custom and plain payload values on drag start', () => {
    const transfer = createDataTransferMock()

    const wasSet = setDraggedVaultItem({ dataTransfer: transfer }, 'task-42')

    expect(wasSet).toBe(true)
    expect(transfer.effectAllowed).toBe('move')
    expect(transfer.getData('application/x-my-vault-item')).toBe('task-42')
    expect(transfer.getData('text/plain')).toBe('vault-item:task-42')
  })

  it('returns false for invalid item ids', () => {
    const transfer = createDataTransferMock()

    const wasSet = setDraggedVaultItem({ dataTransfer: transfer }, '   ')

    expect(wasSet).toBe(false)
    expect(getDraggedVaultItem({})).toBeNull()
  })

  it('resolves custom payload id first when both payloads are present', () => {
    const transfer = createDataTransferMock({
      'application/x-my-vault-item': 'custom-id',
      'text/plain': 'vault-item:plain-id',
    })

    expect(getDraggedVaultItem({ dataTransfer: transfer })).toBe('custom-id')
  })

  it('parses prefixed text/plain payload when custom payload is absent', () => {
    const transfer = createDataTransferMock({
      'text/plain': 'vault-item:plain-id',
    })

    expect(getDraggedVaultItem({ dataTransfer: transfer })).toBe('plain-id')
  })

  it('accepts legacy plain id when custom type marker exists in transfer types', () => {
    const transfer = createDataTransferMock(
      {
        'text/plain': 'legacy-id',
      },
      ['application/x-my-vault-item', 'text/plain'],
    )

    expect(getDraggedVaultItem({ dataTransfer: transfer })).toBe('legacy-id')
  })

  it('uses fallback storage when drag event has no dataTransfer', () => {
    expect(setDraggedVaultItem({}, 'item-from-fallback')).toBe(true)
    expect(getDraggedVaultItem({})).toBe('item-from-fallback')
  })

  it('expires fallback storage after ttl', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    expect(setDraggedVaultItem({}, 'expiring-item')).toBe(true)
    expect(getDraggedVaultItem({})).toBe('expiring-item')

    vi.advanceTimersByTime(30_001)

    expect(getDraggedVaultItem({})).toBeNull()
  })

  it('survives dataTransfer.setData errors and keeps fallback value', () => {
    const transfer: DragDataTransferLike = {
      effectAllowed: 'none',
      setData: () => {
        throw new Error('setData blocked by environment')
      },
      getData: () => '',
      types: [] as unknown as DataTransfer['types'],
    }

    expect(setDraggedVaultItem({ dataTransfer: transfer }, 'safe-id')).toBe(true)
    expect(getDraggedVaultItem({})).toBe('safe-id')
  })
})
