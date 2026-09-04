# VAULT ZERO-KNOWLEDGE E2EE ARCHITECTURE: AUTHENTICATION & SECURITY AUDIT PROMPT

You are a **Principal Application Security Architect, Cryptographer, Backend Security Engineer, and Lead Penetration Tester**.

You are tasked with conducting a **comprehensive, zero-assumption, production-readiness security and cryptographic audit** of the **Vault** project located in `C:\code\vault`.

Do not assume that existing logic is secure simply because tests pass or code runs without exceptions. **Inspect every line of code, trace every cryptographic operation, verify frontend/backend consistency, analyze memory lifetimes, test edge-case race conditions, and assess resilience against advanced adversarial threats.**

---

# 1. CODEBASE SPECIFICATION & AUDIT SCOPE

Audit every authentication, authorization, session, cryptographic, and account security component across both frontend and backend:

### Core Server Endpoints & Controllers

- **Auth Controller & Routes**: `server/controllers/authController.ts`, `server/routes/authRoutes.ts`, `server/validators/authValidator.ts`, `server/validators/requestChainValidator.ts`
- **Two-Factor Authentication**: `server/controllers/twoFactorController.ts`, `server/routes/twoFactorRoutes.ts`, `server/services/twoFactorService.ts`, `server/validators/twoFactorValidator.ts`
- **Master Key Cloud Management**: `server/controllers/masterKeyController.ts`, `server/routes/masterKeyRoutes.ts`, `server/services/masterKeyService.ts`
- **Integrity & Merkle Audit**: `server/controllers/integrityController.ts`, `server/routes/integrityRoutes.ts`, `server/services/integrityService.ts`, `server/utils/merkleTree.ts`, `server/models/vaultIntegrity.ts`
- **Security & Device Operations**: `server/routes/securityRoutes.ts`, `server/services/securityDashboardService.ts`, `server/services/requestFingerprintService.ts`, `server/services/aiAnomalyDetectionService.ts`, `server/services/anomalyDetectionService.ts`, `server/services/threatResponseService.ts`, `server/services/adaptiveRateLimitService.ts`
- **Storage & Upload Security**: `server/controllers/tusController.ts`, `server/controllers/drmController.ts`, `server/services/uploadSecurityService.ts`, `server/services/folderCryptoService.ts`, `server/services/drmPackagingService.ts`
- **Legacy & Multi-Cluster Aggregators**: `server/services/legacyVaultService.ts`, `server/services/vaultAuthService.ts`, `server/services/vaultService.internal.ts`, `server/services/multiClusterAggregator.ts`, `server/services/multiClusterPool.ts`, `server/services/totalUserMirrorService.ts`

### Cryptographic & Auth Utilities

- **Backend Crypto**: `server/utils/crypto.ts` (Scrypt `s2$` hashing, AES-256-GCM, ChaCha20-Poly1305, Envelope KEK `VCAS01`/`VENV02`, KEK Ring, constant-time `timingSafeEqual`)
- **Auth & JWT Utilities**: `server/utils/auth.ts` (Access tokens, refresh tokens, MFA tokens, token family generation, cookie configuration)
- **Security Middleware**: `server/middleware/authMiddleware.ts`, `server/middleware/csrfOriginMiddleware.ts`, `server/middleware/csrfProtection.ts`, `server/middleware/recaptchaMiddleware.ts`, `server/middleware/mongoSanitize.ts`, `server/middleware/originProtection.ts`, `server/middleware/errorHandler.ts`
- **Database Models**: `server/models/user.ts`, `server/models/RefreshToken.ts`, `server/models/masterKey.ts`, `server/models/vaultItem.ts`, `server/models/folder.ts`, `server/models/activityLog.ts`, `server/models/notification.ts`

### Client Cryptography, Auth & State

