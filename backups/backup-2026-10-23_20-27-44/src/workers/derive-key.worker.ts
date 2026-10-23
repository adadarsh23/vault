import { argon2id } from 'hash-wasm';

export type DeriveKeyWorkerRequest = {
  id?: string;
  requestId?: string;
  password: string;
  salt: string;
  iterations?: number;
  memorySize?: number;
  parallelism?: number;
  hashLength?: number;
};

export type DeriveKeyWorkerSuccessResponse = {
  ok: true;
  hashBase64: string;
  id?: string;
  requestId?: string;
};

export type DeriveKeyWorkerErrorResponse = {
  ok: false;
  error: string;
  id?: string;
  requestId?: string;
};

export type DeriveKeyWorkerResponse = DeriveKeyWorkerSuccessResponse | DeriveKeyWorkerErrorResponse;

// Pre-warm hash-wasm Argon2 WASM instance in the background to eliminate cold-start latency
const prewarmArgon2 = async (): Promise<void> => {
  try {
    const dummySalt = new Uint8Array(16);
    const dummy = await argon2id({
      password: '',
      salt: dummySalt,
      iterations: 1,
      memorySize: 512,
      parallelism: 1,
      hashLength: 16,
      outputType: 'binary',
    });
    dummy.fill(0);
  } catch {
    // Non-fatal prewarm failure
  }
};
void prewarmArgon2();

// High-performance binary-to-base64 conversion with safe chunking
const uint8ArrayToBase64 = (array: Uint8Array): string => {
  const chunkSize = 0x4000; // 16KB chunk size avoids call-stack overflow in all JS engines
  let binaryString = '';
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.subarray(i, Math.min(i + chunkSize, array.length));
    binaryString += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binaryString);
};

self.onmessage = async (event: MessageEvent<DeriveKeyWorkerRequest>) => {
  let reqId: string | undefined;
  let reqRequestId: string | undefined;

  let saltBuf: Uint8Array | null = null;
  let hash: Uint8Array | null = null;

  try {
    if (!event.data || typeof event.data !== 'object') {
      throw new Error('Invalid derivation request payload');
    }

    const { id, requestId, password, salt, iterations, memorySize, parallelism, hashLength } =
      event.data;
    reqId = id;
    reqRequestId = requestId;

    if (typeof password !== 'string' || typeof salt !== 'string' || !salt) {
      throw new Error('Valid password and salt are required for key derivation');
    }

    // Prepare 32-byte deterministic salt buffer
    saltBuf = new TextEncoder().encode(salt.padEnd(32, '0').slice(0, 32));

    const safeIterations =
      Number.isFinite(iterations) && (iterations as number) > 0
        ? Math.floor(iterations as number)
        : 3;
    const safeMemorySize =
      Number.isFinite(memorySize) && (memorySize as number) >= 1024
        ? Math.floor(memorySize as number)
        : 65536;
    const safeParallelism =
      Number.isFinite(parallelism) && (parallelism as number) > 0
        ? Math.floor(parallelism as number)
        : 4;
    const safeHashLength =
      Number.isFinite(hashLength) && (hashLength as number) >= 16
        ? Math.floor(hashLength as number)
        : 32;

    const result = await argon2id({
      password,
      salt: saltBuf,
      iterations: safeIterations,
      memorySize: safeMemorySize,
      parallelism: safeParallelism,
      hashLength: safeHashLength,
      outputType: 'binary',
    });

    hash = result as Uint8Array;
    const hashBase64 = uint8ArrayToBase64(hash);

    const response: DeriveKeyWorkerSuccessResponse = {
      ok: true,
      hashBase64,
      ...(reqId ? { id: reqId } : {}),
      ...(reqRequestId ? { requestId: reqRequestId } : {}),
    };

    self.postMessage(response);
  } catch (error: any) {
    const response: DeriveKeyWorkerErrorResponse = {
      ok: false,
      error: error?.message || 'Key derivation failed',
      ...(reqId ? { id: reqId } : {}),
      ...(reqRequestId ? { requestId: reqRequestId } : {}),
    };
    self.postMessage(response);
  } finally {
    // Cryptographic memory hygiene: strictly wipe sensitive buffers even on error
    if (saltBuf) {
      saltBuf.fill(0);
      saltBuf = null;
    }
    if (hash) {
      hash.fill(0);
      hash = null;
    }
  }
};

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('error', (event: Event) => {
    const errorEvent = event as ErrorEvent;
    self.postMessage({
      ok: false,
      error: errorEvent.message || 'Unhandled worker error during key derivation',
    });
  });

  self.addEventListener('unhandledrejection', (event: Event) => {
    const rejectionEvent = event as PromiseRejectionEvent;
    self.postMessage({
      ok: false,
      error:
        rejectionEvent.reason?.message || 'Unhandled promise rejection in key derivation worker',
    });
  });
}
