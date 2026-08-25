/**
 * Web Audio API Voice Clarity & Noise Gate DSP Engine
 *
 * Auto-reduces background fan noise, AC hum, electrical interference, and wind rumble
 * while boosting vocal presence, consonant crispness, and speech intelligibility for
 * crystal-clear audio memos and interview videos.
 */

import { logger } from './logger';

export type VoiceClarityPreset = 'crystal' | 'aggressive' | 'warm-interview' | 'off';

export interface VoiceClarityConfig {
  name: string;
  description: string;
  highpassFreq: number; // Hz - Cuts low rumble, wind buffetting, mic bumping
  notchFreq: number; // Hz - Electrical power hum notch (50/60 Hz)
  notchQ: number;
  fanPeakingFreq: number; // Hz - Fan motor drone reduction
  fanPeakingGain: number; // dB
  fanPeakingQ: number;
  vocalPresenceFreq: number; // Hz - Speech clarity and consonant boost
  vocalPresenceGain: number; // dB
  vocalPresenceQ: number;
  hissShelfFreq: number; // Hz - Air conditioner / PC exhaust hiss dampening
  hissShelfGain: number; // dB
  gateThreshold: number; // dB - Noise gate threshold
  gateKnee: number; // dB
  gateRatio: number; // Compression ratio for noise reduction
  gateAttack: number; // seconds
  gateRelease: number; // seconds
  makeupGain: number; // Linear gain multiplier
}

export const VOICE_CLARITY_PRESETS: Record<VoiceClarityPreset, VoiceClarityConfig> = {
  crystal: {
    name: 'Crystal Voice (Auto Fan & Hum Cut)',
    description: 'Optimal speech clarity with balanced fan, wind, and hum noise reduction.',
    highpassFreq: 85,
    notchFreq: 60,
    notchQ: 5.0,
    fanPeakingFreq: 260,
    fanPeakingGain: -4.5,
    fanPeakingQ: 1.8,
    vocalPresenceFreq: 3200,
    vocalPresenceGain: 4.5,
    vocalPresenceQ: 1.1,
    hissShelfFreq: 9000,
    hissShelfGain: -3.5,
    gateThreshold: -45,
    gateKnee: 6,
    gateRatio: 12,
    gateAttack: 0.003,
    gateRelease: 0.15,
    makeupGain: 1.25,
  },
  aggressive: {
    name: 'Heavy Noise Gate (Loud Fan & Wind)',
    description:
      'Maximum suppression for high-noise environments, strong fan whir, and outdoor wind.',
    highpassFreq: 120,
    notchFreq: 60,
    notchQ: 6.0,
    fanPeakingFreq: 280,
    fanPeakingGain: -7.0,
    fanPeakingQ: 2.0,
    vocalPresenceFreq: 3400,
    vocalPresenceGain: 6.0,
    vocalPresenceQ: 1.3,
    hissShelfFreq: 8000,
    hissShelfGain: -6.0,
    gateThreshold: -38,
    gateKnee: 4,
    gateRatio: 16,
    gateAttack: 0.002,
    gateRelease: 0.12,
    makeupGain: 1.4,
  },
  'warm-interview': {
    name: 'Warm Interview (Podcast & Dialogue)',
    description: 'Smooth broadcast compression and subtle acoustic warmth for interview videos.',
    highpassFreq: 70,
    notchFreq: 50,
    notchQ: 4.0,
    fanPeakingFreq: 240,
    fanPeakingGain: -3.0,
    fanPeakingQ: 1.5,
    vocalPresenceFreq: 2800,
    vocalPresenceGain: 3.0,
    vocalPresenceQ: 1.0,
    hissShelfFreq: 11000,
    hissShelfGain: -2.0,
    gateThreshold: -50,
    gateKnee: 8,
    gateRatio: 8,
    gateAttack: 0.005,
    gateRelease: 0.2,
    makeupGain: 1.15,
  },
  off: {
    name: 'Bypass (Raw Audio)',
    description: 'Direct unfiltered audio pass-through.',
    highpassFreq: 10,
    notchFreq: 10,
    notchQ: 0.1,
    fanPeakingFreq: 250,
    fanPeakingGain: 0,
    fanPeakingQ: 1.0,
    vocalPresenceFreq: 3000,
    vocalPresenceGain: 0,
    vocalPresenceQ: 1.0,
    hissShelfFreq: 20000,
    hissShelfGain: 0,
    gateThreshold: 0,
    gateKnee: 0,
    gateRatio: 1,
    gateAttack: 0.001,
    gateRelease: 0.05,
    makeupGain: 1.0,
  },
};

