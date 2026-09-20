# 🧪 Vault Test Suite Reference Guide

<p align="left">
  <a href="./README.md">← Back to Main README</a> •
  <a href="#-quick-reference-cheat-sheet">Quick Reference</a> •
  <a href="#3-main--all-in-one-test-suites-npm">Main npm Suites</a> •
  <a href="#1-run-a-single-test-file-isolated-execution">Isolated Tests</a> •
  <a href="#8-test-runner-modes--debugging-options">Debugging Modes</a> •
  <a href="#13-drag--drop--deep-test-commands">Drag & Drop</a> •
  <a href="#19-complete-npm-script-reference-table">Full Reference Table</a> •
  <a href="#27-cross-platform-shell-execution--syntax-windows-powershell-cmd-bash-zsh">Cross-Platform Guide</a> •
  <a href="#30-test-troubleshooting--common-errors--immediate-fixes">Troubleshooting</a> •
  <a href="#31-stress-testing-repeat--race-condition-detection">Stress Testing</a> •
  <a href="#33-local-ci-simulation--pre-commit--pre-push-workflows">CI Simulation</a>
</p>

Comprehensive cheat sheet and execution manual for **every** Vitest, standalone, and npm command across the Vault repository — covering **97 test files** (57 unit, 4 integration, 36 component/feature), **67 npm test scripts**, all build/clean/deploy pipelines, diagnostics, performance tooling, and cross-device verification procedures.

---

## ⚡ Quick Reference Cheat Sheet

| Category / Target        | Command                                                                                                  | Description                                     |
| :----------------------- | :------------------------------------------------------------------------------------------------------- | :---------------------------------------------- |
| **Default Safe Run**     | `npm test`                                                                                               | Single-worker Vitest run (`--maxWorkers 1`)     |
| **Parallel Fast Run**    | `npm run test:run`                                                                                       | Full suite across all CPU workers               |
| **Full Runner + Lint**   | `npm run test:all`                                                                                       | Lint + Vitest + custom crypto runner            |
| **CI Strict Test**       | `npm run test:ci`                                                                                        | Lint + Vitest --no-cache                        |
| **Unit Tests**           | `npm run test:unit`                                                                                      | All 57 unit tests in `tests/unit/`              |
| **Integration Tests**    | `npm run test:integration`                                                                               | All 4 integration tests in `tests/integration/` |
| **Client Source Tests**  | `npm run test:client`                                                                                    | All 36 component and lib tests in `src/`        |
| **Server Tests**         | `npm run test:server`                                                                                    | Backend unit and integration                    |
| **Component Tests**      | `npm run test:components`                                                                                | All React UI component specs (`*.test.tsx`)     |
| **Cryptography Suite**   | `npm run test:crypto`                                                                                    | AES-256-GCM, PQC Kyber, KDF & Key Rotation      |
| **Authentication Suite** | `npm run test:auth`                                                                                      | Login, Register, Session & Token Revocation     |
| **Hardened 2FA & Bot**   | `npx vitest run tests/unit/recaptchaMiddleware.test.ts tests/unit/two-factor-hardening.test.ts`          | 2FA rate limits, password checks & reCAPTCHA    |
| **Security Boundaries**  | `npm run test:security`                                                                                  | Auth, Multipart, Streaming & UI Isolation       |
| **Cloud Sync & Stores**  | `npm run test:sync`                                                                                      | Delta sync, conflict handling & state integrity |
| **Media & Streaming**    | `npm run test:media`                                                                                     | HLS player, capture modal, video streaming      |
| **Mini-Player Suite**    | `npx vitest run src/components/ui/GlobalVideoMiniPlayer.test.tsx src/store/videoMiniPlayerStore.test.ts` | Picture-in-picture floating video & store       |
| **Mobile PDF & Docs**    | `npx vitest run tests/unit/mobile-pdf-document-handling.test.tsx`                                        | Mobile PDF rendering, anti-screenshot shield    |
| **Interactive UI**       | `npm run test:ui`                                                                                        | Vitest browser dashboard GUI                    |
| **Code Coverage**        | `npm run test:coverage:open`                                                                             | Generate coverage and open in browser           |
| **Watch Mode**           | `npm run test:watch`                                                                                     | Auto re-run on file change                      |
| **Fast Fail**            | `npm run test:fast`                                                                                      | Stop on first failure                           |
| **Heap Tracking**        | `npm run test:heap`                                                                                      | Memory/heap usage per test file                 |
| **Node Inspector**       | `npm run test:debug:brk`                                                                                 | Attach Chrome DevTools or VS Code               |
| **Typecheck Tests**      | `npx vitest typecheck`                                                                                   | Typecheck TypeScript test files                 |
| **Stress Repeat**        | `npm run test:repeat 5`                                                                                  | Run test suite 5 times sequentially             |
| **Quick Verify**         | `npm run verify:quick`                                                                                   | Lint + Auth tests                               |
| **Full CI Verify**       | `npm run verify:ci`                                                                                      | Doctor + Lint + CI tests + Build                |
| **Local CI Simulation**  | `$env:CI="true"; npm run verify:ci`                                                                      | Replay strict CI pipeline locally               |
| **Complete Audit**       | `npm run verify:full`                                                                                    | Clean all + Doctor + Verify + All Tests         |

---

## Table of Contents

