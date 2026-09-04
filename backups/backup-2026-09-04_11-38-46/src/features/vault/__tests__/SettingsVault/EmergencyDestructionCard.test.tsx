/* @vitest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmergencyDestructionCard } from '../../components/SettingsVault/EmergencyDestructionCard';

describe('EmergencyDestructionCard Component Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Stage 1 (Idle) state with initial warning text', () => {
    render(
      <EmergencyDestructionCard
        destructionStage="idle"
        isDestroyingVault={false}
        onEmergencyClear={vi.fn()}
        onAbort={vi.fn()}
      />,
    );

    expect(screen.getByText('Emergency Destruction')).toBeTruthy();
    expect(screen.getByText('Before You Continue')).toBeTruthy();
    expect(screen.getByRole('button', { name: /destroy vault data/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /abort/i })).toBeNull();
  });

  it('triggers onEmergencyClear to advance to Stage 2 (Confirm) when Stage 1 button is clicked', () => {
    const onEmergencyClearMock = vi.fn().mockResolvedValue(undefined);

    render(
      <EmergencyDestructionCard
        destructionStage="idle"
        isDestroyingVault={false}
        onEmergencyClear={onEmergencyClearMock}
        onAbort={vi.fn()}
      />,
    );

    const destroyButton = screen.getByRole('button', { name: /destroy vault data/i });
    fireEvent.click(destroyButton);

    expect(onEmergencyClearMock).toHaveBeenCalledTimes(1);
  });

  it('renders Stage 2 (Confirm) state and advances to Stage 3 upon clicking initial confirm button', () => {
    const onEmergencyClearMock = vi.fn().mockResolvedValue(undefined);

    render(
      <EmergencyDestructionCard
        destructionStage="confirm"
        isDestroyingVault={false}
        onEmergencyClear={onEmergencyClearMock}
        onAbort={vi.fn()}
      />,
    );

    expect(screen.getByText('Wait - Confirmation Required')).toBeTruthy();
    expect(screen.getByText('Phase 1: Readiness check.')).toBeTruthy();

    const stage2Button = screen.getByRole('button', { name: /confirm: initial step/i });
    fireEvent.click(stage2Button);

    expect(onEmergencyClearMock).toHaveBeenCalledTimes(1);
  });

  it('renders Stage 3 (Final) state and triggers final purge on clicking final confirm button', () => {
    const onEmergencyClearMock = vi.fn().mockResolvedValue(undefined);

    render(
      <EmergencyDestructionCard
        destructionStage="final"
        isDestroyingVault={false}
        onEmergencyClear={onEmergencyClearMock}
        onAbort={vi.fn()}
      />,
    );

    expect(screen.getByText('FINAL OVERRIDE')).toBeTruthy();
    expect(screen.getByText('Phase 2: Final destruction override.')).toBeTruthy();

    const finalButton = screen.getByRole('button', { name: /final confirm: purge everything/i });
    fireEvent.click(finalButton);

    expect(onEmergencyClearMock).toHaveBeenCalledTimes(1);
  });

  it('asserts loading spinner and disabled state during active vault destruction (isDestroyingVault)', () => {
    render(
      <EmergencyDestructionCard
        destructionStage="final"
        isDestroyingVault={true}
        onEmergencyClear={vi.fn()}
        onAbort={vi.fn()}
      />,
    );

    const destroyingButton = screen.getByRole('button', { name: /destroying vault data\.\.\./i });
    expect(destroyingButton.hasAttribute('disabled')).toBe(true);

    const abortButton = screen.getByRole('button', { name: /abort and return to settings/i });
    expect(abortButton.hasAttribute('disabled')).toBe(true);
  });

  it('triggers onAbort callback on clicking "Abort and return to settings" button', () => {
    const onAbortMock = vi.fn();

    render(
      <EmergencyDestructionCard
        destructionStage="confirm"
        isDestroyingVault={false}
        onEmergencyClear={vi.fn()}
        onAbort={onAbortMock}
      />,
    );

    const abortButton = screen.getByRole('button', { name: /abort and return to settings/i });
    fireEvent.click(abortButton);

    expect(onAbortMock).toHaveBeenCalledTimes(1);
  });
});