- **Client Cryptographic Primitives**: `src/lib/cryptoPrimitives.ts` (Argon2id KDF worker/direct, Dual-Engine Cascade `VCAS01`, ChaCha20-Poly1305, AES-256-GCM, PBKDF2 100k rounds Duress PIN hashing, XOR key splitting `splitKey`/`reconstructKey`, 60-second RAM Key Shredder `touchCryptoKeyCache`/`clearCryptoKeyCache`)
- **Hybrid Key Exchange & Encryption**: `src/lib/encryption.ts` (X25519 + Kyber768 Post-Quantum Key Exchange, stream decryption, WebCrypto wrappers)
- **Auth Frontend Logic & Hooks**: `src/features/auth/useVaultAuth.ts`, `src/features/auth/AuthScreen.tsx`, `src/features/auth/VaultLoginForm.tsx`, `src/features/auth/SecurityLayers.tsx`
- **Client API & Session Management**: `src/lib/auth-api.ts`, `src/lib/auth-session.ts`, `src/lib/auth-cookie-manager.ts`, `src/lib/csrf.ts`, `src/lib/cloudMasterKey.ts`, `src/lib/cloudMasterKeyApi.ts`
- **Zustand State Stores**: `src/store/vaultStore.ts` (Unlock, lock, decoy unlock, key rotation, local emergency wipe, keycheck verification), `src/store/integrityStore.ts`, `src/store/activityStore.ts`
- **Security UI Components & Tests**: `src/features/vault/SettingsVault.tsx`, `src/components/security/ForensicWatermark.tsx`, `src/components/security/VaultIntegrityAlarmBanner.tsx`, `tests/integration/auth-security.test.ts`, `tests/integration/auth.integration.test.ts`, `tests/unit/encryption.test.ts`

---

# 2. ARCHITECTURE MAP & SECURITY FLOWS

Trace and map the 8 critical architectural paths in the Vault system:

```text
Flow 1: Registration Flow
Frontend (Username + Password + MasterKey + PQC Salt)
  ↓ Argon2id KDF (Client: deriveKey)
  ↓ Hybrid Key Exchange (X25519 + Kyber768)
  ↓ POST /api/auth/signup (Rate limiter + Captcha + Origin Guard)
  ↓ Server Password Hashing (Scrypt s2$ + Pepper + Salt)
  ↓ Server MasterKey Envelope Encryption (AES-256-GCM via VAULT_ENCRYPTION_KEY)
  ↓ MongoDB User Document + RefreshToken Creation + Default Folders Init
  ↓ Issue JWT Access Token + HttpOnly Refresh Token Cookie

Flow 2: Normal Login Flow
Frontend (Username + Password + MasterKey)
  ↓ Decoy / Duress Check (Client-side PBKDF2 100k against stored hashes)
  ↓ POST /api/auth/login
  ↓ Constant-Time Scrypt Comparison (comparePassword with dummy fallback)
  ↓ 2FA Enabled?
      ├── YES → Issue Short-lived mfaToken → Trigger Step 2 (POST /api/2fa/login)
      └── NO  → Revoke Zombie Sessions → Issue Session Pair (Access + Refresh)
  ↓ Client Derives Master Key via Argon2id KDF
  ↓ Vault Unlock & Keycheck Verification (unlockVaultWithCandidateSalts)
  ↓ 60-Second Inactivity RAM Key Shredder Timer Activated

Flow 3: Decoy / Duress Vault Flow
Frontend receives PIN/Password
  ↓ PBKDF2 100,000 rounds + SHA-256 fallback comparison
  ↓ Match found in stored decoy hashes
  ↓ Intercept flow: DO NOT call /api/auth/login with real credentials
  ↓ Simulate 8-Layer Security Protocol UI
  ↓ Call vaultStore.unlockDecoyVault() (Mount in-memory isolated decoy mock vault)
  ↓ Zero leakage to backend network logs

Flow 4: Two-Factor Authentication (TOTP + Backup Codes)
User initiates 2FA Setup
  ↓ POST /api/2fa/setup (Generate secret via speakeasy/otpauth + encrypt at rest)
  ↓ POST /api/2fa/verify (Verify OTP token + Generate 10 CSPRNG Backup Codes + Enable 2FA)
  ↓ Login Challenge: POST /api/2fa/login (Validate mfaToken signature + verify OTP/Burn Backup Code)
  ↓ POST /api/2fa/disable (Requires live OTP token re-verification)

Flow 5: Dual-Engine Cascade File Encryption (VCAS01)
Raw File Buffer (Client-Side)
  ↓ Generate 64-byte DEK (32B AES-GCM DEK + 32B ChaCha20 DEK)
  ↓ Layer 1: Encrypt Payload with AES-256-GCM (AAD: vault:e2ee:aes-gcm:v2)
  ↓ Layer 2: Encrypt AES Ciphertext with ChaCha20-Poly1305 (AAD: vault:e2ee:chacha20-poly1305:v1)
  ↓ Encrypt 64-byte DEK with Master KEK (AES-256-GCM, AAD: vault:dek:cascade-gcm:v1)
  ↓ Assemble 122-Byte Header VCAS01 Bundle
  ↓ Memory Sanitization: Explicit .fill(0) on raw DEKs and intermediate plaintext buffers

Flow 6: Cloud Master Key Storage & Zero-Knowledge Verification
Client-Side Encrypted Master Key
  ↓ POST /api/master-key/save (Encrypted payload + SHA-256 verification hash)
  ↓ POST /api/master-key/verify (Constant-time hash comparison without exposing key)
  ↓ GET /api/master-key/retrieve (Restricted to authenticated user & device)

Flow 7: Merkle Tree Vault Integrity
User vault modifications
  ↓ Update leaf hashes (SHA-256 of item ciphertext + metadata)
  ↓ Compute Merkle root in server & client
  ↓ Compare Merkle proof on sync (POST /api/integrity/verify-tree)
  ↓ Discrepancy triggers VaultIntegrityAlarmModal & locks tampering

Flow 8: Dead Man's Switch & Emergency Local Wipe
Failed unlock attempt
  ↓ Increment failed attempt counter (vault_failed_unlock_attempts)
  ↓ Reaches maxFailedAttemptsBeforeWipe threshold (Default: 10)
  ↓ Trigger emergencyLocalWipe()
  ↓ Shred IndexedDB, LocalStorage, SessionStorage, memory keys
  ↓ Log emergency destruction event
```

---

# 3. REGISTRATION & SIGNUP SECURITY AUDIT

Audit `server/services/authService.ts`, `server/services/vaultAuthService.ts`, `server/routes/authRoutes.ts`, `src/features/auth/useVaultAuth.ts`:

### Input Validation & Normalization

- **Username Sanitization**: Verify lowercase conversion, NFKC unicode normalization, regex `/^[a-z0-9._@+-]+$/`, length constraints (3–64 chars).
- **Password Policy Enforcement**: Validate minimum length (8 or 16 depending on mode), complexity requirements (uppercase, lowercase, digits, symbols), rejection of whitespace.
- **Credential Separation**: Verify that `password !== masterKey` is strictly enforced (`AUTH_SAME_CREDENTIALS`).
- **Timing & Enumeration Resistance**: Verify that duplicate registration attempts execute dummy password comparisons (`comparePassword(password, CONFIG.dummyPasswordHash)`) to prevent username enumeration via timing differentials.
- **Anti-Automation**: Confirm reCAPTCHA verification (`requireRecaptcha({ action: 'auth_register' })`) and IP/route rate limiters (`ipAuthLimiter`, `authLimiter`).

### Password Hashing & Pepper Architecture

