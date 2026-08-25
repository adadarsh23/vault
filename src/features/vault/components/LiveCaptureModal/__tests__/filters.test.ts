/* @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { CAMERA_FILTERS, getFilterPreset, getFilterCss } from '../filters';
import { CameraFilter } from '../types';

describe('Live Camera & Media Filters Suite', () => {
  it('should include the Moe filter in CAMERA_FILTERS presets', () => {
    const moePreset = CAMERA_FILTERS.find((f) => f.id === 'moe');
    expect(moePreset).toBeDefined();
    expect(moePreset?.label).toBe('Moe Anime');
    expect(moePreset?.shortLabel).toBe('Moe');
    expect(moePreset?.description).toContain('Soft pastel glow');
    expect(moePreset?.cssFilter).toBe(
      'contrast(106%) brightness(108%) saturate(135%) sepia(10%) hue-rotate(345deg)',
    );
    expect(moePreset?.badgeColor).toContain('bg-rose-500/20');
    expect(moePreset?.iconColor).toBe('text-rose-400');
    expect(moePreset?.icon).toBeDefined();
  });

  it('should include 10 new safe & secure filter presets', () => {
    const newPresets: { id: CameraFilter; label: string; shortLabel: string }[] = [
      { id: 'golden-hour', label: 'Golden Hour', shortLabel: 'Golden' },
      { id: 'matrix-green', label: 'Matrix Code', shortLabel: 'Matrix' },
      { id: 'deep-ocean', label: 'Deep Ocean', shortLabel: 'Ocean' },
      { id: 'ruby-noir', label: 'Ruby Noir', shortLabel: 'Ruby' },
      { id: 'high-key-bw', label: 'Silver High-Key', shortLabel: 'Silver' },
      { id: 'pastel-bloom', label: 'Pastel Bloom', shortLabel: 'Bloom' },
      { id: 'chroma-synth', label: 'Chroma Synth', shortLabel: 'Synth' },
      { id: 'kodak-gold', label: 'Kodak 400', shortLabel: 'Kodak' },
      { id: 'midnight-fog', label: 'Midnight Fog', shortLabel: 'Midnight' },
      { id: 'warm-espresso', label: 'Warm Espresso', shortLabel: 'Espresso' },
    ];

    newPresets.forEach(({ id, label, shortLabel }) => {
      const preset = CAMERA_FILTERS.find((f) => f.id === id);
      expect(preset).toBeDefined();
      expect(preset?.label).toBe(label);
      expect(preset?.shortLabel).toBe(shortLabel);
      expect(preset?.cssFilter).toBeTruthy();
      expect(preset?.icon).toBeDefined();
      expect(preset?.badgeColor).toBeTruthy();
      expect(preset?.iconColor).toBeTruthy();
    });
  });

  it('should return correct FilterPreset from getFilterPreset for all 32 presets', () => {
    const filterIds: CameraFilter[] = [
      'none',
      'document',
      'noir',
      'vivid',
      'warm',
      'cyberpunk',
      'moe',
      'sepia',
      'cool',
      'dramatic',
      'emerald',
      'sunset',
      'vintage-film',
      'cinema-teal',
      'matte-black',
      'lavender-dream',
      'cyber-neon',
      'desert-gold',
      'arctic-frost',
      'polaroid',
      'infrared',
      'night-vision',
      'golden-hour',
      'matrix-green',
      'deep-ocean',
      'ruby-noir',
      'high-key-bw',
      'pastel-bloom',
      'chroma-synth',
      'kodak-gold',
      'midnight-fog',
      'warm-espresso',
    ];

    expect(CAMERA_FILTERS.length).toBe(32);

    filterIds.forEach((id) => {
      const preset = getFilterPreset(id);
      expect(preset.id).toBe(id);
      expect(preset.label).toBeTruthy();
      expect(preset.cssFilter).toBeTruthy();
      expect(preset.icon).toBeDefined();
    });
  });

  it('should return fallback preset for unknown filter IDs', () => {
    const fallbackPreset = getFilterPreset('non-existent' as CameraFilter);
    expect(fallbackPreset.id).toBe('none');
    expect(fallbackPreset.cssFilter).toBe('none');
  });

  it('should return correct CSS filter string from getFilterCss', () => {
    expect(getFilterCss('moe')).toBe(
      'contrast(106%) brightness(108%) saturate(135%) sepia(10%) hue-rotate(345deg)',
    );
    expect(getFilterCss('golden-hour')).toBe(
      'contrast(110%) brightness(112%) saturate(145%) sepia(24%) hue-rotate(355deg)',
    );
    expect(getFilterCss('matrix-green')).toBe(
      'contrast(140%) brightness(106%) hue-rotate(95deg) saturate(240%)',
    );
    expect(getFilterCss('ruby-noir')).toBe(
      'grayscale(100%) sepia(100%) hue-rotate(320deg) saturate(400%) contrast(145%) brightness(96%)',
    );
    expect(getFilterCss('none')).toBe('none');
    expect(getFilterCss('noir')).toBe('grayscale(100%) contrast(140%) brightness(90%)');
    expect(getFilterCss('non-existent' as CameraFilter)).toBe('none');
  });
});
