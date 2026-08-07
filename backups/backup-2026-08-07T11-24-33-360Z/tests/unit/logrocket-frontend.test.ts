import { beforeEach, describe, expect, it, vi } from 'vitest';

const logrocketMock = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('logrocket', () => ({
  default: logrocketMock,
}));

describe('frontend logrocket guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('stays a safe no-op in test runtime when not enabled', async () => {
    const mod = await import('../../src/lib/logrocket.ts');

    expect(mod.initLogRocket()).toBe(false);
    mod.identifyLogRocketUser('u1', { username: 'alice' });
    mod.captureLogRocketError(new Error('boom'));

    expect(logrocketMock.init).not.toHaveBeenCalled();
    expect(logrocketMock.identify).not.toHaveBeenCalled();
    expect(logrocketMock.captureException).not.toHaveBeenCalled();
  });
});
