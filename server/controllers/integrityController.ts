import express from 'express';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { sendSuccess } from '../responses.ts';
import { AppError } from '../utils/appError.ts';
import { integrityService } from '../services/integrityService.ts';
import { HashAlgorithm } from '../utils/merkleTree.ts';

const getUserId = (req: AuthenticatedRequest): string => req.user.userId;
const getUsername = (req: AuthenticatedRequest): string => req.user.username;

export const getIntegrityStatusController = async (
  req: AuthenticatedRequest,
  res: express.Response
) => {
  const status = await integrityService.getStatus(getUserId(req), getUsername(req));
  return sendSuccess(res, status, 'Merkle Tree integrity status fetched successfully');
};

export const verifyVaultIntegrityController = async (
  req: AuthenticatedRequest,
  res: express.Response
) => {
  const algorithm = (req.body?.algorithm || 'blake3') as HashAlgorithm;
  const ip = getClientIp(req);
  const result = await integrityService.auditVault(getUserId(req), getUsername(req), ip, algorithm);

  return sendSuccess(
    res,
    result,
    result.status === 'clean'
      ? 'Vault Merkle Tree integrity verified: 0 corruptions detected'
      : 'ALERT: Cryptographic corruption detected in vault items!',
    result.status === 'clean' ? 200 : 409
  );
};

export const getMerkleProofController = async (
  req: AuthenticatedRequest,
  res: express.Response
) => {
  const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  if (!itemId) {
    throw AppError.badRequest(
      'Item ID is required for Merkle proof generation.',
      'ITEM_ID_REQUIRED'
    );
  }

  const algorithm = ((req.query?.algorithm as string) || 'blake3') as HashAlgorithm;
  const proof = await integrityService.getProof(
    getUserId(req),
    getUsername(req),
    itemId,
    algorithm
  );

  if (!proof) {
    throw AppError.notFound('Item not found in current Merkle tree.', 'LEAF_NOT_FOUND');
  }

  return sendSuccess(res, proof, 'Merkle proof generated successfully');
};

export const reportTamperController = async (req: AuthenticatedRequest, res: express.Response) => {
  const { itemId, expectedHash, actualHash, details } = req.body || {};
  if (!itemId || !expectedHash || !actualHash) {
    throw AppError.badRequest(
      'Item ID, expectedHash, and actualHash are required.',
      'TAMPER_PAYLOAD_INVALID'
    );
  }

  const ip = getClientIp(req);
  await integrityService.reportTamper(getUserId(req), getUsername(req), ip, {
    itemId,
    expectedHash,
    actualHash,
    details,
  });

  return sendSuccess(
    res,
    { acknowledged: true },
    'Tamper incident reported and alarm dispatched',
    201
  );
};