- **Scrypt Parameters**: Inspect `server/utils/crypto.ts`. Confirm $N=32768, r=8, p=1, keyLen=64, maxmem=128\text{MB}$.
- **Pepper Management**: Verify `AUTH_PEPPER` is appended to passwords prior to scrypt hashing. Confirm that production crashes immediately if `AUTH_PEPPER` is absent or default.
- **Salt Entropy**: Confirm 16-byte CSPRNG salts per user (`crypto.randomBytes(16)`).
- **Hash Format**: Verify serialization format `s2$N$r$p$keyLen$saltHex$hashHex`.

---

# 4. LOGIN & AUTHENTICATION PROTOCOL AUDIT

Audit `server/controllers/authController.ts`, `server/services/authService.ts`, `server/utils/auth.ts`, `src/features/auth/useVaultAuth.ts`:

### Credential Verification & Timing Attack Defense

- **Constant-Time Verification**: Check `comparePassword()`. When a user does not exist in MongoDB, verify that a full dummy scrypt derivation is computed against `DUMMY_SALT` and compared against `DUMMY_HASH_BUFFER` using `crypto.timingSafeEqual()`.
- **NFKC Normalization**: Ensure input passwords and stored hashes are normalized consistently.
- **Legacy Format Migration**: Verify that legacy encrypted passwords or `salt:hash` formats are migrated securely to the `s2$` format upon successful authentication.

### Two-Factor Interception

- **MFA Challenge Flow**: If `user.twoFactorEnabled === true`, verify that:
  1. No session tokens (access or refresh) are issued.
  2. A signed, short-lived JWT `mfaToken` (valid for $\le 5$ minutes) containing `{ sub: userId, username }` is returned.
  3. The client transitions to the OTP screen without exposing vault data.

### Brute-Force, Rate Limiting & Anomaly Detection

- **Layered Rate Limits**:
  - IP pool limit (`ipAuthLimiter`): 200 req / 15 min.
  - User-specific limit (`authLimiter`): 100 req / 15 min keyed by `IP:path:username`.
  - Stricter 2FA limit (`twoFactorLimiter`): 10 req / 15 min.
- **Anomaly Detection**: Verify `anomalyDetectionService` and `aiAnomalyDetectionService` track failed attempts per user and IP, logging alerts on unusual device/location footprints.
- **Zombie Session Cleanup**: Verify that old unrevoked sessions on the same device or previous logins are revoked when a new password login occurs.

---

# 5. DECOY & DURESS VAULT SECURITY AUDIT

Audit `src/lib/cryptoPrimitives.ts`, `src/features/auth/useVaultAuth.ts`, `src/store/vaultStore.ts`, `src/features/vault/SettingsVault.tsx`:

### Zero-Knowledge Duress Interception

- **Client-Side Interception**: Verify that when a user enters a Duress/Decoy PIN:
  1. The PIN is hashed using `PBKDF2` (100,000 iterations, SHA-256, `vault-decoy:` salt) via `hashDecoyPin()`.
  2. The candidate hash is compared against stored hashes using `timingSafeEqualStrings()`.
  3. If matched, the application **immediately aborts the server network call** and calls `useVaultStore.getState().unlockDecoyVault(username)`.
- **Zero Network Artifacts**: Confirm that no HTTP request containing decoy credentials or signaling decoy status is ever transmitted to `/api/auth/login` or any server route.
- **In-Memory Isolation**: Verify that decoy vault data is populated with convincing mock records (fake notes, fake files, fake logins) and never merges with real encrypted IndexedDB records.
- **Indistinguishability Analysis**: Verify that UI transitions, timing delays (`LAYER_UI_DELAY_MS`), and animations in `SecurityLayers.tsx` are pixel-perfect and timing-identical between real and decoy unlocks.

---

# 6. 2FA, TOTP & RECOVERY BACKUP CODE AUDIT

Audit `server/controllers/twoFactorController.ts`, `server/services/twoFactorService.ts`, `server/routes/twoFactorRoutes.ts`, `server/models/user.ts`:

### TOTP Setup & Secret Storage

