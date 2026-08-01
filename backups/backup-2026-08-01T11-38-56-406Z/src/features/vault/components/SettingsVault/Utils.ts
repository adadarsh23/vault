import { VaultItem } from '../../../../lib/storage'

export const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

export const formatDate = (value: number | string | null | undefined) => {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}

export const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  const candidate = error as { message?: string; code?: string }
  if (typeof candidate?.message === 'string' && candidate.message.trim()) {
    return candidate.message
  }

  return fallback
}

export const getSyncHealthLabel = (
  syncStatus: 'idle' | 'syncing' | 'success' | 'error',
) =>
  syncStatus === 'success'
    ? 'Healthy'
    : syncStatus === 'syncing'
      ? 'Syncing'
      : syncStatus === 'error'
        ? 'Needs attention'
        : 'Idle'

export const getSyncHealthDescription = (
  syncStatus: 'idle' | 'syncing' | 'success' | 'error',
) => {
  switch (syncStatus) {
    case 'success':
      return 'Vault data is aligned with secure cloud storage.'
    case 'syncing':
      return 'A secure sync is currently in progress.'
    case 'error':
      return 'Recent sync activity needs attention.'
    default:
      return 'No active cloud sync is running right now.'
  }
}

export const formatCountLabel = (
  count: number,
  singular: string,
  plural = `${singular}s`,
) => `${count} ${count === 1 ? singular : plural}`

export const estimateVaultItemBytes = (
  item: VaultItem,
) => {
  const textEncoder = new TextEncoder()
  const metadataSize = (() => {
    try {
      return textEncoder.encode(JSON.stringify(item.metadata || {})).length
    } catch {
      return 0
    }
  })()

  const contentSize =
    item.content instanceof Uint8Array
      ? item.content.byteLength
      : typeof item.content === 'string'
        ? textEncoder.encode(item.content).length
        : 0

  return (
    textEncoder.encode(item.id).length +
    textEncoder.encode(item.title).length +
    (item.folder ? textEncoder.encode(item.folder).length : 0) +
    metadataSize +
    contentSize
  )
}

export const getMediaType = (
  item: VaultItem,
): 'photo' | 'video' | 'audio' | 'other' => {
  if (item.type === 'photo') return 'photo'
  if (item.type === 'video') return 'video'
  if (item.type === 'audio') return 'audio'

  // Additional fallback for generic files/documents if type is not specifically photo/video/audio
  const metadata = (item.metadata as Record<string, any>) || {}
  const mimeType = (metadata.type || metadata.mimeType || '').toLowerCase()

  if (mimeType.startsWith('image/')) return 'photo'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'

  return 'other'
}

export const calculateMediaBreakdown = (
  items: VaultItem[],
) => {
  let photoCount = 0,
    videoCount = 0,
    audioCount = 0,
    otherCount = 0
  let photoBytes = 0,
    videoBytes = 0,
    audioBytes = 0,
    otherBytes = 0

  items.forEach((item) => {
    const mediaType = getMediaType(item)
    const bytes = estimateVaultItemBytes(item)

    if (mediaType === 'photo') {
      photoCount += 1
      photoBytes += bytes
    } else if (mediaType === 'video') {
      videoCount += 1
      videoBytes += bytes
    } else if (mediaType === 'audio') {
      audioCount += 1
      audioBytes += bytes
    } else {
      otherCount += 1
      otherBytes += bytes
    }
  })

  return {
    photo: { count: photoCount, bytes: photoBytes },
    video: { count: videoCount, bytes: videoBytes },
    audio: { count: audioCount, bytes: audioBytes },
    other: { count: otherCount, bytes: otherBytes },
  }
}

export const SETTINGS_SURFACE =
  'rounded-[2rem] border border-card-border bg-card-bg p-6 dark:border-white/10 dark:bg-black sm:p-8 shadow-sm'

export const SETTINGS_PANEL =
  'rounded-[1.5rem] border border-card-border bg-card-bg p-5 transition-all dark:border-white/10 dark:bg-black/40 hover:bg-text/[0.02]'

export const SETTINGS_PANEL_SOFT =
  'rounded-[1.5rem] border border-card-border bg-card-bg transition-all dark:border-white/10 dark:bg-black/20 hover:bg-text/[0.01]'
