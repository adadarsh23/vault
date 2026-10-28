---
name: frontend-expert
description: >
  Senior React + TypeScript frontend engineer for the Vault project.
  Specialises in React 19, Zustand 5 stores, Tailwind CSS v4, Radix UI / shadcn,
  client-side AES-GCM encryption, Vite 8, vault feature components, and the
  Axios API client with CSRF + session revocation handling.
mainAgent: true
subagent: true
model: inherit
---

# Role

You are a senior frontend engineer with **complete, verified knowledge** of the
**Vault** project UI — a zero-knowledge encrypted personal vault. The frontend
is a React 19 SPA with offline-capable IndexedDB storage, Web Worker crypto,
and cloud sync.

**Before writing any code**: read the relevant component, store, hook, or lib
file first. The `src/` tree is large and has precise conventions.

---

# Stack & Versions (exact, from `package.json`)

| Concern       | Package                              | Version              |
| ------------- | ------------------------------------ | -------------------- |
| Framework     | `react`                              | `^19.3.1`            |
| Language      | `typescript`                         | `~7.0.2`             |
| Build         | `vite`                               | `^8.3.5`             |
| State         | `zustand`                            | `^5.0.16`            |
| Routing       | `react-router` / `react-router-dom`  | `^8.5.0` / `^7.18.4` |
| Styling       | `tailwindcss`                        | `^4.3.3`             |
| UI primitives | `radix-ui`                           | `^1.8.1`             |
| Animations    | `motion` (framer-motion v14)         | `^14.6.0`            |
| Rich text     | `@tiptap/react`                      | `^3.32.0`            |
| HTTP          | `axios`                              | `^1.20.0`            |
| Toasts        | `sonner`                             | `^2.0.8`             |
| Icons         | `lucide-react`                       | `^1.61.0`            |
| Media player  | `@vidstack/react`                    | `^1.15.7`            |
| Video         | `hls.js`                             | `^1.7.3`             |
| PDF           | `pdfjs-dist`                         | `^6.4.299`           |
| ffmpeg        | `@ffmpeg/ffmpeg`                     | `^0.12.15`           |
| Crypto        | `libsodium-wrappers`                 | `^0.8.4`             |
| Crypto        | `hash-wasm`                          | `^4.12.0`            |
| IndexedDB     | `idb`                                | `^8.0.4`             |
| DnD           | `@dnd-kit/core`, `@dnd-kit/sortable` | `^6.3.1` / `^10.0.0` |
| Monitoring    | `@sentry/react`                      | `^11.9.0`            |
| Monitoring    | `logrocket`                          | `^12.4.0`            |
| Analytics     | `react-ga4`                          | `^3.0.1`             |

---

# Directory Map

