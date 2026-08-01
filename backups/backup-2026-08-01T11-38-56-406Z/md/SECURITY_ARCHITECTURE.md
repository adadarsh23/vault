# Media Vault Security Architecture

This document outlines the multi-layered security stack implemented to ensure high-performance, secure, and scalable media delivery.

## 1. Data Encryption

### At-Rest Encryption (Server-Side)
*   **Algorithm**: `AES-256-GCM` (Advanced Encryption Standard with Galois/Counter Mode).
*   **Implementation**: All files uploaded to the vault are encrypted before being written to disk.
*   **Metadata**: Each file entry in the database stores its own unique `IV` (Initialization Vector) and `Auth Tag` to ensure cryptographic integrity and prevent tampering.
*   **Source**: [/server/utils/crypto.ts](file:///c:/code/vault/server/utils/crypto.ts), [/server/services/vaultItemService.ts](file:///c:/code/vault/server/services/vaultItemService.ts)

### Streaming Encryption (HLS)
*   **Algorithm**: `HLS AES-128`.
*   **Implementation**: Media segments (.ts files) are encrypted using 128-bit AES. The encryption is applied during the FFmpeg transcoding process.
*   **Delivery**: Decryption keys are NEVER stored alongside segments. They are served via a dedicated secure endpoint.
*   **Source**: [/server/services/transcodingService.ts](file:///c:/code/vault/server/services/transcodingService.ts)

## 2. Access Control & Authorization

### Authentication
*   **Standard**: JWT (JSON Web Tokens).
*   **Session Binding**: Tokens are strictly bound to a `sessionId`. If a session is revoked or expired in the database, the JWT becomes immediately invalid.
*   **Source**: [/server/middleware/authMiddleware.ts](file:///c:/code/vault/server/middleware/authMiddleware.ts)

### HMAC-Based Signed URLs
*   **Technology**: SHA-256 HMAC (Hash-based Message Authentication Code).
*   **TTL**: 2-minute short-lived expiration.
*   **Scope**: Prevents "direct link" sharing. Access is restricted to specific actions (e.g., `view`, `stream`, `download`).
*   **Binding**: Signed URLs are bound to the `SessionID` and `Device Fingerprint`.
*   **Soft IP Validation**: Allows for IP drift (e.g., switching from Wi-Fi to Mobile) to prevent playback breakage while logging significant changes for security auditing.
*   **Source**: [/server/services/storageService.ts](file:///c:/code/vault/server/services/storageService.ts)

### Secure License Server Model
*   **Unified Gateway**: All key delivery is centralized via the `/api/vault/license/:itemId` endpoint.
*   **Verification Flow**:
    1. **Authentication**: JWT verification ensures the request is from a valid session.
    2. **Device Verification**: The server validates the `deviceId` against the user's active sessions, preventing unauthorized device hijacking.
    3. **Ownership Policy**: Checks the MongoDB `VaultItem` record to confirm the user owns the content they are trying to play.
*   **Non-Exposure**: The server returns an encrypted license payload. Raw content keys never touch the JavaScript layer; they are processed inside the hardware CDM.
*   **Source**: [/server/controllers/drmController.ts](file:///c:/code/vault/server/controllers/drmController.ts)

### DRM Content Protection (Premium Hardware Access)
*   **Encapsulation**: Content is now packaged using **Common Encryption (CENC)** via Shaka Packager instead of standard AES-128 envelope encryption.
*   **Protocols**: Supports **Widevine** (Google/Chrome/Android) and **FairPlay** (Apple/Safari/iOS).
*   **Key Security**: Decryption keys are NEVER exposed to the JavaScript layer. They are delivered via a secure license request directly to the browser's hardware-backed **Content Decryption Module (CDM)**.
*   **Client**: Frontend transitioned to **Shaka Player**, enabling secure hardware decryption and preventing content extraction via browser extension or screencast.
*   **Source**: [/server/controllers/drmController.ts](file:///c:/code/vault/server/controllers/drmController.ts)

## 3. Infrastructure & Resilience

### Secure Key Management
*   **Endpoint**: `/api/vault/media/key/:itemId`
*   **Protection**: Required JWT Auth + Signed URL Verification.
*   **Performance**: In-memory caching (TTL: 2m) to prevent repeated cryptographic overhead.
*   **Rate Limiting**: Sliding window rate limiting (~150 req/min/IP) to prevent key brute-forcing or scrapers.
*   **Source**: [/server/controllers/mediaController.ts](file:///c:/code/vault/server/controllers/mediaController.ts)

### CDN Integration Strategy
*   **Edge Delivery**: Media segments (`.ts`) and playlists (`.m3u8`) are configured with high `Cache-Control` headers for CDN efficiency.
*   **Key Protection**: Decryption key endpoints are configured to NEVER be cached by the CDN, ensuring every key request is re-validated by the origin server.

### Origin Protection (IP Filtering)
*   **Method**: CIDR-based IP filtering.
*   **Restriction**: In production, the server ONLY accepts traffic from trusted CDN IP ranges (`74.220.48.0/24`, `74.220.56.0/24`).
*   **Defense**: This prevents "Origin Bypassing" where attackers try to hit the server's public IP to avoid CDN security rules (WAF/DDoS protection).
*   **Source**: [/server/middleware/originProtection.ts](file:///c:/code/vault/server/middleware/originProtection.ts)

### Forensic Invisible Watermarking (Signal-Level Traceability)
*   **Implementation**: Multi-layer invisible spatial & metadata steganography.
*   **Spatial Encoding**: Instead of visible overlays, the system uses multiple high-transparency layers (`opacity: 0.003 - 0.007`) scattered across the frame. This makes the watermark **invisible to the human eye** while ensuring it is mathematically burned into the pixel data.
*   **Metadata Steganography**: Embeds the encrypted User ID and Item ID into the A/V bitstream's SEI and Global Metadata headers.
*   **Traceability**: Even if the video is cropped or filtered, the scattered spatial encoding allows for recovery of the identity via signal analysis (Luma/Alpha thresholding).
*   **Premium Experience**: Eliminates visual distractions for the user while providing professional-grade anti-piracy deterrence.
*   **Source**: [/server/services/transcodingService.ts](file:///c:/code/vault/server/services/transcodingService.ts)

### Frontend Security Deterrents (UX-Level)
> [!NOTE]
> Client-side UI measures (like disabling right-click) are **deterrents** intended to stop casual users. **The primary security layer is the hardware-backed DRM (CDM) integrated via Shaka Player.**

*   **UI Hardening**:
    *   **Context Blocking**: Right-click is disabled on the media player to discourage basic "Save Video As" attempts.
    *   **Keyboard Hijacking**: Standard DevTools shortcuts (`F12`, `Ctrl+Shift+I`) are blocked during playback to increase the friction for inspection.
*   **Anti-Reverse Engineering**:
    *   **Debugger Loop**: Implements a background "Anti-Debug" pulse. While bypassable by experts, it halts the execution flow for most standard inspection tools.
*   **Source**: [/src/components/ui/video-player.tsx](file:///c:/code/vault/src/components/ui/video-player.tsx)

## 4. Security Intelligence & Anomaly Detection
The vault implements a real-time anomaly detection system to identify and alert on suspicious activity patterns.

### Threat Detection Rules
*   **Brute-Force Detection**: Monitors failed JWT verifications and login attempts. Triggers an alert after **10 failures in 10 minutes** from a single source.
*   **Scraper Detection**: Monitors media key and segment requests. Triggers an alert if a single user requests more than **50 keys in 60 seconds**.
*   **IP Drift Monitoring**: Tracks the number of unique IP addresses used by a single session. Triggers an alert if **3+ unique IPs** are detected within **1 hour** (indicative of credential sharing or hijacking).
*   **Alerting**: Detections are logged with `SECURITY_ALERT` tags and `CRITICAL` severity for immediate log aggregation system triggering.
*   **Source**: [/server/services/anomalyDetectionService.ts](file:///c:/code/vault/server/services/anomalyDetectionService.ts)

## 5. Observability & Telemetry
*   **Telemetry**: Real-time logging of playback events (`bitrate_switch`, `buffer_start`, `error`).
*   **Dashboard**: Aggregated metrics filtered per user to monitor for playback anomalies or unauthorized access attempts.
*   **Source**: [/server/models/telemetry.ts](file:///c:/code/vault/server/models/telemetry.ts)
