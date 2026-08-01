import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../../src/lib/auth-api.ts'
import { clearAuthToken, setAuthToken } from '../../src/lib/auth-session.ts'
import { ensureAuth } from '../../src/lib/sync.ts'

describe('ensureAuth', () => {
  beforeEach(() => {
    clearAuthToken()
  })

  afterEach(() => {
    clearAuthToken()
  })

  it('does not refresh when an access token is already present', async () => {
    setAuthToken('already-authenticated')
    const refreshSpy = vi.spyOn(authApi, 'refreshVaultSession')

    await expect(ensureAuth()).resolves.toBeUndefined()
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('refreshes the session when token is missing', async () => {
    const refreshSpy = vi
      .spyOn(authApi, 'refreshVaultSession')
      .mockImplementation(async () => {
        setAuthToken('refreshed-access-token')
        return {
          token: 'refreshed-access-token',
          user: { id: 'user-1', username: 'alice' },
        } as any
      })

    await expect(ensureAuth()).resolves.toBeUndefined()
    expect(refreshSpy).toHaveBeenCalledTimes(1)
  })

  it('throws AUTH_REQUIRED when refresh fails', async () => {
    vi.spyOn(authApi, 'refreshVaultSession').mockRejectedValue(
      new Error('refresh failed'),
    )

    await expect(ensureAuth()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
  })
})
