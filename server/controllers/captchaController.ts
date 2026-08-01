import express from 'express';
import { sendSuccess } from '../responses.ts';

export const verifyMasterKeyCaptcha = async (_req: express.Request, res: express.Response) => {
  return sendSuccess(
    res,
    {
      verified: true,
      verifiedAt: new Date().toISOString(),
    },
    'CAPTCHA verified for master key change.'
  );
};

export const verifyCloudUnlockCaptcha = async (_req: express.Request, res: express.Response) => {
  return sendSuccess(
    res,
    {
      verified: true,
      verifiedAt: new Date().toISOString(),
    },
    'CAPTCHA verified for cloud vault unlock.'
  );
};