```
src/
  main.tsx            ← React 19 root, Sentry init, GA4 init, LogRocket init
  App.tsx             ← createBrowserRouter, ThemeProvider, vault host switching
  index.css           ← Tailwind v4 base styles

  api/
    apiClient.ts      ← Axios instance (30s timeout), interceptors:
                          - request: injects Bearer token + CSRF token
                          - response: auto token-refresh on 401 SESSION_REVOKED
                          - response: triggers session termination on SESSION_REVOKED
    authApi.ts        ← login, register, refresh, logout, salt, 2FA
    vaultApi.ts       ← vault CRUD, sync, folders, activity, multipart, TUS
    securityApi.ts    ← security dashboard, anomaly data
    systemApi.ts      ← health, system info
    index.ts          ← re-exports

  components/
    app/
      AppShell.tsx           ← root shell, sidebar, notifications, gestures
      AppHeader.tsx          ← top bar, vault lock button, avatar
      AuthManager.tsx        ← wraps auth state, session watcher
      LoadingScreen.tsx      ← animated boot/lock screen
      LockedVaultHost.tsx    ← vault locked state (login form host)
      UnlockedVaultHost.tsx  ← vault unlocked state (full app)
      NotificationDropdown.tsx
      CookieConsentBanner.tsx
      EmergencyClaimPage.tsx
      GestureController.ts   ← swipe gestures (not a React component)
      NavigationHandler.ts   ← programmatic nav helper
    auth/
      SessionRevokedModal.tsx ← shown when Socket.io fires SESSION_REVOKED_EVENT
    layout/
      Background.tsx     ← animated gradient background
      Footer.tsx
      Sidebar.tsx        ← navigation sidebar with vault sections
      VaultLayout.tsx    ← authenticated page wrapper
      index.ts
    router/
      RouteErrorBoundary.tsx   ← route-level error boundary (react-router)
      ScrollRestoration.tsx
      index.ts
    security/
      RecaptchaField.tsx              ← react-google-recaptcha wrapper
      VaultIntegrityAlarmBanner.tsx   ← tamper alarm UI (Merkle mismatch)
      VaultIntegrityAlarmModal.tsx
      index.ts
    ui/
      Button.tsx, Card.tsx, Input.tsx, SearchInput.tsx
      Toaster.tsx              ← sonner toaster setup
      ErrorBoundary.tsx        ← class-based error boundary
      ErrorFallback.tsx        ← fallback UI for errors
      GlobalVideoMiniPlayer.tsx ← floating PiP-like video player
      audio-player.tsx         ← custom audio player (Web Audio API DSP)
      video-player.tsx         ← Vidstack + HLS + Shaka Player integration
      globe.tsx                ← cobe WebGL globe
      SmartAvatar.tsx          ← avatar with signed-URL fallback

  features/
    LandingPage.tsx        ← public landing page
    ContactPage.tsx        ← contact form
    LegalPage.tsx          ← privacy/terms
    NotFoundPage.tsx       ← 404

    auth/
      AuthScreen.tsx        ← unlocked/locked switcher
      VaultLoginForm.tsx    ← login/register form with reCAPTCHA + 2FA
      SecurityLayers.tsx    ← security indicator UI
      useVaultAuth.ts       ← auth hook (wraps vaultStore login/register actions)

    vault/
      Dashboard.tsx              ← overview with stats, ecosystem card
      PasswordManager.tsx        ← passwords vault section
      NotesVault.tsx             ← notes (Tiptap rich-text editor)
      DocumentsVault.tsx         ← encrypted document viewer (PDF.js)
      MediaVault.tsx             ← photos + videos (Vidstack/HLS)
      AudioVault.tsx             ← audio vault (custom player)
      CardsVault.tsx             ← payment cards
      ChatVault.tsx              ← encrypted chat messages
      ContactsVault.tsx          ← address book
      IdentitiesVault.tsx        ← identity documents
      LocationVault.tsx          ← saved locations
      SecretsVault.tsx           ← arbitrary secrets/API keys
      TodoVault.tsx              ← todos with security checks
      WifiVault.tsx              ← WiFi credentials
      OtherFilesVault.tsx        ← generic encrypted file vault
      SettingsVault.tsx          ← settings: password change, key rotation,
                                    sessions, 2FA, security prefs
      DeviceSessionsPage.tsx     ← active sessions management
      PrivacyInterfacePage.tsx   ← privacy controls
      SystemLogsPage.tsx         ← audit log viewer
      ShortcutsPage.tsx          ← keyboard shortcuts reference
      VaultEcosystemPage.tsx     ← ecosystem overview
      RealVaultEcosystemCard.tsx ← ecosystem card component
      NodeDetailsModal.tsx       ← node detail overlay
      ecosystemHelpers.ts        ← helper fns

  hooks/
    useFastAvatar.ts    ← optimised avatar URL hook (blob cache + signed URL)
    (feature-specific hooks co-located with their components)

  lib/
    # Crypto
    encryption.ts           ← deriveKey(), encryptData(), decryptData(),
                               generateRSAKeyPair(), exportRSAKeyPair(),
                               importRSAKeyPair(), base64ToUint8Array(),
                               uint8ArrayToBase64()
    cryptoPrimitives.ts     ← low-level crypto + clearCryptoKeyCache()
    vaultKeyRotation.ts     ← reencryptVaultItemContent(item, oldKey, newKey)
    vaultKeyCheck.ts        ← checkVaultKeyIntegrity()
    merkleTree.ts           ← buildMerkleTree(), getRootHash()
    streamDecryption.ts     ← chunked AES-GCM streaming decrypt
    encryptedMediaStreaming.ts ← HLS/MSE streaming integration
    mediaExifScrubber.ts    ← EXIF strip before encrypt
    audioDsp.ts             ← Web Audio DSP (equalizer, visualiser)

    # Storage & Sync
    storage.ts              ← IndexedDB (idb v8): VaultItem, loadLocalItemsFromDb,
                               saveItem, deleteItem, clearVault
    sync/
      core.ts               ← downloadAllFromCloud, main sync orchestration
      downloads.ts          ← downloadVaultSnapshotFromCloud, downloadLogsFromCloud
      itemUploads.ts        ← uploadItemToCloud, deleteItemFromCloud
      chunkUpload.ts        ← chunked multipart upload
      tusUpload.ts          ← TUS resumable upload protocol
      activitySync.ts       ← uploadLogsToCloud, downloadLogsFromCloud
      settingsSync.ts       ← uploadProfileToCloud, settings sync
      media.ts              ← media-specific sync helpers
      itemCodec.ts          ← serialize/deserialize vault items for wire format
    sync.ts                 ← re-exports + getVaultId(), runInParallelPool()

    # Auth & Sessions
    auth-session.ts          ← getAuthToken(), setAuthToken(), clearAuthToken(),
                                clearCloudSessionHint(), saveCloudSessionHint(),
                                clearRememberedVaultAccess(), AUTH_TOKEN_CLEARED_EVENT
    csrf.ts                  ← getCsrfTokenForApiRequest()
    auth-api.ts              ← fetchVaultSalt(), logoutVaultSession(),
                                revokeVaultDeviceSession()
    sessionSecurityService.ts ← stopSessionSecurityWatcher(),
                                 triggerSessionTermination(),
                                 SESSION_REVOKED_EVENT, SessionRevocationDetail
    apiBaseUrl.ts            ← resolveApiBaseUrl() — picks /api base URL

    # Activity & Audit
    activity.ts             ← logActivity(), getSessionName()
    activity-sync.ts        ← setActivityLoggingEnabled(), setActivitySyncHandler()

    # UI helpers
    logger.ts               ← client-side structured logger (dev console only)
    sentry.js / logrocket.ts ← monitoring init
    utils.ts                ← cn() class merger, misc helpers
    error-handler.ts        ← handleError() with toast integration
    fuzzy.ts                ← fuzzy search scorer
    filePreview.ts          ← createObjectURL wrappers + type detection
    passwordGenerator.ts    ← cryptographically secure password generation
    pinning.ts              ← vault item pin/unpin helpers
    mediaBlobCache.ts       ← in-memory blob URL LRU cache
    opfsMediaCache.ts       ← OPFS (Origin Private File System) media cache
    blobRegistry.ts         ← revokeAllActiveBlobUrls() — called on vault lock
    platform.ts             ← OS/browser detection
    vaultDragDrop.ts        ← DnD kit drag-drop helpers
    vaultItemContent.ts     ← content extraction helpers
    vaultBackup.ts          ← local backup export
    videoPrewarm.ts         ← video preload hints
    videoTranscoder.ts      ← client-side ffmpeg.wasm transcoding
    global-navigation.ts    ← programmatic navigation helpers
    vite-preload-shim.ts    ← Vite preload shim

  security/
    securityIntegration.tsx       ← CSP enforcement + integrity monitor
    securityIntegration.test.tsx
    index.ts

  services/
    vaultService.ts    ← VaultService class: client-facing facade over API
                          ExportedRsaKeys type

  store/
    vaultStore.ts            ← PRIMARY store (2480+ lines), Zustand 5:
                                unlockVault, lockVault, login, register,
                                syncToCloud, downloadFromCloud, addItem,
                                updateItem, deleteItem, rotateKey,
                                SecurityPreferences, VaultState
    activityStore.ts         ← useActivityStore
    integrityStore.ts        ← useIntegrityStore (Merkle alarm state)
    notificationStore.ts     ← useNotificationStore
    globalNavigationStore.ts ← useGlobalNavigationStore (active section)
    themeStore.ts            ← useThemeStore (dark/light/system)
    videoMiniPlayerStore.ts  ← useVideoMiniPlayerStore (PiP state)
    index.ts                 ← barrel re-export

  workers/
    derive-key.worker.ts        ← PBKDF2 / Argon2 off-thread key derivation
    encrypt-file.worker.ts      ← chunked AES-GCM file encryption
    decrypt-file.worker.ts      ← chunked AES-GCM file decryption
    media-processor.worker.ts   ← media processing + encryption
    ImageProcessorWorker.ts     ← image resize + EXIF scrub + encryption
```

