import { getOrCreateCryptoKey, AES_GCM_IV_LENGTH, AES_GCM_AAD } from './cryptoPrimitives';
import { detectMimeTypeFromBytes } from './encryption';

async function decryptBlock(
  cryptoKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<ArrayBuffer> {
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength);
  const cipherBuffer = ciphertext.buffer.slice(
    ciphertext.byteOffset,
    ciphertext.byteOffset + ciphertext.byteLength
  );

  try {
    return await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer as BufferSource,
        additionalData: AES_GCM_AAD.buffer as ArrayBuffer,
      },
      cryptoKey,
      cipherBuffer as BufferSource
    );
  } catch {
    return await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer as BufferSource,
      },
      cryptoKey,
      cipherBuffer as BufferSource
    );
  }
}

/**
 * Creates a TransformStream that decrypts AES-GCM encrypted byte streams chunk-by-chunk.
 * Supports both self-contained chunked encrypted streams and single-IV encrypted payloads,
 * avoiding high RAM spikes during multi-gigabyte media playback.
 */
export function createChunkedDecryptTransformStream(
  cryptoKey: CryptoKey,
  initialIv?: Uint8Array
): TransformStream<Uint8Array, Uint8Array> {
  let iv: Uint8Array | null = initialIv || null;
  let isHeaderParsed = Boolean(initialIv);
  let accumulatedBuffer: Uint8Array = new Uint8Array(0);
  let isPerChunkMode = true;

  return new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
      try {
        let payload = chunk;

        if (!isHeaderParsed) {
          const combined = new Uint8Array(accumulatedBuffer.length + chunk.length);
          combined.set(accumulatedBuffer);
          combined.set(chunk, accumulatedBuffer.length);

          if (combined.length < AES_GCM_IV_LENGTH) {
            accumulatedBuffer = combined;
            return;
          }

          iv = combined.slice(0, AES_GCM_IV_LENGTH);
          payload = combined.slice(AES_GCM_IV_LENGTH);
          isHeaderParsed = true;
          accumulatedBuffer = new Uint8Array(0);
        }

        if (payload.length === 0) {
          return;
        }

        if (!iv) {
          throw new Error('Missing initialization vector for stream decryption');
        }

        if (isPerChunkMode) {
          try {
            const decryptedBuffer = await decryptBlock(cryptoKey, iv, payload);
            controller.enqueue(new Uint8Array(decryptedBuffer));
            return;
          } catch {
            isPerChunkMode = false;
          }
        }

        const nextBuffer = new Uint8Array(accumulatedBuffer.length + payload.length);
        nextBuffer.set(accumulatedBuffer);
        nextBuffer.set(payload, accumulatedBuffer.length);
        accumulatedBuffer = nextBuffer;
      } catch (err: any) {
        controller.error(new Error(`Chunked stream decryption failed: ${err.message}`));
      }
    },

    async flush(controller: TransformStreamDefaultController<Uint8Array>) {
      if (accumulatedBuffer.length > 0 && iv) {
        try {
          const decryptedBuffer = await decryptBlock(cryptoKey, iv, accumulatedBuffer);
          controller.enqueue(new Uint8Array(decryptedBuffer));
        } catch (err: any) {
          controller.error(new Error(`Stream decryption flush failed: ${err.message}`));
        } finally {
          accumulatedBuffer.fill(0);
        }
      }
      accumulatedBuffer = new Uint8Array(0);
      iv = null;
    },
  });
}

/**
 * Transforms an encrypted Blob or ReadableStream into a decrypted ReadableStream.
 */
export async function decryptStream(
  encryptedInput: ReadableStream<Uint8Array> | Blob,
  secretKey: string | CryptoKey
): Promise<ReadableStream<Uint8Array>> {
  const cryptoKey = await getOrCreateCryptoKey(secretKey);
  if (!cryptoKey) {
    throw new Error('Failed to import cryptographic key for stream decryption');
  }

  const inputStream = encryptedInput instanceof Blob ? encryptedInput.stream() : encryptedInput;

  const decryptTransform = createChunkedDecryptTransformStream(cryptoKey);
  return inputStream.pipeThrough(decryptTransform as any);
}

/**
 * Creates a stream-backed object URL for audio/video HTML elements to stream playback
 * chunk-by-chunk without storing giant unencrypted blobs in browser RAM.
 */
export async function getDecryptStreamResponseUrl(
  encryptedInput: ReadableStream<Uint8Array> | Blob,
  secretKey: string | CryptoKey,
  mimeType: string
): Promise<string> {
  const decryptedStream = await decryptStream(encryptedInput, secretKey);

  const response = new Response(decryptedStream, {
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
    },
  });

  const blob = await response.blob();

  let finalMimeType = mimeType;
  if (
    !finalMimeType ||
    finalMimeType === 'application/octet-stream' ||
    finalMimeType === 'audio/mpeg'
  ) {
    const headerBuffer = await blob.slice(0, 512).arrayBuffer();
    const detected = detectMimeTypeFromBytes(new Uint8Array(headerBuffer));
    if (detected !== 'application/octet-stream') {
      if (
        !finalMimeType ||
        finalMimeType === 'application/octet-stream' ||
        (finalMimeType === 'audio/mpeg' && detected !== 'audio/mpeg')
      ) {
        finalMimeType = detected;
      }
    }
  }

  const finalBlob =
    finalMimeType && finalMimeType !== blob.type ? blob.slice(0, blob.size, finalMimeType) : blob;

  return URL.createObjectURL(finalBlob);
}