- **Secret Generation**: Confirm base32 secret generation using cryptographically secure random bytes via `speakeasy`/`otpauth`.
- **Encryption at Rest**: Verify `twoFactorSecret` and `twoFactorTempSecret` are stored in MongoDB as encrypted fields (`encryptedFieldSchema` via `encryptText`), never plaintext.
- **Two-Step Confirmation**: Confirm 2FA is **never** marked `twoFactorEnabled: true` until the user successfully verifies a live OTP from the temporary secret.

### Verification & Replay Protection

- **Time Drift Window**: Verify `speakeasy.totp.verify` uses an appropriate window ($\le \pm 1$ step / 30 seconds).
- **Replay Attack Prevention**: Check `twoFactorLastUsedTimestamp`. Verify that if an OTP timestamp $\le$ `twoFactorLastUsedTimestamp`, the OTP is rejected to prevent replay within the same 30-second window.
- **MFA Token Binding**: Verify `/api/2fa/login` requires the valid signed `mfaToken` and validates `decoded.sub === userId`.

### Single-Use Recovery Backup Codes

- **Generation & Entropy**: Confirm generation of 10 cryptographically random backup codes (e.g. 10–12 hex/alphanumeric characters).
- **Storage & Consumption**: Check whether backup codes are hashed at rest. Verify that when a backup code is used:
  1. It is permanently removed / marked used in MongoDB (`$pull` or atomic update).
  2. It cannot be reused under concurrent race-condition attempts.
- **Disable Protection**: Verify `/api/2fa/disable` requires live OTP verification or master-key re-authentication.

---

# 7. CLIENT-SIDE CRYPTOGRAPHY & ENVELOPE CIPHER AUDIT

Audit `src/lib/cryptoPrimitives.ts`, `src/lib/encryption.ts`, `server/utils/crypto.ts`:

### Dual-Engine Cascade Envelope (`VCAS01`)

- **Header Structure**:
  $$\text{Magic (6B: 'VCAS01')} \parallel \text{KEK IV (12B)} \parallel \text{Encrypted DEKs (80B)} \parallel \text{AES IV (12B)} \parallel \text{ChaCha Nonce (12B)} \parallel \text{Ciphertext}$$
- **Cascade Cipher Execution**:
  1. Generate 64-byte random DEK: 32B for AES-256-GCM + 32B for ChaCha20-Poly1305.
  2. Layer 1 (Inner): Encrypt plaintext with AES-256-GCM ($\text{AAD} = \text{"vault:e2ee:aes-gcm:v2"}$).
  3. Layer 2 (Outer): Encrypt AES ciphertext with ChaCha20-Poly1305 ($\text{AAD} = \text{"vault:e2ee:chacha20-poly1305:v1"}$).
  4. DEK Wrapping: Encrypt the 64B DEK with Master KEK via AES-256-GCM ($\text{AAD} = \text{"vault:dek:cascade-gcm:v1"}$).
- **Post-Quantum Hybrid Key Exchange**: Verify `performHybridKeyExchange()` correctly binds X25519 ECDH and Kyber768 KEM shared secrets.

### Memory Lifetime & Anti-RAM Dump Shredding

- **60-Second Inactivity RAM Shredder**: Inspect `touchCryptoKeyCache()` and `clearCryptoKeyCache()`. Confirm that after 60 seconds of user inactivity, all cached `CryptoKey` instances in `cryptoKeyCache` are evicted and garbage-collected.
- **Explicit Zero-Out**: Confirm that raw key buffers (`keyBuf`, `dekBytes`, `derivedKey`, `decryptedDekBuf`) immediately execute `.fill(0)` after WebCrypto import or decryption.
- **Two-Share XOR Key Splitting**: Verify `splitKey()` and `reconstructKey()` create two cryptographically independent shares ($K = S_A \oplus S_B$) and shred intermediate memory.

### Fast Key Rotation

