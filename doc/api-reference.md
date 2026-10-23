# 📡 REST API & WebSocket Protocol Reference (`doc/api-reference.md`)

This document details the HTTP REST endpoints and real-time WebSocket protocol for **Vault**.

---

## 1. Authentication & Security Headers

All protected endpoints require an `Authorization` Bearer header with a valid JSON Web Token:

```http
Authorization: Bearer <jwt_access_token>
```

### Security Headers Enforced by the Server
- `Content-Security-Policy`: Restricts scripts, styles, frames, and connect origins.
- `Cross-Origin-Resource-Policy`: `same-origin`
- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `DENY`

---

## 2. Authentication & Session Endpoints (`/api/auth`)

### 2.1 Register User Account
`POST /api/auth/register`

Creates a new user account, creates initial salt records, and establishes a device session.

- **Rate Limit**: Max 10 attempts per 15 minutes.
- **Bot Defense**: Verified with Google reCAPTCHA token if configured.

#### Request Body:
```json
{
  "username": "alice",
  "password": "SuperSecurePassword123!",
  "masterKey": "Base64EncryptedSentinelProof",
  "deviceId": "desktop-client-uuid",
  "recaptchaToken": "03AFcWeA7..."
}
```

#### Response (201 Created):
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "65f0a82bc194d30a11223344",
      "username": "alice"
    }
  }
}
```

---

### 2.2 User Login
`POST /api/auth/login`

Authenticates credentials and sets an HTTP-Only rotating refresh cookie.

#### Request Body:
```json
{
  "username": "alice",
  "password": "SuperSecurePassword123!",
  "deviceId": "desktop-client-uuid",
  "recaptchaToken": "03AFcWeA7..."
}
```

#### Response Headers:
```http
Set-Cookie: refreshToken=eyJhbGciOi...; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
```

---

### 2.3 Rotate Access Token (Refresh)
`POST /api/auth/refresh`

Rotates the HTTP-Only refresh token and returns a fresh JWT access token.

- **Auth Required**: Refresh cookie present.
- **Session Security**: Single-use rotation; reusing a previously consumed refresh token invalidates all sessions for the device.

---

### 2.4 User Logout
`POST /api/auth/logout`

Invalidates the active device session token and clears cookies.

---

### 2.5 Current Profile & Active Device Sessions
`GET /api/auth/me`

- **Auth Required**: 🔐 Bearer Token.

#### Response (200 OK):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "65f0a82bc194d30a11223344",
      "username": "alice",
      "twoFactorEnabled": true
    },
    "sessions": [
      {
        "deviceId": "desktop-client-uuid",
        "deviceName": "Chrome on Windows",
        "lastActive": "2026-10-23T04:15:30.000Z",
        "isCurrent": true
      }
    ]
  }
}
```

---

### 2.6 Revoke Device Session
`POST /api/auth/sessions/revoke`

Revokes a specific remote device session or terminates all other sessions.

#### Request Body:
```json
{
  "deviceId": "target-device-uuid",
  "revokeAllOthers": false
}
```

---

## 3. Vault Storage & Sync Endpoints (`/api/vault`)

### 3.1 Fetch All Encrypted Items
`GET /api/vault/items`

Retrieves all encrypted records for the authenticated user, including user items and control records (`__settings__`, `__logs__`, `__keycheck__`).

- **Auth Required**: 🔐 Bearer Token.