export interface VoiceClarityNodes {
  highpassFilter: BiquadFilterNode;
  notchFilter: BiquadFilterNode;
  fanPeakingFilter: BiquadFilterNode;
  vocalPresenceFilter: BiquadFilterNode;
  hissShelfFilter: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  makeupGainNode: GainNode;
}

export interface VoiceClarityChain {
  inputNode: AudioNode;
  outputNode: AudioNode;
  nodes: VoiceClarityNodes;
  setPreset: (preset: VoiceClarityPreset) => void;
  destroy: () => void;
}

/**
 * Creates a connected Web Audio API filter graph chain implementing
 * noise gating, hum reduction, fan dampening, and voice clarity enhancement.
 */
export function createVoiceClarityChain(
  audioContext: AudioContext,
  sourceNode: AudioNode,
  initialPreset: VoiceClarityPreset = 'crystal',
): VoiceClarityChain {
  const highpassFilter = audioContext.createBiquadFilter();
  highpassFilter.type = 'highpass';

  const notchFilter = audioContext.createBiquadFilter();
  notchFilter.type = 'notch';

  const fanPeakingFilter = audioContext.createBiquadFilter();
  fanPeakingFilter.type = 'peaking';

  const vocalPresenceFilter = audioContext.createBiquadFilter();
  vocalPresenceFilter.type = 'peaking';

  const hissShelfFilter = audioContext.createBiquadFilter();
  hissShelfFilter.type = 'highshelf';

  const compressor = audioContext.createDynamicsCompressor();

  const makeupGainNode = audioContext.createGain();

  // Connect chain:
  // source -> highpass -> notch -> fanPeaking -> vocalPresence -> hissShelf -> compressor -> makeupGain
  sourceNode.connect(highpassFilter);
  highpassFilter.connect(notchFilter);
  notchFilter.connect(fanPeakingFilter);
  fanPeakingFilter.connect(vocalPresenceFilter);
  vocalPresenceFilter.connect(hissShelfFilter);
  hissShelfFilter.connect(compressor);
  compressor.connect(makeupGainNode);

  const applyPreset = (preset: VoiceClarityPreset) => {
    const config = VOICE_CLARITY_PRESETS[preset] || VOICE_CLARITY_PRESETS.crystal;
    const now = audioContext.currentTime;
    const rampTime = 0.05; // 50ms smooth transition

    try {
      // Highpass (rumble / wind cut)
      highpassFilter.frequency.setTargetAtTime(config.highpassFreq, now, rampTime);
      highpassFilter.Q.setTargetAtTime(0.707, now, rampTime);

      // Notch (power mains 50/60 Hz hum)
      notchFilter.frequency.setTargetAtTime(config.notchFreq, now, rampTime);
      notchFilter.Q.setTargetAtTime(config.notchQ, now, rampTime);

      // Fan motor resonance
      fanPeakingFilter.frequency.setTargetAtTime(config.fanPeakingFreq, now, rampTime);
      fanPeakingFilter.gain.setTargetAtTime(config.fanPeakingGain, now, rampTime);
      fanPeakingFilter.Q.setTargetAtTime(config.fanPeakingQ, now, rampTime);

      // Vocal presence & intelligibility
      vocalPresenceFilter.frequency.setTargetAtTime(config.vocalPresenceFreq, now, rampTime);
      vocalPresenceFilter.gain.setTargetAtTime(config.vocalPresenceGain, now, rampTime);
      vocalPresenceFilter.Q.setTargetAtTime(config.vocalPresenceQ, now, rampTime);

      // Hiss / Air dampening
      hissShelfFilter.frequency.setTargetAtTime(config.hissShelfFreq, now, rampTime);
      hissShelfFilter.gain.setTargetAtTime(config.hissShelfGain, now, rampTime);

      // Dynamics Noise Gate / Compressor
      compressor.threshold.setTargetAtTime(config.gateThreshold, now, rampTime);
      compressor.knee.setTargetAtTime(config.gateKnee, now, rampTime);
      compressor.ratio.setTargetAtTime(config.gateRatio, now, rampTime);
      compressor.attack.setTargetAtTime(config.gateAttack, now, rampTime);
      compressor.release.setTargetAtTime(config.gateRelease, now, rampTime);

      // Makeup Gain
      makeupGainNode.gain.setTargetAtTime(config.makeupGain, now, rampTime);
    } catch (e) {
      logger.warn('Failed to update voice clarity DSP parameters', { error: e });
    }
  };

  applyPreset(initialPreset);

  const destroy = () => {
    try {
      sourceNode.disconnect();
      highpassFilter.disconnect();
      notchFilter.disconnect();
      fanPeakingFilter.disconnect();
      vocalPresenceFilter.disconnect();
      hissShelfFilter.disconnect();
      compressor.disconnect();
      makeupGainNode.disconnect();
    } catch (e) {
      logger.warn('Error during voice clarity chain cleanup', { error: e });
    }
  };

  return {
    inputNode: sourceNode,
    outputNode: makeupGainNode,
    nodes: {
      highpassFilter,
      notchFilter,
      fanPeakingFilter,
      vocalPresenceFilter,
      hissShelfFilter,
      compressor,
      makeupGainNode,
    },
    setPreset: applyPreset,
    destroy,
  };
}

