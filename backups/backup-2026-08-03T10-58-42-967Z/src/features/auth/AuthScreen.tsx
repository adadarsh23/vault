import React, { memo, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { SecurityLayers } from './SecurityLayers';
import { VaultLoginForm } from './VaultLoginForm';
import { useVaultAuth } from './useVaultAuth';

type AuthStatus = 'idle' | 'authenticating' | 'syncing' | 'success' | 'error';
type AuthMode = 'login' | 'register';

interface AuthScreenProps {
  onGoBack?: () => void;
  initialUsername?: string;
  cloudSessionActive?: boolean;
}

export const AuthScreen: React.FC<AuthScreenProps> = memo(
  ({ onGoBack, initialUsername, cloudSessionActive = false }) => {
    const [authMode, setAuthMode] = useState<AuthMode>(
      initialUsername || cloudSessionActive ? 'login' : 'login'
    );

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

    const resolvedStatus: AuthStatus = status ?? 'idle';

    const content = useMemo(() => {
      switch (resolvedStatus) {
        case 'authenticating':
          return <SecurityLayers layers={securityLayers} currentLayer={currentLayer} />;

        case 'syncing':
          return (
            <SecurityLayers
              layers={securityLayers}
              currentLayer={currentLayer}
              title="Syncing Secure Vault"
              description="Cloud sync is in progress. Please wait while we establish a secure connection."
            />
          );

        case 'success':
          return (
            <AnimatePresence mode="wait">
              <motion.div
                key="verified-screen"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <SecurityLayers
                  layers={securityLayers}
                  currentLayer={securityLayers.length}
                  success
                  title="Verified Access"
                  description="Initial sync completed successfully."
                />
              </motion.div>
            </AnimatePresence>
          );

        case 'error':
          return (
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

        case 'idle':
        default:
          return (
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
      }
    }, [
      resolvedStatus,
      securityLayers,
      currentLayer,
      username,
      accountPassword,
      vaultKey,
      authMode,
      cloudSessionActive,
      onGoBack,
      handleUnlock,
      setVaultKey,
      twoFactorRequired,
      otpToken,
      setOtpToken,
      handleVerifyOTP,
      resetTwoFactorFlow,
    ]);

    return (
      <main
        className="flex min-h-screen w-full items-center justify-center bg-bg px-4 py-8 text-text transition-colors"
        role="main"
        aria-label="Vault Authentication"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={resolvedStatus}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex w-full items-center justify-center"
          >
            {content}
          </motion.div>
        </AnimatePresence>
      </main>
    );
  }
);

AuthScreen.displayName = 'AuthScreen';

export default AuthScreen;
