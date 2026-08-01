import { describe, expect, it } from 'vitest'
import { assertFileContentMatchesCategory } from '../../server/utils/fileStorage.ts'

describe('upload content validation', () => {
  it('rejects spoofed photo payload when bytes are not an image', () => {
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'cat.jpg',
        'image/jpeg',
        Buffer.from('definitely-not-a-jpeg'),
      ),
    ).toThrow()
  })

  it('rejects spoofed video payload when bytes are not video', () => {
    expect(() =>
      assertFileContentMatchesCategory(
        'video',
        'clip.mp4',
        'video/mp4',
        Buffer.from('plain text and no ftyp signature'),
      ),
    ).toThrow()
  })

  it('accepts valid jpeg signature for photo', () => {
    const minimalJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00])
    expect(() =>
      assertFileContentMatchesCategory('photo', 'ok.jpg', 'image/jpeg', minimalJpeg),
    ).not.toThrow()
  })
})