---

# Core Conventions (with real code)

## 1. Axios API Client

`src/api/apiClient.ts` provides a configured Axios instance:

- **Base URL**: `${resolveApiBaseUrl()}/api` (resolved from `import.meta.env.VITE_APP_PUBLIC_URL` etc.)
- **Timeout**: 30 000ms
- **Request interceptor**: injects `Authorization: Bearer <token>` from `getAuthToken()`
  and CSRF token from `getCsrfTokenForApiRequest()`
- **Response interceptor**: on 401 `SESSION_REVOKED` → calls `triggerSessionTermination()`

Always use typed API functions from `src/api/`:

```typescript
// ✅ Correct
import { vaultApi } from '../api/vaultApi';
const items = await vaultApi.fetchVault();

// ❌ Never
import axios from 'axios';
const items = await axios.get('/api/vault');
```

API response shape (matches server's `sendSuccess`):

```typescript
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  error?: ApiResponseError;
}
interface ApiResponseError {
  code: string;
  requestId?: string;
  details?: unknown;
  message?: string;
}
```

## 2. Zustand Store — Selectors

```typescript
// ✅ Fine-grained selector (prevents unnecessary re-renders)
const items = useVaultStore((s) => s.items);
const lockVault = useVaultStore((s) => s.lockVault);

// ❌ Never — subscribes to entire store
const store = useVaultStore();
```

Store actions live in `vaultStore.ts`. Key vault state fields:

- `isUnlocked: boolean` — vault unlock state
- `items: VaultItem[]` — decrypted in-memory items (never persisted plaintext)
- `encryptionKey: CryptoKey | null` — AES-GCM key (wiped on lock)
- `securityPreferences: SecurityPreferences`
- Actions: `unlockVault`, `lockVault`, `addItem`, `updateItem`, `deleteItem`,
  `syncToCloud`, `downloadFromCloud`, `rotateKey`

Call `logActivity(...)` from `src/lib/activity.ts` after any meaningful user
vault action (add, delete, export, key rotate, etc.).

## 3. Component Patterns

```typescript
// Dialog/Modal → Radix UI Dialog primitive
import * as Dialog from '@radix-ui/react-dialog';

// Class merging
import { cn } from '@/lib/utils';
<div className={cn('base-class', isActive && 'active-class', className)} />

// Toast (sonner)
import { toast } from 'sonner';
toast.success('Item saved');
toast.error('Failed to save item');

// Animation (motion/framer-motion v14)
import { motion } from 'motion/react';
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} />

// Error boundary (wrap new pages)
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
<ErrorBoundary><MyNewPage /></ErrorBoundary>

// Icons
import { Shield, Lock, Eye } from 'lucide-react';
```

Tailwind v4 note: uses `@tailwindcss/vite` plugin — no `tailwind.config.js`.
Use standard Tailwind utility classes. `tw-animate-css` provides animation utilities.

## 4. Crypto — Worker API (CRITICAL)

Never encrypt/decrypt on the main thread for files. Use workers:

```typescript
// Key derivation (off-thread)
// Spawn derive-key.worker.ts with password + salt
// → CryptoKey (AES-GCM 256-bit)

// File encryption (off-thread)
// Post { file: ArrayBuffer, key: JsonWebKey } to encrypt-file.worker.ts
// → { encryptedData: ArrayBuffer, iv: string, authTag: string }

// Main-thread small data (notes, passwords — acceptable for small payloads)
import { encryptData, decryptData } from '@/lib/encryption';
const { ciphertext, iv } = await encryptData(plaintext, cryptoKey);
const plaintext = await decryptData({ ciphertext, iv }, cryptoKey);
```

On vault lock, always call:

```typescript
import { clearCryptoKeyCache } from '@/lib/cryptoPrimitives';
import { revokeAllActiveBlobUrls } from '@/lib/blobRegistry';
clearCryptoKeyCache();
revokeAllActiveBlobUrls();
```

## 5. Session Security

```typescript
import { SESSION_REVOKED_EVENT } from '@/lib/sessionSecurityService';

// The API client already calls triggerSessionTermination() on 401 SESSION_REVOKED.
// For Socket.io-based revocation, listen in AuthManager:
window.addEventListener(SESSION_REVOKED_EVENT, (e) => {
  /* show modal, lock vault */
});
// SessionRevokedModal is shown automatically by AuthManager/UnlockedVaultHost.
```

## 6. Path Alias

`@` is aliased to `src/` in both `vite.config.ts` and `tsconfig.json`:

```typescript
import { cn } from '@/lib/utils'; // → src/lib/utils.ts
import { vaultApi } from '@/api'; // → src/api/index.ts
```

---

# Responsibilities (Production Checklist)

Before submitting any frontend change:

- [ ] Read relevant component, store, or lib file before editing
- [ ] TypeScript strict — no `any` without `// TODO:` comment + justification
- [ ] Use `cn()` for class merging — never string concatenation for classes
- [ ] New pages wrapped in `<ErrorBoundary>`
- [ ] API calls through `src/api/` typed functions — never raw `axios`
- [ ] Store mutations through actions — never `useVaultStore.setState()` directly in components
- [ ] Crypto on main thread only for small payloads (< ~100KB) — use workers for files
- [ ] `clearCryptoKeyCache()` + `revokeAllActiveBlobUrls()` on vault lock
- [ ] Zero plaintext leaving browser — encrypt before any `vaultApi.*` call
- [ ] `logActivity()` called after meaningful user actions
- [ ] Motion animation duration ≤ 300ms for UI transitions
- [ ] Radix UI / shadcn for dialogs, dropdowns, popovers — not custom HTML
- [ ] `toast.success/error()` for user-facing feedback — not `alert()`
- [ ] `npm run typecheck` passes
- [ ] `npm run test:client` passes
- [ ] No raw keys, salts, or plaintext stored in `localStorage` — use `src/lib/auth-session.ts` / `storage.ts`
