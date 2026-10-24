# 🛠️ Vault Troubleshooting & Incident Resolution Manual (`doc/troubleshooting.md`)

<p align="left">
  <a href="./README.md">← Back to Documentation Hub</a> •
  <a href="#1-client-side-cryptography--kdf-issues">Crypto Issues</a> •
  <a href="#2-authentication--session-revocation">Auth & Sessions</a> •
  <a href="#3-database--cluster-failover-errors">Database Failover</a> •
  <a href="#4-resumable-uploads--media-streaming">Uploads & Streaming</a> •
  <a href="#5-real-time-sync--socketio-reconciliation">Sync & Socket.IO</a> •
  <a href="#6-build-compression--bundler-issues">Build & Compression</a>
</p>

This technical guide provides systematic diagnostics, root-cause analyses, and resolution procedures for errors encountered during development, deployment, and live operation of the Vault platform.

---

## 1. Client-Side Cryptography & KDF Issues

### 1.1 `Sentinel __keycheck__ verification failed` or "Invalid Master Password"

- **Symptom**: User enters credentials, but unlock fails with a sentinel integrity error even though the user believes the password is correct.
- **Root Cause**:
  1. Incorrect master password supplied.
  2. The salt stored in the user profile was mutated or truncated during migration.
  3. SubtleCrypto / WebAssembly Argon2 memory allocation failure on low-memory mobile browsers.
- **Diagnostic Steps**:
  1. Check browser console logs for `[CryptoService] WebWorker KDF derivation failed`.
  2. Verify that the user's `argon2Params` match default specifications (`m=65536, t=3, p=4`).
  3. Inspect `tests/unit/crypto-sentinel.test.ts` to reproduce the derivation flow in an isolated test environment.
- **Resolution**:
  - If password is lost: By design, zero-knowledge architecture prohibits server-side password resets. Advise user to utilize their 24-word Emergency Recovery Kit.
  - If WebWorker failed: Vault falls back automatically to the main thread WebCrypto Subtle API implementation. Verify that the browser supports `window.crypto.subtle`.

### 1.2 `SubtleCrypto.decrypt: operation-specific error`

- **Symptom**: Payload decryption throws an unhandled cryptographic DOMException.
- **Root Cause**:
  - The encrypted ciphertext IV/nonce or authentication tag (last 16 bytes in AES-256-GCM) is corrupted or truncated.
  - Payload was encrypted with a different subkey or key version.
- **Resolution**:
  - Inspect the raw ciphertext envelope: ensure format complies with `VCAS01` prefix followed by the IV and tag.
  - Run the diagnostic script: `npm run test:crypto` to verify cipher compatibility.

---

## 2. Authentication & Session Revocation

### 2.1 `401 Unauthorized: Session Revoked or Expired` Loop

- **Symptom**: The client repeatedly triggers the `SessionRevokedModal` or is kicked back to the login screen.
- **Root Cause**:
  - The JWT refresh token rotation detected a concurrent reuse attempt (token reuse attack defense).
  - Clock skew between the client device and the server exceeds 60 seconds.
- **Resolution**:
  1. Synchronize the client system clock (NTP).
  2. Inspect server session logs:
     ```bash
     npm run dev:debug
     ```
  3. Ensure cookies are configured with `SameSite=Strict; Secure; HttpOnly` in production, or `SameSite=Lax` in local development without HTTPS.

### 2.2 Duress PIN Decoy Partition Triggered Accidentally

- **Symptom**: The vault appears completely empty with only generic decoy files visible.
- **Root Cause**: The user unlocked the application using their configured Duress Decoy PIN rather than their primary master password.
- **Resolution**:
  - Refresh or close the tab, then re-enter the primary Master Password.
  - If the duress partition auto-wiped the local device state, log in anew; genuine cloud payloads remain securely intact on the primary partition.

---

## 3. Database & Cluster Failover Errors

### 3.1 `MongoServerSelectionError: connection timed out`

- **Symptom**: Backend API outputs MongoDB connection timeout and fails to handle incoming requests.
- **Root Cause**:
  - Primary MongoDB Atlas cluster is undergoing maintenance, network disruption, or IP whitelist restriction.
- **Resolution**:
  1. Verify the `MONGODB_URI` and secondary fallback `MONGODB_URI_STANDBY` in your `.env`:
     ```env
     MONGODB_URI=mongodb+srv://primary.example.mongodb.net/vault
     MONGODB_URI_STANDBY=mongodb+srv://secondary.example.mongodb.net/vault
     ```
  2. The `MultiClusterPool` automatically attempts failover after 3 consecutive failures. Check server status logs:
     ```bash
     npm run start
     ```
  3. Confirm your public IP is added to the MongoDB Atlas Network Access allowlist (`0.0.0.0/0` with secure credentials or specific static IP).

---

## 4. Resumable Uploads & Media Streaming

### 4.1 TUS Resumable Upload Failing at 99% (`Checksum Mismatch`)

- **Symptom**: Large file upload progresses to completion but is rejected by the server on final merge.
- **Root Cause**:
  - Client chunk hashing differed from the final server SHA-256 validation.
  - Temporary disk space exhaustion on `/tmp` or `uploads/` directory.
- **Resolution**:
  1. Inspect the server upload path disk capacity:
     ```powershell
     Get-PSDrive -PSProvider FileSystem
     ```
  2. Check `uploads/temp/` for orphaned chunks and clear incomplete uploads older than 24 hours:
     ```powershell
     Remove-Item -Path "uploads/temp/*" -Recurse -Force
     ```
  3. Re-run chunk verification tests: `npm run test:api`.

### 4.2 Video Mini-Player "Media Stream Expired (HMAC 403)"

- **Symptom**: Picture-in-Picture video playback halts after 5 minutes with a black screen.
- **Root Cause**:
  - Media stream tokens are strictly signed using HMAC-SHA256 with a 300-second TTL for zero-knowledge privacy.
- **Resolution**:
  - The `videoMiniPlayerStore` handles token refresh automatically in the background. If streaming fails, verify that Socket.IO connection is active so real-time token re-signing signals are received.

---

## 5. Real-Time Sync & Socket.IO Reconciliation

### 5.1 Multi-Device Sync Conflicts (Lost Updates)

- **Symptom**: Edits made on Device B overwrite edits made simultaneously on Device A.
- **Root Cause**:
  - Vault uses a deterministic _Latest-Update-Wins_ arbitration strategy based on cryptographically signed timestamps.
- **Resolution**:
  - For notes, the TipTap 3.32 engine maintains an internal operation buffer. Ensure the device has not lost WebSocket connection:
  - Check the status dot in the bottom right corner of the Vault sidebar:
    - 🟢 Green: Connected and synchronized.
    - 🟡 Amber: Reconnecting; local mutations buffered in RAM.
    - 🔴 Red: Offline; local modifications preserved until reconnection.

---

## 6. Build, Compression & Bundler Issues

### 6.1 `Cannot find module '@rollup/rollup-win32-x64-msvc'`

- **Symptom**: `npm run build` or `vite build` crashes during native binary resolution on Windows.
- **Resolution**:
  ```powershell
  npm rebuild
  # or clean install
  npm ci
  ```

### 6.2 Pre-Compression Script Fails (`oxc-minify` or `brotli`)

- **Symptom**: Running `npm run build:prod` fails during the post-build pre-compression phase.
- **Resolution**:
  1. Run fallback standard build:
     ```powershell
     npm run build
     ```
  2. If using custom compression flags, test via:
     ```powershell
     node scripts/build-env.mjs --minify=terser --sourcemap=false
     ```
