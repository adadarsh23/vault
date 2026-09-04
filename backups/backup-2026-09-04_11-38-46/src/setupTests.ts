import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { installAllTestMocks } from '../tests/setup/mocks/index.ts';

// Disable Framer Motion animations to keep component tests fast and deterministic
MotionGlobalConfig.skipAnimations = true;

// Install modular high-fidelity mocks (Browser, Observers, Canvas)
installAllTestMocks();

// Automated per-test teardown and storage cleanup
afterEach(() => {
  cleanup();

  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.clear();
    } catch {
      // Defensive fallback for environments with locked or disabled storage
    }

    try {
      window.sessionStorage?.clear();
    } catch {
      // Defensive fallback for environments with locked or disabled storage
    }
  }
});
