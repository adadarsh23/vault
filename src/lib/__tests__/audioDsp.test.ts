import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VOICE_CLARITY_PRESETS,
  createVoiceClarityChain,
  createFilteredMediaStream,
  attachVoiceClarityToMediaElement,
} from '../audioDsp';

describe('Voice Clarity & Noise Gate DSP Engine (Web Audio API)', () => {
  it('should have properly defined presets for noise reduction and clarity', () => {
    expect(VOICE_CLARITY_PRESETS.crystal).toBeDefined();
    expect(VOICE_CLARITY_PRESETS.crystal.highpassFreq).toBe(85);
    expect(VOICE_CLARITY_PRESETS.crystal.vocalPresenceGain).toBe(4.5);
    expect(VOICE_CLARITY_PRESETS.crystal.gateThreshold).toBe(-45);

    expect(VOICE_CLARITY_PRESETS.aggressive).toBeDefined();
    expect(VOICE_CLARITY_PRESETS.aggressive.highpassFreq).toBe(120);
    expect(VOICE_CLARITY_PRESETS.aggressive.fanPeakingGain).toBe(-7.0);

    expect(VOICE_CLARITY_PRESETS['warm-interview']).toBeDefined();
    expect(VOICE_CLARITY_PRESETS['warm-interview'].vocalPresenceGain).toBe(3.0);

    expect(VOICE_CLARITY_PRESETS.off).toBeDefined();
    expect(VOICE_CLARITY_PRESETS.off.gateThreshold).toBe(0);
  });

  describe('Web Audio API Node Creation & Filter Chaining', () => {
    let mockContext: any;
    let mockSource: any;
    let createdNodes: any[];

    beforeEach(() => {
      createdNodes = [];
      const createMockAudioNode = (type: string) => {
        const node: any = {
          _type: type,
          frequency: { value: 0, setTargetAtTime: vi.fn() },
          gain: { value: 0, setTargetAtTime: vi.fn() },
          Q: { value: 0, setTargetAtTime: vi.fn() },
          threshold: { value: 0, setTargetAtTime: vi.fn() },
          ratio: { value: 0, setTargetAtTime: vi.fn() },
          attack: { value: 0, setTargetAtTime: vi.fn() },
          release: { value: 0, setTargetAtTime: vi.fn() },
          knee: { value: 0, setTargetAtTime: vi.fn() },
          type: '',
          connect: vi.fn((dest) => dest),
          disconnect: vi.fn(),
        };
        createdNodes.push(node);
        return node;
      };

      mockContext = {
        currentTime: 0,
        createBiquadFilter: vi.fn(() => createMockAudioNode('biquadFilter')),
        createDynamicsCompressor: vi.fn(() => createMockAudioNode('dynamicsCompressor')),
        createGain: vi.fn(() => createMockAudioNode('gain')),
        createMediaStreamSource: vi.fn(() => createMockAudioNode('mediaStreamSource')),
        createMediaStreamDestination: vi.fn(() => ({
          stream: {
            getAudioTracks: () => [{ id: 'mock-filtered-track', kind: 'audio', stop: vi.fn() }],
          },
          disconnect: vi.fn(),
        })),
        createMediaElementSource: vi.fn(() => createMockAudioNode('mediaElementSource')),
        destination: createMockAudioNode('destination'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockSource = createMockAudioNode('mediaStreamSource');
    });

    it('should construct full DSP filter chain with highpass, notch, peaking eq, highshelf, and compressor', () => {
      const chain = createVoiceClarityChain(mockContext, mockSource, 'crystal');
      expect(chain).toBeDefined();
      expect(chain.inputNode).toBeDefined();
      expect(chain.outputNode).toBeDefined();
      expect(chain.nodes).toBeDefined();

      // Check all filters were created
      expect(mockContext.createBiquadFilter).toHaveBeenCalledTimes(5);
      expect(mockContext.createDynamicsCompressor).toHaveBeenCalledTimes(1);
      expect(mockContext.createGain).toHaveBeenCalledTimes(1);

      // Verify node parameters were initialized via setTargetAtTime
      expect(chain.nodes.highpassFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(
        85,
        0,
        0.05
      );
      expect(chain.nodes.notchFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(60, 0, 0.05);
      expect(chain.nodes.fanPeakingFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(
        260,
        0,
        0.05
      );
      expect(chain.nodes.vocalPresenceFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(
        3200,
        0,
        0.05
      );
      expect(chain.nodes.hissShelfFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(
        9000,
        0,
        0.05
      );
      expect(chain.nodes.compressor.threshold.setTargetAtTime).toHaveBeenCalledWith(
        -45,
        0,
        0.05
      );
    });

    it('should dynamically update filter parameters when preset is changed', () => {
      const chain = createVoiceClarityChain(mockContext, mockSource, 'crystal');
      chain.setPreset('aggressive');

      expect(chain.nodes.highpassFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(
        120,
        0,
        0.05
      );
      expect(chain.nodes.fanPeakingFilter.gain.setTargetAtTime).toHaveBeenCalledWith(
        -7.0,
        0,
        0.05
      );
      expect(chain.nodes.compressor.threshold.setTargetAtTime).toHaveBeenCalledWith(
        -38,
        0,
        0.05
      );
      expect(chain.nodes.compressor.ratio.setTargetAtTime).toHaveBeenCalledWith(16, 0, 0.05);

      chain.setPreset('off');
      expect(chain.nodes.highpassFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(
        10,
        0,
        0.05
      );
      expect(chain.nodes.fanPeakingFilter.gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.05);
      expect(chain.nodes.compressor.threshold.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.05);
    });

    it('should disconnect all nodes on destroy/cleanup', () => {
      const chain = createVoiceClarityChain(mockContext, mockSource, 'crystal');
      chain.destroy();

      expect(mockSource.disconnect).toHaveBeenCalled();
      expect(chain.nodes.highpassFilter.disconnect).toHaveBeenCalled();
      expect(chain.nodes.notchFilter.disconnect).toHaveBeenCalled();
      expect(chain.nodes.fanPeakingFilter.disconnect).toHaveBeenCalled();
      expect(chain.nodes.vocalPresenceFilter.disconnect).toHaveBeenCalled();
      expect(chain.nodes.hissShelfFilter.disconnect).toHaveBeenCalled();
      expect(chain.nodes.compressor.disconnect).toHaveBeenCalled();
      expect(chain.nodes.makeupGainNode.disconnect).toHaveBeenCalled();
    });
  });
});
