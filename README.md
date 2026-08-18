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
| **Testing & Quality**       | **Vitest 4**, Lighthouse Runner, Sentry Error Tracking & Node Profiling                                                 |

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

The application uses environment variables for security, database connectivity, CORS policies, rate limiting, and observability. Three environment files are provided:

- **`.env`**: Active configuration file loaded at runtime by the server and client.
- **`.env.example`**: Clean template with placeholders and descriptive comments for developers.
- **`.env.production.example`**: Complete reference configuration for Render Production (`https://my-vault-cic6.onrender.com`).

### Quick Start Setup

#### Local Development

```bash
# Copy template to .env
cp .env.example .env

# Edit .env and supply your MongoDB URI & secrets
```

#### Render Production Deployment

```bash
# Use production example as reference for Render dashboard environment variables
cp .env.production.example .env
```

---

### 📚 Comprehensive Environment Variable Reference

#### 1. Server & Runtime Environment

| Variable                      | Description                                                        | Default / Example          |  Required  |
| :---------------------------- | :----------------------------------------------------------------- | :------------------------- | :--------: |
| `NODE_ENV`                    | Runtime environment (`development`, `production`, `test`)          | `production`               |    Yes     |
| `PORT`                        | HTTP server port                                                   | `4000`                     |     No     |
| `RENDER_SERVICE_ID`           | Render cloud service ID                                            | `srv-d6njnj4r85hc73fpivtg` |     No     |
| `DISABLE_ORIGIN_PROTECTION`   | Bypass strict origin checks when SPA and API share the same origin | `true`                     |     No     |
| `ALLOW_LOCAL_CORS_ORIGINS`    | Allow localhost browser origins in production                      | `false`                    |     No     |
| `TRUST_PROXY`                 | Number of upstream reverse proxies (1 for Render / Cloudflare)     | `1`                        | Yes (Prod) |
| `KEEP_ALIVE_ENABLED`          | Background keep-alive self-ping to prevent sleep                   | `true`                     |     No     |
| `ENABLE_COMPRESSION`          | Automatic Brotli / Gzip response compression                       | `true`                     |     No     |
| `ENABLE_OVERLOAD_PROTECTION`  | Event-loop lag monitoring and load shedding                        | `true`                     |     No     |
| `EVENT_LOOP_LAG_THRESHOLD_MS` | Overload protection trigger threshold in ms                        | `1000`                     |     No     |

#### 2. Database Configuration (MongoDB Atlas)

| Variable                       | Description                                                | Default / Example                     | Required |
| :----------------------------- | :--------------------------------------------------------- | :------------------------------------ | :------: |
| `MONGODB_URI`                  | Primary MongoDB Atlas connection string (SRV)              | `mongodb+srv://user:pass@cluster0...` |   Yes    |
| `MONGODB_URI_FALLBACK`         | Secondary fallback MongoDB connection string               | `mongodb+srv://user:pass@cluster1...` |    No    |
| `MONGODB_URI_DIRECT`           | Direct non-SRV replica-set URI for DNS-restricted networks | `mongodb://user:pass@host1:27017...`  |    No    |
| `MONGODB_DB`                   | MongoDB database name                                      | `vault`                               |    No    |
| `MONGODB_ALLOW_LOCAL_FALLBACK` | Fallback to mock in-memory store if DB is down             | `false`                               |    No    |
| `MONGODB_DNS_SERVERS`          | Primary DNS resolvers for Atlas SRV lookups                | `1.1.1.1,8.8.8.8`                     |    No    |
| `MONGODB_DNS_RETRY_SERVERS`    | Fallback DNS resolvers for retry                           | `8.8.8.8,1.1.1.1`                     |    No    |
| `ATLAS_KEEPALIVE_MINUTES`      | Frequency for database keep-alive ping                     | `10`                                  |    No    |
| `SKIP_MONGO_CONNECT`           | Skip DB connection (testing/mock mode)                     | `false`                               |    No    |

#### 3. Authentication, Cryptography & Security

