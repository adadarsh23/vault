import express from 'express';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { sendSuccess } from '../responses.ts';
import { AppError } from '../utils/appError.ts';
import { integrityService } from '../services/integrityService.ts';
import { HashAlgorithm } from '../utils/merkleTree.ts';

const ALLOWED_ALGORITHMS = new Set<string>(['blake3', 'sha512', 'sha256']);
const SAFE_ID_PATTERN = /^[a-zA-Z0-9:_-]+$/;
const HEX_HASH_PATTERN = /^[a-fA-F0-9]{32,128}$/;

const getUserId = (req: AuthenticatedRequest): string => req.user.userId;
const getUsername = (req: AuthenticatedRequest): string => req.user.username;

const assertValidAlgorithm = (algorithm: unknown): HashAlgorithm => {
  if (typeof algorithm !== 'string' || !ALLOWED_ALGORITHMS.has(algorithm.toLowerCase())) {
    throw AppError.badRequest(
      'Invalid hash algorithm. Allowed algorithms: blake3, sha512, sha256.',
      'INVALID_ALGORITHM',
    );
  }
  return algorithm.toLowerCase() as HashAlgorithm;
};

const assertSafeId = (id: unknown, paramName: string): string => {
  if (typeof id !== 'string' || !id.trim() || id.length > 256 || !SAFE_ID_PATTERN.test(id.trim())) {
    throw AppError.badRequest(`Invalid format for ${paramName}.`, 'INVALID_IDENTIFIER');
  }
  return id.trim();
};

export const getIntegrityStatusController = async (
  req: AuthenticatedRequest,
  res: express.Response,
) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const status = await integrityService.getStatus(getUserId(req), getUsername(req));
  return sendSuccess(res, status, 'Merkle Tree integrity status fetched successfully');
};

export const verifyVaultIntegrityController = async (
  req: AuthenticatedRequest,
  res: express.Response,
) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  const rawAlgo = req.body?.algorithm || 'blake3';
  const algorithm = assertValidAlgorithm(rawAlgo);

  const ip = getClientIp(req);
  const result = await integrityService.auditVault(getUserId(req), getUsername(req), ip, algorithm);

  return sendSuccess(
    res,
    result,
    result.status === 'clean'
      ? 'Vault Merkle Tree integrity verified: 0 corruptions detected'
      : 'ALERT: Cryptographic corruption detected in vault items!',
    result.status === 'clean' ? 200 : 409,
  );
};

export const getMerkleProofController = async (
  req: AuthenticatedRequest,
  res: express.Response,
) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  const rawItemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const itemId = assertSafeId(rawItemId, 'itemId');

  const rawAlgo = (req.query?.algorithm as string) || 'blake3';
  const algorithm = assertValidAlgorithm(rawAlgo);

  const proof = await integrityService.getProof(
    getUserId(req),
    getUsername(req),
    itemId,
    algorithm,
  );

  if (!proof) {
    throw AppError.notFound('Item not found in current Merkle tree.', 'LEAF_NOT_FOUND');
  }

  return sendSuccess(res, proof, 'Merkle proof generated successfully');
};

export const reportTamperController = async (req: AuthenticatedRequest, res: express.Response) => {
  const { itemId: rawItemId, expectedHash, actualHash, details } = req.body || {};

  const itemId = assertSafeId(rawItemId, 'itemId');

  if (
    typeof expectedHash !== 'string' ||
    typeof actualHash !== 'string' ||
    !HEX_HASH_PATTERN.test(expectedHash) ||
    !HEX_HASH_PATTERN.test(actualHash)
  ) {
    throw AppError.badRequest(
      'expectedHash and actualHash must be valid hex hash strings between 32 and 128 characters.',
      'TAMPER_PAYLOAD_INVALID',
    );
  }

  let sanitizedDetails: Record<string, unknown> = {};
  if (details && typeof details === 'object') {
    const rawJson = JSON.stringify(details);
    if (rawJson.length > 10240) {
      throw AppError.badRequest(
        'details payload exceeds maximum size limit (10KB).',
        'PAYLOAD_TOO_LARGE',
      );
    }
    sanitizedDetails = details;
  }

  const ip = getClientIp(req);
  await integrityService.reportTamper(getUserId(req), getUsername(req), ip, {
    itemId,
    expectedHash,
    actualHash,
    details: sanitizedDetails,
  });

  return sendSuccess(
    res,
    { acknowledged: true },
    'Tamper incident reported and alarm dispatched',
    201,
  );
};