- **Envelope KEK Rotation**: Inspect `rotateItemEnvelopeKey()`. Verify that when the user changes their Master Key:
  1. Only the 80-byte encrypted DEK header is re-wrapped with the new KEK.
  2. Large file payloads are NOT re-encrypted, preventing data corruption and timeouts.
  3. The operation verifies authentication tags before committing changes.

---

# 8. CLOUD MASTER KEY & ZERO-KNOWLEDGE AUDIT

Audit `server/controllers/masterKeyController.ts`, `server/services/masterKeyService.ts`, `server/routes/masterKeyRoutes.ts`, `src/lib/cloudMasterKey.ts`:

### Zero-Knowledge Architecture

- **Server Key Blindness**: Verify that the server **never** receives the plaintext Master Key. The client only sends:
  - `encryptedMasterKey`: AES-256-GCM ciphertext encrypted with client-derived key.
  - `masterKeyHash`: SHA-256 hash of the master key for unlock verification.
  - `metadata`: Argon2id KDF derivation parameters.
- **Payload Bounds & Schema Sanitization**: Verify `MAX_BASE64_FIELD_LENGTH` (8192B), `MAX_MASTER_KEY_HASH_LENGTH` (256B), and strict base64 regex validation to prevent payload inflation and NoSQL injection.
- **Master Key Change Re-Authentication**: Confirm that changing the cloud master key requires validating the current account password (`comparePassword`) and verifying that the new key $\ne$ account password.
- **Audit History**: Verify `masterKeyHistorySchema` archives previous encrypted key versions upon modification.

---

# 9. SESSION LIFECYCLE, TOKEN ROTATION & REVOCATION

Audit `server/utils/auth.ts`, `server/services/authService.ts`, `server/models/RefreshToken.ts`, `server/middleware/authMiddleware.ts`, `src/lib/auth-session.ts`:

### Token Specifications

- **Access Tokens**: Short-lived JWT (15 minutes), signed with `JWT_SECRET`, containing `userId`, `username`, `sessionId`.
- **Refresh Tokens**: Cryptographically random 64-byte tokens, stored in MongoDB as SHA-256 hashes (`tokenHash`), mapped to a `familyId` and `sessionId`.
- **Cookie Configuration**:
  ```text
  HttpOnly: true
  Secure: true (in production)
  SameSite: 'Strict' or 'Lax' (configured appropriately for CORS)
  Path: /api/auth
  Max-Age: 7 days
  ```

### Refresh Token Family & Reuse Hijacking Detection

- **Automatic Rotation**: On every `/api/auth/refresh`, issue a new access token and a new refresh token.
- **Token Reuse Detection**: If a previously-used or revoked refresh token is presented:
  1. Detect potential token theft / replay attack.
  2. **Immediately revoke all tokens in the entire `familyId`**.
  3. Mark all associated sessions revoked in `user.sessions`.
  4. Log high-severity security alert.

### Session Revocation Matrix

Verify that:

1. `/api/auth/logout`: Revokes the current session and clears cookies.
2. `/api/auth/sessions/revoke`: Allows revoking a specific `sessionId`, a specific `deviceId`, or all other sessions (`revokeAllOther: true`).
3. **Password Change**: Automatically revokes all active refresh tokens and sessions.
4. **Backend Enforcement**: Confirm `requireAuth` middleware verifies `session.revokedAt === null` and `session.expiresAt > now` on every protected request.

---

# 10. MERKLE TREE INTEGRITY & ANTI-TAMPERING AUDIT

Audit `server/controllers/integrityController.ts`, `server/services/integrityService.ts`, `server/utils/merkleTree.ts`, `src/store/integrityStore.ts`:

### Merkle Tree Construction

- **Leaf Node Generation**: Verify that each leaf hash is computed deterministically from item ciphertext, IV, authTag, and item ID:
  $$\text{Leaf} = \text{SHA-256}(\text{itemId} \parallel \text{cipherText} \parallel \text{iv} \parallel \text{authTag} \parallel \text{updatedAt})$$
