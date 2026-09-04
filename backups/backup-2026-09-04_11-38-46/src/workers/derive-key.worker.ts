import { argon2id } from 'hash-wasm';

type DeriveKeyWorkerRequest = {
  password: string;
  salt: string;
  iterations: number;
  memorySize: number;
  parallelism: number;
  hashLength: number;
};

const uint8ArrayToBase64 = (array: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binaryString = '';
  for (let i = 0; i < array.length; i += chunkSize) {
    binaryString += String.fromCharCode(...(array.subarray(i, i + chunkSize) as any));
  }
  return btoa(binaryString);
};

self.onmessage = async (event: MessageEvent<DeriveKeyWorkerRequest>) => {
  try {
    if (!event.data || typeof event.data !== 'object') {
      throw new Error('Invalid derivation request payload');
    }

    const { password, salt, iterations, memorySize, parallelism, hashLength } = event.data;
    if (!password || !salt) {
      throw new Error('Password and salt are required for derivation');
    }

    const saltBuf = new TextEncoder().encode(salt.padEnd(32, '0').slice(0, 32));
    const hash = await argon2id({
      password,
      salt: saltBuf,
      iterations: Number.isFinite(iterations) ? iterations : 3,
      memorySize: Number.isFinite(memorySize) ? memorySize : 65536,
      parallelism: Number.isFinite(parallelism) ? parallelism : 4,
      hashLength: Number.isFinite(hashLength) ? hashLength : 32,
      outputType: 'binary',
    });

    const hashBase64 = uint8ArrayToBase64(hash);

    // Securely wipe memory buffers immediately after derivation
    hash.fill(0);
    saltBuf.fill(0);

    self.postMessage({ ok: true, hashBase64 });
  } catch (error: any) {
    self.postMessage({ ok: false, error: error?.message || 'Derivation failed' });
  }
};
