/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SecretsVault,
  SECRET_TYPES,
  SECRET_TYPE_CONFIGS,
  getSecretTypeIcon,
} from '../SecretsVault';
import { useVaultStore } from '../../../store/vaultStore';

vi.mock('../../../lib/cryptoPrimitives', async (importOriginal: <T = any>() => Promise<T>) => {
  const actual = (await importOriginal()) as typeof import('../../../lib/cryptoPrimitives');
  return {
    ...actual,
    encryptData: vi.fn().mockImplementation(async (data: string) => `encrypted:${data}`),
    decryptData: vi
      .fn()
      .mockImplementation(async (data: string) => data.replace(/^encrypted:/, '')),
  };
});

vi.mock('../../../lib/activity', () => ({
  logActivity: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('SecretsVault & SecretTypeHorizontalSelector Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      items: [],
      masterKey: {} as CryptoKey,
      isDecoyMode: false,
      pinningItemIds: [],
    });
  });

  describe('Secret Types & Icon Resolvers', () => {
    it('defines standard secret types and configurations', () => {
      expect(SECRET_TYPES).toContain('API Key');
      expect(SECRET_TYPES).toContain('SSH Key');
      expect(SECRET_TYPES).toContain('Recovery Phrase');
      expect(SECRET_TYPES).toContain('Private Key');
      expect(SECRET_TYPES).toContain('Access Token');
      expect(SECRET_TYPES).toContain('Database URL');
      expect(SECRET_TYPES).toContain('Environment Variable');
      expect(SECRET_TYPES).toContain('Other');

      expect(SECRET_TYPE_CONFIGS.length).toBe(SECRET_TYPES.length);
      SECRET_TYPE_CONFIGS.forEach((config) => {
        expect(config).toHaveProperty('type');
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('icon');
        expect(config).toHaveProperty('description');
      });
    });

    it('resolves correct icons based on secret type names', () => {
      expect(getSecretTypeIcon('API Key')).toBeTruthy();
      expect(getSecretTypeIcon('SSH Key')).toBeTruthy();
      expect(getSecretTypeIcon('Recovery Phrase')).toBeTruthy();
      expect(getSecretTypeIcon('Private Key')).toBeTruthy();
      expect(getSecretTypeIcon('Access Token')).toBeTruthy();
      expect(getSecretTypeIcon('Database URL')).toBeTruthy();
      expect(getSecretTypeIcon('Environment Variable')).toBeTruthy();
      expect(getSecretTypeIcon('Custom / Other')).toBeTruthy();
      expect(getSecretTypeIcon(undefined)).toBeTruthy();
    });
  });

  describe('SecretsVault UI & Add Secret Interaction', () => {
    it('renders the Secrets Vault header and Add Secret button', () => {
      render(<SecretsVault />);

      expect(screen.getByRole('heading', { level: 1, name: /Secrets/i })).toBeTruthy();
      expect(screen.getByPlaceholderText(/Search secrets.../i)).toBeTruthy();
      expect(screen.getByText(/No secrets found/i)).toBeTruthy();
    });

    it('opens New Secret form and displays horizontal secret type selector', () => {
      render(<SecretsVault />);

      const addBtn = screen.getAllByRole('button', { name: /Add Secret/i })[0];
      fireEvent.click(addBtn);

      expect(screen.getByText(/New Secret/i)).toBeTruthy();
      expect(screen.getByRole('tablist', { name: /Secret Types/i })).toBeTruthy();

      // Check all secret type tabs are present
      SECRET_TYPE_CONFIGS.forEach((config) => {
        expect(screen.getByRole('tab', { name: new RegExp(config.label, 'i') })).toBeTruthy();
      });
    });

    it('switches active secret type when clicked and shows appropriate description', () => {
      render(<SecretsVault />);

      const addBtn = screen.getAllByRole('button', { name: /Add Secret/i })[0];
      fireEvent.click(addBtn);

      const sshTab = screen.getByRole('tab', { name: /SSH Key/i });
      fireEvent.click(sshTab);

      expect(sshTab.getAttribute('aria-selected')).toBe('true');
      expect(screen.getByPlaceholderText(/SSH private key/i)).toBeTruthy();
    });

    it('shows custom type input when "Custom / Other" type is selected', () => {
      render(<SecretsVault />);

      const addBtn = screen.getAllByRole('button', { name: /Add Secret/i })[0];
      fireEvent.click(addBtn);

      const otherTab = screen.getByRole('tab', { name: /Custom \/ Other/i });
      fireEvent.click(otherTab);

      expect(otherTab.getAttribute('aria-selected')).toBe('true');
      expect(screen.getByPlaceholderText(/Enter custom type label/i)).toBeTruthy();
    });

    it('successfully adds a new secret to the store', async () => {
      const addItemSpy = vi.fn().mockResolvedValue(undefined);
      useVaultStore.setState({ addItem: addItemSpy });

      render(<SecretsVault />);

      const addBtn = screen.getAllByRole('button', { name: /Add Secret/i })[0];
      fireEvent.click(addBtn);

      const nameInput = screen.getByPlaceholderText(/Secret Name/i);
      fireEvent.change(nameInput, { target: { value: 'Production OpenAI Key' } });

      const valueInput = screen.getByPlaceholderText(/Enter API key/i);
      fireEvent.change(valueInput, { target: { value: 'sk-proj-test123456789' } });

      const saveBtn = screen.getByRole('button', { name: /Save Secret/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(addItemSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'secret',
            title: 'Production OpenAI Key',
          }),
        );
      });
    });
  });
});