| Variable                             | Description                                                 | Default / Example                          |  Required  |
| :----------------------------------- | :---------------------------------------------------------- | :----------------------------------------- | :--------: |
| `JWT_SECRET`                         | 256-bit+ HMAC secret for access token signing               | `64+ char hex string`                      |    Yes     |
| `JWT_EXPIRES_IN`                     | Access token lifespan                                       | `12h`                                      |     No     |
| `REFRESH_TOKEN_SECRET`               | 256-bit+ HMAC secret for refresh token signing              | `64+ char hex string`                      | Yes (Prod) |
| `REFRESH_TOKEN_EXPIRES_IN`           | Refresh token lifespan                                      | `30d`                                      |     No     |
| `CSRF_SECRET`                        | Secret key for double-submit HMAC CSRF token validation     | `64+ char hex string`                      | Yes (Prod) |
| `SIGNED_URL_SECRET`                  | Secret key for signed media URLs & temporary download links | `64+ char hex string`                      | Yes (Prod) |
| `VAULT_ENCRYPTION_KEY`               | Master server envelope encryption key (32-byte hex/base64)  | `64+ char hex string`                      | Yes (Prod) |
| `AUTH_PEPPER`                        | Server-side pepper for password hashing                     | `64+ char hex string`                      | Yes (Prod) |
| `BCRYPT_ROUNDS`                      | Salt rounds for bcrypt hashing                              | `12`                                       |     No     |
| `REQUIRE_ES256_IN_PRODUCTION`        | Enforce asymmetric ES256 key rings                          | `false`                                    |     No     |
| `REQUIRE_ENVELOPE_KEK_IN_PRODUCTION` | Enforce KMS envelope KEK                                    | `false`                                    |     No     |
| `RECAPTCHA_SECRET_KEY`               | Google reCAPTCHA v2 secret key for backend verification     | `6LeC-PAsAAAAALktpsRvS44FA9ndPSnS7p4a3u_F` | Yes (Prod) |
| `VITE_RECAPTCHA_SITE_KEY`            | Google reCAPTCHA v2 site key for frontend widget            | `6LeC-PAsAAAAAOsr4Qf3gwf2pGY9CrkM2A_bM-CB` | Yes (Prod) |
| `ALLOW_RECAPTCHA_TEST_HOST`          | Allow Google test-key host validation in production         | `false`                                    |     No     |
| `DUMMY_PASSWORD_HASH`                | Dummy hash to prevent login timing enumeration attacks      | `Pre-computed bcrypt hash`                 |     No     |

#### 4. Client & Public URLs

| Variable                    | Description                                              | Default / Example                                           |  Required  |
| :-------------------------- | :------------------------------------------------------- | :---------------------------------------------------------- | :--------: |
| `CLIENT_URL`                | Allowed frontend origin for CORS & cookie policies       | `https://my-vault-cic6.onrender.com/`                       | Yes (Prod) |
| `PUBLIC_URL`                | Canonical public URL for keep-alive pings & signed links | `https://my-vault-cic6.onrender.com`                        | Yes (Prod) |
| `VITE_APP_PUBLIC_URL`       | Frontend public root URL injected into Vite runtime      | `https://my-vault-cic6.onrender.com/`                       | Yes (Prod) |
| `VITE_API_BASE_URL`         | Primary client API base endpoint                         | `https://my-vault-cic6.onrender.com/`                       | Yes (Prod) |
| `VITE_DEV_API_BASE_URL`     | Development API endpoint for local Vite server           | `http://localhost:4000`                                     |     No     |
| `VITE_DEFAULT_API_BASE_URL` | Fallback API endpoint                                    | `http://127.0.0.1:4000`                                     |     No     |
| `VITE_DNS_PREFETCH_HOST`    | Pre-connect DNS host hint for HTML head                  | `//my-vault-cic6.onrender.com`                              |     No     |
| `VITE_CSP_CONNECT_SRC`      | CSP `connect-src` whitelist                              | `https://my-vault-cic6.onrender.com https://*.onrender.com` |     No     |
| `VITE_APP_RELEASE`          | Frontend release version tag                             | `1.0.0`                                                     |     No     |

#### 5. Cookies & Session Management

| Variable                   | Description                                              | Default / Example            |  Required  |
| :------------------------- | :------------------------------------------------------- | :--------------------------- | :--------: |
| `REFRESH_COOKIE_DOMAIN`    | Domain for refresh cookie (`my-vault-cic6.onrender.com`) | `my-vault-cic6.onrender.com` |     No     |
| `REFRESH_COOKIE_SAME_SITE` | SameSite cookie policy (`strict`, `lax`, `none`)         | `strict`                     |     No     |
| `REFRESH_COOKIE_SECURE`    | HTTPS-only cookie flag                                   | `true`                       | Yes (Prod) |
| `SESSION_RETENTION_MS`     | Max session retention window (7 days)                    | `604800000`                  |     No     |
| `MAX_ACTIVE_DEVICES`       | Maximum active device sessions per user                  | `25`                         |     No     |
| `MAX_USER_WRITE_RETRIES`   | Optimistic lock mutation retry attempts                  | `3`                          |     No     |

#### 6. File Storage & Upload Limits

| Variable                | Description                                       | Default / Example                | Required |
| :---------------------- | :------------------------------------------------ | :------------------------------- | :------: |
| `UPLOAD_DIR`            | Directory for persistent vault file storage       | `/var/data/uploads` or `uploads` |    No    |
| `MULTIPART_TMP_ROOT`    | Ephemeral scratch directory for multipart uploads | `/tmp/vault/multipart-uploads`   |    No    |
| `MAX_FILE_SIZE_MB`      | Server maximum file upload size limit             | `500` (or `4096`)                |    No    |
| `VITE_MAX_FILE_SIZE_MB` | Client maximum file upload size validation        | `500` (or `4096`)                |    No    |
| `MAX_JSON_BODY_MB`      | Server maximum JSON payload size                  | `100`                            |    No    |

#### 7. Rate Limiting & Abuse Prevention

