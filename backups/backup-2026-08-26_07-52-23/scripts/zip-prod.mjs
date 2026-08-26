import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { randomUUID } from 'node:crypto';

const root = path.resolve(process.cwd());
const archiveName = 'vault-production.zip';
const zipPath = path.join(root, archiveName);

// Use a unique temporary directory name so parallel builds cannot interfere.
const tempDirName = `.vault-package-${randomUUID()}`;
const tempDir = path.join(root, tempDirName);

const EXCLUDED_NAMES = new Set([
  '.git',
  '.cache',
  '.next',
  '.turbo',
  '.vercel',
  'node_modules',
  'backups',
  'backup',
  'logs',
  'log',
  '.DS_Store',
  'Thumbs.db',

  archiveName,
]);

const EXCLUDED_EXTENSIONS = new Set(['.log', '.tmp', '.temp', '.bak', '.swp']);

const EXCLUDED_FILE_PATTERNS = [
  /^npm-debug\.log.*$/i,
  /^yarn-debug\.log.*$/i,
  /^yarn-error\.log.*$/i,
  /^pnpm-debug\.log.*$/i,
];

const isExcludedName = (name) => {
  if (
    name === tempDirName ||
    name.startsWith('.vault-package') ||
    name.startsWith('vault-package')
  ) {
    return true;
  }

  if (EXCLUDED_NAMES.has(name)) {
    return true;
  }

  if (EXCLUDED_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    return true;
  }

  // Exclude real .env files while allowing templates like .env.example
  if (
    name === '.env' ||
    (/^\.env(?:\..+)?$/i.test(name) && !name.toLowerCase().endsWith('.example'))
  ) {
    return true;
  }

  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(name));
};

const shouldExcludePath = (targetPath) => {
  const relativePath = path.relative(root, targetPath);

  if (!relativePath || relativePath.startsWith('..')) {
    return false;
  }

  const segments = relativePath.split(path.sep);
  return segments.some(isExcludedName);
};