- **Root Verification**: Verify that the server computes and stores the Merkle root in `VaultIntegrity`.
- **Tamper Alarm Trigger**: Verify that if a client detects a root hash mismatch during sync:
  1. `integrityStore` flags `tamperDetected = true`.
  2. `VaultIntegrityAlarmBanner` and `VaultIntegrityAlarmModal` lock the UI.
  3. Client blocks writing compromised state to IndexedDB.

---

# 11. AUTHORIZATION, IDOR & BOLA AUDIT

Audit every data endpoint in `server/routes/vaultRoutes.ts`, `server/routes/contactRoutes.ts`, `server/routes/avatarRoutes.ts`:

### Ownership & Tenant Isolation

- **Resource Ownership**: Verify that every CRUD query includes `{ userId: req.user.userId, _id: itemId }` or `{ username: req.user.username }`.
- **IDOR Test Matrix**:
  - Test accessing/modifying/deleting another user's vault items (`photos`, `videos`, `notes`, `passwords`, `secrets`, `chats`, `todos`).
  - Test accessing another user's master key metadata (`/api/master-key/retrieve?deviceId=...`).
  - Test accessing another user's device sessions (`/api/security/devices`).
  - Test downloading another user's TUS encrypted chunks or media streams.
- **NoSQL Injection Defense**: Verify that `mongoSanitize` and strict schema type validation prevent `$ne`, `$gt`, `$where`, or regex injection payloads in query/body parameters.

---

# 12. CSRF, CORS & NETWORK SECURITY HEADERS

Audit `server/middleware/csrfOriginMiddleware.ts`, `server/middleware/csrfProtection.ts`, `server/utils/cors.ts`, `server.ts`:

### Anti-CSRF Origin Guard

