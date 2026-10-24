/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TagBadge, TagManager } from '../TagManager';
import { VaultItem } from '../../../lib/storage';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockUpdateItem = vi.fn();

vi.mock('../../../store/vaultStore', () => ({
  useVaultStore: (selector?: any) => {
    const state = {
      updateItem: mockUpdateItem,
    };
    return selector ? selector(state) : state;
  },
}));

describe('TagBadge Component', () => {
  it('renders tag name with # prefix', () => {
    render(<TagBadge tag="finance" />);
    expect(screen.getByText('finance')).toBeTruthy();
    expect(screen.getByText('#')).toBeTruthy();
  });

  it('renders remove button when onRemove is provided', () => {
    const onRemove = vi.fn();
    render(<TagBadge tag="work" onRemove={onRemove} />);

    const removeBtn = screen.getByRole('button', { name: /Remove tag work/i });
    expect(removeBtn).toBeTruthy();

    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('work');
  });

  it('renders highlighted characters correctly', () => {
    render(<TagBadge tag="secrets" highlightMatches={[0, 1]} />);
    const highlighted = screen.getByText('se');
    expect(highlighted.tagName.toLowerCase()).toBe('mark');
  });
});

describe('TagManager Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders existing tags', () => {
    render(<TagManager tags={['alpha', 'beta']} />);
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
  });

  it('allows adding a new tag via input', async () => {
    const onAddTag = vi.fn().mockResolvedValue(undefined);
    render(<TagManager tags={['alpha']} onAddTag={onAddTag} />);

    const addBtn = screen.getByRole('button', { name: /^Tag$/i });
    fireEvent.click(addBtn);

    const input = screen.getByPlaceholderText('tag...');
    fireEvent.change(input, { target: { value: 'gamma' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onAddTag).toHaveBeenCalledWith('gamma');
    });
  });

  it('cancels adding when Escape is pressed', () => {
    render(<TagManager tags={['alpha']} />);

    const addBtn = screen.getByRole('button', { name: /^Tag$/i });
    fireEvent.click(addBtn);

    const input = screen.getByPlaceholderText('tag...');
    fireEvent.change(input, { target: { value: 'temp' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByPlaceholderText('tag...')).toBeNull();
  });

  it('works seamlessly with VaultItem integration', async () => {
    mockUpdateItem.mockResolvedValue(undefined);
    const mockItem: VaultItem = {
      id: 'item-123',
      type: 'card',
      title: 'Visa Platinum',
      content: 'enc',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        tags: ['credit', 'banking'],
      },
    };

    render(<TagManager item={mockItem} />);

    expect(screen.getByText('credit')).toBeTruthy();
    expect(screen.getByText('banking')).toBeTruthy();

    const removeBtn = screen.getByRole('button', { name: /Remove tag credit/i });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('item-123', {
        metadata: {
          tags: ['banking'],
        },
      });
    });
  });

  it('renders label when showLabel is true', () => {
    render(<TagManager tags={['note-tag']} showLabel label="Tags:" />);
    expect(screen.getByText('Tags:')).toBeTruthy();
  });
});
