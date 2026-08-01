/**
 * VaultService public API.
 *
 * Implementation is split across auth/session and vault-item modules while this
 * file preserves the historical import path used by controllers and tests.
 */

export * from './vaultAuthService.ts';
export * from './vaultDataService.ts';
export { logAndEmit } from './vaultService.internal.ts';
