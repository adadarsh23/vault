import { describe, expect, it } from 'vitest';
import { assertFileContentMatchesCategory } from '../../server/utils/fileStorage.ts';

describe('upload content validation', () => {
  it('rejects spoofed photo payload when bytes are not an image', () => {
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'cat.jpg',
        'image/jpeg',
        Buffer.from('definitely-not-a-jpeg'),
      ),
    ).toThrow();
  });

  it('rejects spoofed video payload when bytes are not video', () => {
    expect(() =>
      assertFileContentMatchesCategory(
        'video',
        'clip.mp4',
        'video/mp4',
        Buffer.from('plain text and no ftyp signature'),
      ),
    ).toThrow();
  });

  it('accepts valid jpeg signature for photo', () => {
    const minimalJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]);
    expect(() =>
      assertFileContentMatchesCategory('photo', 'ok.jpg', 'image/jpeg', minimalJpeg),
    ).not.toThrow();
  });

  it('accepts valid signatures across multiple photo formats', () => {
    // PNG
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.png',
        'image/png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      ),
    ).not.toThrow();

    // GIF
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.gif',
        'image/gif',
        Buffer.from('GIF89a\x01\x00\x01\x00'),
      ),
    ).not.toThrow();

    // BMP
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.bmp',
        'image/bmp',
        Buffer.from('BM\x00\x00\x00\x00'),
      ),
    ).not.toThrow();

    // WebP
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.webp',
        'image/webp',
        Buffer.from('RIFF\x00\x00\x00\x00WEBP\x00\x00'),
      ),
    ).not.toThrow();

    // SVG
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.svg',
        'image/svg+xml',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
      ),
    ).not.toThrow();

    // TIFF
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.tiff',
        'image/tiff',
        Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
      ),
    ).not.toThrow();

    // PSD
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.psd',
        'image/vnd.adobe.photoshop',
        Buffer.from('8BPS\x00\x01\x00\x00\x00\x00\x00\x00'),
      ),
    ).not.toThrow();

    // ICO
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.ico',
        'image/x-icon',
        Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]),
      ),
    ).not.toThrow();

    // Fuji RAW (RAF)
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.raf',
        'image/x-fuji-raf',
        Buffer.from('FUJIFILMCCD-RAW 0201'),
      ),
    ).not.toThrow();

    // DDS
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.dds',
        'image/vnd-ms.dds',
        Buffer.from('DDS \x7c\x00\x00\x00'),
      ),
    ).not.toThrow();

    // EXR
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.exr',
        'image/x-exr',
        Buffer.from([0x76, 0x2f, 0x31, 0x01, 0x02, 0x00, 0x00, 0x00]),
      ),
    ).not.toThrow();

    // Radiance HDR
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'test.hdr',
        'image/vnd.radiance',
        Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n'),
      ),
    ).not.toThrow();

    // Client Encrypted Cascade Cipher Envelope (VCAS01)
    expect(() =>
      assertFileContentMatchesCategory(
        'photo',
        'secure_photo.enc',
        'image/jpeg',
        Buffer.from([0x56, 0x43, 0x41, 0x53, 0x30, 0x31, 0x00, 0x01, 0x02, 0x03]),
      ),
    ).not.toThrow();
  });

  it('accepts valid signatures across multiple video formats including encrypted payloads', () => {
    // Standard MP4
    expect(() =>
      assertFileContentMatchesCategory(
        'video',
        'test.mp4',
        'video/mp4',
        Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
      ),
    ).not.toThrow();

    // Modern MP4 with dash/iso5 brand
    expect(() =>
      assertFileContentMatchesCategory(
        'video',
        'movie.mp4',
        'video/mp4',
        Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x64, 0x61, 0x73, 0x68]),
      ),
    ).not.toThrow();

    // WebM / MKV (EBML)
    expect(() =>
      assertFileContentMatchesCategory(
        'video',
        'test.webm',
        'video/webm',
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]),
      ),
    ).not.toThrow();

    // AVI
    expect(() =>
      assertFileContentMatchesCategory(
        'video',
        'test.avi',
        'video/x-msvideo',
        Buffer.from('RIFF\x00\x00\x00\x00AVI LIST\x00\x00'),
      ),
    ).not.toThrow();

    // FLV
    expect(() =>
      assertFileContentMatchesCategory(
        'video',
        'test.flv',
        'video/x-flv',
        Buffer.from('FLV\x01\x05\x00\x00\x00\x09'),
      ),
    ).not.toThrow();

    // MPEG-TS
    const tsBuffer = Buffer.alloc(188);
    tsBuffer[0] = 0x47;
    expect(() =>
      assertFileContentMatchesCategory('video', 'test.ts', 'video/mp2t', tsBuffer),
    ).not.toThrow();

    // Encrypted Video Cascade Cipher Envelope (VCAS01)
    expect(() =>
      assertFileContentMatchesCategory(
        'video',
        'secure_video.enc',
        'video/mp4',
        Buffer.from([0x56, 0x43, 0x41, 0x53, 0x30, 0x31, 0xaa, 0xbb, 0xcc, 0xdd]),
      ),
    ).not.toThrow();
  });

  it('accepts valid signatures across audio formats including encrypted payloads', () => {
    // MP3 with ID3 tag
    expect(() =>
      assertFileContentMatchesCategory(
        'audio',
        'song.mp3',
        'audio/mpeg',
        Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'),
      ),
    ).not.toThrow();

    // WAV
    expect(() =>
      assertFileContentMatchesCategory(
        'audio',
        'track.wav',
        'audio/wav',
        Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt '),
      ),
    ).not.toThrow();

    // FLAC
    expect(() =>
      assertFileContentMatchesCategory(
        'audio',
        'track.flac',
        'audio/flac',
        Buffer.from('fLaC\x00\x00\x00\x22'),
      ),
    ).not.toThrow();

    // Ogg Audio
    expect(() =>
      assertFileContentMatchesCategory(
        'audio',
        'voice.ogg',
        'audio/ogg',
        Buffer.from('OggS\x00\x02\x00\x00\x00\x00'),
      ),
    ).not.toThrow();

    // Encrypted Audio Cascade Cipher Envelope (VCAS01)
    expect(() =>
      assertFileContentMatchesCategory(
        'audio',
        'voice_memo.enc',
        'audio/mpeg',
        Buffer.from([0x56, 0x43, 0x41, 0x53, 0x30, 0x31, 0x11, 0x22, 0x33, 0x44]),
      ),
    ).not.toThrow();
  });
});