const removeIfExists = (targetPath) => {
  try {
    if (!fs.existsSync(targetPath)) {
      return;
    }

    const stats = fs.lstatSync(targetPath);

    if (stats.isDirectory()) {
      fs.rmSync(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    } else {
      fs.rmSync(targetPath, {
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  } catch (error) {
    throw new Error(
      `Failed to remove "${targetPath}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const copyProjectFiles = () => {
  fs.mkdirSync(tempDir, {
    recursive: true,
    mode: 0o700,
  });

  const entries = fs.readdirSync(root, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (isExcludedName(entry.name)) {
      continue;
    }

    const sourcePath = path.join(root, entry.name);
    const destinationPath = path.join(tempDir, entry.name);

    fs.cpSync(sourcePath, destinationPath, {
      recursive: true,
      force: true,
      // Do not follow symbolic links
      dereference: false,
      filter: (source) => {
        if (source === sourcePath) {
          return !isExcludedName(entry.name);
        }

        return !shouldExcludePath(source);
      },
    });
  }
};

// Precomputed CRC32 lookup table for fast CRC-32 calculation
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

const computeCrc32 = (buffer) => {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buffer) >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const toDosDateTime = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = Math.max(1980, d.getFullYear());
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
};

const archiveProject = () => {
  const entries = [];

  const collectEntries = (currentDir) => {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    items.sort((a, b) => a.name.localeCompare(b.name));

    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);
      if (item.isDirectory()) {
        const relativePath = path.relative(tempDir, fullPath).replace(/\\/g, '/') + '/';
        const stats = fs.statSync(fullPath);
        entries.push({
          fullPath,
          relativePath,
          isDirectory: true,
          mtime: stats.mtime,
          mode: stats.mode,
        });
        collectEntries(fullPath);
      } else if (item.isFile()) {
        const relativePath = path.relative(tempDir, fullPath).replace(/\\/g, '/');
        const stats = fs.statSync(fullPath);
        entries.push({
          fullPath,
          relativePath,
          isDirectory: false,
          mtime: stats.mtime,
          mode: stats.mode,
          size: stats.size,
        });
      }
    }
  };

  collectEntries(tempDir);

  const fd = fs.openSync(zipPath, 'w');
  let currentOffset = 0;
  const centralDirectoryRecords = [];

  try {
    for (const entry of entries) {
      const encodedName = Buffer.from(entry.relativePath, 'utf8');
      const { dosTime, dosDate } = toDosDateTime(entry.mtime);
      const localHeaderOffset = currentOffset;

      let compressionMethod = 0;
      let crc32 = 0;
      let uncompressedSize = 0;
      let compressedSize = 0;
      let compressedData = Buffer.alloc(0);

      if (!entry.isDirectory) {
        const content = fs.readFileSync(entry.fullPath);
        uncompressedSize = content.length;
        crc32 = computeCrc32(content);

        if (uncompressedSize > 0) {
          const deflated = zlib.deflateRawSync(content, { level: 9 });
          if (deflated.length < uncompressedSize) {
            compressionMethod = 8;
            compressedData = deflated;
            compressedSize = deflated.length;
          } else {
            compressionMethod = 0;
            compressedData = content;
            compressedSize = uncompressedSize;
          }
        }
      }

      // Local File Header (30 bytes + name length)
      const localHeader = Buffer.alloc(30 + encodedName.length);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0x0800, 6);
      localHeader.writeUInt16LE(compressionMethod, 8);
      localHeader.writeUInt16LE(dosTime, 10);
      localHeader.writeUInt16LE(dosDate, 12);
      localHeader.writeUInt32LE(crc32, 14);
      localHeader.writeUInt32LE(compressedSize, 18);
      localHeader.writeUInt32LE(uncompressedSize, 22);
      localHeader.writeUInt16LE(encodedName.length, 26);
      localHeader.writeUInt16LE(0, 28);
      encodedName.copy(localHeader, 30);

      fs.writeSync(fd, localHeader, 0, localHeader.length);
      currentOffset += localHeader.length;

      if (compressedSize > 0) {
        fs.writeSync(fd, compressedData, 0, compressedData.length);
        currentOffset += compressedData.length;
      }

      // Central Directory Record (46 bytes + name length)
      const unixMode = entry.mode ? entry.mode & 0o777 : entry.isDirectory ? 0o755 : 0o644;
      const fullMode = entry.isDirectory ? 0o040000 | unixMode : 0o100000 | unixMode;
      const externalAttr = ((fullMode << 16) | (entry.isDirectory ? 0x10 : 0x00)) >>> 0;

      const cdRecord = Buffer.alloc(46 + encodedName.length);
      cdRecord.writeUInt32LE(0x02014b50, 0);
      cdRecord.writeUInt16LE(0x0314, 4);
      cdRecord.writeUInt16LE(20, 6);
      cdRecord.writeUInt16LE(0x0800, 8);
      cdRecord.writeUInt16LE(compressionMethod, 10);
      cdRecord.writeUInt16LE(dosTime, 12);
      cdRecord.writeUInt16LE(dosDate, 14);
      cdRecord.writeUInt32LE(crc32, 16);
      cdRecord.writeUInt32LE(compressedSize, 20);
      cdRecord.writeUInt32LE(uncompressedSize, 24);
      cdRecord.writeUInt16LE(encodedName.length, 28);
      cdRecord.writeUInt16LE(0, 30);
      cdRecord.writeUInt16LE(0, 32);
      cdRecord.writeUInt16LE(0, 34);
      cdRecord.writeUInt16LE(0, 36);
      cdRecord.writeUInt32LE(externalAttr, 38);
      cdRecord.writeUInt32LE(localHeaderOffset, 42);
      encodedName.copy(cdRecord, 46);

      centralDirectoryRecords.push(cdRecord);
    }

    const cdStartOffset = currentOffset;
    let cdSize = 0;

    for (const cdRecord of centralDirectoryRecords) {
      fs.writeSync(fd, cdRecord, 0, cdRecord.length);
      cdSize += cdRecord.length;
    }
    currentOffset += cdSize;

    // End of Central Directory Record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(centralDirectoryRecords.length, 8);
    eocd.writeUInt16LE(centralDirectoryRecords.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStartOffset, 16);
    eocd.writeUInt16LE(0, 20);

    fs.writeSync(fd, eocd, 0, eocd.length);
  } finally {
    fs.closeSync(fd);
  }
};

const validateArchive = () => {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Archive was not created: ${zipPath}`);
  }

  const stats = fs.statSync(zipPath);

  if (!stats.isFile()) {
    throw new Error(`Archive path is not a file: ${zipPath}`);
  }

  if (stats.size === 0) {
    throw new Error('Archive was created but is empty.');
  }

  // Basic ZIP signature validation.
  const fileHandle = fs.openSync(zipPath, 'r');

  try {
    const header = Buffer.alloc(4);
    const bytesRead = fs.readSync(fileHandle, header, 0, 4, 0);

    if (bytesRead !== 4) {
      throw new Error('Unable to read the generated archive.');
    }

    /*
     * ZIP files normally begin with:
     *
     * PK\x03\x04
     * PK\x05\x06  empty archive
     * PK\x07\x08  spanned archive
     */
    const validZip =
      header[0] === 0x50 &&
      header[1] === 0x4b &&
      ((header[2] === 0x03 && header[3] === 0x04) ||
        (header[2] === 0x05 && header[3] === 0x06) ||
        (header[2] === 0x07 && header[3] === 0x08));

    if (!validZip) {
      throw new Error('Generated file does not have a valid ZIP signature.');
    }
  } finally {
    fs.closeSync(fileHandle);
  }
};

const validateNoSensitiveFiles = () => {
  const sensitiveFiles = [];

  const walk = (directory) => {
    const entries = fs.readdirSync(directory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (isExcludedName(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const isEnvSecret =
        entry.name === '.env' ||
        (/^\.env(?:\..+)?$/i.test(entry.name) && !entry.name.toLowerCase().endsWith('.example'));

      const isSecretPattern =
        /(?:^|[-_.])(secret|secrets|private-key|credentials?)(?:[-_.]|$)/i.test(entry.name) &&
        !entry.name.toLowerCase().endsWith('.example');

      if (isEnvSecret || isSecretPattern) {
        sensitiveFiles.push(path.relative(tempDir, fullPath));
      }
    }
  };

  walk(tempDir);

  if (sensitiveFiles.length > 0) {
    throw new Error(
      [
        'Potentially sensitive files were found in the package:',
        ...sensitiveFiles.map((file) => `  - ${file}`),
      ].join('\n'),
    );
  }
};

const formatBytes = (bytes) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  }

  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

const main = () => {
  console.log('========================================');
  console.log(' Vault Production Package');
  console.log('========================================');
  console.log();

  console.log(`Project root : ${root}`);
  console.log(`Output       : ${zipPath}`);
  console.log();

  try {
    // Remove a previous archive.
    removeIfExists(zipPath);

    // Create isolated temporary package directory.
    removeIfExists(tempDir);
    copyProjectFiles();

    console.log('✓ Project files copied');

    // Security check before creating the archive.
    validateNoSensitiveFiles();

    console.log('✓ Sensitive-file check passed');

    // Create ZIP.
    archiveProject();

    console.log('✓ Archive created');

    // Validate generated ZIP.
    validateArchive();

    const archiveStats = fs.statSync(zipPath);

    console.log('✓ Archive validation passed');
    console.log();
    console.log(`Archive : ${archiveName}`);
    console.log(`Size    : ${formatBytes(archiveStats.size)}`);
    console.log();
    console.log('Production package created successfully.');
  } catch (error) {
    console.error();
    console.error('✗ Production package failed.');

    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    } else {
      console.error(`  ${String(error)}`);
    }

    // Remove a potentially incomplete archive.
    try {
      removeIfExists(zipPath);
    } catch (cleanupError) {
      console.error(
        `  Warning: failed to remove incomplete archive: ${
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }`,
      );
    }

    process.exitCode = 1;
  } finally {
    // Always clean temporary files.
    try {
      removeIfExists(tempDir);
    } catch (cleanupError) {
      console.error(
        `Warning: temporary directory cleanup failed: ${
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }`,
      );

      process.exitCode = 1;
    }
  }
};

main();
