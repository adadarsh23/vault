import { useLocation } from 'react-router-dom';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { useAuthManager, AuthManager } from './AuthManager';
import { LoadingScreen } from './LoadingScreen';
import { ErrorBoundary } from '../ui/ErrorBoundary';

const PUBLIC_ROUTE_META: Record<
  string,
  {
    title: string;
    description: string;
  }
> = {
  '/': {
    title: 'Vault - Secure Storage',
    description:
      'Securely store your files, notes, and sensitive data with end-to-end peace of mind.',
  },
  '/legal': {
    title: 'Vault - Legal',
    description: 'Review legal terms, privacy policies, and security commitments for Vault.',
  },
  '/contact': {
    title: 'Vault - Contact',
    description: 'Reach the Vault team for support, feedback, and security-related questions.',
  },
  '/emergency-claim': {
    title: 'Vault - Emergency Access',
    description: 'Initiate or monitor emergency contact vault recovery and timelocks.',
  },
};

const resolvePublicRouteMeta = (pathname: string) =>
  PUBLIC_ROUTE_META[pathname] ?? PUBLIC_ROUTE_META['/'];

export function LockedVaultHost({
  shouldReduceMotion: _shouldReduceMotion,
}: {
  shouldReduceMotion: boolean;
}) {
  const authManager = useAuthManager();
  const location = useLocation();
  const meta = resolvePublicRouteMeta(location.pathname);

  useDocumentMeta({
    title: meta.title,
    description: meta.description,
    path: location.pathname,
  });

  if (authManager.isRestoringSession) {
    return <LoadingScreen label="Checking vault session..." fullscreen />;
  }

  return (
    <ErrorBoundary>
      <AuthManager
        cloudSessionActive={authManager.hasCloudSession}
        initialUsername={authManager.restoredUsername}
        onEnterVault={() => authManager.setShowLanding(false)}
        onGoBack={() => {
          if (authManager.hasCloudSession) {
            void authManager.handleSignOut();
          } else {
            authManager.setShowLanding(true);
          }
        }}
        showLanding={authManager.showLanding}
      />
    </ErrorBoundary>
  );
}
