<p align="center">
  <a href="#vault">
    <img
      src="./public/favicon.svg"
      alt="Vault Logo"
      width="72"
      height="72"
      style="padding: 14px; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 16px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.05);"
    />
  </a>
</p>

<h1 align="center" style="font-weight: 800; letter-spacing: -0.025em;">Vault</h1>

<p align="center">
  <span style="display: inline-block; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 9999px; padding: 3px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;">
    ● Protected
  </span>
</p>

<p align="center">
  <strong>Ultra-Secure Zero-Knowledge Personal Storage & Real-Time Sync Platform</strong>
</p>

<p align="center">
  <em>Engineered with client-side AES-256-GCM encryption, Post-Quantum Kyber key exchange, device session rotation, and real-time cloud synchronization.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Security-Zero--Knowledge-blueviolet?style=for-the-badge&logo=shield&logoColor=white" alt="Zero Knowledge Security" />
  <img src="https://img.shields.io/badge/Encryption-AES--256--GCM-007acc?style=for-the-badge&logo=lock&logoColor=white" alt="AES-256-GCM" />
  <img src="https://img.shields.io/badge/Post--Quantum-PQC--Kyber-8b5cf6?style=for-the-badge&logo=quantum&logoColor=white" alt="PQC Kyber" />
  <img src="https://img.shields.io/badge/React-19.0-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-8.0-646cff?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node 22" />
  <img src="https://img.shields.io/badge/Express-5.0-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/MongoDB-7.0-47a248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB 7" />
