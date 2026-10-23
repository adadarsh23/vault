/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SmartAvatar, validateAvatarFile } from '../SmartAvatar';

describe('SmartAvatar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('File Validation', () => {
    it('rejects files larger than the maximum allowed size', () => {
      const file = new File(['a'.repeat(1024)], 'photo.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 }); // 6 MB

      const result = validateAvatarFile(file, 'image/png,image/jpeg', 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File is too large');
    });

    it('accepts files within the allowed size limit', () => {
      const file = new File(['small'], 'photo.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 }); // 2 MB

      const result = validateAvatarFile(file, 'image/png,image/jpeg', 5);
      expect(result.valid).toBe(true);
    });

    it('supports wildcard MIME types like image/*', () => {
      const file = new File(['webp-content'], 'test.webp', { type: 'image/webp' });
      const result = validateAvatarFile(file, 'image/*', 5);
      expect(result.valid).toBe(true);
    });

    it('supports file extensions in accepted formats', () => {
      const file = new File(['avif-content'], 'avatar.avif', { type: 'image/avif' });
      const result = validateAvatarFile(file, '.jpg,.png,.avif', 5);
      expect(result.valid).toBe(true);
    });

    it('rejects unsupported file formats', () => {
      const file = new File(['pdf-content'], 'document.pdf', { type: 'application/pdf' });
      const result = validateAvatarFile(file, 'image/jpeg,image/png', 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file format');
    });
  });

  describe('Monogram and Rendering', () => {
    it('renders monogram initials when no image src is provided', () => {
      render(<SmartAvatar name="Alice Cooper" size={96} />);
      expect(screen.getByText('AC')).toBeInTheDocument();
    });

    it('extracts two characters for single-word names', () => {
      render(<SmartAvatar name="Adarsh" size={96} />);
      expect(screen.getByText('AD')).toBeInTheDocument();
    });

    it('handles Unicode and emoji initials safely', () => {
      render(<SmartAvatar name="🚀 Rocket" size={96} />);
      expect(screen.getByText('🚀R')).toBeInTheDocument();
    });

    it('renders default U when name is empty', () => {
      render(<SmartAvatar name="" size={96} />);
      expect(screen.getByText('U')).toBeInTheDocument();
    });

    it('sanitizes invalid src strings like "none" or "null"', () => {
      render(<SmartAvatar src="none" name="Bob Ross" size={96} />);
      expect(screen.getByText('BR')).toBeInTheDocument();
    });

    it('renders image when a valid src is provided', () => {
      render(<SmartAvatar src="https://example.com/avatar.jpg" alt="User Avatar" />);
      const img = screen.getByAltText('User Avatar');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });
  });

  describe('Interactions and Accessibility', () => {
    it('triggers file input click when avatar container is clicked', () => {
      const onFileSelect = vi.fn();
      render(<SmartAvatar name="Test User" onFileSelect={onFileSelect} />);

      const avatarButton = screen.getByRole('button', {
        name: /change profile photo for test user/i,
      });
      expect(avatarButton).toBeInTheDocument();

      const input = avatarButton
        .closest('div[style*="contain"]')!
        .querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      fireEvent.click(avatarButton);
      expect(clickSpy).toHaveBeenCalled();
    });

    it('triggers file selection via Enter key', () => {
      const onFileSelect = vi.fn();
      render(<SmartAvatar name="Test User" onFileSelect={onFileSelect} />);

      const avatarButton = screen.getByRole('button');
      const input = avatarButton
        .closest('div[style*="contain"]')!
        .querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      fireEvent.keyDown(avatarButton, { key: 'Enter' });
      expect(clickSpy).toHaveBeenCalled();
    });

    it('validates and calls onFileSelect when a valid file is chosen', () => {
      const onFileSelect = vi.fn();
      render(<SmartAvatar name="Test User" onFileSelect={onFileSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['valid'], 'avatar.jpg', { type: 'image/jpeg' });

      fireEvent.change(input, { target: { files: [file] } });
      expect(onFileSelect).toHaveBeenCalledWith(file);
    });

    it('calls onValidationError when an invalid file is selected', () => {
      const onFileSelect = vi.fn();
      const onValidationError = vi.fn();
      render(
        <SmartAvatar
          name="Test User"
          onFileSelect={onFileSelect}
          onValidationError={onValidationError}
          maxSizeInMb={1}
        />,
      );

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const oversizedFile = new File(['a'.repeat(2 * 1024 * 1024)], 'large.jpg', {
        type: 'image/jpeg',
      });
      Object.defineProperty(oversizedFile, 'size', { value: 2 * 1024 * 1024 });

      fireEvent.change(input, { target: { files: [oversizedFile] } });
      expect(onFileSelect).not.toHaveBeenCalled();
      expect(onValidationError).toHaveBeenCalledWith(expect.stringContaining('File is too large'));
    });
  });

  describe('Status Indicators and Badges', () => {
    it('displays offline indicator badge when isOfflineQueued is true', () => {
      render(<SmartAvatar name="Test User" isOfflineQueued={true} />);
      const badge = screen.getByRole('status', { name: /offline sync queued/i });
      expect(badge).toBeInTheDocument();
    });

    it('displays error badge when error is provided', () => {
      render(<SmartAvatar name="Test User" error="Upload failed" />);
      const alertBadge = screen.getByRole('alert', { name: /upload failed/i });
      expect(alertBadge).toBeInTheDocument();
    });

    it('renders upload progress ring and percentage', () => {
      render(<SmartAvatar name="Test User" isUploading={true} uploadProgress={75} size={96} />);
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('renders processing state loader', () => {
      render(<SmartAvatar name="Test User" isProcessing={true} size={96} />);
      expect(screen.getByText(/processing/i)).toBeInTheDocument();
    });
  });
});
