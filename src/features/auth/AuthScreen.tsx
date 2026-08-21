import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { SecurityLayers } from './SecurityLayers';
import { VaultLoginForm } from './VaultLoginForm';
import { useVaultAuth } from './useVaultAuth';

type AuthMode = 'login' | 'register';

interface AuthScreenProps {
  onGoBack?: () => void;
  initialUsername?: string;
  cloudSessionActive?: boolean;
}

export const AuthScreen = memo(function AuthScreen({
  onGoBack,
  initialUsername,
  cloudSessionActive = false,
}: AuthScreenProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const {
    username,
    setUsername,
    accountPassword,
    setAccountPassword,
    vaultKey,
    setVaultKey,
    status,
    currentLayer,
    securityLayers,
    handleUnlock,
    twoFactorRequired,
    otpToken,
    setOtpToken,
    handleVerifyOTP,
    resetTwoFactorFlow,
  } = useVaultAuth({
    initialUsername,
    cloudSessionActive,
    authMode,
  });

  const loginForm = (
    <VaultLoginForm
      username={username}
      setUsername={setUsername}
      accountPassword={accountPassword}
      setAccountPassword={setAccountPassword}
      vaultKey={vaultKey}
      setVaultKey={setVaultKey}
      onUnlock={handleUnlock}
      onGoBack={onGoBack}
      cloudSessionActive={cloudSessionActive}
      authMode={authMode}
      onAuthModeChange={setAuthMode}
      twoFactorRequired={twoFactorRequired}
      otpToken={otpToken}
      setOtpToken={setOtpToken}
      onVerifyOTP={handleVerifyOTP}
      onBackToCredentials={resetTwoFactorFlow}
    />
  );

  const renderContent = () => {
    switch (status) {
      case 'authenticating':
        return (
          <SecurityLayers
            layers={securityLayers}
            currentLayer={currentLayer}
            status="authenticating"
            mode="security"
          />
        );

      case 'syncing':
        return (
          <SecurityLayers
            layers={securityLayers}
            currentLayer={currentLayer}
            status="syncing"
            mode="sync"
            title="Syncing Secure Vault"
            description="Cloud sync is in progress. Please wait while we establish a secure connection."
          />
        );

      case 'success':
        return (
          <SecurityLayers
            layers={securityLayers}
            currentLayer={securityLayers.length}
            status="success"
            success
            title="Verified Access"
            description="Initial sync completed successfully."
            successTitle="Verified Access"
            successMessage="Initial sync completed successfully."
          />
        );

      case 'error':
      case 'idle':
      default:
        return loginForm;
    }
  };

  return (
    <main
      className="flex min-h-screen w-full items-center justify-center bg-bg px-4 py-8 text-text transition-colors"
      aria-label="Vault Authentication"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={status}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex w-full items-center justify-center"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </main>
  );
});

AuthScreen.displayName = 'AuthScreen';

export default AuthScreen;