</p>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Security Blueprint](#architecture--security-blueprint)
- [Technology Stack](#technology-stack)
- [Performance & Asset Optimization](#performance--asset-optimization)
- [Environment Configuration](#environment-configuration)
- [API Reference](#api-reference)
  - [Authentication Endpoints](#authentication-endpoints)
  - [Vault Storage Endpoints](#vault-storage-endpoints)
- [Synchronization Strategy](#synchronization-strategy)
- [Security & Hardening Notes](#security--hardening-notes)
- [Development & Verification Commands](#development--verification-commands)

---

## 🎯 Overview

**Vault** is a high-performance, enterprise-grade personal vault application designed for storing sensitive files, encrypted notes, credentials, and confidential personal data.

Built on a **Zero-Knowledge Architecture**, all sensitive client payload data (notes, vault items, secret keys) is encrypted locally on the user's client using **AES-256-GCM** before ever being transmitted over the network or stored in the database. The server never holds unencrypted user keys or plaintext vault items.

---

## ✨ Key Features

- 🔑 **Zero-Knowledge Encryption**: Full end-to-end client-side encryption using AES-256-GCM.
- 🛡️ **Post-Quantum Crypto Readiness**: Integrated with `pqc-kyber` for lattice-based post-quantum key encapsulation.
- 🔐 **Dual-Key Authentication**: Strict separation between account authentication passwords (bcrypt hashed) and local client vault encryption keys.
- 🌐 **Real-time Socket.IO Sync**: Instant cross-device synchronization with automatic delta resolution and timestamp conflict arbitration (`latest-update-wins`).
- 📝 **Rich Text Encrypted Notes**: Interactive rich-text editing powered by TipTap with live client-side decryption.
- 🔒 **2FA & TOTP Vault**: Built-in time-based one-time password (TOTP) generator supporting QR code export & verification.
- 📁 **Secure Media & File Streaming**: Encrypted file uploads with MIME-type verification, HLS.js, and Shaka Player video streaming.
- 📲 **Device Session Management**: Granular per-device session tracking with HTTP-Only refresh cookie rotation and instant session revoking.
- ⚡ **Automated Asset Optimization**: Build-time Brotli/Gzip compression, automatic module preloading, and 1-year immutable caching for static assets.

---

## 🏗️ Architecture & Security Blueprint

```
+---------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                    |
|   React 19 + Vite + TypeScript + WebCrypto API + Sodium / PQC-Kyber + TipTap    |
|                                                                                 |
|  * Client-side AES-256-GCM encryption before sending data over the wire         |
|  * Vault Encryption Key never leaves client memory                              |
|  * Decrypts notes, files, passwords & TOTP tokens locally in real-time          |
+----------------------------------------+----------------------------------------+
                                         |
                       HTTPS + WebSockets (Socket.IO)
                                         |
+----------------------------------------v----------------------------------------+
|                               API GATEWAY LAYER                                 |
|          Express 5 + Helmet Hardening + Rate Limiter + CSRF + Auth Middleware     |
|                                                                                 |
|  * JWT Bearer Access Tokens + HTTP-Only Rotating Refresh Cookies                |
|  * IP-Based & Route-Based Rate Throttling                                       |
|  * Sentinel Verification Check (`__keycheck__`) without exposing raw secrets   |
+----------------------------------------+----------------------------------------+
                                         |
                                  MongoDB Driver 7
                                         |
+----------------------------------------v----------------------------------------+
|                                DATABASE LAYER                                   |
|             MongoDB Atlas Cluster (Primary) + SRV Fallback Cluster              |
|                                                                                 |
|  * Encrypted Control Records (`__settings__`, `__logs__`, `__profile__`)        |
|  * Scoped encrypted user items & soft-deleted tombstones                        |
+---------------------------------------------------------------------------------+
```

---

## 🛠️ Technology Stack

| Layer                       | Technologies & Key Libraries                                                                                            |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| **Frontend UI**             | **React 19**, **Vite 8**, **TypeScript 7**, TailwindCSS v4, Framer Motion, Radix UI, Lucide Icons, Sonner               |
| **Rich Text & Media**       | TipTap Editor, HLS.js, Shaka Player, HTML-to-Image, Emoji-Mart, tsParticles, COBE 3D Globe                              |
| **Cryptography & Security** | WebCrypto API, **AES-256-GCM**, `libsodium-wrappers`, **`pqc-kyber`**, `hash-wasm` (Argon2), `bcryptjs`, `jsonwebtoken` |
| **Backend Framework**       | **Express 5**, **Node.js 22 (LTS)**, Socket.IO 4, Helmet 8, Express Rate Limit, Multer, Cookie Parser                   |
| **Database & Cache**        | **MongoDB 7**, Mongoose 9, Node Cache                                                                                   |
| **Asset Optimization**      | **Brotli & Gzip Pre-compression**, Module Preload Polyfills, Aggressive Asset Caching                                   |
| **Testing & Quality**       | **Vitest 4**, **Playwright E2E**, Lighthouse Runner, Sentry Error Tracking & Node Profiling                             |

---

## ⚡ Performance & Asset Optimization

The platform implements an automated asset pipeline designed for fast load times and minimal network bandwidth:

- **Brotli & Gzip Compression**:
  - Static production assets are pre-compressed into `.br` and `.gz` formats during the build step ([`vite.config.ts`](file:///c:/Code/vault/vite.config.ts)).
  - Express serves pre-compressed assets directly via compression middleware ([`server/vite.ts`](file:///c:/Code/vault/server/vite.ts)) based on the client's `Accept-Encoding` header, minimizing runtime CPU overhead.
- **Module Preloading & Resource Hints**:
  - `<link rel="modulepreload">` tags automatically preload critical bundle dependencies during initial HTML parse.
  - Safe array coercion guards prevent runtime script evaluation issues across dynamic imports.
- **Aggressive Cache-Control Headers**:
  - Content-hashed static assets (`/assets/*.js`, `/assets/*.css`) use `Cache-Control: public, max-age=31536000, immutable`.
  - Non-hashed entry files (`index.html`, `/sw.js`, `/sw-register.js`) enforce strict revalidation with `Cache-Control: no-cache, no-store, must-revalidate`.

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

### Essential Environment Variables

| Variable                | Description                                              | Example / Recommended                               |
| :---------------------- | :------------------------------------------------------- | :-------------------------------------------------- |
| `MONGODB_URI`           | Primary MongoDB connection URI (Atlas SRV or direct)     | `mongodb+srv://user:pass@cluster.mongodb.net/vault` |
| `MONGODB_URI_FALLBACK`  | Non-SRV Atlas fallback URI if SRV lookups fail           | `mongodb://user:pass@node1.mongodb.net/vault`       |
| `JWT_SECRET`            | Secret key for short-lived JWT access tokens             | `your-256-bit-jwt-secret-string`                    |
| `REFRESH_TOKEN_SECRET`  | Secret key for long-lived refresh tokens                 | `your-256-bit-refresh-secret-string`                |
| `VAULT_ENCRYPTION_KEY`  | Server-side master envelope encryption key               | `32-byte-hex-or-base64-secret-key`                  |
| `CLIENT_URL`            | Trusted frontend origin for CORS & cookie policy         | `https://my-vault.onrender.com`                     |
| `PUBLIC_URL`            | Public server URL for health check keep-alive pings      | `https://my-vault.onrender.com`                     |
| `VITE_API_BASE_URL`     | Frontend API endpoint URL                                | `https://my-vault.onrender.com`                     |
| `VITE_DEV_API_BASE_URL` | Vite local development API endpoint                      | `http://localhost:4000`                             |
| `TRUST_PROXY`           | Set `1` when deployed behind reverse proxy/load balancer | `1`                                                 |
| `AUTH_RATE_LIMIT_MAX`   | Max login/auth requests per window (default: 15 min)     | `100`                                               |
| `MAX_JSON_BODY_MB`      | Maximum allowed JSON request payload size                | `5`                                                 |

---

### Example Configuration Snippets

#### 🌟 Standard Atlas Production Setup

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.ncuxgch.mongodb.net/personal-vault?retryWrites=true&w=majority&appName=Cluster0
CLIENT_URL=https://my-vault-cic6.onrender.com
PUBLIC_URL=https://my-vault-cic6.onrender.com
VITE_APP_PUBLIC_URL=https://my-vault-cic6.onrender.com/
VITE_DNS_PREFETCH_HOST=//my-vault-cic6.onrender.com
RENDER_SERVICE_ID=srv-your-render-service-id
VITE_API_BASE_URL=https://my-vault-cic6.onrender.com
VITE_DEV_API_BASE_URL=http://localhost:4000
VITE_DEFAULT_API_BASE_URL=http://127.0.0.1:4000
VITE_CSP_CONNECT_SRC=https://my-vault-cic6.onrender.com https://*.onrender.com
ANALYZE_BUNDLE=false
MAX_JSON_BODY_MB=100
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=100
REFRESH_COOKIE_SAME_SITE=strict
REFRESH_COOKIE_SECURE=true
FREE_IP_API_URL_TEMPLATE=https://free.freeipapi.com/api/json/{ip}
IPWHOIS_URL_TEMPLATE=https://ipwho.is/{ip}
IPINFO_IO_URL_TEMPLATE=https://ipinfo.io/{ip}/json
IPGEOLOCATION_URL_TEMPLATE=https://api.ipgeolocation.io/ipgeo?apiKey={apiKey}&ip={ip}
```

#### 🔄 Atlas Primary + Fallback Cluster Setup

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.ncuxgch.mongodb.net/personal-vault?retryWrites=true&w=majority&appName=Cluster0
MONGODB_URI_FALLBACK=mongodb+srv://<username>:<password>@cluster1.example.mongodb.net/personal-vault?retryWrites=true&w=majority&appName=Cluster1
CLIENT_URL=https://my-vault-cic6.onrender.com
PUBLIC_URL=https://my-vault-cic6.onrender.com
VITE_APP_PUBLIC_URL=https://my-vault-cic6.onrender.com/
VITE_DNS_PREFETCH_HOST=//my-vault-cic6.onrender.com
RENDER_SERVICE_ID=srv-your-render-service-id
VITE_API_BASE_URL=https://my-vault-cic6.onrender.com
VITE_DEV_API_BASE_URL=http://localhost:4000
VITE_DEFAULT_API_BASE_URL=http://127.0.0.1:4000
VITE_CSP_CONNECT_SRC=https://my-vault-cic6.onrender.com https://*.onrender.com
ANALYZE_BUNDLE=false
MAX_JSON_BODY_MB=100
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=100
REFRESH_COOKIE_SAME_SITE=strict
REFRESH_COOKIE_SECURE=true
```

> **Note**: The server automatically attempts connection to `MONGODB_URI` first. If SRV resolution or primary cluster fails, it gracefully falls back to `MONGODB_URI_FALLBACK`.

---

## 📡 API Reference

### Authentication Endpoints

| Method | Endpoint                    | Description                                                   | Auth Required |
| :----- | :-------------------------- | :------------------------------------------------------------ | :-----------: |
| `POST` | `/api/auth/register`        | Register new user account & set device session                |      ❌       |
| `POST` | `/api/auth/login`           | Authenticate user credentials & issue JWT + Session Cookie    |      ❌       |
| `POST` | `/api/auth/refresh`         | Rotate long-lived refresh cookie & issue new JWT access token |      ❌       |
| `POST` | `/api/auth/logout`          | Invalidate current device refresh token & clear cookies       |      ❌       |
| `GET`  | `/api/auth/me`              | Fetch active user profile & active device sessions            |      🔐       |
| `POST` | `/api/auth/sessions/revoke` | Revoke specific device session or all remote sessions         |      🔐       |

#### Request Example (`POST /api/auth/register`):

```json
{
  "username": "vault_user",
  "password": "KW88P0E%NezFZs7!",
  "masterKey": "O4[qH:shrp95_Xd0",
  "deviceId": "laptop-main"
}
```

#### Response Example (`POST /api/auth/login`):

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "65f0...",
      "username": "vault_user"
    }
  }
}
```

---

### Vault Storage Endpoints

| Method   | Endpoint                           | Description                                                  | Auth Required |
| :------- | :--------------------------------- | :----------------------------------------------------------- | :-----------: |
| `GET`    | `/api/vault/items`                 | Fetch all encrypted vault records for the authenticated user |      🔐       |
| `POST`   | `/api/vault/items/:itemId`         | Upsert (create or update) an encrypted vault item record     |      🔐       |
| `DELETE` | `/api/vault/items/:itemId`         | Soft-delete vault item & emit tombstone for sync clients     |      🔐       |
| `GET`    | `/api/vault/sync`                  | Query updated items since timestamp (`since` query param)    |      🔐       |
| `GET`    | `/api/vault/legacy/:vaultId/items` | Legacy compatibility endpoint for older vault formats        |      🔐       |

#### Internal Vault Control Records:

- `__settings__`: Client interface configuration & theme preferences (encrypted).
- `__logs__`: Client activity audit logs (encrypted).
- `__profile__`: User profile metadata & optional registration IP telemetry.
- `__keycheck__`: Encrypted sentinel record used to verify client vault passphrase correctness without exposing raw secrets.

---

## 🔄 Synchronization Strategy

- **Real-Time WebSocket Push**: Real-time change events are broadcast over Socket.IO on the `vault:changed` event channel.
- **Incremental Delta Polling**: Polling clients query `/api/vault/sync?since=<timestamp>` for lightweight delta updates.
- **Conflict Arbitration**: Concurrent cross-device edits resolve using **latest-update-wins** based on client timestamp (`updatedAt`).
- **Tombstone Preservation**: Deleted items are soft-deleted (`isDeleted: true`, `deletedAt: <timestamp>`) to propagate deletion seamlessly across all synced devices.

---

## 🔒 Security & Hardening Notes

1. **Bcrypt Password Hashing**: Passwords are salted and hashed via `bcryptjs` before storage.
2. **AES-256-GCM Envelope Encryption**: Vault items and sensitive records are encrypted client-side using AES-256-GCM.
3. **Dedicated Keycheck Sentinel**: High-entropy `__keycheck__` records allow instant validation of client-entered passphrase without decrypting actual user payload data.
4. **Helmet Security Headers**: Enforces Content Security Policy (CSP), Cross-Origin Resource Policy (CORP), Frameguard, and X-Content-Type-Options.
5. **Session Isolation**: HTTP-Only, SameSite strict cookies prevent XSS-based refresh token theft.

---

## 🧪 Development & Verification Commands

### Development Server

```bash
# Start backend server in development watch mode
npm run dev

# Start Vite client development server
npm run dev:client
```

### Build & Production Packaging

```bash
# Type check and build Vite production bundle
npm run build

# Build with OXC minification
npm run build:minify

# Analyze bundle sizes
npm run build:analyze
```

### Testing Suite

```bash
# Run unit test suite
npm run test:unit

# Run full Vitest test suite
npm run test

# Run End-to-End Playwright test suite
npm run test:e2e

# Run security & cryptographic verification tests
npm run test:crypto
npm run test:security:integration

# Run full linting, type-checking and test verification
npm run verify
```

---

<p align="center">
  <sub>Built with ❤️ for privacy and zero-trust personal data security.</sub>
</p>
