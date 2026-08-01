import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VaultItem } from '../../src/lib/storage.ts'
import { deriveKey } from '../../src/lib/cryptoPrimitives.ts'
import { clearAuthToken, setAuthToken } from '../../src/lib/auth-session.ts'
import { uploadItemToCloud } from '../../src/lib/sync.ts'

class MockXmlHttpRequest {
  static lastRequest: {
    method: string
    url: string
    headers: Record<string, string>
    body: unknown
  } | null = null

  upload: { onprogress?: (event: any) => void } = {}
  headers: Record<string, string> = {}
  method = 'POST'
  url = ''
  status = 200
  responseText = '{}'
  timeout = 0
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value
  }

  send(body?: unknown) {
    MockXmlHttpRequest.lastRequest = {
      method: this.method,
      url: this.url,
      headers: { ...this.headers },
      body,
    }
    if (this.upload.onprogress) {
      this.upload.onprogress({
        lengthComputable: true,
        loaded: 1,
        total: 1,
      })
    }
    this.onload?.()
  }
}

describe('uploadItemToCloud privacy', () => {
  const originalXhr = globalThis.XMLHttpRequest

  beforeEach(() => {
    MockXmlHttpRequest.lastRequest = null
    ;(globalThis as any).XMLHttpRequest = MockXmlHttpRequest
    setAuthToken('unit-test-token')
  })

  afterEach(() => {
    ;(globalThis as any).XMLHttpRequest = originalXhr
    clearAuthToken()
  })

  it('does not send plaintext title or metadata in the JSON payload body', async () => {
    const masterKey = await deriveKey('VaultKey123!', 'sync-test-salt-value')
    const sensitiveTitle = 'Pay rent on Friday'

    const item: VaultItem = {
      id: 'todo-privacy-1',
      type: 'todo',
      title: sensitiveTitle,
      content: 'encrypted-content-placeholder',
      folder: 'Personal',
      metadata: { internalLabel: 'home-budget' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await uploadItemToCloud(item, masterKey)

    const request = MockXmlHttpRequest.lastRequest
    expect(request).not.toBeNull()
    expect(request?.method).toBe('POST')
    expect(request?.url).toContain('/api/vault/items/todo-privacy-1')

    const headers = request?.headers || {}
    expect(headers['X-Vault-Title']).toMatch(/^V2_ENC:/)
    expect(headers['X-Vault-Metadata']).toMatch(/^V2_ENC:/)

    const bodyText = String(request?.body || '')
    const body = JSON.parse(bodyText) as Record<string, unknown>

    expect(Object.keys(body).sort()).toEqual(['category', 'payload'])
    expect(body.category).toBe('todo')
    expect(bodyText).not.toContain(sensitiveTitle)
    expect(bodyText).not.toContain('"title"')
    expect(bodyText).not.toContain('"metadata"')
  })
})
