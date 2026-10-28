import express from 'express';
import { sendSuccess } from '../responses.ts';

/**
 * Controller: verifyMasterKeyCaptcha
 * Confirms successful verification of CAPTCHA for master key modification requests.
 */
export const verifyMasterKeyCaptcha = async (_req: express.Request, res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  return sendSuccess(
    res,
    {
      verified: true,
      verifiedAt: new Date().toISOString(),
    },
    'CAPTCHA verified for master key change.',
  );
};

/**
 * Controller: verifyCloudUnlockCaptcha
 * Confirms successful verification of CAPTCHA for cloud vault unlock requests.
 */
export const verifyCloudUnlockCaptcha = async (_req: express.Request, res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  return sendSuccess(
    res,
    {
      verified: true,
      verifiedAt: new Date().toISOString(),
    },
    'CAPTCHA verified for cloud vault unlock.',
  );
};
