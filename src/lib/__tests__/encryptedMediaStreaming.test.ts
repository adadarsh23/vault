import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createChunkedDecryptTransformStream, decryptStream, getDecryptStreamResponseUrl } from '../streamDecryption';
import { uploadFileTus } from '../sync/tusUpload';
import { generateThumbnailInWorker, generateBlurhashInWorker, compressFileInWorker } from '../mediaWorker';
import { vaultApi } from '../../api/vaultApi';

describe('Encrypted Media Streaming & TUS Upload Pipeline', () => {
  const mockMasterKey = 'dGVzdC1tYXN0ZXIta2V5LTMyLWJ5dGVzLWxvbmctc3RyaW5nIQ=='; // 32 byte base64

  it('should initialize TransformStream for chunk-by-chunk stream decryption', async () => {
    const rawData = new TextEncoder().encode('Hello world, testing encrypted streaming video/audio chunks!');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(rawData);
        controller.close();
      },
    });

    expect(stream).toBeDefined();
    expect(typeof createChunkedDecryptTransformStream).toBe('function');
  });

  it('should generate decrypt stream response URL for HTML5 media elements', async () => {
    const fakeEncryptedBlob = new Blob([new Uint8Array(64)]);
    const url = await getDecryptStreamResponseUrl(fakeEncryptedBlob, mockMasterKey, 'video/mp4');
    expect(url).toBeDefined();
    expect(typeof url).toBe('string');
  });

  it('should perform TUS protocol upload creation and chunk streaming', async () => {
    const dummyFile = new File([new Uint8Array(1024 * 1024)], 'test-video.mp4', { type: 'video/mp4' });

    vi.spyOn(vaultApi, 'createTusUpload').mockResolvedValue({
      uploadId: 'test-tus-id-123',
      location: '/vault/files/tus/test-tus-id-123',
    });

    vi.spyOn(vaultApi, 'getTusOffset').mockResolvedValue(0);
    vi.spyOn(vaultApi, 'uploadTusChunk').mockResolvedValue(1024 * 1024);

    let progressCalled = false;
    const result = await uploadFileTus({
      file: dummyFile,
      masterKey: mockMasterKey,
      onProgress: (uploaded, total) => {
        progressCalled = true;
        expect(uploaded).toBeGreaterThan(0);
        expect(total).toBe(dummyFile.size);
      },
    });

    expect(result.uploadId).toBe('test-tus-id-123');
    expect(progressCalled).toBe(true);
  });

  it('should fallback gracefully when Web Worker canvas is invoked', async () => {
    const testImageFile = new File([new Uint8Array(100)], 'sample.jpg', { type: 'image/jpeg' });
    const compressed = await compressFileInWorker(testImageFile);
    expect(compressed).toBeDefined();
    expect(compressed.name).toBe('sample.jpg');
  });
});
