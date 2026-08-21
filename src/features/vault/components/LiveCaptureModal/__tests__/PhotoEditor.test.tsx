/* @vitest-environment jsdom */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhotoEditor } from '../PhotoEditor';
import { CAMERA_FILTERS } from '../filters';

describe('PhotoEditor Component Suite', () => {
  const dummyBlob = new Blob(['photo content'], { type: 'image/jpeg' });
  const dummyUrl = 'blob:http://localhost/dummy-photo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders canvas and all filter preset buttons with labels', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <PhotoEditor
        initialBlob={dummyBlob}
        initialUrl={dummyUrl}
        onSave={onSave}
        onCancel={onCancel}
      />
    );

    // Verify all 32 filter preset buttons are present
    CAMERA_FILTERS.forEach((f) => {
      const btn = screen.getByLabelText(f.label);
      expect(btn).toBeTruthy();
    });

    // Verify Discard, Rotate, Redact, and Apply buttons exist
    expect(screen.getByLabelText(/Cancel editing/i)).toBeTruthy();
    expect(screen.getByLabelText(/Rotate 90 degrees/i)).toBeTruthy();
    expect(screen.getByLabelText(/Redact brush/i)).toBeTruthy();
    expect(screen.getByLabelText(/Apply edits/i)).toBeTruthy();
  });

  it('calls onCancel when discard button is clicked', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <PhotoEditor
        initialBlob={dummyBlob}
        initialUrl={dummyUrl}
        onSave={onSave}
        onCancel={onCancel}
      />
    );

    const cancelBtn = screen.getByLabelText(/Cancel editing/i);
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('allows selecting filters and toggling redact brush', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <PhotoEditor
        initialBlob={dummyBlob}
        initialUrl={dummyUrl}
        onSave={onSave}
        onCancel={onCancel}
      />
    );

    // Select Cyberpunk filter
    const cyberBtn = screen.getByLabelText('Cyberpunk');
    fireEvent.click(cyberBtn);

    // Toggle redact brush on
    const redactBtn = screen.getByLabelText(/Redact brush/i);
    fireEvent.click(redactBtn);

    // Undo and Clear buttons should now be visible
    expect(screen.getByLabelText(/Undo/i)).toBeTruthy();
    expect(screen.getByLabelText(/Clear all marks/i)).toBeTruthy();
  });
});
