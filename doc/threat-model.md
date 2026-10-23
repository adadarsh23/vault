# 🛡️ STRIDE Threat Model & Cryptographic Risk Analysis (`doc/threat-model.md`)

This document provides a formal security threat analysis of **Vault** using the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) along with operational countermeasure analyses for physical, memory, network, and post-quantum threat vectors.

---

## 1. System Threat Landscape & Trust Assumptions

### Untrusted Entities:

1. **The Hosting Cloud & Server Backend**: Operating system environments, cloud providers (Render, AWS, GCP), and hosting personnel are assumed to be potentially compromised or malicious.
2. **The Database & Persistent Storage**: MongoDB database administrators, disk storage volumes, and cloud backup snapshots are treated as public ciphertext repositories.
3. **The Network Transport**: Public Wi-Fi access points, intermediate routers, and ISPs are assumed to be monitored or subject to passive eavesdropping.

### Trusted Entities:

1. **The Client Execution Enclave**: The authenticated user's physical device hardware, secure browser sandbox (W3C WebCrypto API implementation), and client-side memory during active user interaction.

---

## 2. STRIDE Threat Matrix & Countermeasure Architecture

| Threat Category            | Potential Attack Vector                                                              | System Impact                                                         | Vault Architectural Countermeasures                                                                                                                                                                                                                                                                                                                                                                                                                                      | Verification / Test Suite                                                                                          |
| :------------------------- | :----------------------------------------------------------------------------------- | :-------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| **Spoofing Identity**      | Stolen credentials, credential stuffing, brute-force dictionary attacks.             | Unauthorized access to user account.                                  | - **WebAuthn / FIDO2 Passkeys** (Biometric biometric hardware tokens).<br>- **RFC 6238 TOTP** 6-digit MFA.<br>- **Google reCAPTCHA v2/v3** bot defense middleware.<br>- Per-user salt with **12 rounds of bcrypt** + optional `AUTH_PEPPER`.<br>- IP & user-keyed rate limiters (max 10 attempts / 15 min).                                                                                                                                                              | `tests/unit/auth-*`<br>`tests/unit/recaptchaMiddleware.test.ts`<br>`tests/unit/two-factor-hardening.test.ts`       |
| **Spoofing Identity**      | Stolen refresh tokens (Token Replay Attack).                                         | Adversary impersonates active session.                                | - **Token Family Tracking (RFC 6819)**: Single-use refresh token rotation. Replay of an expired/used refresh token immediately invalidates all active sessions within that `familyId`.<br>- HTTP-Only, `SameSite=Strict`, `Secure` cookies.                                                                                                                                                                                                                              | `tests/unit/auth-security.test.ts`<br>`tests/integration/auth.integration.test.ts`                                 |
| **Tampering with Data**    | Silent bit-rot, unauthorized database injection, or malicious server-side tampering. | Corruption or silent modification of vault records.                   | - **Authenticated AES-256-GCM**: 128-bit authentication tags validate integrity; tampered ciphertext throws cryptographic verification error.<br>- **AAD Binding**: User ID and Item ID bound as Additional Authenticated Data to prevent cross-account ciphertext splicing.<br>- **Hierarchical Merkle Tree**: Leaf hashes computed across all records; mismatch between client and server root triggers immediate tamper alarm (`/api/vault/integrity/report-tamper`). | `tests/unit/encryption.test.ts`<br>`tests/unit/sync-download-corruption.test.ts`<br>`tests/unit/integrity.test.ts` |
| **Repudiation**            | User denies performing a destructive action (file deletion, session revocation).     | Inability to audit security events.                                   | - **Encrypted Activity Audit Logs (`__logs__`)**: Client-side encrypted timeline of all operations.<br>- **Ed25519 Digital Signatures**: Critical security operations (device revocations, key changes) require cryptographic signatures from the originating device key pair.                                                                                                                                                                                           | `tests/unit/activity-store.test.ts`<br>`tests/unit/vault-item-content.test.ts`                                     |
| **Information Disclosure** | Database breach, rogue database administrator, cloud snapshot leak.                  | Mass leak of confidential personal files, notes, or passwords.        | - **Zero-Knowledge Architecture**: The database stores exclusively encrypted ciphertext envelopes (`encryptedFieldSchema`).<br>- Dual-key isolation ensures server bcrypt credential cannot decrypt vault data.<br>- **`VCAS01` Dual-Cipher Cascade**: Combines AES-256-GCM with ChaCha20-Poly1305 for ultra-critical payloads.                                                                                                                                          | `tests/unit/server-crypto.test.ts`<br>`tests/unit/account-session-profile-encryption.test.ts`                      |
| **Information Disclosure** | Harvest Now, Decrypt Later (HNDL) quantum computing attacks.                         | Future quantum computers break classical public key / ECDH exchanges. | - **PQC Kyber-768 (ML-KEM, NIST FIPS 203)**: Hybrid key exchange combining Curve25519 with Kyber-768 lattice cryptography ensures forward-secrecy against future quantum decryption.                                                                                                                                                                                                                                                                                     | `tests/unit/encryption.test.ts` (Hybrid Key Exchange)                                                              |
| **Information Disclosure** | Browser memory dump, malicious extensions, cold-boot attacks.                        | Key exfiltration from RAM.                                            | - **Non-Extractable Keys**: Imported into WebCrypto with `extractable: false`.<br>- **60-Second Inactivity Watchdog**: Purges all keys and decrypted records on idle.<br>- **Explicit Buffer Zeroization**: Immediate `.fill(0)` on all typed array key buffers.                                                                                                                                                                                                         | `src/lib/__tests__/cryptoPrimitives.test.ts`                                                                       |
| **Denial of Service**      | Volumetric HTTP flooding, massive file upload exhaustion, event loop starvation.     | Service unresponsiveness for legitimate users.                        | - **Overload Lag Monitor**: `perf_hooks` event-loop lag monitor sheds requests with HTTP 503 if lag > 1000ms.<br>- **Sliding Window Rate Limiters**: Route-level throttling for auth, upload, and media streaming.<br>- **Upload Anomaly Detection**: Tracks rapid large-file bursts (>100MB / 10 min), invalid MIME spam, and hash mismatches.                                                                                                                          | `tests/unit/server-overload.test.ts`<br>`tests/unit/upload-validation.test.ts`                                     |
| **Elevation of Privilege** | Insecure Direct Object References (IDOR), cross-tenant item manipulation.            | User A reads or modifies User B's vault items.                        | - **Mandatory Identity Scoping**: Every Mongoose query strictly filters by authenticated user ID (`_id: req.user.userId`).<br>- Express middleware enforces JWT ownership prior to routing into controllers.                                                                                                                                                                                                                                                             | `tests/integration/auth-security.test.ts`<br>`tests/unit/vaultItemService.test.ts`                                 |

