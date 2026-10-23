import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthToken, setAuthToken } from '../../src/lib/auth-session.ts';
import { downloadLogsFromCloud, uploadActivityLog } from '../../src/lib/sync.ts';

const makeOkResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
  }) as Response;

describe('activity log cloud sync', () => {
  beforeEach(() => {
    setAuthToken('sync-activity-token');
  });

  afterEach(() => {
    clearAuthToken();
    vi.restoreAllMocks();
  });

  it('uses a valid deviceId and keeps the human-readable session label in details', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeOkResponse({ success: true }, 201));

    const sessionName = 'Chrome on Windows (Desktop) - 10:05 PM';

    const success = await uploadActivityLog({
      actionType: 'auth_login',
      itemName: 'App',
      sessionName,
      status: 'success',
      description: 'Login succeeded',
    });

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const requestBody = JSON.parse(String(requestInit.body)) as {
      deviceId?: string;
      details?: { description?: string; sessionName?: string };
    };

    expect(requestBody.deviceId).toBe('server-device');
    expect(requestBody.deviceId).not.toBe(sessionName);
    expect(requestBody.details?.description).toBe('Login succeeded');
    expect(requestBody.details?.sessionName).toBe(sessionName);
  });

  it('prefers details.sessionName when reconstructing cloud logs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: [
          {
            _id: 'log-1',
            action: 'auth_login',
            itemId: 'App',
            createdAt: '2026-05-21T10:30:00.000Z',
            device: 'server-device',
            status: 'SUCCESS',
            details: {
              description: 'Login succeeded',
              sessionName: 'Chrome on Windows (Desktop) - 10:30 PM',
            },
          },
        ],
      }),
    );

    const logs = await downloadLogsFromCloud();

    expect(logs).toHaveLength(1);
    expect(logs?.[0]?.sessionName).toBe('Chrome on Windows (Desktop) - 10:30 PM');
    expect(logs?.[0]?.userOrSessionId).toBe('server-device');
    expect(logs?.[0]?.status).toBe('success');
  });

  it('downloads every activity-log page instead of stopping at the first batch', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      _id: `log-${index}`,
      action: 'item_create',
      itemId: `Item ${index}`,
      createdAt: '2026-05-21T10:30:00.000Z',
      device: 'server-device',
      status: 'SUCCESS',
      details: {
        description: `Created item ${index}`,
      },
    }));
    const secondPage = [
      {
        _id: 'log-1000',
        action: 'item_update',
        itemId: 'Last Item',
        createdAt: '2026-05-21T10:31:00.000Z',
        device: 'server-device',
        status: 'SUCCESS',
        details: {
          description: 'Updated item',
        },
      },
    ];

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeOkResponse({ success: true, data: firstPage }))
      .mockResolvedValueOnce(makeOkResponse({ success: true, data: secondPage }));

    const logs = await downloadLogsFromCloud();

    expect(logs).toHaveLength(1001);
    expect(logs?.[0]?.id).toBe('log-0');
    expect(logs?.[1000]?.id).toBe('log-1000');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('limit=1000&skip=0');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('limit=1000&skip=1000');
  });
});