export interface FilteredStreamResult {
  filteredStream: MediaStream;
  audioContext: AudioContext;
  chain: VoiceClarityChain;
  setPreset: (preset: VoiceClarityPreset) => void;
  close: () => void;
}

/**
 * Pipes a microphone MediaStream through the Voice Clarity DSP engine,
 * returning a filtered MediaStream containing processed audio ready for MediaRecorder.
 */
export function createFilteredMediaStream(
  originalStream: MediaStream,
  preset: VoiceClarityPreset = 'crystal',
): FilteredStreamResult | null {
  const AudioCtxClass =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as any).webkitAudioContext
      : null;

  if (!AudioCtxClass) {
    logger.warn('AudioContext not supported in this environment');
    return null;
  }

  const audioTrack = originalStream.getAudioTracks()[0];
  if (!audioTrack) {
    return null;
  }

  try {
    const audioContext = new AudioCtxClass();
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => {});
    }

    const source = audioContext.createMediaStreamSource(originalStream);
    const chain = createVoiceClarityChain(audioContext, source, preset);
    const destination = audioContext.createMediaStreamDestination();

    chain.outputNode.connect(destination);

    // Build the output stream: include filtered audio track + any original video tracks
    const processedAudioTrack = destination.stream.getAudioTracks()[0];
    const videoTracks = originalStream.getVideoTracks();

    const outputTracks: MediaStreamTrack[] = [processedAudioTrack, ...videoTracks];
    const filteredStream = new MediaStream(outputTracks);

    const close = () => {
      chain.destroy();
      destination.disconnect();
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
    };

    return {
      filteredStream,
      audioContext,
      chain,
      setPreset: chain.setPreset,
      close,
    };
  } catch (error) {
    logger.warn('Failed to create filtered MediaStream', { error });
    return null;
  }
}

/**
 * Attaches the Voice Clarity DSP pipeline to an HTML5 Audio or Video element for real-time playback enhancement.
 */
export function attachVoiceClarityToMediaElement(
  mediaElement: HTMLMediaElement,
  initialPreset: VoiceClarityPreset = 'crystal',
): { setPreset: (preset: VoiceClarityPreset) => void; destroy: () => void } | null {
  const AudioCtxClass =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as any).webkitAudioContext
      : null;

  if (!AudioCtxClass) return null;

  try {
    const audioContext = new AudioCtxClass();
    if (audioContext.state === 'suspended') {
      const resume = () => {
        void audioContext.resume().catch(() => {});
        mediaElement.removeEventListener('play', resume);
      };
      mediaElement.addEventListener('play', resume);
    }

    const source = audioContext.createMediaElementSource(mediaElement);
    const chain = createVoiceClarityChain(audioContext, source, initialPreset);

    chain.outputNode.connect(audioContext.destination);

    const destroy = () => {
      chain.destroy();
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
    };

    return {
      setPreset: chain.setPreset,
      destroy,
    };
  } catch (error) {
    logger.warn('Failed to attach Voice Clarity DSP to media element', { error });
    return null;
  }
}
