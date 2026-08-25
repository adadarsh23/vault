/* @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityDetailsModal } from '../../src/components/vault/ActivityDetailsModal';
import type { ActivityEntry } from '../../src/store/activityStore';

describe('ActivityDetailsModal', () => {
  const mockEntry: ActivityEntry & { parsedTimestamp: number } = {
    id: 'activity-uuid-12345',
    actionType: 'password_create',
    itemName: 'Github Account Password',
    timestamp: 1700000000000,
    parsedTimestamp: 1700000000000,
    userOrSessionId: 'session_chrome_mac',
    sessionName: 'Work MacBook Pro',
    status: 'success',
    description: 'Created new master password entry with 24-character entropy.',
    isSynced: true,
  };

  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders nothing when entry is null', () => {
    const { container } = render(<ActivityDetailsModal entry={null} onClose={onCloseMock} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders full activity details correctly when entry is provided', () => {
    render(<ActivityDetailsModal entry={mockEntry} onClose={onCloseMock} />);

    // Header and title
    expect(screen.getAllByText('Github Account Password')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Password Created')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Credentials')[0]).toBeInTheDocument();
    expect(screen.getAllByText('success')[0]).toBeInTheDocument();
    expect(screen.getByText(/Synced/i)).toBeInTheDocument();

    // Event summary description
    expect(
      screen.getByText('Created new master password entry with 24-character entropy.'),
    ).toBeInTheDocument();

    // Session and device info
    expect(screen.getByText('Work MacBook Pro')).toBeInTheDocument();
    expect(screen.getByText('session_chrome_mac')).toBeInTheDocument();

    // Event ID
    expect(screen.getByText('activity-uuid-12345')).toBeInTheDocument();
  });

  it('calls onClose when clicking close button', () => {
    render(<ActivityDetailsModal entry={mockEntry} onClose={onCloseMock} />);

    const closeBtn = screen.getByLabelText(/close modal/i);
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when pressing Escape key', () => {
    render(<ActivityDetailsModal entry={mockEntry} onClose={onCloseMock} />);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('toggles raw JSON inspector view', () => {
    render(<ActivityDetailsModal entry={mockEntry} onClose={onCloseMock} />);

    const inspectBtn = screen.getByText(/Telemetry Payload/i);
    fireEvent.click(inspectBtn);

    expect(screen.getByText(/Copy JSON/i)).toBeInTheDocument();
  });
});
