import 'dotenv/config';

import { connectToMongo, disconnectFromMongo } from '../mongo.ts';
import { rewrapGridFsEnvelopeKeys } from '../services/legacyVaultService.ts';

const OPERATION = 'rewrap-gridfs-envelope-keys';

interface CliOptions {
  dryRun: boolean;
  targetKeyId?: string;
  limit?: number;
}

function parseArgs(args: string[]): CliOptions {
  let dryRun = false;
  let targetKeyId: string | undefined;
  let limit: number | undefined;

  const seen = new Set<string>();

  for (const arg of args) {
    if (arg === '--dry-run') {
      if (seen.has('--dry-run')) {
        throw new Error('Duplicate argument: --dry-run');
      }

      seen.add('--dry-run');
      dryRun = true;
      continue;
    }

    if (arg.startsWith('--target-key-id=')) {
      if (seen.has('--target-key-id')) {
        throw new Error('Duplicate argument: --target-key-id');
      }

      seen.add('--target-key-id');

      const value = arg.slice('--target-key-id='.length).trim();

      if (!value) {
        throw new Error('--target-key-id must not be empty.');
      }

      if (value.length > 256) {
        throw new Error('--target-key-id must not exceed 256 characters.');
      }

      targetKeyId = value;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      if (seen.has('--limit')) {
        throw new Error('Duplicate argument: --limit');
      }

      seen.add('--limit');

      const value = arg.slice('--limit='.length);

      if (!/^[1-9]\d*$/.test(value)) {
        throw new Error('--limit must be a positive integer.');
      }

      limit = Number(value);

      if (!Number.isSafeInteger(limit)) {
        throw new Error('--limit exceeds the supported integer range.');
      }

      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}\n` +
        'Usage: tsx server/scripts/rewrapEnvelopeKeys.ts ' +
        '[--dry-run] [--target-key-id=<id>] [--limit=<positive-integer>]',
    );
  }

  return { dryRun, targetKeyId, limit };
}

function logJson(
  level: 'info' | 'error',
  event: string,
  details: Record<string, unknown> = {},
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    operation: OPERATION,
    event,
    ...details,
  };

  const output = JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  logJson('info', 'started', {
    dryRun: options.dryRun,
    targetKeyId: options.targetKeyId,
    limit: options.limit,
  });

  await connectToMongo();

  try {
    const result = await rewrapGridFsEnvelopeKeys(options);

    logJson('info', 'completed', {
      ...result,
    });
  } finally {
    await disconnectFromMongo();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'An unknown error occurred.';

  logJson('error', 'failed', { message });

  process.exitCode = 1;
});
