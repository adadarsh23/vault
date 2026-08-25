/* @vitest-environment jsdom */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoEditor } from '../VideoEditor';
import { CAMERA_FILTERS } from '../filters';

describe('VideoEditor Component Suite', () => {
  const dummyBlob = new Blob(['video content'], { type: 'video/mp4' });
  const dummyUrl = 'blob:http://localhost/dummy-video';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders video player and all filter preset buttons', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <VideoEditor
        initialBlob={dummyBlob}
        initialUrl={dummyUrl}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    // Verify all filter preset buttons are present
    CAMERA_FILTERS.forEach((f) => {
      const btn = screen.getByLabelText(f.label);
      expect(btn).toBeTruthy();
    });

    // Verify Discard, Play, Mute, Rotate, Flip, and Apply buttons exist
    expect(screen.getByLabelText(/Cancel editing/i)).toBeTruthy();
    expect(screen.getByLabelText(/Play video/i)).toBeTruthy();
    expect(screen.getByLabelText(/Toggle mute/i)).toBeTruthy();
    expect(screen.getByLabelText(/Rotate 90 degrees/i)).toBeTruthy();
    expect(screen.getByLabelText(/Flip horizontal/i)).toBeTruthy();
    expect(screen.getByLabelText(/Apply video edits/i)).toBeTruthy();
  });

  it('calls onCancel when discard button is clicked', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <VideoEditor
        initialBlob={dummyBlob}
        initialUrl={dummyUrl}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    const cancelBtn = screen.getByLabelText(/Cancel editing/i);
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('allows selecting filters and calls onSave on apply', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <VideoEditor
        initialBlob={dummyBlob}
        initialUrl={dummyUrl}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    // Select Noir filter
    const noirBtn = screen.getByLabelText('Vault Noir');
    fireEvent.click(noirBtn);

    // Fast save if no transform or calls export
    const applyBtn = screen.getByLabelText(/Apply video edits/i);
    await act(async () => {
      fireEvent.click(applyBtn);
    });

    expect(onSave).toHaveBeenCalled();
  });
});