#### Response (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "type": "note",
      "ciphertext": "eyJhbGciOiJBMjU2R0NNIiwiaXYiOiI...",
      "iv": "X4bL8gO9q1==",
      "updatedAt": "2026-10-23T04:00:00.000Z",
      "version": 2
    }
  ]
}
```

---

### 3.2 Upsert Vault Item Record
`POST /api/vault/items/:itemId`

Creates or updates an encrypted item record.

#### Request Body:
```json
{
  "type": "file",
  "ciphertext": "base64EncodedEncryptedPayload",
  "iv": "base64IV",
  "tag": "base64AuthTag",
  "category": "documents",
  "updatedAt": "2026-10-23T04:15:00.000Z"
}
```

---

### 3.3 Soft Delete Vault Item (Tombstone)
`DELETE /api/vault/items/:itemId`

Soft-deletes the item by setting `isDeleted: true` and recording `deletedAt`. A tombstone event is broadcast over WebSockets so all connected clients remove the item from local stores.

---

### 3.4 Incremental Delta Sync Query
`GET /api/vault/sync?since=<iso_timestamp>`

Queries modified and soft-deleted items since the client's last synchronization timestamp.

#### Response (200 OK):
```json
{
  "success": true,
  "data": {
    "items": [ /* Modified encrypted records */ ],
    "tombstones": [
      {
        "id": "deleted-item-uuid",
        "deletedAt": "2026-10-23T04:12:00.000Z"
      }
    ],
    "serverTime": "2026-10-23T04:20:00.000Z"
  }
}
```

---

## 4. Chunked & Resumable File Uploads

Vault supports two resilient file upload pipelines for massive media files and unstable mobile connections:

### 4.1 Resumable TUS Protocol (`/api/vault/upload/tus`)
- `POST /api/vault/upload/tus`: Initializes a new resumable TUS upload session. Returns `Upload-Offset: 0` and `Location` header.
- `HEAD /api/vault/upload/tus/:uploadId`: Queries current uploaded byte offset.
- `PATCH /api/vault/upload/tus/:uploadId`: Streams binary chunk at `Upload-Offset`.

### 4.2 Multipart Sliced Upload (`/api/vault/upload/multipart`)
- `POST /api/vault/upload/multipart/start`: Allocates session ID and part chunk size.
- `PUT /api/vault/upload/multipart/:uploadId/part/:partNumber`: Streams individual chunk with MD5 verification.
- `POST /api/vault/upload/multipart/:uploadId/complete`: Assembles all chunks and verifies complete SHA-256 integrity.

---

## 5. Encrypted Media & Streaming Endpoints (`/api/vault/media`)

### 5.1 Generate Signed Media URL
`POST /api/vault/media/signed-url`

Generates a cryptographically signed HMAC token for direct, authenticated media playback without exposing raw bearer tokens in video player tags.

#### Request Body:
```json
{
  "fileId": "video-uuid",
  "expiresInSeconds": 3600
}
```

### 5.2 HLS Playlist & Video Segment Streaming
- `GET /api/vault/media/:fileId/playlist.m3u8?token=<signedToken>`: Returns adaptive HLS master playlist.
- `GET /api/vault/media/:fileId/segment/:segmentId.ts?token=<signedToken>`: Streams encrypted video chunk.
- Client media players (HLS.js / Shaka Player) decrypt segments locally in real-time.

---

## 6. Real-Time WebSocket Protocol (Socket.IO)

The real-time synchronization layer is powered by **Socket.IO** on `/socket.io`.

### 6.1 Authentication & Channel Isolation
1. Client connects with JWT token:
   ```javascript
   const socket = io({
     auth: { token: 'Bearer <jwt>' }
   });
   ```
2. Server verifies token, extracts `userId`, and joins socket to private channel `user:<userId>`.

### 6.2 Server-to-Client Events

| Event Channel | Payload Schema | Action Required by Client |
| :------------ | :------------- | :------------------------ |
| `vault:changed` | `{ itemId, type, updatedAt, originDeviceId }` | If `originDeviceId !== localDeviceId`, triggers incremental delta sync. |
| `vault:deleted` | `{ itemId, deletedAt }` | Removes item from local IndexedDB and Zustand store. |
| `device:revoked` | `{ deviceId, timestamp }` | If matches local device, triggers emergency key zeroization and logout. |
| `sync:conflict` | `{ itemId, conflictingVersions }` | Requests client timestamp arbitration. |
| `security:alert` | `{ alertType, message, timestamp }` | Displays prominent security modal or toast. |

### 6.3 Client-to-Server Events

| Event Channel | Payload Schema | Description |
| :------------ | :------------- | :---------- |
| `vault:ping` | `{ timestamp }` | Keep-alive heartbeat and connection latency measurement. |
| `vault:subscribe` | `{ rooms: [] }` | Re-subscribes to folder or shared channel updates. |
