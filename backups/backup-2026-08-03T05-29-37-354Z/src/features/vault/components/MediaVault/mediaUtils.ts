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
            image.onload = () =>
              resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
            image.onerror = () => reject(new Error('Failed to read image dimensions.'));
            image.src = objectUrl;
          }
        );

        return {
          ...dimensions,
          aspectRatio: dimensions.width / dimensions.height,
        };
      }

      const video = document.createElement('video');
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        video.onloadedmetadata = () =>
          resolve({ width: video.videoWidth, height: video.videoHeight });
        video.onerror = () => reject(new Error('Failed to read video dimensions.'));
        video.preload = 'metadata';
        video.src = objectUrl;
      });

      return {
        ...dimensions,
        aspectRatio: dimensions.width / dimensions.height,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
};

export const normalizeMediaMimeType = (file: File, type: 'photo' | 'video') => {
  const extension = getFileExtension(file.name);

  if (type === 'photo') {
    if (extension === 'HEIC') return 'image/heic';
    if (extension === 'HEIF') return 'image/heif';
    if (extension === 'AVIF') return 'image/avif';
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

  if (type === 'photo') return 'image/jpeg';
  return 'video/mp4';
};
