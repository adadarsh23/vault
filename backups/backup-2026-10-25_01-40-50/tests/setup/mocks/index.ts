/**
 * Central index exporting all mock polyfills and test behavioral simulators.
 */

import { installBrowserMocks } from './browser.ts';
import { installObserverMocks } from './observers.ts';
import { installCanvasMocks } from './canvas.ts';

export * from './browser.ts';
export * from './observers.ts';
export * from './canvas.ts';

/**
 * Installs all browser, observer, and canvas polyfills into the current test execution environment.
 */
export const installAllTestMocks = (): void => {
  installBrowserMocks();
  installObserverMocks();
  installCanvasMocks();
};
