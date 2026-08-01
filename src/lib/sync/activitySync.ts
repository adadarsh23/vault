import { getDeviceId } from '../auth-session'
import { logger } from '../logger'
import { API_BASE_URL, fetchWithRetry, getAuthHeaders } from './core'


const ACTIVITY_LOG_PAGE_SIZE = 1000
const ACTIVITY_LOG_MAX_PAGES = 1000
const DEVICE_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/

const normalizeActivityDeviceId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 128) {
    return undefined
  }
  if (!DEVICE_ID_PATTERN.test(trimmed)) {
    return undefined
  }
  return trimmed
}


/**
 * Syncs a single encrypted log to MongoDB via API ONE BY ONE.
 */
export const uploadActivityLog = async (log: any): Promise<boolean> => {
  try {
    const stableDeviceId =
      normalizeActivityDeviceId(getDeviceId()) ||
      normalizeActivityDeviceId(log.userOrSessionId)
    const sessionName =
      typeof log.sessionName === 'string' && log.sessionName.trim()
        ? log.sessionName.trim()
        : undefined

    await fetchWithRetry(
      `${API_BASE_URL}/api/vault/activity`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: log.actionType,
          category: 'system',
          itemId: log.itemName,
          ...(stableDeviceId ? { deviceId: stableDeviceId } : {}),
          status: log.status === 'success' ? 'SUCCESS' : 'FAILURE',
          details: {
            description: log.description,
            ...(sessionName ? { sessionName } : {}),
          },
        }),
      },
      'Activity Log Sync',
    )
    return true
  } catch (error) {
    logger.error('Activity Log Sync failed', { error })
    return false
  }
}

/**
 * Syncs an array of logs to MongoDB via API.
 */
export const uploadLogsToCloud = async (logs: any[]) => {
  const { markAsSynced } = (
    await import('../../store/activityStore')
  ).useActivityStore.getState()
  const syncedIds: string[] = []

  for (const log of logs) {
    if (log.isSynced === false || log.isSynced === undefined) {
      const success = await uploadActivityLog(log)
      if (success) {
        syncedIds.push(log.id)
      }
    }
  }

  if (syncedIds.length > 0) {
    markAsSynced(syncedIds)
  }
}

/**
 * Downloads and decrypts logs from MongoDB.
 */
export const downloadLogsFromCloud = async (): Promise<any[] | null> => {
  try {
    const logs: any[] = []

    for (let page = 0; page < ACTIVITY_LOG_MAX_PAGES; page += 1) {
      const skip = page * ACTIVITY_LOG_PAGE_SIZE
      const response = await fetchWithRetry(
        `${API_BASE_URL}/api/vault/activity?limit=${ACTIVITY_LOG_PAGE_SIZE}&skip=${skip}`,
        { method: 'GET', headers: getAuthHeaders() },
        'Logs Cloud Sync',
      )
      const body = await response.json()
      const data = Array.isArray(body) ? body : body?.data
      if (!data || !Array.isArray(data)) {
        return logs.length > 0 ? logs : null
      }

      logs.push(...data)

      if (data.length < ACTIVITY_LOG_PAGE_SIZE) {
        break
      }
    }

    return logs.map((log: any) => ({
      id: log._id,
      actionType: log.action,
      itemName: log.itemId || log.details?.itemId || 'App',
      timestamp: new Date(log.timestamp || log.createdAt).getTime(),
      userOrSessionId: log.device || log.metadata?.deviceId || 'unknown',
      sessionName:
        log.details?.sessionName ||
        log.device ||
        log.metadata?.deviceId ||
        'unknown',
      status: log.status === 'SUCCESS' ? 'success' : 'failure',
      description: log.details?.description || '',
      isSynced: true,
    }))
  } catch (error) {
    logger.error('downloadLogsFromCloud failed', { error })
    return null
  }
}
