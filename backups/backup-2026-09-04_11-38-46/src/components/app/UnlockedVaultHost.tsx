import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useInactivity } from '../../hooks/useInactivity';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { useVaultStore } from '../../store/vaultStore';
import { AppShell } from './AppShell';
import { useGestureController } from './GestureController';
import { useNavigationHandler } from './NavigationHandler';
import { AutoLockCountdownOverlay } from '../vault/AutoLockCountdownOverlay';

type MaintenanceType = 'export' | 'import' | 'changeKey' | 'changePassword';

type MaintenanceState = { isOpen: false } | { isOpen: true; type: MaintenanceType };

export function UnlockedVaultHost({ shouldReduceMotion }: { shouldReduceMotion: boolean }) {
  const {
    isVaultReady,
    lock,
    isAutoLockEnabled,
    autoLockDuration,
    isBlurOnTabHideEnabled,
    isLockOnTabHideEnabled,
  } = useVaultStore(
    useShallow((state) => ({
      isVaultReady: state.isVaultReady,
      lock: state.lock,
      isAutoLockEnabled: state.preferences.isAutoLockEnabled,
      autoLockDuration: state.preferences.autoLockDuration,
      isBlurOnTabHideEnabled: state.preferences.isBlurOnTabHideEnabled,
      isLockOnTabHideEnabled: state.preferences.isLockOnTabHideEnabled,
    })),
  );

  const navigation = useNavigationHandler();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [maintenanceModal, setMaintenanceModal] = useState<MaintenanceState>({
    isOpen: false,
  });

  const gestureController = useGestureController({
    isSidebarOpen,
    setIsSidebarOpen,
    locationPath: navigation.location.pathname,
  });

  const { isInactive, setIsInactive, countdownSeconds, resetTimer } = useInactivity({
    isUnlocked: isVaultReady,
    isAutoLockEnabled,
    autoLockDuration,
    isBlurOnTabHideEnabled,
    isLockOnTabHideEnabled,
    lock,
  });

  useEffect(() => {
    if (!isVaultReady) {
      setMaintenanceModal({ isOpen: false });
      setIsSidebarOpen(false);
    }
  }, [isVaultReady]);

  const openMaintenance = useCallback((type: MaintenanceType) => {
    setMaintenanceModal({ isOpen: true, type });
  }, []);

  const closeMaintenance = useCallback(() => {
    setMaintenanceModal({ isOpen: false });
  }, []);

  const activePath = navigation.location.pathname;
  const activeTabLabel =
    navigation.activeTab === 'dashboard'
      ? 'Dashboard'
      : `${navigation.activeTab.charAt(0).toUpperCase()}${navigation.activeTab.slice(1)}`;

  useDocumentMeta({
    title: `Vault - ${activeTabLabel}`,
    description: `Securely manage your ${activeTabLabel.toLowerCase()} in Vault.`,
    path: activePath,
  });

  return (
    <>
      <AppShell
        activeTab={navigation.activeTab}
        handleMobileTouchEnd={gestureController.handleMobileTouchEnd}
        handleMobileTouchMove={gestureController.handleMobileTouchMove}
        handleMobileTouchStart={gestureController.handleMobileTouchStart}
        isBlurOnTabHideEnabled={isBlurOnTabHideEnabled}
        isInactive={isInactive}
        isSidebarDragging={gestureController.isSidebarDragging}
        isSidebarOpen={isSidebarOpen}
        locationPath={navigation.location.pathname}
        maintenanceModal={maintenanceModal}
        mobileOverlayOpacity={gestureController.mobileOverlayOpacity}
        mobileSidebarTransform={gestureController.mobileSidebarTransform}
        navigateToTab={navigation.navigateToTab}
        onCloseMaintenance={closeMaintenance}
        onOpenMaintenance={openMaintenance}
        resetSidebarGesture={gestureController.resetSidebarGesture}
        safeNavigateToTab={navigation.safeNavigateToTab}
        setIsInactive={setIsInactive}
        setIsSidebarOpen={setIsSidebarOpen}
        shouldReduceMotion={shouldReduceMotion}
        showMobileOverlay={gestureController.showMobileOverlay}
      />
      <AutoLockCountdownOverlay
        countdownSeconds={countdownSeconds ?? null}
        resetTimer={resetTimer}
      />
    </>
  );
}
