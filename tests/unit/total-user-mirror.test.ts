import { beforeEach, describe, expect, it, vi } from 'vitest';

const totalUserMocks = vi.hoisted(() => {
  const execFindOneAndUpdate = vi.fn();
  const execUpdateOne = vi.fn();

  return {
    execFindOneAndUpdate,
    execUpdateOne,
    findOneAndUpdate: vi.fn(() => ({ exec: execFindOneAndUpdate })),
    updateOne: vi.fn(() => ({ exec: execUpdateOne })),
  };
});

vi.mock('../../server/models/totalUser.ts', () => ({
  TotalUser: {
    findOneAndUpdate: totalUserMocks.findOneAndUpdate,
    updateOne: totalUserMocks.updateOne,
  },
}));

describe('total user mirror upsert', async () => {
  const { upsertTotalUserMirror } = await import('../../server/services/totalUserMirrorService.ts');

  beforeEach(() => {
    totalUserMocks.findOneAndUpdate.mockClear();
    totalUserMocks.updateOne.mockClear();
    totalUserMocks.execFindOneAndUpdate.mockReset();
    totalUserMocks.execUpdateOne.mockReset();
  });

  it('upserts mirror successfully on first try', async () => {
    totalUserMocks.execFindOneAndUpdate.mockResolvedValue({});

    await upsertTotalUserMirror({
      username: 'alice',
      userId: 'u1',
      createdDate: new Date('2026-05-07T00:00:00.000Z'),
    });

    expect(totalUserMocks.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(totalUserMocks.updateOne).not.toHaveBeenCalled();
  });

  it('falls back to updateOne on duplicate-key race (11000)', async () => {
    totalUserMocks.execFindOneAndUpdate.mockRejectedValue({ code: 11000 });
    totalUserMocks.execUpdateOne.mockResolvedValue({});

    await upsertTotalUserMirror({
      username: 'alice',
      userId: 'u1',
      createdDate: new Date('2026-05-07T00:00:00.000Z'),
    });

    expect(totalUserMocks.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(totalUserMocks.updateOne).toHaveBeenCalledTimes(1);
  });
});
