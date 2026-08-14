export const getFileExtension = (fileName: string) =>
  fileName.split('.').pop()?.trim().toUpperCase() || '';

export const getMediaDimensions = async (
  file: File,
  type: 'photo' | 'video'
): Promise<{ width: number; height: number; aspectRatio: number } | null> => {
  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      if (type === 'photo') {
        const image = new Image();
        const dimensions = await new Promise<{ width: number; height: number }>(
          (resolve, reject) => {
            const timer = setTimeout(() => {
              image.onload = null;
              image.onerror = null;
              image.src = '';
              reject(new Error('Image dimensions probe timeout'));
            }, 3000);

            image.onload = () => {
              clearTimeout(timer);
              resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
            };
            image.onerror = () => {
              clearTimeout(timer);
              reject(new Error('Failed to read image dimensions.'));
            };
            image.src = objectUrl;
          }
        );

        return {
          ...dimensions,
          aspectRatio:
            dimensions.width > 0 && dimensions.height > 0
              ? dimensions.width / dimensions.height
              : 1,
        };
      }

      const video = document.createElement('video');
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const timer = setTimeout(() => {
          video.onloadedmetadata = null;
          video.onerror = null;
          reject(new Error('Video metadata probe timeout'));
        }, 5000);

        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve({ width: video.videoWidth, height: video.videoHeight });
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Failed to read video dimensions.'));
        };
        video.preload = 'metadata';
        video.src = objectUrl;
      });

      // Explicitly cleanup the video element to prevent memory leak of the hardware decoder
      video.pause();
      video.removeAttribute('src');
      video.load();

      return {
        ...dimensions,
        aspectRatio:
          dimensions.width > 0 && dimensions.height > 0
            ? dimensions.width / dimensions.height
            : 16 / 9,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
};

const extensionToPhotoMime: Record<string, string> = {
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  JPE: 'image/jpeg',
  JFIF: 'image/jpeg',
  PJPEG: 'image/jpeg',
  PJP: 'image/jpeg',
  PNG: 'image/png',
  APNG: 'image/apng',
  GIF: 'image/gif',
  WEBP: 'image/webp',
  AVIF: 'image/avif',
  HEIC: 'image/heic',
  HEIF: 'image/heif',
  BMP: 'image/bmp',
  DIB: 'image/bmp',
  TIF: 'image/tiff',
  TIFF: 'image/tiff',
  ICO: 'image/x-icon',
  CUR: 'image/x-icon',
  SVG: 'image/svg+xml',
  SVGZ: 'image/svg+xml',
  PSD: 'image/vnd.adobe.photoshop',
  RAW: 'image/x-dcraw',
  CR2: 'image/x-canon-cr2',
  CR3: 'image/x-canon-cr3',
  NEF: 'image/x-nikon-nef',
  NRW: 'image/x-nikon-nrw',
  ARW: 'image/x-sony-arw',
  SR2: 'image/x-sony-sr2',
  SRF: 'image/x-sony-srf',
  RAF: 'image/x-fuji-raf',
  ORF: 'image/x-olympus-orf',
  RW2: 'image/x-panasonic-rw2',
  PEF: 'image/x-pentax-pef',
  DNG: 'image/x-adobe-dng',
  X3F: 'image/x-sigma-x3f',
  '3FR': 'image/x-hasselblad-3fr',
  FFF: 'image/x-hasselblad-fff',
  IIQ: 'image/x-phaseone-iiq',
  ERF: 'image/x-epson-erf',
  KDC: 'image/x-kodak-kdc',
  MEF: 'image/x-mamiya-mef',
  MOS: 'image/x-leaf-mos',
  MRW: 'image/x-minolta-mrw',
  RWL: 'image/x-leica-rwl',
  DCR: 'image/x-kodak-dcr',
  BAY: 'image/x-casio-bay',
  GPR: 'image/x-gopro-gpr',
  JP2: 'image/jp2',
  J2K: 'image/jp2',
  JPF: 'image/jp2',
  JPM: 'image/jp2',
  JXR: 'image/jxr',
  HDP: 'image/jxr',
  WDP: 'image/jxr',
  DDS: 'image/vnd-ms.dds',
  EXR: 'image/x-exr',
  HDR: 'image/vnd.radiance',
  PIC: 'image/x-pict',
  PCT: 'image/x-pict',
  PCX: 'image/x-pcx',
  TGA: 'image/x-tga',
  ICNS: 'image/x-icns',
};

export const normalizeMediaMimeType = (file: File, type: 'photo' | 'video') => {
  const extension = getFileExtension(file.name);

  if (type === 'photo') {
    const photoMime = extensionToPhotoMime[extension];
    if (photoMime) return photoMime;
    if (file.type && file.type.startsWith('image/')) {
      return file.type;
    }
    return 'image/jpeg';
  } else if (type === 'video') {
    const extensionToVideoMime: Record<string, string> = {
      MP4: 'video/mp4',
      M4V: 'video/mp4',
      MOV: 'video/quicktime',
      QT: 'video/quicktime',
      WEBM: 'video/webm',
      MKV: 'video/x-matroska',
      MKA: 'video/x-matroska',
      MKS: 'video/x-matroska',
      AVI: 'video/x-msvideo',
      DIVX: 'video/x-msvideo',
      XVID: 'video/x-msvideo',
      WMV: 'video/x-ms-wmv',
      ASF: 'video/x-ms-asf',
      ASX: 'video/x-ms-asf',
      MPG: 'video/mpeg',
      MPEG: 'video/mpeg',
      MPE: 'video/mpeg',
      MPV: 'video/mpeg',
      M2V: 'video/mpeg',
      M2P: 'video/mpeg',
      MTS: 'video/mp2t',
      M2TS: 'video/mp2t',
      TS: 'video/mp2t',
      VOB: 'video/dvd',
      EVO: 'video/mp2t',
      MOD: 'video/mp2t',
      TOD: 'video/mp2t',
      '3GP': 'video/3gpp',
      '3G2': 'video/3gpp2',
      F4V: 'video/x-f4v',
      F4P: 'video/mp4',
      F4A: 'video/mp4',
      F4B: 'video/mp4',
      FLV: 'video/x-flv',
      SWF: 'application/x-shockwave-flash',
      OGV: 'video/ogg',
      OGM: 'video/ogg',
      RM: 'application/vnd.rn-realmedia',
      RMVB: 'application/vnd.rn-realmedia-vbr',
      RV: 'video/vnd.rn-realvideo',
      DAT: 'video/mpeg',
      MXF: 'application/mxf',
      GXF: 'application/gxf',
      LXF: 'video/mp2t',
      NUT: 'video/x-nut',
      DV: 'video/x-dv',
      DIF: 'video/x-dv',
      Y4M: 'video/x-yuv4mpeg',
      H264: 'video/h264',
      '264': 'video/h264',
      H265: 'video/h265',
      '265': 'video/h265',
      HEVC: 'video/h265',
      AV1: 'video/av1',
      VP8: 'video/x-vnd.on2.vp8',
      VP9: 'video/x-vnd.on2.vp9',
      R3D: 'video/x-r3d',
      BRAW: 'video/x-braw',
      CINE: 'application/octet-stream',
      ARI: 'application/octet-stream',
      ARX: 'application/octet-stream',
      MJP2: 'video/mj2',
      MJ2: 'video/mj2',
    };

    const normalized = extensionToVideoMime[extension];
    if (normalized) return normalized;
  }

  if (file.type && file.type !== 'application/octet-stream') {
    return file.type;
  }

  return 'video/mp4';
};
