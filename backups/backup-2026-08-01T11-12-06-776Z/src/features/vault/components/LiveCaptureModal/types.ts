export type CaptureType = 'photo' | 'video' | 'audio'

export const getSupportedMimeType = (type: CaptureType): string => {
  if (type === 'photo') return 'image/jpeg'
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
    return ''
  }

  const candidates: string[] =
    type === 'video'
      ? [
        // Best quality first
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',

        // MP4 (Safari / iOS support)
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=h264',
        'video/mp4',

        // Edge cases
        'video/x-matroska;codecs=avc1',
      ]
      : [
        // Most widely supported
        'audio/webm;codecs=opus',
        'audio/webm',

        // Firefox legacy
        'audio/ogg;codecs=opus',
        'audio/ogg',

        // Safari / iOS
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',

        // Fallback
        'audio/wav',
      ]

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }

  return ''
}
