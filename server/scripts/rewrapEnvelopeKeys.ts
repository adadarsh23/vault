import dotenv from 'dotenv';
import { connectToMongo } from '../mongo.ts';
import { rewrapGridFsEnvelopeKeys } from '../services/legacyVaultService.ts';

dotenv.config();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetKeyArg = args.find((arg) => arg.startsWith('--target-key-id='));
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const targetKeyId = targetKeyArg ? targetKeyArg.split('=')[1] : undefined;
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

const run = async () => {
  await connectToMongo();
  const result = await rewrapGridFsEnvelopeKeys({
    dryRun,
    targetKeyId,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        operation: 'rewrap-gridfs-envelope-keys',
        ...result,
      },
      null,
      2,
    ),
  );
  process.exit(0);
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to rewrap envelope keys:', error);
  process.exit(1);
});