| Variable                    | Description                                    | Default / Example | Required |
| :-------------------------- | :--------------------------------------------- | :---------------- | :------: |
| `API_RATE_LIMIT_WINDOW_MS`  | General API rate limit window in ms (15 min)   | `900000`          |    No    |
| `API_RATE_LIMIT_MAX`        | Max general API requests per window            | `1000`            |    No    |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Auth endpoint rate limit window in ms (15 min) | `900000`          |    No    |
| `AUTH_RATE_LIMIT_MAX`       | Max auth attempts per window                   | `100`             |    No    |

#### 8. Vault Record & Data Field Limits

| Variable                  | Description                                      | Default / Example | Required |
| :------------------------ | :----------------------------------------------- | :---------------- | :------: |
| `MAX_ACTIVITY_LOGS`       | Maximum audit log entries kept per user          | `500`             |    No    |
| `MAX_LOGIN_HISTORY`       | Maximum login history records kept per user      | `20`              |    No    |
| `MAX_ITEM_ID_LENGTH`      | Maximum character length of item IDs             | `128`             |    No    |
| `MAX_TITLE_LENGTH`        | Maximum character length of vault item titles    | `200`             |    No    |
| `MAX_NOTE_CONTENT_LENGTH` | Maximum length of encrypted note body            | `100000`          |    No    |
| `MAX_TEXT_FIELD_LENGTH`   | Maximum length of standard encrypted text fields | `2000`            |    No    |
| `MAX_FILE_NAME_LENGTH`    | Maximum character length of filenames            | `255`             |    No    |

#### 9. Geolocation & Registration Telemetry

| Variable                               | Description                                | Default / Example                          | Required |
| :------------------------------------- | :----------------------------------------- | :----------------------------------------- | :------: |
| `REGISTRATION_PROFILE_CAPTURE_ENABLED` | Geolocation capture upon user registration | `true`                                     |    No    |
| `REGISTRATION_PROFILE_TIMEOUT_MS`      | Timeout for external geolocation APIs      | `2500`                                     |    No    |
| `FREE_IP_API_URL_TEMPLATE`             | FreeIPAPI endpoint template                | `https://free.freeipapi.com/api/json/{ip}` |    No    |
| `ENABLE_IPAPI_CO`                      | Enable IPAPI.co provider                   | `true`                                     |    No    |
| `IPAPI_CO_URL_TEMPLATE`                | IPAPI.co endpoint template                 | `https://ipapi.co/{ip}/json/`              |    No    |
| `ENABLE_IPWHO_IS`                      | Enable IPWho.is provider                   | `false`                                    |    No    |
| `IPWHOIS_APP_API_KEY`                  | IPWhois.app API key                        | `sk.544e...`                               |    No    |
| `IPGEOLOCATION_API_KEY`                | IPGeolocation.io API key                   | `64273...`                                 |    No    |
| `IPLOCATE_IO_API_KEY`                  | IPLocate.io API key                        | `d6a93...`                                 |    No    |

#### 10. Observability, Monitoring & Analytics

| Variable                                 | Description                               | Default / Example           | Required |
| :--------------------------------------- | :---------------------------------------- | :-------------------------- | :------: |
| `SENTRY_ENABLED` / `VITE_SENTRY_ENABLED` | Master toggle for Sentry error monitoring | `false`                     |    No    |
| `SENTRY_DSN`                             | Backend Sentry DSN endpoint               | `https://...@sentry.io/...` |    No    |
| `VITE_SENTRY_DSN`                        | Frontend Sentry DSN endpoint              | `https://...@sentry.io/...` |    No    |
| `LOGROCKET_APP_ID`                       | LogRocket backend ID                      | `o4jvc9/vault-backend`      |    No    |
| `VITE_LOGROCKET_APP_ID`                  | LogRocket frontend ID                     | `o4jvc9/vault-oewnk`        |    No    |
| `VITE_GA_ID`                             | Google Analytics 4 Measurement ID         | `G-RVR6ZG608D`              |    No    |
| `ANALYZE_BUNDLE`                         | Generate Vite visualizer bundle map       | `false`                     |    No    |

---

### 🚀 Render Production Deployment Guide

When deploying Vault to Render ([my-vault-cic6.onrender.com](https://my-vault-cic6.onrender.com)):

1. **Service Type**: Web Service (Node.js environment).
2. **Build Command**: `npm run build`
3. **Start Command**: `npm start`
4. **Health Check Path**: `/health`
5. **Environment Variables**: Add all production variables from [`.env.production.example`](file:///c:/Code/vault/.env.production.example) in the Render Dashboard under **Environment**.

#### Zero-Downtime Database Failover

The backend supports automatic database cluster failover. If `MONGODB_URI` becomes unavailable or experiences SRV lookup timeout, the server automatically connects to `MONGODB_URI_FALLBACK`.

```env
MONGODB_URI="mongodb+srv://adrajpu523_db_user:x3MijIdldwTAcF1w@cluster0.ncuxgch.mongodb.net/vault?retryWrites=true&w=majority&appName=Cluster0"
MONGODB_URI_FALLBACK="mongodb+srv://adrajpu523_db_user:Ns4cz0uMqfAxI46I@cluster0.dxhm8nx.mongodb.net/vault?retryWrites=true&w=majority&appName=Cluster0"
```

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
