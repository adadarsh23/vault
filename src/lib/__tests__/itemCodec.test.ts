import { describe, it, expect } from 'vitest';
import { downloadAllFromResponseItems } from '../sync/itemCodec';
import { encryptData } from '../cryptoPrimitives';

describe('itemCodec - downloadAllFromResponseItems', () => {
  const mockMasterKey = 'dGVzdC1tYXN0ZXIta2V5LTMyLWJ5dGVzLWxvbmchITE=';

  it('preserves cloud file reference when modern video payload has empty content', async () => {
    const itemId = 'video-item-123';
    const metadata = {
      mimeType: 'video/mp4',
      size: 10485760,
      folder: 'Saved videos',
    };

    const metadataOnly = {
      id: itemId,
      type: 'video',
      metadata,
      folder: 'Saved videos',
      content: '__ENC__',
    };
    const encryptedMeta = await encryptData(JSON.stringify(metadataOnly), mockMasterKey);
    const encryptedTitle = await encryptData('my_video.mp4', mockMasterKey);

    const doc = {
      itemId,
      category: 'video',
      folder: 'Saved videos',
      title: `V2_ENC:${encryptedTitle}`,
      payload: `V2_MODERN:${encryptedMeta}|`, // Empty content string from in-memory stripping
      gridFsId: 'gridfs-file-abc-999',
      file: {
        filePath: 'cloud://gridfs-file-abc-999',
        fileName: 'my_video.mp4',
        mimeType: 'video/mp4',
        size: 10485760,
      },
    };

    const items = await downloadAllFromResponseItems([doc], mockMasterKey);

    expect(items.length).toBe(1);
    const item = items[0];
    expect(item.id).toBe(itemId);
    expect(item.type).toBe('video');
    expect(item.folder).toBe('Saved videos');
    expect(item.title).toBe('my_video.mp4');
    expect(item.content).toBe('cloud://gridfs-file-abc-999');
  });

  it('correctly maps moved folder for modern items', async () => {
    const itemId = 'video-item-456';
    const metadata = {
      folder: 'Custom Folder',
    };

    const metadataOnly = { id: itemId, type: 'video', folder: 'Custom Folder', metadata };
    const encryptedMeta = await encryptData(JSON.stringify(metadataOnly), mockMasterKey);

    const doc = {
      itemId,
      category: 'video',
      folder: 'Custom Folder',
      title: 'plain_title.mp4',
      payload: `V2_MODERN:${encryptedMeta}|cloud://${itemId}`,
    };

    const items = await downloadAllFromResponseItems([doc], mockMasterKey);

    expect(items.length).toBe(1);
    expect(items[0].folder).toBe('Custom Folder');
    expect(items[0].content).toBe(`cloud://${itemId}`);
  });
});