---

## 3. Physical & Duress Threat Modeling

### 3.1 Coercive Duress Attack

- **Threat**: The user is physically compelled (e.g., robbery, unlawful border inspection, duress) to unlock their vault.
- **Countermeasure — Plausible Deniability Decoy Partition**:
  - The user enters a pre-configured **Decoy PIN**.
  - Vault transparently unlocks a completely isolated decoy sandbox workspace populated with plausible placeholder items.
  - The decoy partition derives a distinct key from independent salt.
  - There is zero cryptographic metadata or database schema evidence indicating the existence of a primary vault.

### 3.2 Shoulder Surfing & Window-Switch Snooping

- **Threat**: An onlooker watches the screen in a public venue or an operating system preview screenshot captures confidential documents during window switching.
- **Countermeasure — Sandboxed Document Privacy Shield**:
  - `useAntiScreenshotAndShield.ts` listens for `visibilitychange` and `blur` events.
  - The document viewport is instantly obscured by a **30px Gaussian blur** and an opaque black shield.
  - Anti-screenshot deterrence layers inject dynamic identity watermarks containing the user's username, client IP, and UTC timestamp.
  - Print dialog shortcuts (`Ctrl+P`) are blocked, and print media CSS styles render a blank document.

### 3.3 Emergency Panic Lockout

- **Threat**: The user must immediately sanitize device memory under urgent threat.
- **Countermeasure — Universal Panic Shredder**:
  - Tapping the panic button or hitting `Ctrl+Shift+L` instantly:
    1. Zeroizes all in-memory WebCrypto handles and cryptographic buffers within **60ms**.
    2. Revokes all registered blob URLs (`URL.revokeObjectURL`) via `blobRegistry.ts`.
    3. Clears local session storage and IndexedDB caches.
    4. Emits a socket disconnection and redirects the browser to the unauthenticated login screen.
