/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Background, Footer, Sidebar, VaultLayout } from '../../src/components/layout';

// Mock stores
const mockFullLogout = vi.fn();
const mockSetTheme = vi.fn();

vi.mock('../../src/store/vaultStore', () => ({
  useVaultStore: (selector: (state: any) => unknown) =>
    selector({
      fullLogout: mockFullLogout,
      preferences: { sidebarPosition: 'left' },
      isUnlocked: true,
      isVaultReady: true,
      isLoading: false,
    }),
}));

vi.mock('../../src/store/themeStore', () => ({
  useThemeStore: () => ({
    theme: 'dark',
    setTheme: mockSetTheme,
  }),
}));

// Mock @tsparticles to prevent canvas/webgl loading in node jsdom
vi.mock('@tsparticles/react', () => ({
  default: () => <div data-testid="particles-mock" />,
  ParticlesProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@tsparticles/slim', () => ({
  loadSlim: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/components/vault/CloudHealthIndicator', () => ({
  CloudHealthIndicator: () => <div data-testid="cloud-health-indicator" />,
}));

describe('Layout Components Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Background', () => {
    it('renders without throwing error and mounts backdrop container', () => {
      const { container } = render(<Background />);
      expect(container.querySelector('.fixed.inset-0')).toBeTruthy();
    });
  });

  describe('Footer', () => {
    it('renders Vault branding and navigation links', () => {
      render(
        <MemoryRouter>
          <Footer />
        </MemoryRouter>,
      );

      expect(screen.getByText('Vault')).toBeTruthy();
      expect(screen.getByText('Contact Us')).toBeTruthy();
      expect(screen.getByText('Privacy Policy')).toBeTruthy();
      expect(screen.getByText('License')).toBeTruthy();
      expect(screen.getByText(/All rights reserved/i)).toBeTruthy();
    });
  });

  describe('Sidebar', () => {
    it('renders navigation categories, theme selector, and handles tab switching', () => {
      const onTabChange = vi.fn();
      render(
        <MemoryRouter>
          <Sidebar activeTab="dashboard" setActiveTab={onTabChange} />
        </MemoryRouter>,
      );

      expect(screen.getByText('Overview')).toBeTruthy();
      expect(screen.getByText('Collections')).toBeTruthy();
      expect(screen.getByText('System')).toBeTruthy();

      const dashboardBtn = screen.getByTitle('Dashboard');
      expect(dashboardBtn).toBeTruthy();
      fireEvent.click(dashboardBtn);
      expect(onTabChange).toHaveBeenCalledWith('dashboard');

      expect(screen.getByTitle('Dark theme')).toBeTruthy();
      expect(screen.getByTitle('Sign Out')).toBeTruthy();
    });

    it('handles theme keyboard navigation via arrow keys', () => {
      render(
        <MemoryRouter>
          <Sidebar activeTab="dashboard" setActiveTab={vi.fn()} />
        </MemoryRouter>,
      );

      const darkRadio = screen.getByRole('radio', { name: /Dark theme/i });
      fireEvent.keyDown(darkRadio, { key: 'ArrowRight' });
      expect(mockSetTheme).toHaveBeenCalledWith('system');
    });

    it('triggers full logout securely when Sign Out button is clicked', async () => {
      render(
        <MemoryRouter>
          <Sidebar activeTab="dashboard" setActiveTab={vi.fn()} />
        </MemoryRouter>,
      );

      const signOutBtn = screen.getByTitle('Sign Out');
      fireEvent.click(signOutBtn);
      await waitFor(() => {
        expect(mockFullLogout).toHaveBeenCalled();
      });
    });
  });

  describe('VaultLayout', () => {
    const mockFolderControls = {
      isAdding: false,
      setIsAdding: vi.fn(),
      newName: '',
      setNewName: vi.fn(),
      editing: null,
      setEditing: vi.fn(),
      editingName: '',
      setEditingName: vi.fn(),
      onCreate: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
    };

    it('renders layout header, folder controls, and children correctly', () => {
      const onSearchChange = vi.fn();
      const onFolderSelect = vi.fn();

      render(
        <VaultLayout
          title="Documents"
          description="Secure document storage"
          itemTypeLabel="Document"
          searchQuery=""
          onSearchChange={onSearchChange}
          folders={['Contracts', 'Receipts']}
          currentFolder={null}
          onFolderSelect={onFolderSelect}
          folderControls={mockFolderControls}
        >
          <div data-testid="vault-child-content">Child vault items</div>
        </VaultLayout>,
      );

      expect(screen.getByText('Documents')).toBeTruthy();
      expect(screen.getByText('Secure document storage')).toBeTruthy();
      expect(screen.getByTestId('vault-child-content')).toBeTruthy();
      expect(screen.getByText('Contracts')).toBeTruthy();
      expect(screen.getByText('Receipts')).toBeTruthy();

      const searchInput = screen.getByLabelText('Search Documents');
      expect(searchInput).toBeTruthy();
      fireEvent.change(searchInput, { target: { value: 'invoice' } });
    });

    it('opens mobile category drawer and allows selecting category to close drawer', () => {
      const onFolderSelect = vi.fn();

      render(
        <VaultLayout
          title="Documents"
          description="Secure document storage"
          itemTypeLabel="Document"
          searchQuery=""
          onSearchChange={vi.fn()}
          folders={['Contracts']}
          currentFolder={null}
          onFolderSelect={onFolderSelect}
          folderControls={mockFolderControls}
        >
          <div>Child</div>
        </VaultLayout>,
      );

      const mobileMenuBtn = screen.getByLabelText('Toggle mobile folders menu');
      fireEvent.click(mobileMenuBtn);

      // Category should be visible in portal drawer
      const contractsPills = screen.getAllByText('Contracts');
      expect(contractsPills.length).toBeGreaterThanOrEqual(1);

      // Clicking folder in mobile drawer triggers onFolderSelect
      fireEvent.click(contractsPills[contractsPills.length - 1]);
      expect(onFolderSelect).toHaveBeenCalledWith('Contracts');
    });
  });
});
