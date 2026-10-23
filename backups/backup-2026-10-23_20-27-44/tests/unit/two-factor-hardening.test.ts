import { describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { disable2FA } from '../../server/services/twoFactorService.ts';
import { User } from '../../server/models/user.ts';
import { AppError } from '../../server/utils/appError.ts';
import { getPlaybackInsights } from '../../server/controllers/mediaController.ts';
import { processHlsAdaptive } from '../../server/services/transcodingService.ts';

describe('Production Hardening Verifications', () => {
  describe('2FA Security Hardening', () => {
    it('enforces password requirement on disable2FA and rejects missing password with 400', async () => {
      vi.spyOn(User, 'findById').mockReturnValue({
        select: vi.fn().mockResolvedValue({
          twoFactorEnabled: true,
          password: 'hashedpassword',
        }),
      } as any);

      // Missing password
      await expect(disable2FA('user_123', '123456')).rejects.toThrow(
        'Current password is required to disable 2FA.',
      );

      // Empty string password
      await expect(disable2FA('user_123', '123456', '   ')).rejects.toThrow(
        'Current password is required to disable 2FA.',
      );
    });
  });

  describe('Playback Insights Validation', () => {
    it('rejects invalid userId with 400 Bad Request in getPlaybackInsights', async () => {
      const req: any = {
        user: {
          userId: 'invalid-non-object-id',
          username: 'testuser',
        },
      };
      const res: any = {};

      await expect(getPlaybackInsights(req, res)).rejects.toThrow('Invalid user ID');
      try {
        await getPlaybackInsights(req, res);
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.statusCode).toBe(400);
      }
    });
  });

  describe('FFmpeg Spawn Error Handling', () => {
    it('gracefully rejects with 503 or 500 AppError on spawn failure without crashing', async () => {
      vi.spyOn(mongoose.Model, 'findOne').mockResolvedValue(null as any);

      // Trigger transcoding for non-existent item/path
      await expect(
        processHlsAdaptive(
          'item_fail',
          'user_test',
          'testuser',
          'c:/nonexistent/file.mp4',
          'c:/nonexistent/out',
        ),
      ).rejects.toSatisfy((err: any) => {
        return err instanceof AppError && (err.statusCode === 503 || err.statusCode === 500);
      });
    });
  });

  describe('User Session Compound Index', () => {
    it('has compound index on _id and sessions.sessionId', () => {
      const indexes = User.schema.indexes();
      const hasSessionCompoundIndex = indexes.some(([fields]) => {
        return fields._id === 1 && fields['sessions.sessionId'] === 1;
      });
      expect(hasSessionCompoundIndex).toBe(true);
    });
  });
});