- **Browser Origin Verification**: Inspect `requireTrustedBrowserOrigin`. Verify that all state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`):
  1. Inspect `Origin` and `Referer` headers.
  2. Match against configured allowed client origins (`CLIENT_URL`, `FRONTEND_URL`, localhost dev domains).
  3. Reject requests with missing or untrusted origins when credentials/cookies are included.

### Security Headers & Content Security Policy (CSP)

- **Helmet Configuration**: Verify `helmet()` settings:
  - `Content-Security-Policy` with strict `script-src`, `connect-src`, `worker-src` (allowing Web Workers for Argon2id and encryption).
  - `X-Content-Type-Options: nosniff`.
  - `X-Frame-Options: DENY` or `SAMEORIGIN`.
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
  - `Referrer-Policy: strict-origin-when-cross-origin`.

---

# 13. ADVERSARIAL PENETRATION TESTING MATRIX

Perform systematic adversarial threat simulations against the codebase:

| Threat / Attack Vector                | Target Area                         | Expected Security Defense                                      |
| :------------------------------------ | :---------------------------------- | :------------------------------------------------------------- |
| **Credential Stuffing / Brute Force** | `/api/auth/login`                   | Multi-tier rate limiting + IP pooling + CAPTCHA challenge      |
| **Timing Attack on Password / Decoy** | `comparePassword`, `verifyDecoyPin` | Constant-time dummy KDF derivation + `timingSafeEqual`         |
| **Decoy Vault Discovery**             | Network inspection                  | Pure client-side duress interception; 0 network calls sent     |
| **Token Family Replay Attack**        | `/api/auth/refresh`                 | Full `familyId` revocation on duplicate refresh token use      |
| **Zustand / RAM Key Scraping**        | Browser memory                      | 60-second inactivity key shredder + explicit `.fill(0)`        |
| **IDOR Resource Access**              | `/api/vault/*`, `/api/master-key/*` | Strict MongoDB tenant filtering by authenticated `userId`      |
| **NoSQL Operator Injection**          | All JSON input endpoints            | `mongoSanitize` + express-validator schema sanitization        |
| **2FA Bypass / OTP Replay**           | `/api/2fa/login`, `/api/2fa/verify` | Signed `mfaToken` binding + `twoFactorLastUsedTimestamp` check |
| **Single-Use Code Multi-Consumption** | Backup code login                   | Atomic `$pull` / removal prevents race-condition double use    |
| **Master Key Decryption Failure**     | `unlockVaultWithCandidateSalts`     | Dead Man's Switch local wipe after $N$ failed attempts         |
| **Merkle Tree Tampering**             | `/api/integrity/*`                  | Client-side Merkle proof verification + integrity alarm modal  |
| **CSRF State Manipulation**           | State-changing routes               | `requireTrustedBrowserOrigin` + SameSite cookie enforcement    |

---

# 14. PRODUCTION READINESS EVALUATION & SCORING

Evaluate each dimension on a scale of **0 to 100**:

1. **Authentication Architecture**: _____ / 100
2. **Zero-Knowledge Key Management**: _____ / 100
3. **Password Security & Pepper Architecture**: _____ / 100
4. **2FA / TOTP & Backup Codes**: _____ / 100
5. **Decoy / Duress Vault Implementation**: _____ / 100
6. **Dual-Engine Cascade File Encryption**: _____ / 100
7. **Session Lifecycle & Refresh Token Rotation**: _____ / 100
8. **Authorization & IDOR / BOLA Prevention**: _____ / 100
9. **Merkle Integrity & Anti-Tampering**: _____ / 100
10. **Rate Limiting, Anomaly & Brute-Force Defense**: _____ / 100
11. **CSRF & Origin Verification**: _____ / 100
12. **XSS & Client Memory Key Shredding**: _____ / 100
13. **Database Security & Injection Resistance**: _____ / 100
14. **Error Handling & Information Leakage**: _____ / 100
15. **Security Logging & Audit Trails**: _____ / 100
16. **Environment & Secrets Management**: _____ / 100
17. **Automated Security Test Coverage**: _____ / 100

### OVERALL PRODUCTION READINESS SCORE: _____ / 100

---

# 15. AUDIT REPORT FORMAT & VULNERABILITY SCHEMA

Every finding must be documented using this standard vulnerability schema:

````text
FINDING ID: SEC-[CAT]-[NUM]
TITLE: Short descriptive vulnerability title
SEVERITY: [CRITICAL | HIGH | MEDIUM | LOW | INFO]
CATEGORY: [Authentication | Cryptography | Authorization | Session | Integrity | Injection]
TARGET FILE: file:///path/to/file.ts#Lxx-Lyy
FUNCTION / COMPONENT: functionName()

PROBLEM DESCRIPTION:
Detailed technical breakdown of the vulnerability or architectural flaw.

ATTACK SCENARIO / PROOF OF CONCEPT:
Step-by-step adversarial execution demonstrating how an attacker could exploit this flaw.

CURRENT CODE:
```typescript
// Current vulnerable code snippet
````

RECOMMENDED REMEDIATION:

```typescript
// Exact secure code replacement
```

TEST CASE TO PROVE FIX:
Description or code for unit/integration test to verify remediation.

````

---

# 16. REQUIRED FINAL VERDICT

Conclude the audit report with one of the following exact verdicts:

```text
FINAL PRODUCTION STATUS:
[ ] PRODUCTION READY (No Critical or High issues; all security controls verified)
[ ] PRODUCTION READY WITH MINOR FIXES (No Critical issues; minor Low/Medium improvements)
[ ] NOT PRODUCTION READY (Critical or High vulnerabilities present; deployment blocked)
````

Followed by:

- **Top 10 High-Priority Remediation Action Items** (ordered by risk).
- **Cryptographic Verification Matrix** confirming key lengths, algorithms, nonces, and entropy.
- **Production Deployment Hardening Checklist** (Environment variables, TLS, CSP, Database indexes, Rate limit pools).