- [⚡ Quick Reference Cheat Sheet](#-quick-reference-cheat-sheet)
- [1. Run a Single Test File — Isolated Execution](#1-run-a-single-test-file--isolated-execution)
  - [1.1 Integration Tests](#11-integration-tests-testsintegration)
  - [1.2 Unit — Cryptography, Keys & ZK Security](#12-unit--cryptography-keys--zk-security)
  - [1.3 Unit — Authentication, Sessions & Identity](#13-unit--authentication-sessions--identity)
  - [1.4 Unit — Cloud Sync, Storage & Networking](#14-unit--cloud-sync-storage--networking)
  - [1.5 Unit — Vault Core, UI State, Utilities & Monitoring](#15-unit--vault-core-ui-state-utilities--monitoring)
  - [1.6 Source — Components & Features (src/)](#16-source--components--features-src)
  - [1.7 Source — Hooks, Lib & Security (src/)](#17-source--hooks-lib--security-src)
- [2. Domain-Specific Batch Suites — Direct Vitest](#2-domain-specific-batch-suites--direct-vitest)
- [3. Main & All-in-One Test Suites (npm)](#3-main--all-in-one-test-suites-npm)
- [4. Authentication & Session Security (npm)](#4-authentication--session-security-npm)
- [5. Cryptography, Zero-Knowledge & Key Management (npm)](#5-cryptography-zero-knowledge--key-management-npm)
- [6. Comprehensive Security Integration (npm)](#6-comprehensive-security-integration-npm)
- [7. Feature & Module Tests (npm)](#7-feature--module-tests-npm)
- [8. Test Runner Modes & Debugging Options](#8-test-runner-modes--debugging-options)
- [9. Test Watch Modes](#9-test-watch-modes)
- [10. Code Coverage & Reports](#10-code-coverage--reports)
- [11. Advanced Vitest Filtering & CLI Flags](#11-advanced-vitest-filtering--cli-flags)
- [12. Standalone Runner & Verification Pipelines](#12-standalone-runner--verification-pipelines)
- [13. Drag & Drop — Deep Test Commands](#13-drag--drop--deep-test-commands)
- [14. Type Checking & Linting](#14-type-checking--linting)
- [15. Code Formatting](#15-code-formatting)
- [16. Development Servers](#16-development-servers)
- [17. Build Commands](#17-build-commands)
- [18. Clean & Maintenance Commands](#18-clean--maintenance-commands)
- [19. Complete npm Script Reference Table](#19-complete-npm-script-reference-table)
- [20. Performance, Lighthouse & Reporting](#20-performance-lighthouse--reporting)
- [21. Database, Infrastructure & Diagnostics](#21-database-infrastructure--diagnostics)
- [22. Security & Key Management Operations](#22-security--key-management-operations)
- [23. Dependency & Package Management](#23-dependency--package-management)
- [24. Memory Index & Code Intelligence](#24-memory-index--code-intelligence)
- [25. Production Packaging & Deployment](#25-production-packaging--deployment)
- [26. Cross-Device Manual Verification Checklist](#26-cross-device-manual-verification-checklist)
- [27. Cross-Platform Shell Execution & Syntax (Windows PowerShell, CMD, Bash, Zsh)](#27-cross-platform-shell-execution--syntax-windows-powershell-cmd-bash-zsh)
- [28. Passing Arguments to npm Test Scripts (-- Forwarding Guide)](#28-passing-arguments-to-npm-test-scripts---forwarding-guide)
- [29. Interactive Vitest Watch Mode Controls](#29-interactive-vitest-watch-mode-controls)
- [30. Test Troubleshooting — Common Errors & Immediate Fixes](#30-test-troubleshooting--common-errors--immediate-fixes)
- [31. Stress Testing, Repeat & Race-Condition Detection](#31-stress-testing-repeat--race-condition-detection)
- [32. Mock Registry Verification & Test Harness Diagnostics](#32-mock-registry-verification--test-harness-diagnostics)
- [33. Local CI Simulation & Pre-Commit / Pre-Push Workflows](#33-local-ci-simulation--pre-commit--pre-push-workflows)
- [34. Network, REST API & Supertest Backend Commands](#34-network-rest-api--supertest-backend-commands)

---

## 1. Run a Single Test File — Isolated Execution

Run any individual test file directly with `npx vitest run <path>`.

### 1.1 Integration Tests (`tests/integration/`)

```bash
# Authentication security perimeter (JWT bypass, CSRF, session hijacking)
npx vitest run tests/integration/auth-security.test.ts

# Full auth flow — login, register, session rotation, refresh tokens
npx vitest run tests/integration/auth.integration.test.ts

# Multipart upload encryption and abuse prevention
npx vitest run tests/integration/multipart-security.test.ts

# Media streaming access control and DRM boundaries
npx vitest run tests/integration/streaming-security.test.ts
```

### 1.2 Unit — Cryptography, Keys & ZK Security

```bash
# AES-256-GCM client-side encryption / decryption
npx vitest run tests/unit/encryption.test.ts

# Server-side HKDF, 2FA TOTP seed derivation
npx vitest run tests/unit/server-crypto.test.ts

# Envelope encryption (KEK wrapping DEK)
npx vitest run tests/unit/envelope-encryption.test.ts

# Per-session, per-profile AES key isolation
npx vitest run tests/unit/account-session-profile-encryption.test.ts

# Master key rotation without data loss
npx vitest run tests/unit/vault-key-rotation.test.ts

# Integrity check of stored vault keys
npx vitest run tests/unit/vault-key-check.test.ts

# Zod schema validation of vault manifests
npx vitest run tests/unit/vault-manifest-schema.test.ts

# Decoy PIN vault isolation — wrong PIN opens decoy data
npx vitest run tests/unit/decoy-vault.test.ts

# DRM media authorization boundary tests
npx vitest run tests/unit/drm-media-security.test.ts

# EXIF metadata scrubbing from images before encryption
npx vitest run tests/unit/exif-scrubber.test.ts

# Merkle tree hash computation and verification
npx vitest run tests/unit/merkle-tree.test.ts

# Vault integrity service (tamper detection)
npx vitest run tests/unit/integrity-service.test.ts

# Password generation (NIST / ZXCVBN strength)
npx vitest run tests/unit/password-generation.test.ts

# Enhanced password generator (symbols, entropy, patterns)
npx vitest run tests/unit/password-generator-enhanced.test.ts

# Folder pinning encryption state isolation
npx vitest run tests/unit/pinning.test.ts
```

### 1.3 Unit — Authentication, Sessions & Identity

```bash
# Auth REST API layer — login, register, refresh token
npx vitest run tests/unit/auth-api.test.ts

# Session lifecycle management (create, rotate, destroy)
npx vitest run tests/unit/auth-service-session.test.ts

# Auth utility functions (token parsing, normalization)
npx vitest run tests/unit/auth-utils.test.ts

# Auth validator — Zod schema + input sanitization
npx vitest run tests/unit/auth-validator.test.ts

# Real-time session revocation via WebSocket / SSE
npx vitest run tests/unit/session-realtime-revocation.test.ts

# useVaultAuth React hook (login state, protected routes)
npx vitest run tests/unit/useVaultAuth.test.tsx

# Session revoked modal UI behaviour
npx vitest run tests/unit/session-revoked-modal.test.tsx

# 2FA security hardening (disable 2FA password verification & playback insights)
npx vitest run tests/unit/two-factor-hardening.test.ts

# reCAPTCHA middleware (token validation, bot detection, optional 2FA flow bypass guard)
npx vitest run tests/unit/recaptchaMiddleware.test.ts
```

### 1.4 Unit — Cloud Sync, Storage & Networking

```bash
# Sync download corruption detection (hash mismatch recovery)
npx vitest run tests/unit/sync-download-corruption.test.ts

# Sync upload privacy (metadata stripping, zero-knowledge upload)
npx vitest run tests/unit/sync-upload-privacy.test.ts

# Parallel sync engine (concurrency, throttle, retry)
npx vitest run tests/unit/sync-parallel-engine.test.ts

# Sync activity logging (event stream, audit trail)
npx vitest run tests/unit/sync-activity-log.test.ts

# Sync auth guard (ensures valid session before sync)
npx vitest run tests/unit/sync-ensure-auth.test.ts

# Privacy interface store (Zustand — privacy settings)
npx vitest run tests/unit/privacy-interface-store.test.ts

# Activity store (Zustand — recent actions)
npx vitest run tests/unit/activity-store.test.ts

# Total user mirror (server-side state projection)
npx vitest run tests/unit/total-user-mirror.test.ts

# Multi-cluster aggregator (MongoDB Atlas multi-region)
npx vitest run tests/unit/multi-cluster-aggregator.test.ts

# Signed URL generation and expiry validation
npx vitest run tests/unit/signed-url.test.ts

# Upload MIME type, size, and filename validation
npx vitest run tests/unit/upload-validation.test.ts
```

### 1.5 Unit — Vault Core, UI State, Utilities & Monitoring

```bash
# Vault item content encryption / decryption roundtrip
npx vitest run tests/unit/vault-item-content.test.ts

# Drag & drop polyfill, DataTransfer, payload, fallback storage
npx vitest run tests/unit/vault-drag-drop.test.ts

# Legacy vault format parser (migration compatibility)
npx vitest run tests/unit/legacy-vault-parser.test.ts

# Chat vault message cleanup and normalization
npx vitest run tests/unit/chat-vault-clean.test.ts

# Chat vault utilities (search, filter, thread grouping)
npx vitest run tests/unit/chat-vault-utils.test.ts

# Avatar image processing pipeline
npx vitest run tests/unit/avatar-pipeline.test.ts

# MongoDB Atlas avatar storage and retrieval
npx vitest run tests/unit/mongo-atlas-avatar.test.ts

# API client — axios instance config, interceptors, retries
npx vitest run tests/unit/apiClient.test.ts

# Environment variable parsing and validation
npx vitest run tests/unit/env.test.ts

# Fuzzy search algorithm correctness
npx vitest run tests/unit/fuzzy.test.ts

# Backup script — file creation and integrity
npx vitest run tests/unit/backup.test.ts

# Lighthouse runner script unit tests
npx vitest run tests/unit/lighthouse-runner.test.ts

# Report open script unit tests
npx vitest run tests/unit/open-report.test.ts

# Sentry backend configuration and DSN validation
npx vitest run tests/unit/sentry-backend.test.ts

# LogRocket backend integration
npx vitest run tests/unit/logrocket-backend.test.ts

# LogRocket frontend SDK integration
npx vitest run tests/unit/logrocket-frontend.test.ts

# Global test setup mocks (vi.mock registry)
npx vitest run tests/unit/test-setup-mocks.test.ts

# Theme provider (dark/light mode state)
npx vitest run tests/unit/theme-provider.test.tsx

# Activity details modal UI
npx vitest run tests/unit/activity-details-modal.test.tsx

# Universal panic lock widget
npx vitest run tests/unit/universal-panic-lock-widget.test.tsx

# Universal sync status widget
npx vitest run tests/unit/universal-sync-widget.test.tsx

# Mobile PDF & document handling (anti-screenshot shield, print blocking, iframe isolation)
npx vitest run tests/unit/mobile-pdf-document-handling.test.tsx
```

### 1.6 Source — Components & Features (`src/`)

```bash
# Router scroll restoration (history, hash anchors, POP nav, lazy routes)
npx vitest run src/components/router/__tests__/ScrollRestoration.test.tsx

# Vault integrity alarm UI component
npx vitest run src/components/security/__tests__/VaultIntegrityAlarm.test.tsx

# Tag manager component (CRUD, multi-select, chips)
npx vitest run src/components/vault/__tests__/TagManager.test.tsx

# Audio player component (playback controls, progress, waveform)
npx vitest run src/components/ui/audio-player.test.tsx

# Video player component (HLS, Shaka, fallback)
npx vitest run src/components/ui/video-player.test.tsx

# Global video mini-player (floating picture-in-picture, minimize/restore, playback controls)
npx vitest run src/components/ui/GlobalVideoMiniPlayer.test.tsx

# Dashboard header (security health score, layer breakdown, profile card trigger)
npx vitest run src/features/vault/components/Dashboard/DashboardHeader.test.tsx

# Auth security layers (2FA, rate-limit, brute-force protection)
npx vitest run src/features/auth/SecurityLayers.test.tsx

# Todo vault write path security tests
npx vitest run src/features/vault/TodoVault.security.test.tsx

# Emergency self-destruct wipe flow
npx vitest run src/features/vault/__tests__/EmergencySelfDestructWipe.test.tsx

# Secrets vault — CRUD, decryption display, copy
npx vitest run src/features/vault/__tests__/SecretsVault.test.tsx

# Keyboard controls and shortcuts registration
npx vitest run src/features/vault/__tests__/ControlsAndShortcuts.test.tsx

# Shortcuts card UI component
npx vitest run src/features/vault/__tests__/ShortcutsCard.test.tsx

# Settings — Emergency destruction card
npx vitest run src/features/vault/__tests__/SettingsVault/EmergencyDestructionCard.test.tsx

# Settings — Maintenance card (clear cache, force sync)
npx vitest run src/features/vault/__tests__/SettingsVault/MaintenanceCard.test.tsx

# Settings — Merkle integrity card (tree rebuild, verify)
npx vitest run src/features/vault/__tests__/SettingsVault/MerkleIntegrityCard.test.tsx

# Settings — Mobile experience card (haptics, gestures)
npx vitest run src/features/vault/__tests__/SettingsVault/MobileExperienceCard.test.tsx

# Settings — Profile card (avatar, display name, email)
npx vitest run src/features/vault/__tests__/SettingsVault/ProfileCard.test.tsx

# Settings vault full integration test
npx vitest run src/features/vault/__tests__/SettingsVault/SettingsVaultIntegration.test.tsx

# Settings — Share vault card (invite, permissions)
npx vitest run src/features/vault/__tests__/SettingsVault/ShareVaultCard.test.tsx

# Settings — Sync storage card (quota, provider)
npx vitest run src/features/vault/__tests__/SettingsVault/SyncStorageCard.test.tsx

# Settings — 2FA settings card (enable TOTP, backup codes)
npx vitest run src/features/vault/__tests__/SettingsVault/TwoFactorSettingsCard.test.tsx

# Live capture — advanced camera modes (portrait, macro, night)
npx vitest run src/features/vault/components/LiveCaptureModal/__tests__/AdvancedCameraModes.test.tsx

# Live capture — photo editor (crop, rotate, filter)
npx vitest run src/features/vault/components/LiveCaptureModal/__tests__/PhotoEditor.test.tsx

# Live capture — video editor (trim, mute, preview)
npx vitest run src/features/vault/components/LiveCaptureModal/__tests__/VideoEditor.test.tsx

# Live capture — filter pipeline (WASM canvas filters)
npx vitest run src/features/vault/components/LiveCaptureModal/__tests__/filters.test.ts

# Media vault — preview modal (image, video, audio)
npx vitest run src/features/vault/components/MediaVault/__tests__/MediaPreview.test.tsx

# Media vault — gallery layout (grid, masonry, date group)
npx vitest run src/features/vault/components/MediaVault/__tests__/mediaGallery.test.ts

# Media vault — ZIP export utility
npx vitest run src/features/vault/components/MediaVault/__tests__/mediaZipUtils.test.ts
```

### 1.7 Source — Hooks, Lib & Security (`src/`)

```bash
# useFastAvatar hook (avatar cache, progressive load)
npx vitest run src/hooks/__tests__/useFastAvatar.test.ts

# Video mini-player Zustand store (active video, floating state, progress sync, tab routing)
npx vitest run src/store/videoMiniPlayerStore.test.ts

# Audio DSP processing (normalisation, noise gate, EQ)
npx vitest run src/lib/__tests__/audioDsp.test.ts

# Encrypted media streaming (chunk decrypt, HLS key inject)
npx vitest run src/lib/__tests__/encryptedMediaStreaming.test.ts

# Item codec (serialize / deserialize vault items)
npx vitest run src/lib/__tests__/itemCodec.test.ts

# Searchable transcripts (whisper transcript indexing)
npx vitest run src/lib/__tests__/searchableTranscripts.test.ts

# Full security integration (CSP, CSRF, XSS, clickjacking)
npx vitest run src/security/securityIntegration.test.tsx
```

---

## 2. Domain-Specific Batch Suites — Direct Vitest

> [!TIP]
> **Windows PowerShell Users:** Multi-line commands in Bash use `\` while PowerShell uses the backtick (`` ` ``). To avoid syntax errors, every suite below provides a **Universal Single-Line** command (paste-and-run anywhere on Windows/Mac/Linux) alongside shell-specific multi-line formats.

### Security & Zero-Knowledge Full Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/integration/auth-security.test.ts tests/integration/multipart-security.test.ts tests/integration/streaming-security.test.ts src/security/securityIntegration.test.tsx src/features/vault/TodoVault.security.test.tsx tests/unit/drm-media-security.test.ts tests/unit/decoy-vault.test.ts

# Windows PowerShell
npx vitest run `
  tests/integration/auth-security.test.ts `
  tests/integration/multipart-security.test.ts `
  tests/integration/streaming-security.test.ts `
  src/security/securityIntegration.test.tsx `
  src/features/vault/TodoVault.security.test.tsx `
  tests/unit/drm-media-security.test.ts `
  tests/unit/decoy-vault.test.ts

# Linux / macOS Bash & Zsh
npx vitest run \
  tests/integration/auth-security.test.ts \
  tests/integration/multipart-security.test.ts \
  tests/integration/streaming-security.test.ts \
  src/security/securityIntegration.test.tsx \
  src/features/vault/TodoVault.security.test.tsx \
  tests/unit/drm-media-security.test.ts \
  tests/unit/decoy-vault.test.ts
```

### Cryptography & Key Management Full Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/encryption.test.ts tests/unit/server-crypto.test.ts tests/unit/envelope-encryption.test.ts tests/unit/account-session-profile-encryption.test.ts tests/unit/vault-key-rotation.test.ts tests/unit/vault-key-check.test.ts src/lib/__tests__/encryptedMediaStreaming.test.ts

# Windows PowerShell
npx vitest run `
  tests/unit/encryption.test.ts `
  tests/unit/server-crypto.test.ts `
  tests/unit/envelope-encryption.test.ts `
  tests/unit/account-session-profile-encryption.test.ts `
  tests/unit/vault-key-rotation.test.ts `
  tests/unit/vault-key-check.test.ts `
  src/lib/__tests__/encryptedMediaStreaming.test.ts

# Linux / macOS Bash & Zsh
npx vitest run \
  tests/unit/encryption.test.ts \
  tests/unit/server-crypto.test.ts \
  tests/unit/envelope-encryption.test.ts \
  tests/unit/account-session-profile-encryption.test.ts \
  tests/unit/vault-key-rotation.test.ts \
  tests/unit/vault-key-check.test.ts \
  src/lib/__tests__/encryptedMediaStreaming.test.ts
```

### Authentication, Credentials & Session Revocation

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/integration/auth.integration.test.ts tests/integration/auth-security.test.ts tests/unit/auth-api.test.ts tests/unit/auth-service-session.test.ts tests/unit/auth-utils.test.ts tests/unit/auth-validator.test.ts tests/unit/session-realtime-revocation.test.ts tests/unit/session-revoked-modal.test.tsx tests/unit/useVaultAuth.test.tsx src/features/auth/SecurityLayers.test.tsx

# Windows PowerShell
npx vitest run `
  tests/integration/auth.integration.test.ts `
  tests/integration/auth-security.test.ts `
  tests/unit/auth-api.test.ts `
  tests/unit/auth-service-session.test.ts `
  tests/unit/auth-utils.test.ts `
  tests/unit/auth-validator.test.ts `
  tests/unit/session-realtime-revocation.test.ts `
  tests/unit/session-revoked-modal.test.tsx `
  tests/unit/useVaultAuth.test.tsx `
  src/features/auth/SecurityLayers.test.tsx

# Linux / macOS Bash & Zsh
npx vitest run \
  tests/integration/auth.integration.test.ts \
  tests/integration/auth-security.test.ts \
  tests/unit/auth-api.test.ts \
  tests/unit/auth-service-session.test.ts \
  tests/unit/auth-utils.test.ts \
  tests/unit/auth-validator.test.ts \
  tests/unit/session-realtime-revocation.test.ts \
  tests/unit/session-revoked-modal.test.tsx \
  tests/unit/useVaultAuth.test.tsx \
  src/features/auth/SecurityLayers.test.tsx
```

### Cloud Sync, Integrity & State Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/sync-download-corruption.test.ts tests/unit/sync-upload-privacy.test.ts tests/unit/sync-parallel-engine.test.ts tests/unit/sync-activity-log.test.ts tests/unit/sync-ensure-auth.test.ts tests/unit/merkle-tree.test.ts tests/unit/integrity-service.test.ts tests/unit/total-user-mirror.test.ts tests/unit/activity-store.test.ts tests/unit/privacy-interface-store.test.ts

# Windows PowerShell
npx vitest run `
  tests/unit/sync-download-corruption.test.ts `
  tests/unit/sync-upload-privacy.test.ts `
  tests/unit/sync-parallel-engine.test.ts `
  tests/unit/sync-activity-log.test.ts `
  tests/unit/sync-ensure-auth.test.ts `
  tests/unit/merkle-tree.test.ts `
  tests/unit/integrity-service.test.ts `
  tests/unit/total-user-mirror.test.ts `
  tests/unit/activity-store.test.ts `
  tests/unit/privacy-interface-store.test.ts

# Linux / macOS Bash & Zsh
npx vitest run \
  tests/unit/sync-download-corruption.test.ts \
  tests/unit/sync-upload-privacy.test.ts \
  tests/unit/sync-parallel-engine.test.ts \
  tests/unit/sync-activity-log.test.ts \
  tests/unit/sync-ensure-auth.test.ts \
  tests/unit/merkle-tree.test.ts \
  tests/unit/integrity-service.test.ts \
  tests/unit/total-user-mirror.test.ts \
  tests/unit/activity-store.test.ts \
  tests/unit/privacy-interface-store.test.ts
```

### Drag & Drop + Vault Core

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/vault-drag-drop.test.ts tests/unit/vault-item-content.test.ts tests/unit/legacy-vault-parser.test.ts

# Via npm shortcut
npm run test:vault:core
```

### Settings Vault Full Suite (All 9 Cards + Integration)

```bash
# Entire SettingsVault directory
npx vitest run src/features/vault/__tests__/SettingsVault

# Via npm shortcut
npm run test:settings

# Explicit all 9 cards + integration (Universal)
npx vitest run src/features/vault/__tests__/SettingsVault/EmergencyDestructionCard.test.tsx src/features/vault/__tests__/SettingsVault/MaintenanceCard.test.tsx src/features/vault/__tests__/SettingsVault/MerkleIntegrityCard.test.tsx src/features/vault/__tests__/SettingsVault/MobileExperienceCard.test.tsx src/features/vault/__tests__/SettingsVault/ProfileCard.test.tsx src/features/vault/__tests__/SettingsVault/SettingsVaultIntegration.test.tsx src/features/vault/__tests__/SettingsVault/ShareVaultCard.test.tsx src/features/vault/__tests__/SettingsVault/SyncStorageCard.test.tsx src/features/vault/__tests__/SettingsVault/TwoFactorSettingsCard.test.tsx
```

### Camera, Live Capture & Media Full Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run src/components/ui/video-player.test.tsx src/components/ui/audio-player.test.tsx src/lib/__tests__/encryptedMediaStreaming.test.ts src/lib/__tests__/audioDsp.test.ts tests/integration/streaming-security.test.ts src/features/vault/components/MediaVault src/features/vault/components/LiveCaptureModal

# Windows PowerShell
npx vitest run `
  src/components/ui/video-player.test.tsx `
  src/components/ui/audio-player.test.tsx `
  src/lib/__tests__/encryptedMediaStreaming.test.ts `
  src/lib/__tests__/audioDsp.test.ts `
  tests/integration/streaming-security.test.ts `
  src/features/vault/components/MediaVault `
  src/features/vault/components/LiveCaptureModal

# Linux / macOS Bash & Zsh
npx vitest run \
  src/components/ui/video-player.test.tsx \
  src/components/ui/audio-player.test.tsx \
  src/lib/__tests__/encryptedMediaStreaming.test.ts \
  src/lib/__tests__/audioDsp.test.ts \
  tests/integration/streaming-security.test.ts \
  src/features/vault/components/MediaVault \
  src/features/vault/components/LiveCaptureModal
```

### Live Capture Modal Suite

```bash
# Directory run
npx vitest run src/features/vault/components/LiveCaptureModal

# Individual components
npx vitest run src/features/vault/components/LiveCaptureModal/__tests__/AdvancedCameraModes.test.tsx
npx vitest run src/features/vault/components/LiveCaptureModal/__tests__/PhotoEditor.test.tsx
npx vitest run src/features/vault/components/LiveCaptureModal/__tests__/VideoEditor.test.tsx
npx vitest run src/features/vault/components/LiveCaptureModal/__tests__/filters.test.ts
```

### Media Vault Suite

```bash
# Directory run
npx vitest run src/features/vault/components/MediaVault

# Individual components
npx vitest run src/features/vault/components/MediaVault/__tests__/MediaPreview.test.tsx
npx vitest run src/features/vault/components/MediaVault/__tests__/mediaGallery.test.ts
npx vitest run src/features/vault/components/MediaVault/__tests__/mediaZipUtils.test.ts
```

### Upload, Signed URL & Multipart Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/integration/multipart-security.test.ts tests/unit/upload-validation.test.ts tests/unit/signed-url.test.ts

# Via npm shortcut
npm run test:multipart
```

### Password, Pinning & Decoy Vault

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/password-generation.test.ts tests/unit/password-generator-enhanced.test.ts tests/unit/pinning.test.ts tests/unit/decoy-vault.test.ts

# Via npm shortcut
npm run test:password
```

### Monitoring — Sentry & LogRocket

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/sentry-backend.test.ts tests/unit/logrocket-backend.test.ts tests/unit/logrocket-frontend.test.ts

# Via npm shortcut
npm run test:monitoring
```

### Avatar & Profile Pipeline

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/avatar-pipeline.test.ts tests/unit/mongo-atlas-avatar.test.ts src/hooks/__tests__/useFastAvatar.test.ts

# Via npm shortcut
npm run test:avatar
```

### Utilities & Infrastructure

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/env.test.ts tests/unit/fuzzy.test.ts tests/unit/apiClient.test.ts tests/unit/backup.test.ts tests/unit/open-report.test.ts tests/unit/lighthouse-runner.test.ts

# Via npm shortcut
npm run test:utils
```

### Floating Video & Picture-in-Picture (PiP) Mini-Player Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run src/components/ui/GlobalVideoMiniPlayer.test.tsx src/store/videoMiniPlayerStore.test.ts src/components/ui/video-player.test.tsx

# Windows PowerShell
npx vitest run `
  src/components/ui/GlobalVideoMiniPlayer.test.tsx `
  src/store/videoMiniPlayerStore.test.ts `
  src/components/ui/video-player.test.tsx

# Linux / macOS Bash & Zsh
npx vitest run \
  src/components/ui/GlobalVideoMiniPlayer.test.tsx \
  src/store/videoMiniPlayerStore.test.ts \
  src/components/ui/video-player.test.tsx
```

### Hardened 2FA, reCAPTCHA & Bot Defense Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/recaptchaMiddleware.test.ts tests/unit/two-factor-hardening.test.ts tests/unit/auth-validator.test.ts tests/integration/auth-security.test.ts src/features/auth/SecurityLayers.test.tsx

# Windows PowerShell
npx vitest run `
  tests/unit/recaptchaMiddleware.test.ts `
  tests/unit/two-factor-hardening.test.ts `
  tests/unit/auth-validator.test.ts `
  tests/integration/auth-security.test.ts `
  src/features/auth/SecurityLayers.test.tsx

# Linux / macOS Bash & Zsh
npx vitest run \
  tests/unit/recaptchaMiddleware.test.ts \
  tests/unit/two-factor-hardening.test.ts \
  tests/unit/auth-validator.test.ts \
  tests/integration/auth-security.test.ts \
  src/features/auth/SecurityLayers.test.tsx
```

### Mobile PDF, Viewer & Anti-Screenshot Shield Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/mobile-pdf-document-handling.test.tsx tests/unit/vault-item-content.test.ts

# Windows PowerShell
npx vitest run `
  tests/unit/mobile-pdf-document-handling.test.tsx `
  tests/unit/vault-item-content.test.ts

# Linux / macOS Bash & Zsh
npx vitest run \
  tests/unit/mobile-pdf-document-handling.test.tsx \
  tests/unit/vault-item-content.test.ts
```

### Dashboard, Header & Navigation Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run src/features/vault/components/Dashboard/DashboardHeader.test.tsx src/features/vault/__tests__/ControlsAndShortcuts.test.tsx src/features/vault/__tests__/ShortcutsCard.test.tsx src/components/router/__tests__/ScrollRestoration.test.tsx

# Windows PowerShell
npx vitest run `
  src/features/vault/components/Dashboard/DashboardHeader.test.tsx `
  src/features/vault/__tests__/ControlsAndShortcuts.test.tsx `
  src/features/vault/__tests__/ShortcutsCard.test.tsx `
  src/components/router/__tests__/ScrollRestoration.test.tsx

# Linux / macOS Bash & Zsh
npx vitest run \
  src/features/vault/components/Dashboard/DashboardHeader.test.tsx \
  src/features/vault/__tests__/ControlsAndShortcuts.test.tsx \
  src/features/vault/__tests__/ShortcutsCard.test.tsx \
  src/components/router/__tests__/ScrollRestoration.test.tsx
```

### Merkle Tree & Tamper-Alarm Integrity Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/merkle-tree.test.ts tests/unit/integrity-service.test.ts src/components/security/__tests__/VaultIntegrityAlarm.test.tsx src/features/vault/__tests__/SettingsVault/MerkleIntegrityCard.test.tsx

# Windows PowerShell
npx vitest run `
  tests/unit/merkle-tree.test.ts `
  tests/unit/integrity-service.test.ts `
  src/components/security/__tests__/VaultIntegrityAlarm.test.tsx `
  src/features/vault/__tests__/SettingsVault/MerkleIntegrityCard.test.tsx

# Linux / macOS Bash & Zsh
npx vitest run \
  tests/unit/merkle-tree.test.ts \
  tests/unit/integrity-service.test.ts \
  src/components/security/__tests__/VaultIntegrityAlarm.test.tsx \
  src/features/vault/__tests__/SettingsVault/MerkleIntegrityCard.test.tsx
```

### Emergency Self-Destruct & Vault Wipe Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run src/features/vault/__tests__/EmergencySelfDestructWipe.test.tsx src/features/vault/__tests__/SettingsVault/EmergencyDestructionCard.test.tsx tests/unit/decoy-vault.test.ts

# Windows PowerShell
npx vitest run `
  src/features/vault/__tests__/EmergencySelfDestructWipe.test.tsx `
  src/features/vault/__tests__/SettingsVault/EmergencyDestructionCard.test.tsx `
  tests/unit/decoy-vault.test.ts

# Linux / macOS Bash & Zsh
npx vitest run \
  src/features/vault/__tests__/EmergencySelfDestructWipe.test.tsx \
  src/features/vault/__tests__/SettingsVault/EmergencyDestructionCard.test.tsx \
  tests/unit/decoy-vault.test.ts
```

### Universal UI Widgets & Theme Provider Suite

```bash
# Universal (PowerShell, CMD, Bash, Zsh)
npx vitest run tests/unit/universal-panic-lock-widget.test.tsx tests/unit/universal-sync-widget.test.tsx tests/unit/activity-details-modal.test.tsx tests/unit/theme-provider.test.tsx

# Windows PowerShell
npx vitest run `
  tests/unit/universal-panic-lock-widget.test.tsx `
  tests/unit/universal-sync-widget.test.tsx `
  tests/unit/activity-details-modal.test.tsx `
  tests/unit/theme-provider.test.tsx

# Linux / macOS Bash & Zsh
npx vitest run \
  tests/unit/universal-panic-lock-widget.test.tsx \
  tests/unit/universal-sync-widget.test.tsx \
  tests/unit/activity-details-modal.test.tsx \
  tests/unit/theme-provider.test.tsx
```

### All Component Tests (src/)

```bash
# Universal glob (runs all *.test.tsx across the workspace)
npx vitest run "**/*.test.tsx"

# Via npm shortcut
npm run test:components

# All 36 tests in src/ (Universal single-line)
npx vitest run src/components/router/__tests__/ScrollRestoration.test.tsx src/components/security/__tests__/VaultIntegrityAlarm.test.tsx src/components/vault/__tests__/TagManager.test.tsx src/components/ui/GlobalVideoMiniPlayer.test.tsx src/components/ui/audio-player.test.tsx src/components/ui/video-player.test.tsx src/features/auth/SecurityLayers.test.tsx src/features/vault/__tests__/ControlsAndShortcuts.test.tsx src/features/vault/__tests__/ShortcutsCard.test.tsx src/features/vault/__tests__/EmergencySelfDestructWipe.test.tsx src/features/vault/__tests__/SecretsVault.test.tsx src/features/vault/TodoVault.security.test.tsx src/security/securityIntegration.test.tsx src/features/vault/__tests__/SettingsVault/EmergencyDestructionCard.test.tsx src/features/vault/__tests__/SettingsVault/MaintenanceCard.test.tsx src/features/vault/__tests__/SettingsVault/MerkleIntegrityCard.test.tsx src/features/vault/__tests__/SettingsVault/MobileExperienceCard.test.tsx src/features/vault/__tests__/SettingsVault/ProfileCard.test.tsx src/features/vault/__tests__/SettingsVault/SettingsVaultIntegration.test.tsx src/features/vault/__tests__/SettingsVault/ShareVaultCard.test.tsx src/features/vault/__tests__/SettingsVault/SyncStorageCard.test.tsx src/features/vault/__tests__/SettingsVault/TwoFactorSettingsCard.test.tsx src/features/vault/components/Dashboard/DashboardHeader.test.tsx src/features/vault/components/LiveCaptureModal/__tests__/AdvancedCameraModes.test.tsx src/features/vault/components/LiveCaptureModal/__tests__/PhotoEditor.test.tsx src/features/vault/components/LiveCaptureModal/__tests__/VideoEditor.test.tsx src/features/vault/components/LiveCaptureModal/__tests__/filters.test.ts src/features/vault/components/MediaVault/__tests__/MediaPreview.test.tsx src/features/vault/components/MediaVault/__tests__/mediaGallery.test.ts src/features/vault/components/MediaVault/__tests__/mediaZipUtils.test.ts src/hooks/__tests__/useFastAvatar.test.ts src/lib/__tests__/audioDsp.test.ts src/lib/__tests__/encryptedMediaStreaming.test.ts src/lib/__tests__/itemCodec.test.ts src/lib/__tests__/searchableTranscripts.test.ts src/store/videoMiniPlayerStore.test.ts
```

---

## 3. Main & All-in-One Test Suites (npm)

```bash
# Safe single-worker — no race conditions, most reliable
npm test

# Parallel — fastest, all CPU cores
npm run test:run

# Full: lint + Vitest run + custom runner
npm run test:all

# CI: strict lint + Vitest --no-cache
npm run test:ci

# All unit tests in tests/unit/
npm run test:unit

# All integration tests in tests/integration/
npm run test:integration

# All client/src tests
npm run test:client

# All server-related tests (server-, auth-, sentry-, logrocket- + integration)
npm run test:server

# All React component tests (*.test.tsx)
npm run test:components

# E2E (alias for integration)
npm run test:e2e

# Custom standalone TypeScript runner
npm run test:runner
```

---

## 4. Authentication & Session Security (npm)

```bash
# Auth unit tests only (all auth- prefix files)
npm run test:auth:unit

# Auth integration test (login, register, session rotation)
npm run test:auth:integration

# Auth security perimeter (JWT bypass, CSRF, brute force)
npm run test:auth:security

# Combined auth suite (unit + integration)
npm run test:auth
```

---

## 5. Cryptography, Zero-Knowledge & Key Management (npm)

```bash
# Client-side crypto (AES-256-GCM, PQC Kyber)
npm run test:crypto:unit

# Server-side crypto and 2FA seed derivation
npm run test:crypto:server

# Key rotation and integrity checks
npm run test:crypto:rotation

# Password generator + pinning tests
npm run test:password

# All crypto tests (client + server + sessions + streaming)
npm run test:crypto
```

---

## 6. Comprehensive Security Integration (npm)

```bash
# Full security suite (auth + multipart + streaming + UI + TodoVault)
npm run test:security

# UI security and privacy protection only
npm run test:security:integration
```

---

## 7. Feature & Module Tests (npm)

### Vault Items

```bash
npm run test:vault             # All vault- prefix unit tests
npm run test:vault:core        # drag-drop + item-content + parser
npm run test:vault:chat        # Chat vault (chat-vault- prefix)
npm run test:vault:todo        # TodoVault security write path
```

### Sync & State

```bash
npm run test:sync              # All sync- prefix unit tests
npm run test:sync:corruption   # Download corruption detection
npm run test:sync:stores       # activity-store + privacy-store + total-user-mirror
```

### Media, Streaming, Camera

```bash
npm run test:media             # Video player + encrypted streaming + streaming-security + MediaVault
npm run test:video             # Video player only
npm run test:capture           # LiveCaptureModal tests
npm run test:streaming         # Streaming security integration
npm run test:streaming:media   # Encrypted media streaming unit tests
npm run test:multipart         # Multipart security + upload validation + signed URL
npm run test:avatar            # Avatar pipeline + MongoDB atlas avatar
```

### Settings & UI Controls

```bash
npm run test:settings              # All SettingsVault card tests
npm run test:settings:integration  # SettingsVault integration only
npm run test:shortcuts             # ControlsAndShortcuts + ShortcutsCard
```

### Monitoring & Logs

```bash
npm run test:monitoring        # Sentry + LogRocket (backend + frontend)
npm run test:sentry            # Sentry backend only
npm run test:logrocket         # All logrocket- prefix tests
```

### Utilities

```bash
npm run test:utils             # env + fuzzy + apiClient
npm run test:env               # Environment variables only
npm run test:backup            # Backup script tests
npm run test:lighthouse        # Lighthouse runner tests
npm run test:reports           # Open-report script tests
```

---

## 8. Test Runner Modes & Debugging Options

```bash
# Interactive browser UI dashboard
npm run test:ui

# Browser UI dashboard on a custom port (if 51204 is occupied)
npx vitest --ui --api.port=51300

# Browser UI dashboard with live coverage
npm run test:ui:coverage

# Bail on first failure (stops test suite immediately)
npm run test:fast
npx vitest run --bail=1

# Bail after 3 failures
npx vitest run --bail=3

# Verbose output (every test name + stack trace on failure)
npm run test:verbose
npx vitest run --reporter=verbose

# Silent mode (suppress stdout/stderr)
npm run test:silent

# Retry flaky tests up to 5 times
npm run test:flaky
npx vitest run --retry=5

# Log heap and memory usage per test file
npm run test:heap
npx vitest run --logHeapUsage

# Memory leak & GC profiling (runs Node with explicit garbage collection)
node --expose-gc ./node_modules/vitest/vitest.mjs run --logHeapUsage

# Diagnose hanging processes (detects open timers, sockets, DB connections)
npx vitest run --reporter=hanging-process

# Debug with Node inspector (attach Chrome DevTools / VS Code on port 9229)
npm run test:debug
npx vitest run --inspect --no-file-parallelism

# Debug in watch mode with inspector
npm run test:debug:watch

# Debug with break-on-start (--inspect-brk: pause before any test executes)
npm run test:debug:brk
npx vitest run --inspect-brk --no-file-parallelism

# Update outdated test snapshots
npm run test:update
npx vitest run -u

# Run only tests related to changed git files
npm run test:changed
node scripts/vitest-related.mjs run

# Watch tests related to changed git files
npm run test:related
node scripts/vitest-related.mjs watch

# Run tests related to a specific source file
node scripts/vitest-related.mjs run src/lib/cryptoPrimitives.ts
node scripts/vitest-related.mjs run src/lib/vaultDragDrop.ts
node scripts/vitest-related.mjs run server/services/authService.ts
node scripts/vitest-related.mjs run src/components/ui/GlobalVideoMiniPlayer.tsx
node scripts/vitest-related.mjs run src/store/videoMiniPlayerStore.ts
node scripts/vitest-related.mjs run src/features/vault/components/Dashboard/DashboardHeader.tsx
node scripts/vitest-related.mjs run server/middleware/recaptchaMiddleware.ts
node scripts/vitest-related.mjs run server/services/twoFactorService.ts

# Extended timeouts for heavy cryptographic operations (Argon2 / Kyber / PBKDF2)
npx vitest run --testTimeout=60000 --hookTimeout=60000

# High-precision timeout for long-running integration workflows
npx vitest run --testTimeout=120000 --hookTimeout=90000

# Slow test threshold alerting (highlight any test execution taking longer than 1000ms)
npx vitest run --slowTestThreshold=1000

# Strict worker thread isolation (isolate memory context per file)
npx vitest run --poolOptions.threads.isolate=true

# Single-threaded execution without worker pool overhead (for low memory environments)
npx vitest run --poolOptions.threads.singleThread

# Concurrency throttling (limit concurrent test suites running in parallel)
npx vitest run --maxConcurrency=5

# Restrict worker threads to exactly 2 workers
npx vitest run --maxWorkers=2 --minWorkers=1

# Run tests without any setup files (pure isolation from global mocks)
npx vitest run --setupFiles "" tests/unit/server-crypto.test.ts

# Run tests ignoring integration folder
npx vitest run --exclude="tests/integration/**"

# Run tests ignoring mock files
npx vitest run --exclude="**/mocks/**"

# Profile test CPU consumption using Node.js V8 CPU profiler
node --cpu-prof ./node_modules/vitest/vitest.mjs run tests/unit/encryption.test.ts

# Trigger heap snapshot when approaching V8 memory limit
node --heapsnapshot-near-heap-limit=3 ./node_modules/vitest/vitest.mjs run

# Execute Vitest typecheck engine across test suites
npx vitest typecheck

# Run Vitest typecheck only without executing test assertions
npx vitest typecheck --run

# Clear Vitest cache (removes corrupt module transforms)
npx vitest run --clearCache

# CI Test Sharding (split full suite across 2 parallel runners)
npx vitest run --shard=1/2
npx vitest run --shard=2/2

# Randomize test execution order (detects inter-test state leaks)
npx vitest run --sequence.shuffle

# Run a single file via npm (pass after --)
npm run test:run -- tests/unit/vault-drag-drop.test.ts
npm run test:run -- tests/unit/encryption.test.ts
npm run test:run -- src/features/vault/TodoVault.security.test.tsx
```

---

## 9. Test Watch Modes

```bash
# Watch all tests
npm run test:watch

# Watch unit tests only
npm run test:unit:watch

# Watch integration tests only
npm run test:integration:watch

# Watch component tests only
npm run test:components:watch

# Watch a specific file directly
npx vitest tests/unit/vault-drag-drop.test.ts
npx vitest tests/unit/encryption.test.ts
npx vitest tests/integration/auth-security.test.ts
npx vitest src/features/vault/TodoVault.security.test.tsx
npx vitest src/features/vault/__tests__/SettingsVault/SettingsVaultIntegration.test.tsx
npx vitest src/lib/__tests__/encryptedMediaStreaming.test.ts
npx vitest src/components/ui/GlobalVideoMiniPlayer.test.tsx
npx vitest src/store/videoMiniPlayerStore.test.ts
npx vitest tests/unit/mobile-pdf-document-handling.test.tsx
npx vitest tests/unit/two-factor-hardening.test.ts
npx vitest tests/unit/recaptchaMiddleware.test.ts
npx vitest src/features/vault/components/Dashboard/DashboardHeader.test.tsx
```

---

## 10. Code Coverage & Reports

```bash
# Coverage summary in terminal
npm run test:coverage

# Coverage with heap memory tracking
npm run test:coverage:deep

# Generate coverage + open HTML report in browser
npm run test:coverage:open

# Coverage for a specific file
npx vitest run --coverage tests/unit/vault-drag-drop.test.ts
npx vitest run --coverage tests/unit/encryption.test.ts
npx vitest run --coverage tests/unit/vault-item-content.test.ts
npx vitest run --coverage src/security/securityIntegration.test.tsx
npx vitest run --coverage src/features/vault/TodoVault.security.test.tsx

# Coverage for video mini-player and store
npx vitest run --coverage src/components/ui/GlobalVideoMiniPlayer.test.tsx src/store/videoMiniPlayerStore.test.ts

# Coverage for mobile PDF & document handler
npx vitest run --coverage tests/unit/mobile-pdf-document-handling.test.tsx

# Coverage for hardened 2FA and reCAPTCHA middleware
npx vitest run --coverage tests/unit/recaptchaMiddleware.test.ts tests/unit/two-factor-hardening.test.ts

# Coverage for dashboard header component
npx vitest run --coverage src/features/vault/components/Dashboard/DashboardHeader.test.tsx

# Coverage for an entire domain
npx vitest run --coverage tests/unit/
npx vitest run --coverage tests/integration/
npx vitest run --coverage src/
# Coverage for vault core only (Universal)
npx vitest run --coverage tests/unit/vault-item-content.test.ts tests/unit/vault-drag-drop.test.ts tests/unit/legacy-vault-parser.test.ts

# Coverage for all crypto files (Universal)
npx vitest run --coverage tests/unit/encryption.test.ts tests/unit/server-crypto.test.ts tests/unit/envelope-encryption.test.ts tests/unit/vault-key-rotation.test.ts

# Coverage for all auth files (Universal)
npx vitest run --coverage tests/unit/auth-api.test.ts tests/unit/auth-service-session.test.ts tests/unit/auth-validator.test.ts tests/unit/session-realtime-revocation.test.ts

# Scope coverage to specific directories using CLI include pattern
npx vitest run --coverage --coverage.include="src/lib/**"
npx vitest run --coverage --coverage.include="src/features/vault/**"
npx vitest run --coverage --coverage.include="src/components/**"
npx vitest run --coverage --coverage.include="server/**"

# Output specific coverage formats (e.g. lcov for CI, html for review)
npx vitest run --coverage --coverage.reporter=text --coverage.reporter=html --coverage.reporter=lcov

# Output Cobertura XML format (for CI coverage dashboards)
npx vitest run --coverage --coverage.reporter=cobertura --coverage.reporter=text-summary

# Output JSON summary format (for automated PR bot comments)
npx vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=text

# Assert minimum code coverage thresholds on the fly
npx vitest run --coverage --coverage.thresholds.lines=75 --coverage.thresholds.statements=75

# Enforce strict 80% branch coverage threshold
npx vitest run --coverage --coverage.thresholds.branches=80

# Clean coverage output on every rerun
npx vitest run --coverage --coverage.cleanOnRerun=true

# Clean old coverage reports before running
npm run clean:coverage && npm run test:coverage
```

---

## 11. Advanced Vitest Filtering & CLI Flags

### Filter by Test Name (`-t`)

```bash
# Cryptography filters
npx vitest run -t "AES-GCM"
npx vitest run -t "Argon2"
npx vitest run -t "PBKDF2"
npx vitest run -t "Kyber"
npx vitest run -t "rotates encrypted"
npx vitest run -t "envelope"
npx vitest run -t "key rotation"
npx vitest run -t "key check"

# Auth filters
npx vitest run -t "session revocation"
npx vitest run -t "JWT"
npx vitest run -t "login"
npx vitest run -t "register"
npx vitest run -t "refresh token"
npx vitest run -t "2FA"

# Drag & drop filters
npx vitest run -t "drag"
npx vitest run -t "PolyfillDataTransfer"
npx vitest run -t "TouchEvent"
npx vitest run -t "drop target"
npx vitest run -t "setDraggedVaultItem"
npx vitest run -t "getDraggedVaultItems"
npx vitest run -t "fallback storage"
npx vitest run -t "Multi-item"

# Vault filters
npx vitest run -t "vault item"
npx vitest run -t "decoy"
npx vitest run -t "pinning"
npx vitest run -t "manifest"

# Mini-Player & Video filters
npx vitest run -t "GlobalVideoMiniPlayer"
npx vitest run -t "useVideoMiniPlayerStore"
npx vitest run -t "isFloating"
npx vitest run -t "playVideo"

# Mobile PDF & Document Shield filters
npx vitest run -t "Mobile PDF and Document Handling"
npx vitest run -t "anti-screenshot"
npx vitest run -t "ShieldTestConsumer"
npx vitest run -t "print blocking"

# 2FA Hardening & reCAPTCHA filters
npx vitest run -t "reCAPTCHA Middleware"
npx vitest run -t "2FA Security Hardening"
npx vitest run -t "Playback Insights Validation"

# Dashboard Header & Health Score filters
npx vitest run -t "DashboardHeader Component"
npx vitest run -t "Security Layer Details"
npx vitest run -t "onOpenProfileCard"

# Regex case-insensitive test filters
npx vitest run -t "/(login|register|token)/i"
npx vitest run -t "/(encrypt|decrypt|cipher)/i"

# Inverted test pattern (exclude tests matching regex)
npx vitest run --testNamePattern "^((?!flaky).)*$"

# Filter within a specific file
npx vitest run tests/unit/encryption.test.ts -t "encrypts and decrypts"
npx vitest run tests/unit/vault-drag-drop.test.ts -t "multi-item"
npx vitest run tests/unit/vault-drag-drop.test.ts -t "fallback"
npx vitest run tests/unit/auth-api.test.ts -t "login"
npx vitest run src/features/vault/TodoVault.security.test.tsx -t "write path"
npx vitest run src/components/ui/GlobalVideoMiniPlayer.test.tsx -t "minimizes"
npx vitest run tests/unit/mobile-pdf-document-handling.test.tsx -t "anti-screenshot"
```

### Execution Control

```bash
# Run only previously failed tests
npx vitest run --failed

# Bail after N failures
npx vitest run --bail=1
npx vitest run --bail=3
npx vitest run --bail=5

# No cache (always fresh — use after major refactors)
npx vitest run --no-cache

# Worker control
npx vitest run --maxWorkers=1
npx vitest run --maxWorkers=2
npx vitest run --maxWorkers=4
npx vitest run --maxWorkers=8
npx vitest run --no-file-parallelism

# Pool modes
npx vitest run --pool=threads
npx vitest run --pool=forks
```

### Reporter Options

```bash
npx vitest run --reporter=verbose
npx vitest run --reporter=dot
npx vitest run --reporter=json
npx vitest run --reporter=json --outputFile=test-results.json
npx vitest run --reporter=junit --outputFile=junit.xml
npx vitest run --reporter=html
npx vitest run --reporter=tap
npx vitest run --reporter=github-actions
npx vitest run --reporter=default --reporter=html --reporter=json --outputFile.json=test-results/results.json --outputFile.html=test-results/index.html
```

### Inspector / Debugger

```bash
# Attach Chrome DevTools on default port 9229
npx vitest run --inspect --no-file-parallelism

# Break on first line (attach before any test runs)
npx vitest run --inspect-brk --no-file-parallelism

# Debug a specific file
npx vitest run --inspect-brk --no-file-parallelism tests/unit/vault-drag-drop.test.ts
npx vitest run --inspect-brk --no-file-parallelism tests/unit/encryption.test.ts
npx vitest run --inspect-brk --no-file-parallelism src/features/vault/TodoVault.security.test.tsx
```

### Memory & Performance

```bash
# Log heap usage per test file
npx vitest run --logHeapUsage
npx vitest run --logHeapUsage tests/unit/vault-drag-drop.test.ts
npx vitest run --logHeapUsage --coverage tests/unit/
```

### Path & Glob Pattern Filtering

```bash
# Filter test paths by regex pattern
npx vitest run --testPathPattern="crypto|auth"
npx vitest run --testPathPattern="player|video"
npx vitest run --testPathPattern="Dashboard|MiniPlayer"
npx vitest run --testPathPattern="mobile-pdf|recaptcha"

# Run all security perimeter tests across the repo
npx vitest run "**/*.security.test.tsx"

# Run all integration tests
npx vitest run "**/*.integration.test.ts"

# Run all React component tests
npx vitest run "**/*.test.tsx"

# Run all pure TypeScript / Node unit tests
npx vitest run "tests/unit/*.test.ts"

# Run all auth-related unit tests
npx vitest run "tests/unit/auth-*"

# Run all sync-related unit tests
npx vitest run "tests/unit/sync-*"

# Run all vault-related unit tests
npx vitest run "tests/unit/vault-*"

# Run all password & decoy tests
npx vitest run "tests/unit/password-*" "tests/unit/pinning.test.ts" "tests/unit/decoy-vault.test.ts"

# Run all tests in the features directory
npx vitest run "src/features/**"

# Run all LiveCaptureModal tests
npx vitest run "src/features/vault/components/LiveCaptureModal/**"

# Run all MediaVault tests
npx vitest run "src/features/vault/components/MediaVault/**"

# Run all SettingsVault card tests
npx vitest run "src/features/vault/__tests__/SettingsVault/**"
```

### CI Test Sharding & Distributed Execution

```bash
# Split test suite across 2 parallel CI runners
npx vitest run --shard=1/2
npx vitest run --shard=2/2

# Split test suite across 3 parallel CI runners
npx vitest run --shard=1/3
npx vitest run --shard=2/3
npx vitest run --shard=3/3

# Split test suite across 4 parallel CI runners
npx vitest run --shard=1/4
npx vitest run --shard=2/4
npx vitest run --shard=3/4
npx vitest run --shard=4/4
```

### Test Isolation & Sequence Randomization

```bash
# Randomize test execution order (detects inter-test state leaks / pollution)
npx vitest run --sequence.shuffle

# Replay a specific randomized test order using a seed
npx vitest run --sequence.shuffle --sequence.seed=42891

# Run tests within files concurrently
npx vitest run --sequence.concurrent

# Strict sandbox isolation (default: clean environment per test file)
npx vitest run --isolate=true

# Disable sandbox isolation (faster execution, shares VM context)
npx vitest run --no-isolate
```

### Runtime Environment Overrides

```bash
# Force jsdom browser environment for all tests
npx vitest run --environment=jsdom

# Force pure Node.js environment (faster for crypto & server services)
npx vitest run --environment=node
```

### Git Changed Files Detection

```bash
# Run tests related to uncommitted changes (unstaged + staged)
npx vitest run --changed

# Run tests related to changes since previous commit
npx vitest run --changed=HEAD~1

# Run tests related to changes compared to main branch
npx vitest run --changed=main

# Run tests related to changes compared to origin/main
npx vitest run --changed=origin/main
```

### Snapshot Management

```bash
# Update all outdated snapshots
npx vitest run -u

# Update snapshots for a single test file
npx vitest run -u tests/unit/theme-provider.test.tsx
npx vitest run -u src/components/router/__tests__/ScrollRestoration.test.tsx
```

### Cache & Diagnostics

```bash
# Clear Vitest cache completely
npx vitest run --clearCache

# Detect hanging async processes, open intervals, unclosed sockets, DB handles
npx vitest run --reporter=hanging-process

# Track Node.js process warnings and deprecation notices
node --trace-warnings ./node_modules/vitest/vitest.mjs run

# Strict unhandled promise rejection erroring
node --unhandled-rejections=strict ./node_modules/vitest/vitest.mjs run
```

---

## 12. Standalone Runner & Verification Pipelines

### Standalone TypeScript Crypto & Key Rotation Runner (`tests/run-tests.ts`)

`tests/run-tests.ts` is an independent Node.js / `tsx` test harness that executes without Vitest, directly asserting core cryptographic invariants and key rotation routines:

```bash
# Run the custom standalone crypto validation runner
npx tsx tests/run-tests.ts

# Via npm script
npm run test:runner
```

**Coverage inside `tests/run-tests.ts`:**

1. **Master Key Check Validation:** Confirms `createVaultKeyCheckPayload` produces valid payload decryptable by the correct derived key, and strictly rejects derivation with wrong keys.
2. **Empty & Gibberish Payload Rejection:** Tests `validateVaultKeyCheckPayload` against empty strings and malformed Base64 ciphertext.
3. **Non-Deterministic Ciphertext (IV Randomness):** Asserts that encrypting identical keys at the same timestamp produces unique ciphertexts due to fresh 96-bit AES-GCM IV generation.
4. **String Content Key Rotation:** Re-encrypts notes and secrets from `oldKey` to `newKey` via `reencryptVaultItemContent`, verifying new key decryptions match and old keys fail.
5. **String Integrity Check Error Handling:** Confirms an integrity error is thrown if `reencryptVaultItemContent` is invoked with an invalid old key.
6. **Binary Content Key Rotation (`Uint8Array` / File Envelopes):** Re-encrypts binary files (e.g. photos, documents, media chunks) and decrypts via `decryptFileEnvelope` with `newKey`.
7. **Invalid Format Rejection:** Confirms runtime errors when invalid content types are passed into the rotation engine.
8. **Unicode Encrypt/Decrypt Round-Trip:** Validates multi-byte UTF-8, symbols, and emojis (e.g. `🔑 プライベートキー – très secret`).

### Verification Pipelines

```bash
# Quick verify — lint + auth tests only
npm run verify:quick

# Standard verify — lint + safe single-worker test suite
npm run verify

# CI verify — doctor + lint + CI test run (--no-cache) + build
npm run verify:ci

# Full system verify — clean all + doctor + full verify + all tests
npm run verify:full

# JWT token verification helper
npm run verify:jwt
npx tsx scripts/verify-jwt.ts
```

---

## 13. Drag & Drop — Deep Test Commands

### Isolated Runs

```bash
# Run the full drag & drop test file
npx vitest run tests/unit/vault-drag-drop.test.ts

# Verbose — see every test name, duration, and result
npx vitest run --reporter=verbose tests/unit/vault-drag-drop.test.ts

# Heap log — verify polyfill has no memory leaks
npx vitest run --logHeapUsage tests/unit/vault-drag-drop.test.ts

# Coverage — measure PolyfillDataTransfer branch coverage
npx vitest run --coverage tests/unit/vault-drag-drop.test.ts

# No-cache — force fresh run after polyfill edits
npx vitest run --no-cache tests/unit/vault-drag-drop.test.ts

# Debug with Node inspector (Chrome DevTools)
npx vitest run --inspect-brk --no-file-parallelism tests/unit/vault-drag-drop.test.ts

# Watch during development
npx vitest tests/unit/vault-drag-drop.test.ts

# Watch with verbose output
npx vitest --reporter=verbose tests/unit/vault-drag-drop.test.ts
```

### Filter by Describe Group

```bash
# Only PolyfillDataTransfer class tests
npx vitest run -t "PolyfillDataTransfer" tests/unit/vault-drag-drop.test.ts

# Only TouchEvent guard tests
npx vitest run -t "TouchEvent guard" tests/unit/vault-drag-drop.test.ts

# Only multi-item drag tests
npx vitest run -t "Multi-item drag" tests/unit/vault-drag-drop.test.ts

# Only fallback storage TTL tests
npx vitest run -t "fallback" tests/unit/vault-drag-drop.test.ts

# Only setDraggedVaultItem tests
npx vitest run -t "setDraggedVaultItem" tests/unit/vault-drag-drop.test.ts

# Only getDraggedVaultItems resolution tests
npx vitest run -t "getDraggedVaultItems" tests/unit/vault-drag-drop.test.ts

# Only TTL expiry test
npx vitest run -t "expires fallback" tests/unit/vault-drag-drop.test.ts

# Only payload encoding tests
npx vitest run -t "writes custom and plain payload" tests/unit/vault-drag-drop.test.ts
```

### Vault Core Suite (Drag + Content + Parser)

```bash
# npm script shortcut
npm run test:vault:core

# Direct Vitest (equivalent)
npx vitest run tests/unit/vault-item-content.test.ts tests/unit/vault-drag-drop.test.ts tests/unit/legacy-vault-parser.test.ts

# Verbose
npx vitest run --reporter=verbose tests/unit/vault-item-content.test.ts tests/unit/vault-drag-drop.test.ts tests/unit/legacy-vault-parser.test.ts

# With coverage
npx vitest run --coverage tests/unit/vault-item-content.test.ts tests/unit/vault-drag-drop.test.ts tests/unit/legacy-vault-parser.test.ts
```

### All Vault Tests

```bash
npm run test:vault
npx vitest run tests/unit/vault-
```

### Regression Check (Full Unit Suite)

```bash
npm run test:unit
npx vitest run --bail=1 tests/unit/
npx vitest run --reporter=verbose tests/unit/
```

### TypeScript Typecheck of Polyfill

```bash
# Catches type errors in vaultDragDrop.ts
npm run typecheck:all

# Client only
npm run typecheck

# Lint strict (typecheck + unit tests)
npm run lint:strict
```

### Drag & Drop Full CI Pipeline

```bash
# Step 1 — TypeScript compile
npm run typecheck:all

# Step 2 — Run drag & drop tests fresh
npx vitest run --no-cache tests/unit/vault-drag-drop.test.ts

# Step 3 — Vault core suite
npm run test:vault:core

# Step 4 — Full unit suite (regression check)
npm run test:unit

# Step 5 — Coverage
npm run test:coverage

# Step 6 — Full CI verify
npm run verify:ci
```

---

## 14. Type Checking & Linting

```bash
# TypeScript typecheck — client only (tsconfig.json)
npm run typecheck

# TypeScript typecheck — server only (tsconfig.server.json)
npm run typecheck:server

# TypeScript typecheck — both client and server
npm run typecheck:all

# Lint alias (runs typecheck:all)
npm run lint

# Strict lint: typecheck + all unit tests
npm run lint:strict

# Direct tsc commands
npx tsc --noEmit
npx tsc --noEmit -p tsconfig.server.json
npx tsc --noEmit --watch
npx tsc --noEmit --diagnostics
```

---

## 15. Code Formatting

```bash
# Format all files with Prettier
npm run format

# Check formatting without writing (CI-safe)
npm run format:check

# Direct Prettier commands
npx prettier --write .
npx prettier --check .
npx prettier --write src/
npx prettier --write tests/
npx prettier --write "src/**/*.ts" "src/**/*.tsx"
npx prettier --write "tests/**/*.ts"
```

---

## 16. Development Servers

```bash
# Full dev server (Express + tsx watch on server.ts)
npm run dev

# Vite client-only dev server (no backend)
npm run dev:client

# Vite dev server exposed on LAN (for mobile device testing)
npm run dev:host

# Dev server with Node.js debugger attached
npm run dev:debug

# Production server (tsx server.ts)
npm start

# Preview production build (Vite preview)
npm run preview

# Preview on LAN (for mobile/cross-device testing)
npm run preview:host

# Direct Vite commands
npx vite
npx vite --host
npx vite preview
npx vite preview --host
npx vite --port 3001
npx vite --https
```

---

## 17. Build Commands

```bash
# Standard Vite client build
npm run build

# Production — oxc minifier, no sourcemaps
npm run build:prod

# Production — Terser minifier, no sourcemaps
npm run build:minify:terser

# Build with bundle size analyzer (opens stats.html)
npm run build:analyze

# Build with performance debug output
npm run build:perf

# Build client + zip production output
npm run build:zip

# Server bundle — esbuild ESM (for Node deployment)
npm run build:server

# Build both client and server
npm run build:all

# Full production release pipeline:
# lint:strict + format + format:check + build:analyze +
# memory:all + backup + backup:info + zip:prod + lighthouse:ci + stats:chrome
npm run build:zip:analyze

# Direct Vite build commands
npx vite build
npx vite build --mode production
npx vite build --minify=terser
npx vite build --sourcemap
npx vite build --watch
```

---

## 18. Clean & Maintenance Commands

```bash
# Clean build output (dist/)
npm run clean

# Clean Vite cache (.vite/)
npm run clean:vite

# Clean coverage report (coverage/)
npm run clean:coverage

# Clean all reports
npm run clean:reports

# Clean bundle stats (stats.html)
npm run clean:stats

# Clean memory index files (.memory/)
npm run clean:memory

# Force clear npm cache
npm run clean:npm

# Clean absolutely everything
npm run clean:all

# Direct clean commands
node scripts/clean.mjs --build
node scripts/clean.mjs --vite
node scripts/clean.mjs --coverage
node scripts/clean.mjs --reports
node scripts/clean.mjs --stats
node scripts/clean.mjs --memory
node scripts/clean.mjs --all
npm cache clean --force
```

---

## 19. Complete npm Script Reference Table

| Script                              | Underlying Command                                                                                                                                                                                                                      |
| :---------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                          | `vitest run --maxWorkers 1`                                                                                                                                                                                                             |
| `npm run test:run`                  | `vitest run`                                                                                                                                                                                                                            |
| `npm run test:watch`                | `vitest`                                                                                                                                                                                                                                |
| `npm run test:ui`                   | `vitest --ui`                                                                                                                                                                                                                           |
| `npm run test:ui:coverage`          | `vitest --ui --coverage`                                                                                                                                                                                                                |
| `npm run test:fast`                 | `vitest run --bail=1`                                                                                                                                                                                                                   |
| `npm run test:verbose`              | `vitest run --reporter=verbose`                                                                                                                                                                                                         |
| `npm run test:silent`               | `vitest run --silent`                                                                                                                                                                                                                   |
| `npm run test:ci`                   | `npm run lint && vitest run --no-cache`                                                                                                                                                                                                 |
| `npm run test:flaky`                | `vitest run --retry=5`                                                                                                                                                                                                                  |
| `npm run test:repeat`               | `node scripts/test-repeat.mjs`                                                                                                                                                                                                          |
| `npm run test:heap`                 | `vitest run --logHeapUsage`                                                                                                                                                                                                             |
| `npm run test:debug`                | `vitest run --inspect --no-file-parallelism`                                                                                                                                                                                            |
| `npm run test:debug:watch`          | `vitest --inspect --no-file-parallelism`                                                                                                                                                                                                |
| `npm run test:debug:brk`            | `vitest run --inspect-brk --no-file-parallelism`                                                                                                                                                                                        |
| `npm run test:update`               | `vitest run -u`                                                                                                                                                                                                                         |
| `npm run test:changed`              | `node scripts/vitest-related.mjs run`                                                                                                                                                                                                   |
| `npm run test:related`              | `node scripts/vitest-related.mjs watch`                                                                                                                                                                                                 |
| `npm run test:coverage`             | `vitest run --coverage`                                                                                                                                                                                                                 |
| `npm run test:coverage:deep`        | `vitest run --coverage --logHeapUsage`                                                                                                                                                                                                  |
| `npm run test:coverage:open`        | `vitest run --coverage && node scripts/open-report.mjs coverage/index.html`                                                                                                                                                             |
| `npm run test:runner`               | `tsx tests/run-tests.ts`                                                                                                                                                                                                                |
| `npm run test:all`                  | `npm run lint && npm run test:run && npm run test:runner`                                                                                                                                                                               |
| `npm run test:unit`                 | `vitest run tests/unit`                                                                                                                                                                                                                 |
| `npm run test:unit:watch`           | `vitest --watch tests/unit`                                                                                                                                                                                                             |
| `npm run test:integration`          | `vitest run tests/integration`                                                                                                                                                                                                          |
| `npm run test:integration:watch`    | `vitest --watch tests/integration`                                                                                                                                                                                                      |
| `npm run test:components`           | `vitest run .test.tsx`                                                                                                                                                                                                                  |
| `npm run test:components:watch`     | `vitest --watch .test.tsx`                                                                                                                                                                                                              |
| `npm run test:client`               | `vitest run src`                                                                                                                                                                                                                        |
| `npm run test:server`               | `vitest run tests/unit/server- tests/unit/auth- tests/unit/sentry- tests/unit/logrocket- tests/integration`                                                                                                                             |
| `npm run test:e2e`                  | `vitest run tests/integration`                                                                                                                                                                                                          |
| `npm run test:auth`                 | `vitest run tests/integration/auth.integration.test.ts tests/unit/auth-`                                                                                                                                                                |
| `npm run test:auth:unit`            | `vitest run tests/unit/auth-`                                                                                                                                                                                                           |
| `npm run test:auth:integration`     | `vitest run tests/integration/auth.integration.test.ts`                                                                                                                                                                                 |
| `npm run test:auth:security`        | `vitest run tests/integration/auth-security.test.ts`                                                                                                                                                                                    |
| `npm run test:security`             | `vitest run tests/integration/auth-security.test.ts tests/integration/multipart-security.test.ts tests/integration/streaming-security.test.ts src/security/securityIntegration.test.tsx src/features/vault/TodoVault.security.test.tsx` |
| `npm run test:security:integration` | `vitest run src/security/securityIntegration.test.tsx`                                                                                                                                                                                  |
| `npm run test:crypto`               | `vitest run tests/unit/encryption.test.ts tests/unit/server-crypto.test.ts tests/unit/account-session-profile-encryption.test.ts src/lib/__tests__/encryptedMediaStreaming.test.ts`                                                     |
| `npm run test:crypto:unit`          | `vitest run tests/unit/encryption.test.ts`                                                                                                                                                                                              |
| `npm run test:crypto:server`        | `vitest run tests/unit/server-crypto.test.ts`                                                                                                                                                                                           |
| `npm run test:crypto:rotation`      | `vitest run tests/unit/vault-key-rotation.test.ts tests/unit/vault-key-check.test.ts`                                                                                                                                                   |
| `npm run test:vault`                | `vitest run tests/unit/vault-`                                                                                                                                                                                                          |
| `npm run test:vault:core`           | `vitest run tests/unit/vault-item-content.test.ts tests/unit/vault-drag-drop.test.ts tests/unit/legacy-vault-parser.test.ts`                                                                                                            |
| `npm run test:vault:chat`           | `vitest run tests/unit/chat-vault-`                                                                                                                                                                                                     |
| `npm run test:vault:todo`           | `vitest run src/features/vault/TodoVault.security.test.tsx`                                                                                                                                                                             |
| `npm run test:sync`                 | `vitest run tests/unit/sync-`                                                                                                                                                                                                           |
| `npm run test:sync:corruption`      | `vitest run tests/unit/sync-download-corruption.test.ts`                                                                                                                                                                                |
| `npm run test:sync:stores`          | `vitest run tests/unit/activity-store.test.ts tests/unit/privacy-interface-store.test.ts tests/unit/total-user-mirror.test.ts`                                                                                                          |
| `npm run test:settings`             | `vitest run src/features/vault/__tests__/SettingsVault`                                                                                                                                                                                 |
| `npm run test:settings:integration` | `vitest run src/features/vault/__tests__/SettingsVault/SettingsVaultIntegration.test.tsx`                                                                                                                                               |
| `npm run test:shortcuts`            | `vitest run src/features/vault/__tests__/ControlsAndShortcuts.test.tsx src/features/vault/__tests__/ShortcutsCard.test.tsx`                                                                                                             |
| `npm run test:password`             | `vitest run tests/unit/password- tests/unit/pinning.test.ts`                                                                                                                                                                            |
| `npm run test:media`                | `vitest run src/components/ui/video-player.test.tsx src/lib/__tests__/encryptedMediaStreaming.test.ts tests/integration/streaming-security.test.ts src/features/vault/components/MediaVault`                                            |
| `npm run test:video`                | `vitest run src/components/ui/video-player.test.tsx`                                                                                                                                                                                    |
| `npm run test:capture`              | `vitest run src/features/vault/components/LiveCaptureModal`                                                                                                                                                                             |
| `npm run test:streaming`            | `vitest run tests/integration/streaming-security.test.ts`                                                                                                                                                                               |
| `npm run test:streaming:media`      | `vitest run src/lib/__tests__/encryptedMediaStreaming.test.ts`                                                                                                                                                                          |
| `npm run test:avatar`               | `vitest run tests/unit/avatar-pipeline.test.ts tests/unit/mongo-atlas-avatar.test.ts`                                                                                                                                                   |
| `npm run test:multipart`            | `vitest run tests/integration/multipart-security.test.ts tests/unit/upload-validation.test.ts tests/unit/signed-url.test.ts`                                                                                                            |
| `npm run test:monitoring`           | `vitest run tests/unit/sentry-backend.test.ts tests/unit/logrocket-backend.test.ts tests/unit/logrocket-frontend.test.ts`                                                                                                               |
| `npm run test:sentry`               | `vitest run tests/unit/sentry-backend.test.ts`                                                                                                                                                                                          |
| `npm run test:logrocket`            | `vitest run tests/unit/logrocket-`                                                                                                                                                                                                      |
| `npm run test:utils`                | `vitest run tests/unit/env.test.ts tests/unit/fuzzy.test.ts tests/unit/apiClient.test.ts`                                                                                                                                               |
| `npm run test:env`                  | `vitest run tests/unit/env.test.ts`                                                                                                                                                                                                     |
| `npm run test:backup`               | `vitest run tests/unit/backup.test.ts`                                                                                                                                                                                                  |
| `npm run test:lighthouse`           | `vitest run tests/unit/lighthouse-runner.test.ts`                                                                                                                                                                                       |
| `npm run test:reports`              | `vitest run tests/unit/open-report.test.ts`                                                                                                                                                                                             |
| `npm run typecheck`                 | `tsc --noEmit`                                                                                                                                                                                                                          |
| `npm run typecheck:server`          | `tsc --noEmit -p tsconfig.server.json`                                                                                                                                                                                                  |
| `npm run typecheck:all`             | `npm run typecheck && npm run typecheck:server`                                                                                                                                                                                         |
| `npm run lint`                      | `npm run typecheck:all`                                                                                                                                                                                                                 |
| `npm run lint:strict`               | `npm run lint && npm run test:unit`                                                                                                                                                                                                     |
| `npm run format`                    | `prettier --write .`                                                                                                                                                                                                                    |
| `npm run format:check`              | `prettier --check .`                                                                                                                                                                                                                    |
| `npm run dev`                       | `tsx watch server.ts`                                                                                                                                                                                                                   |
| `npm run dev:client`                | `vite`                                                                                                                                                                                                                                  |
| `npm run dev:host`                  | `vite --host`                                                                                                                                                                                                                           |
| `npm run dev:debug`                 | `tsx watch --inspect server.ts`                                                                                                                                                                                                         |
| `npm start`                         | `tsx server.ts`                                                                                                                                                                                                                         |
| `npm run preview`                   | `vite preview`                                                                                                                                                                                                                          |
| `npm run preview:host`              | `vite preview --host`                                                                                                                                                                                                                   |
| `npm run build`                     | `vite build`                                                                                                                                                                                                                            |
| `npm run build:server`              | `esbuild server.ts --bundle --platform=node --format=esm --packages=external --outdir=dist`                                                                                                                                             |
| `npm run build:all`                 | `npm run build && npm run build:server`                                                                                                                                                                                                 |
| `npm run build:prod`                | `node scripts/build-env.mjs --minify=oxc --sourcemap=false --mode=production`                                                                                                                                                           |
| `npm run build:minify:terser`       | `node scripts/build-env.mjs --minify=terser --sourcemap=false --mode=production`                                                                                                                                                        |
| `npm run build:analyze`             | `node scripts/build-env.mjs --analyze`                                                                                                                                                                                                  |
| `npm run build:perf`                | `node scripts/build-env.mjs --mode=production --debug`                                                                                                                                                                                  |
| `npm run build:zip`                 | `npm run build && npm run zip:prod`                                                                                                                                                                                                     |
| `npm run build:zip:analyze`         | `lint:strict + format + format:check + build:analyze + memory:all + backup + backup:info + zip:prod + lighthouse:ci + stats:chrome`                                                                                                     |
| `npm run clean`                     | `node scripts/clean.mjs --build`                                                                                                                                                                                                        |
| `npm run clean:stats`               | `node scripts/clean.mjs --stats`                                                                                                                                                                                                        |
| `npm run clean:vite`                | `node scripts/clean.mjs --vite`                                                                                                                                                                                                         |
| `npm run clean:coverage`            | `node scripts/clean.mjs --coverage`                                                                                                                                                                                                     |
| `npm run clean:reports`             | `node scripts/clean.mjs --reports`                                                                                                                                                                                                      |
| `npm run clean:memory`              | `node scripts/clean.mjs --memory`                                                                                                                                                                                                       |
| `npm run clean:npm`                 | `npm cache clean --force`                                                                                                                                                                                                               |
| `npm run clean:all`                 | `node scripts/clean.mjs --all`                                                                                                                                                                                                          |
| `npm run backup`                    | `node scripts/backup.mjs`                                                                                                                                                                                                               |
| `npm run backup:info`               | `node scripts/backup.mjs --info`                                                                                                                                                                                                        |
| `npm run verify`                    | `npm run lint && npm run test`                                                                                                                                                                                                          |
| `npm run verify:quick`              | `npm run lint && npm run test:auth`                                                                                                                                                                                                     |
| `npm run verify:ci`                 | `npm run doctor && npm run lint && npm run test:ci && npm run build`                                                                                                                                                                    |
| `npm run verify:full`               | `npm run clean:all && npm run doctor && npm run verify && npm run test:all`                                                                                                                                                             |
| `npm run verify:jwt`                | `tsx scripts/verify-jwt.ts`                                                                                                                                                                                                             |
| `npm run doctor`                    | `node scripts/doctor.mjs`                                                                                                                                                                                                               |
| `npm run env:check`                 | `node scripts/env-check.mjs`                                                                                                                                                                                                            |
| `npm run db:ping`                   | `node scripts/db-ping.mjs`                                                                                                                                                                                                              |
| `npm run keepalive`                 | `node scripts/atlas-keepalive.mjs`                                                                                                                                                                                                      |
| `npm run keepalive:once`            | `node scripts/atlas-keepalive.mjs --once`                                                                                                                                                                                               |
| `npm run security:rewrap-kek`       | `tsx server/scripts/rewrapEnvelopeKeys.ts --dry-run`                                                                                                                                                                                    |
| `npm run lighthouse`                | `node scripts/lighthouse-runner.mjs`                                                                                                                                                                                                    |
| `npm run lighthouse:desktop`        | `node scripts/lighthouse-runner.mjs --desktop`                                                                                                                                                                                          |
| `npm run lighthouse:ci`             | `node scripts/lighthouse-runner.mjs --assert --min-score-accessibility=90 --min-score-best-practices=90 --min-score-seo=90 --min-score-performance=65`                                                                                  |
| `npm run lighthouse:split`          | `node scripts/lighthouse-runner.mjs --split-existing-report`                                                                                                                                                                            |
| `npm run lighthouse:open`           | `node scripts/open-report.mjs lighthouse/report-split/index.html`                                                                                                                                                                       |
| `npm run lighthouse:chrome`         | `node scripts/open-report.mjs lighthouse/report-split/index.html --chrome`                                                                                                                                                              |
| `npm run stats`                     | `node scripts/open-report.mjs stats.html`                                                                                                                                                                                               |
| `npm run stats:chrome`              | `node scripts/open-report.mjs stats.html --chrome`                                                                                                                                                                                      |
| `npm run memory:index`              | `node scripts/code-memory-index.mjs`                                                                                                                                                                                                    |
| `npm run memory:visual`             | `node scripts/code-memory-visual.mjs`                                                                                                                                                                                                   |
| `npm run memory:open`               | `node scripts/open-report.mjs .memory/index.html`                                                                                                                                                                                       |
| `npm run memory:all`                | `npm run memory:index && npm run memory:visual && npm run memory:open`                                                                                                                                                                  |
| `npm run update:check`              | `npm outdated`                                                                                                                                                                                                                          |
| `npm run update:safe`               | `npm update`                                                                                                                                                                                                                            |
| `npm run update:all`                | `npx npm-check-updates -u && npm install`                                                                                                                                                                                               |
| `npm run check:audit`               | `npm audit`                                                                                                                                                                                                                             |
| `npm run fix:audit`                 | `npm audit fix`                                                                                                                                                                                                                         |
| `npm run zip:prod`                  | `node scripts/zip-prod.mjs`                                                                                                                                                                                                             |

---

## 20. Performance, Lighthouse & Reporting

```bash
# Run Lighthouse on local dev server
npm run lighthouse

# Run Lighthouse with desktop preset
npm run lighthouse:desktop

# Run Lighthouse CI with strict score thresholds:
# accessibility ≥ 90, best-practices ≥ 90, SEO ≥ 90, performance ≥ 65
npm run lighthouse:ci

# Split existing Lighthouse report for detailed view
npm run lighthouse:split

# Open Lighthouse report in default browser
npm run lighthouse:open

# Open Lighthouse report in Chrome
npm run lighthouse:chrome

# Open Vite bundle stats (rollup-plugin-visualizer output)
npm run stats

# Open stats in Chrome specifically
npm run stats:chrome

# Direct lighthouse-runner commands (Universal single-line)
node scripts/lighthouse-runner.mjs
node scripts/lighthouse-runner.mjs --desktop
node scripts/lighthouse-runner.mjs --split-existing-report
node scripts/lighthouse-runner.mjs --assert --min-score-accessibility=90 --min-score-best-practices=90 --min-score-seo=90 --min-score-performance=65

# Windows PowerShell format
node scripts/lighthouse-runner.mjs --assert `
  --min-score-accessibility=90 `
  --min-score-best-practices=90 `
  --min-score-seo=90 `
  --min-score-performance=65

# Linux / macOS Bash format
node scripts/lighthouse-runner.mjs --assert \
  --min-score-accessibility=90 \
  --min-score-best-practices=90 \
  --min-score-seo=90 \
  --min-score-performance=65
```

---

## 21. Database, Infrastructure & Diagnostics

```bash
# Full project health check (env vars, DB, config validation)
npm run doctor
node scripts/doctor.mjs

# Validate required environment variables
npm run env:check
node scripts/env-check.mjs

# Ping MongoDB Atlas cluster
npm run db:ping
node scripts/db-ping.mjs

# Keep MongoDB Atlas cluster alive (long-running daemon)
npm run keepalive
node scripts/atlas-keepalive.mjs

# Keep alive — one ping then exit
npm run keepalive:once
node scripts/atlas-keepalive.mjs --once

# Open report files in browser
node scripts/open-report.mjs coverage/index.html
node scripts/open-report.mjs lighthouse/report-split/index.html
node scripts/open-report.mjs stats.html
node scripts/open-report.mjs .memory/index.html
node scripts/open-report.mjs coverage/index.html --chrome
```

---

## 22. Security & Key Management Operations

```bash
# Verify a JWT token manually
npm run verify:jwt
npx tsx scripts/verify-jwt.ts

# Dry-run KEK envelope re-wrapping (key rotation preview)
npm run security:rewrap-kek
npx tsx server/scripts/rewrapEnvelopeKeys.ts --dry-run

# npm security audit
npm run check:audit
npm audit

# Fix audit vulnerabilities automatically
npm run fix:audit
npm audit fix

# Fix with --force (use with caution — may introduce breaking changes)
npm audit fix --force
```

---

## 23. Dependency & Package Management

```bash
# Check for outdated packages
npm run update:check
npm outdated

# Update packages within semver ranges (safe)
npm run update:safe
npm update

# Update all packages to latest (including major versions)
npm run update:all
npx npm-check-updates -u && npm install

# Install dependencies
npm install

# Install with exact versions locked
npm ci

# List all installed packages
npm list

# List top-level packages only
npm list --depth=0

# Check specific package version
npm list vitest
npm list typescript
npm list vite

# Install a specific package
npm install <package>
npm install <package>@<version>
npm install --save-dev <package>
```

---

## 24. Memory Index & Code Intelligence

```bash
# Build searchable code memory index (for AI context)
npm run memory:index
node scripts/code-memory-index.mjs

# Build visual code memory graph (HTML)
npm run memory:visual
node scripts/code-memory-visual.mjs

# Open memory index in browser
npm run memory:open
node scripts/open-report.mjs .memory/index.html

# Build index + visual + open (all in one)
npm run memory:all
```

---

## 25. Production Packaging & Deployment

```bash
# Create production zip archive
npm run zip:prod
node scripts/zip-prod.mjs

# Full production release pipeline
npm run build:zip:analyze
# Equivalent to:
#   npm run lint:strict
#   npm run format
#   npm run format:check
#   npm run build:analyze
#   npm run memory:all
#   npm run backup
#   npm run backup:info
#   npm run zip:prod
#   npm run lighthouse:ci
#   npm run stats:chrome

# Create project backup
npm run backup
node scripts/backup.mjs

# Show backup info (size, path, timestamp)
npm run backup:info
node scripts/backup.mjs --info
```

---

## 26. Cross-Device Manual Verification Checklist

### Desktop — Mouse & Trackpad

- **Browsers:** Windows Chrome / Edge / Firefox, macOS Safari / Chrome / Firefox, Linux Chrome / Firefox
- **Steps:**
  1. Hover over any vault card (Notes, Documents, Photos, Passwords, Contacts, Cards, Audio, Todo, Secrets, WiFi)
  2. Click and hold → drag to a sidebar folder pill
  3. Verify native drag ghost shows item (or multi-item badge if multiple selected)
  4. Hover over folder pill → drop zone highlights with glow + border
  5. Release → item moves to folder, success toast appears
  6. Verify single click still opens the card normally (no false trigger)
  7. Verify Escape key cancels drag and resets state

### Mobile Phones — iOS Safari (iPhone)

- **Devices:** iPhone 16 Pro (Dynamic Island), iPhone 15 / 14 (Notch), iPhone SE (compact)
- **Steps:**
  1. **Tap** → card opens immediately, no Quick-Drop Bar flash, no delay
  2. **Scroll** → smooth 60 / 120fps native scroll, zero drag interference
  3. **Hold 200ms** → subtle haptic feedback, GPU-accelerated ghost appears, card dims to 35% opacity
  4. Quick-Drop Bar slides up from bottom, clear of iPhone home indicator (`env(safe-area-inset-bottom)`)
  5. Drag over category pill → pill highlights, edge auto-scroll pauses over drop zone
  6. Release → item moved, toast shown, Quick-Drop Bar cleanly dismisses
  7. Verify no accidental card click after drop (synthetic click suppressed 400ms)
  8. Long press during hold → context menu does not appear (suppressed)

### Mobile Phones — Android

- **Browsers / Devices:** Chrome (Pixel 9), Samsung Internet (Galaxy S24), Firefox (OnePlus 12)
- **Steps:**
  1. Hold card 200ms → drag ghost + Quick-Drop Bar appears
  2. Drag across screen → no conflict with Android system back gesture (Edge swipe)
  3. Drop into folder pill → item moves, state persists after navigation
  4. Verify `body.vault-dragging` disables text selection during drag
  5. Verify no viewport jump or scroll position reset after drop

### Tablets & iPads

- **Devices:** iPad Pro 13" M4, iPad Air, iPad mini, Samsung Galaxy Tab S9
- **Portrait (< 1024px):** Floating Quick-Drop Bar at bottom with safe-area inset
- **Landscape (≥ 1024px):** Desktop sidebar visible — drag directly to sidebar folder buttons
- **Apple Pencil:** Hold card tip for 200ms → lifts → drag into folder → drop cleanly

### Touchscreen Laptops & 2-in-1s

- **Devices:** Microsoft Surface Pro, HP Spectre x360, Dell XPS 15 Touch
- **Steps:**
  1. Trackpad drag → native HTML5 drag handles the operation
  2. Finger touch drag → touch polyfill handles the operation
  3. Switch between trackpad and touch repeatedly → no desync, no ghost stuck on screen

### Security & Edge Case Checklist

- ✅ **Raw TouchEvent Rejection** — `setDraggedVaultItems` rejects `TouchEvent` instances: no drag on tap/scroll
- ✅ **Session DataTransfer Persistence** — payload set in `dragstart` is intact at `drop` via `currentTouchDataTransfer`
- ✅ **Ghost Penetration** — `getElementUnderTouch` hides ghost during `elementFromPoint` — drop targets always resolved
- ✅ **Post-Drag Click Suppression** — 400ms window after drop blocks synthetic click from opening dropped card
- ✅ **Safe-Area Insets** — Quick-Drop Bar respects `env(safe-area-inset-bottom)` on iOS / Android
- ✅ **Auto-Scroll Pause on Drop Zones** — Edge scrolling stops when hovering over a category pill
- ✅ **Single Polyfill Init** — `touchDragDropInitialized` guard prevents duplicate window listeners
- ✅ **User Select Disabled** — `body.vault-dragging` disables text selection and iOS callout during drag
- ✅ **Context Menu Suppressed** — `contextmenu` blocked when `isDraggingActive || pendingDragElement`
- ✅ **`useVaultDragState` Clean** — no `touchend`/`touchcancel` listener that would prematurely wipe `dragFallbackState`

---

## 27. Cross-Platform Shell Execution & Syntax (Windows PowerShell, CMD, Bash, Zsh)

Operating systems and shells interpret multiline commands, environment variables, and globs differently. Use this guide to prevent common syntax errors when copying commands.

### 27.1 Line Continuation Syntax

| Shell / Environment                  | Continuation Character | Example Syntax                                           |
| :----------------------------------- | :--------------------- | :------------------------------------------------------- |
| **Universal (All Shells)**           | _None (Single Line)_   | `npx vitest run test1.ts test2.ts test3.ts`              |
| **Windows PowerShell**               | Backtick (`` ` ``)     | `npx vitest run \` <br> `  test1.ts \` <br> `  test2.ts` |
| **Linux / macOS Bash & Zsh**         | Backslash (`\`)        | `npx vitest run \` <br> `  test1.ts \` <br> `  test2.ts` |
| **Windows Command Prompt (cmd.exe)** | Caret (`^`)            | `npx vitest run ^` <br> `  test1.ts ^` <br> `  test2.ts` |

> [!WARNING]
> In Windows PowerShell, pasting a command with backslashes (`\`) causes PowerShell to treat `\` as an invalid path token, throwing:
> `The term '\' is not recognized as a name of a cmdlet, function, script file, or executable program.`
> **Always use single-line commands or backticks (`` ` ``) in PowerShell.**

### 27.2 Setting Environment Variables for Tests

When overriding concurrency, pool mode, or CI flags inline:

```bash
# Windows PowerShell
$env:VITEST_MAX_THREADS="1"; npm test
$env:VITEST_POOL="threads"; npm test
$env:CI="true"; npm run test:ci

# Linux / macOS Bash & Zsh
VITEST_MAX_THREADS=1 npm test
VITEST_POOL=threads npm test
CI=true npm run test:ci

# Windows Command Prompt (CMD)
set VITEST_MAX_THREADS=1 && npm test
set VITEST_POOL=threads && npm test
set CI=true && npm run test:ci
```

### 27.3 Quoting Globs in Windows PowerShell

In PowerShell, unquoted globs like `tests/unit/vault-*` may trigger PowerShell path expansion before passing arguments to Node.js. Always wrap glob patterns in double quotes:

```powershell
# Recommended in PowerShell:
npx vitest run "tests/unit/vault-*"
npx vitest run "tests/unit/auth-*"
npx vitest run "**/*.test.tsx"

# Avoid in PowerShell (may fail or expand prematurely):
npx vitest run tests/unit/vault-*
```

---

## 28. Passing Arguments to npm Test Scripts (`--` Forwarding Guide)

npm scripts defined in `package.json` accept additional Vitest or Node.js flags by separating them with a double dash (`--`). Any flag placed after `--` is forwarded directly to the underlying `vitest` runner.

### Practical Examples

```bash
# 1. Filter tests by name within a preset npm script
npm test -- -t "AES-GCM"
npm run test:unit -- -t "session revocation"
npm run test:components -- -t "VideoPlayer"

# 2. Stop immediately on first test failure (Fast Fail)
npm test -- --bail=1
npm run test:unit -- --bail=1
npm run test:client -- --bail=1

# 3. Increase test timeouts for slow machines or heavy crypto
npm run test:crypto -- --testTimeout=60000 --hookTimeout=60000
npm run test:server -- --testTimeout=30000

# 4. Target a single file through an npm script
npm run test:run -- tests/unit/encryption.test.ts
npm run test:run -- src/features/vault/TodoVault.security.test.tsx

# 5. Output verbose reporting (each test name + execution time)
npm test -- --reporter=verbose
npm run test:auth -- --reporter=verbose

# 6. Log heap memory usage per test file
npm run test:unit -- --logHeapUsage
npm run test:crypto -- --logHeapUsage

# 7. Update outdated snapshots
npm run test:components -- -u
npm run test:client -- -u

# 8. Force fresh run without cache
npm run test:auth -- --no-cache
npm run test:unit -- --no-cache

# 9. Restrict execution to a single worker (serial run)
npm run test:run -- --maxWorkers=1 --no-file-parallelism

# 10. Generate structured machine-readable reports
npm run test:integration -- --reporter=junit --outputFile=test-results/junit.xml
npm run test:unit -- --reporter=json --outputFile=test-results/unit-results.json

# 11. Run in inspect mode with breakpoint on start
npm run test:unit -- --inspect-brk --no-file-parallelism tests/unit/vault-drag-drop.test.ts

# 12. Run coverage with custom HTML report output
npm run test:coverage -- --coverage.reporter=html --coverage.reporter=text-summary

# 13. Scope coverage to a specific subdirectory
npm run test:coverage -- --coverage.include="src/features/vault/**"

# 14. Randomize execution order to detect test inter-dependencies
npm run test:unit -- --sequence.shuffle

# 15. Diagnose hanging processes through npm
npm run test:run -- --reporter=hanging-process
```

---

## 29. Interactive Vitest Watch Mode Controls

When running `npm run test:watch`, `npm run test:unit:watch`, `npm run test:components:watch`, or direct `npx vitest`, Vitest starts an interactive terminal session. You can press the following single keys while the process is running:

| Key Press | Action                   | Description                                                                    |
| :-------- | :----------------------- | :----------------------------------------------------------------------------- |
| `a`       | **Rerun All Tests**      | Clears filters and reruns every test in the watch scope                        |
| `f`       | **Rerun Failed Only**    | Runs only tests that failed in the previous cycle                              |
| `u`       | **Update Snapshots**     | Updates all changed snapshots with current results                             |
| `p`       | **Filter by Filename**   | Prompts for a filename regex pattern to narrow down watch scope                |
| `t`       | **Filter by Test Title** | Prompts for a test name regex pattern to run matching `it()` / `test()` blocks |
| `c`       | **Clear Console**        | Clears the terminal screen without re-running tests                            |
| `q`       | **Quit Runner**          | Cleanly exits Vitest watch mode                                                |
| `h`       | **Show Help**            | Displays the full interactive command menu in terminal                         |
| `Enter`   | **Trigger Rerun**        | Immediately forces a rerun of current active tests                             |

---

## 30. Test Troubleshooting — Common Errors & Immediate Fixes

### 1. `The term '\' is not recognized as a name of a cmdlet`

- **Cause:** Copied a Linux/macOS bash multiline command with backslashes (`\`) into Windows PowerShell.
- **Fix:** Use the **Universal Single-Line** version of the command, or replace `\` with the PowerShell backtick (`` ` ``).
  ```powershell
  # Fix (Universal single-line):
  npx vitest run tests/unit/encryption.test.ts tests/unit/server-crypto.test.ts
  ```

### 2. `Test timed out of 20000ms exceeded`

- **Cause:** Intensive post-quantum cryptographic key derivation (Argon2id, PBKDF2 with 600,000 iterations, or Kyber keygen) executing on slow CPUs or high CPU load.
- **Fix:** Increase the timeout flags:
  ```bash
  npx vitest run --testTimeout=60000 --hookTimeout=60000 tests/unit/server-crypto.test.ts
  ```

### 3. `Cannot find module 'pqc-kyber'` or alias resolution errors

- **Cause:** Node.js worker pool unable to resolve the path alias `@/` or `./node_modules/pqc-kyber/pqc_kyber.js`.
- **Fix:** Ensure tests run through Vitest (which loads `vitest.config.ts` aliases) with the `threads` pool:
  ```bash
  npx vitest run --pool=threads tests/unit/encryption.test.ts
  ```

### 4. `HTMLCanvasElement.prototype.getContext is not a function`

- **Cause:** jsdom does not implement HTML5 `<canvas>` rendering methods by default.
- **Fix:** Vault provides complete Canvas 2D / WebGL mocks in `tests/setup/mocks/canvas.ts`. Ensure setup files are included or run with Vitest:
  ```bash
  npx vitest run src/features/vault/components/LiveCaptureModal
  ```

### 5. `ResizeObserver / IntersectionObserver is not defined`

- **Cause:** Component tests using responsive layouts or infinite scrolling require DOM observer polyfills.
- **Fix:** Vault automatically registers these mocks via `tests/setup/vitest.setup.ts`. If running standalone, ensure setupFiles are active.

### 6. `JavaScript heap out of memory` / `Worker terminated unexpectedly`

- **Cause:** Concurrently running 90+ test files with full AST parsing and coverage instrumentation exhausts V8 memory limits.
- **Fix:** Restrict workers to 1 or 2, enable explicit garbage collection, and track heap usage:
  ```bash
  npm test
  # Or:
  node --expose-gc ./node_modules/vitest/vitest.mjs run --maxWorkers=1 --logHeapUsage
  ```

### 7. `EADDRINUSE: address already in use :::51204` (Vitest UI)

- **Cause:** A previous instance of `npm run test:ui` was not cleanly terminated.
- **Fix:** Start Vitest UI on an alternative port:
  ```bash
  npx vitest --ui --api.port=51300
  ```

### 8. Test process hangs indefinitely after all tests pass

- **Cause:** An unclosed database connection, pending setTimeout/setInterval, or open network socket is keeping the Node event loop alive.
- **Fix:** Run the hanging process diagnostic reporter to pinpoint the open handle:
  ```bash
  npx vitest run --reporter=hanging-process
  ```

### 9. Stale cache causing false test failures after file edits

- **Cause:** Vite transform cache in `.vite/` or `node_modules/.vitest/` holding outdated compiled modules.
- **Fix:** Clear cache and run fresh:
  ```bash
  npx vitest run --clearCache --no-cache
  npm run clean:vite
  ```

### 10. `No changed source files detected for related tests`

- **Cause:** `scripts/vitest-related.mjs` inspects Git status (`git diff HEAD`). If your git working tree is completely clean, no files are passed.
- **Fix:** Provide the target source file explicitly:
  ```bash
  node scripts/vitest-related.mjs run src/lib/cryptoPrimitives.ts
  node scripts/vitest-related.mjs watch src/features/auth/SecurityLayers.test.tsx
  ```

### 11. `ReferenceError: document is not defined` or `window is not defined`

- **Cause:** React component or DOM hook test executing under default `'node'` environment without browser DOM globals.
- **Fix:** Ensure the test file includes the `/* @vitest-environment jsdom */` comment pragma at line 1, or force the jsdom environment via CLI:
  ```bash
  npx vitest run --environment=jsdom src/components/ui/GlobalVideoMiniPlayer.test.tsx
  ```

### 12. `Module did not self-register` or Native Addon ABI Mismatch

- **Cause:** Native C++ addons (e.g. `@sentry/node-cpu-profiler` or canvas binaries) compiled for a different Node.js version.
- **Fix:** Force Vitest to use the worker `threads` pool and avoid native addons during pure unit testing:
  ```bash
  npx vitest run --pool=threads tests/unit/encryption.test.ts
  ```

---

## 31. Stress Testing, Repeat & Race-Condition Detection

Use these commands to detect intermittent timing issues, race conditions, memory leaks, and async cleanup leaks by running tests repeatedly in automated loops.

> [!IMPORTANT]
> Vitest natively supports the `--retry=<count>` flag (retrying tests when failures occur), but does **not** include a `--repeat` CLI option. Passing `--repeat` triggers `CACError: Unknown option \`--repeat\``.
To repeat passing tests unconditionally, use the project's dedicated cross-platform test repeater script (`npm run test:repeat`or`node scripts/test-repeat.mjs`), or the native PowerShell / Bash shell loops detailed below.

### 31.1 Cross-Platform Test Repeater (`scripts/test-repeat.mjs`)

```bash
# Repeat the entire test suite 5 times sequentially
npm run test:repeat 5
node scripts/test-repeat.mjs 5

# Repeat a specific test file 10 times
npm run test:repeat 10 tests/unit/session-realtime-revocation.test.ts
node scripts/test-repeat.mjs 10 tests/unit/session-realtime-revocation.test.ts

# Repeat a single test with custom flags (e.g. single worker)
node scripts/test-repeat.mjs 5 tests/unit/sync-parallel-engine.test.ts --maxWorkers=1
```

### 31.2 Native Vitest Flaky Test Retries (`--retry`)

```bash
# Automatically retry failed tests up to 3 times
npx vitest run --retry=3 tests/unit/sync-parallel-engine.test.ts

# Automatically retry failed tests up to 5 times (preset npm script)
npm run test:flaky
npx vitest run --retry=5

# Retry failures across an entire directory
npx vitest run --retry=3 tests/integration/
```

### 31.3 Automated Shell Stress Loops

#### Windows PowerShell

```powershell
# Loop 10 times across full test suite — halts immediately on first failure
1..10 | ForEach-Object {
  Write-Host "=== Stress Test Run $_ / 10 ===" -ForegroundColor Cyan
  npm test
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Stress test failed on run $_" -ForegroundColor Red
    break
  }
}

# Stress test a single flaky test file 20 times in PowerShell
1..20 | ForEach-Object {
  Write-Host "Run #$_" -ForegroundColor Yellow
  npx vitest run tests/unit/sync-parallel-engine.test.ts
  if ($LASTEXITCODE -ne 0) { break }
}

# Quick single-line PowerShell loop (paste and run)
1..5 | ForEach-Object { npx vitest run tests/unit/encryption.test.ts }
```

#### Linux / macOS Bash & Zsh

```bash
# Loop 10 times across full test suite — halts on failure
for i in {1..10}; do
  echo "=== Stress Test Run $i / 10 ==="
  npm test || { echo "Failed on run $i"; break; }
done

# Stress test a single file 20 times in Bash
for i in {1..20}; do
  echo "Run #$i"
  npx vitest run tests/unit/sync-parallel-engine.test.ts || break
done

# Quick single-line Bash loop (paste and run)
for i in {1..5}; do npx vitest run tests/unit/encryption.test.ts || break; done
```

### 31.4 Concurrency & Chaos Stress Testing

```bash
# Stress parallel worker execution with maximum CPU allocation
npx vitest run --maxWorkers=8 --sequence.concurrent

# Randomize test execution order to uncover test order dependencies
npx vitest run --sequence.shuffle

# Replay a specific failed shuffle order using the reported random seed
npx vitest run --sequence.shuffle --sequence.seed=1849204
```

---

## 32. Mock Registry Verification & Test Harness Diagnostics

Vault relies on isolated browser mocks in `tests/setup/mocks/` (`canvas.ts`, `observers.ts`, `browser.ts`). Verify that the mock registry itself is functioning as expected before debugging application code.

```bash
# Run all test setup mock verifications
npx vitest run tests/unit/test-setup-mocks.test.ts

# Verbose inspection of all mock assertions
npx vitest run --reporter=verbose tests/unit/test-setup-mocks.test.ts

# Verify Canvas 2D and WebGL polyfill mocks
npx vitest run tests/unit/test-setup-mocks.test.ts -t "Canvas"

# Verify DOM observers (ResizeObserver, IntersectionObserver, MutationObserver)
npx vitest run tests/unit/test-setup-mocks.test.ts -t "Observer"

# Verify Web Storage polyfills (localStorage, sessionStorage)
npx vitest run tests/unit/test-setup-mocks.test.ts -t "Storage"

# Test isolation comparison: verify sandbox clean state between tests
npx vitest run --isolate=true tests/unit/activity-store.test.ts
npx vitest run --no-isolate tests/unit/activity-store.test.ts
```

---

## 33. Local CI Simulation & Pre-Commit / Pre-Push Workflows

Replay the exact CI validation pipeline locally before opening a pull request or pushing commits to remote branches.

### 33.1 Full CI Pipeline Simulation

#### Windows PowerShell

```powershell
$env:CI="true"
$env:GITHUB_ACTIONS="true"
npm run doctor
npm run lint
npm run test:ci
npm run build
```

#### Linux / macOS Bash & Zsh

```bash
CI=true GITHUB_ACTIONS=true npm run verify:ci
```

### 33.2 Fast Pre-Commit Bundle (< 15 seconds)

Run this lightweight verification before committing code:

```bash
# Pre-commit bundle: format check + typecheck + fast critical unit tests
npm run format:check && npm run typecheck && npm run test:fast -- tests/unit/encryption.test.ts tests/unit/auth-validator.test.ts
```

### 33.3 Pre-Push Comprehensive Verification

Run this before pushing to `main` or a feature branch:

```bash
# Pre-push bundle: typecheck all + unit suite + security integration + client build
npm run typecheck:all && npm run test:unit && npm run test:security && npm run build
```

---

## 34. Network, REST API & Supertest Backend Commands

Commands targeting server controllers, Express middleware, and REST API routes via `supertest`:

```bash
# Auth REST API supertest integration (login, register, token refresh, rate limits)
npx vitest run tests/unit/auth-api.test.ts

# Verbose inspect of all HTTP request/response cycles
npx vitest run --reporter=verbose tests/unit/auth-api.test.ts

# Real-time WebSocket / SSE session revocation API
npx vitest run tests/unit/session-realtime-revocation.test.ts

# reCAPTCHA middleware request verification (trust proxy, user agent, IP headers)
npx vitest run tests/unit/recaptchaMiddleware.test.ts

# 2FA security hardening middleware and model validations
npx vitest run tests/unit/two-factor-hardening.test.ts

# API client axios interceptor and retry loop verification
npx vitest run tests/unit/apiClient.test.ts

# Multipart chunk upload integrity and boundary attacks
npx vitest run tests/integration/multipart-security.test.ts

# Upload MIME validation and filename sanitization
npx vitest run tests/unit/upload-validation.test.ts

# Pre-signed S3/Blob URL generation and token expiry checks
npx vitest run tests/unit/signed-url.test.ts
```
