<p align="center">
  <a href="#vault">
    <img
      src="./public/favicon.svg"
      alt="Vault Logo"
      width="80"
      height="80"
      style="padding: 14px; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);"
    />
  </a>
</p>

<h1 align="center" style="font-weight: 800; letter-spacing: -0.025em;">Vault</h1>

<p align="center">
  <span style="display: inline-block; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 9999px; padding: 4px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;">
    ● Zero-Knowledge Protected
  </span>
  <span style="display: inline-block; background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 9999px; padding: 4px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; margin-left: 6px;">
    ● Post-Quantum Ready
  </span>
</p>

<p align="center">
  <strong>Ultra-Secure Zero-Knowledge Personal Storage & Real-Time Sync Platform</strong>
</p>

<p align="center">
  <em>Engineered with client-side AES-256-GCM encryption, Post-Quantum Kyber key exchange, device session rotation, and real-time cloud synchronization.</em>
</p>

<p align="center">
  <a href="https://my-vault-cic6.onrender.com"><img src="https://img.shields.io/badge/Deployment-Live%20on%20Render-success?style=for-the-badge&logo=render&logoColor=white" alt="Deployment" /></a>
  <img src="https://img.shields.io/badge/Security-Zero--Knowledge-blueviolet?style=for-the-badge&logo=shield&logoColor=white" alt="Zero Knowledge Security" />
  <img src="https://img.shields.io/badge/Encryption-AES--256--GCM-007acc?style=for-the-badge&logo=lock&logoColor=white" alt="AES-256-GCM" />
  <img src="https://img.shields.io/badge/Post--Quantum-PQC--Kyber-8b5cf6?style=for-the-badge&logo=quantum&logoColor=white" alt="PQC Kyber" />
  <img src="https://img.shields.io/badge/React-19.3-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-8.3-646cff?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/TypeScript-7.x%20%2F%205.x-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node 22" />
  <img src="https://img.shields.io/badge/Express-5.2-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/MongoDB-7.x-47a248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB 7" />
  <a href="./test.md"><img src="https://img.shields.io/badge/Test%20Suite-97%20Files%20%E2%80%A2%2067%20Scripts-success?style=for-the-badge&logo=vitest&logoColor=white" alt="Test Suite" /></a>
  <img src="https://img.shields.io/badge/TailwindCSS-v4.3-38bdf8?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="TailwindCSS v4" />
</p>

<p align="center">
  <a href="#-overview">Overview</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#%EF%B8%8F-architecture--security-blueprint">Architecture</a> •
  <a href="#-repository-structure">Project Structure</a> •
  <a href="#%EF%B8%8F-technology-stack">Tech Stack</a> •
  <a href="#%EF%B8%8F-environment-configuration">Configuration</a> •
  <a href="#-api-reference">API</a> •
  <a href="#-security--hardening-notes">Security</a> •
  <a href="#-development--verification-commands">Commands</a> •
  <a href="./doc/README.md"><strong>📚 Docs (doc/)</strong></a> •
  <a href="./test.md"><strong>🧪 Test Guide (test.md)</strong></a>
</p>

---

## 📋 Table of Contents

- [🎯 Overview](#-overview)
- [✨ Key Features](#-key-features)
- [🏗️ Architecture & Security Blueprint](#%EF%B8%8F-architecture--security-blueprint)
  - [Architecture Flowchart](#architecture-flowchart)
  - [Zero-Trust Data Boundary](#zero-trust-data-boundary)
- [📂 Repository Structure](#-repository-structure)
- [🛠️ Technology Stack](#%EF%B8%8F-technology-stack)
- [⚡ Performance & Asset Optimization](#-performance--asset-optimization)
- [⚙️ Environment Configuration](#%EF%B8%8F-environment-configuration)
  - [Quick Start Setup](#quick-start-setup)
  - [Environment Variables Reference](#-environment-variables-reference)
  - [Render Production Deployment Guide](#-render-production-deployment-guide)
- [📡 API Reference](#-api-reference)
  - [Authentication Endpoints](#authentication-endpoints)
  - [Vault Storage Endpoints](#vault-storage-endpoints)
  - [Internal Control Records](#internal-control-records)
- [🔄 Synchronization Strategy](#-synchronization-strategy)
- [🔒 Security & Hardening Notes](#-security--hardening-notes)
- [🧪 Development & Verification Commands](#-development--verification-commands)
  - [Development Server](#development-server)
  - [Build & Production Packaging](#build--production-packaging)
  - [Testing Suite & Test Reference (test.md)](#testing-suite--test-reference-testmd)
  - [Code Quality & Maintenance](#code-quality--maintenance)
- [📑 Comprehensive Testing Guide (`test.md`)](#-comprehensive-testing-guide-testmd)
- [📄 License & Authors](#-license--authors)

---

## 🎯 Overview

**Vault** is a high-performance, enterprise-grade personal vault platform engineered for securely storing sensitive files, encrypted notes, credentials, media, and confidential personal data.

### Core Guarantees:

- **Zero-Knowledge Architecture**: All sensitive payload data (notes, passwords, files, metadata) is encrypted client-side using **AES-256-GCM** before transmission. The server only receives encrypted ciphertexts and never possesses the keys to decrypt them.
- **Dual-Key Isolation**: The account authentication credential (used for server-side bcrypt verification) is cryptographically isolated from the client-side master encryption key.
- **Post-Quantum Cryptography**: Lattice-based **PQC Kyber** key exchange preparation ensures forward-secrecy against future quantum decryption threats.
- **Real-Time Cross-Device Sync**: WebSockets powered by **Socket.IO** distribute real-time changes instantly across all authenticated devices with timestamp-based conflict arbitration.

---

## ✨ Key Features

### 🔐 Cryptography & Zero-Knowledge

- **End-to-End Client Encryption**: Authenticated **AES-256-GCM** with WebCrypto API and `libsodium`.
- **Post-Quantum Key Exchange**: Native lattice cryptography using `pqc-kyber`.
- **Zero-Knowledge Sentinel Check (`__keycheck__`)**: Validates passphrase correctness locally and verifies sentinel envelopes without exposing secrets to the backend.
- **Key Derivation**: Memory-hard key derivation via Argon2 (`hash-wasm`) and PBKDF2.
- **Merkle Tree Tamper Detection**: Hierarchical Merkle hashing across all encrypted records to immediately alert on silent bit-rot, unauthorized edits, or database corruption.
- **Plausible Deniability Decoy Vault**: Secondary decoy PIN partition seamlessly displays mock data under duress without revealing the existence of true encrypted records.

### ⚡ Real-Time Cloud Synchronization

- **WebSocket Event Pipeline**: Live updates broadcast via Socket.IO on isolated user channels.
- **Delta & Polling Fallback**: Lightweight delta queries via `/api/vault/sync?since=<timestamp>`.
- **Conflict Resolution**: Deterministic `latest-update-wins` timestamp arbitration.
- **Tombstone Sync**: Deletions are soft-deleted and propagated seamlessly across all connected clients.
- **Multi-Cluster Database Failover**: Seamless automatic failover between MongoDB Atlas primary and secondary clusters with zero downtime.

### 📝 Rich Content, Video Mini-Player & Document Shield

- **TipTap Rich Text Editor**: Markdown-compatible WYSIWYG note editing with live local decryption.
- **Floating Video Mini-Player (Picture-in-Picture)**: Persistent mini-player (`GlobalVideoMiniPlayer`) backed by Zustand (`videoMiniPlayerStore`) that stays active across navigation, route changes, and tabs with minimize, collapse, and timeline scrub controls.
- **Mobile PDF & Document Privacy Shield**: Sandboxed in-browser PDF rendering (`PdfViewer`) with anti-screenshot protection, tab-switch blurring (`useAntiScreenshotAndShield`), print prevention, and secure mobile handoff.
- **Encrypted Media Streaming**: Secure file storage with chunked streaming via HLS.js and Shaka Player.
- **Interactive Visualizations**: 3D globe visualization (COBE), interactive particles, and dynamic canvas rendering.
- **TOTP & 2FA Vault**: Built-in OTP token generator with live countdown and QR code scanning.

### 🛡️ Identity, Bot Defense & Hardened Security

- **Hardened 2FA & reCAPTCHA Bot Defense**: Google reCAPTCHA v2/v3 token verification middleware (`recaptchaMiddleware`), rate-limited 2FA verification, and mandatory password verification on 2FA deactivation.
- **Universal Panic Lock Widget**: One-tap emergency panic widget that instantly zeroizes and shreds all in-memory cryptographic keys within 60ms.
- **Device Fingerprinting & Session Rotation**: Distinct device tracking with HTTP-Only rotating refresh cookies.
- **Remote Revocation**: Instantly revoke individual device sessions or terminate all remote sessions.
- **Audit & Activity Logs**: Client-side encrypted event tracking (`__logs__`) and login history telemetry.

### 👆 Cross-Device Touch & Gestures

- **Touch Drag-and-Drop Polyfill**: Native-feeling touch drag & drop with 200ms hold initiation, haptic feedback, safe-area inset compliance (`env(safe-area-inset-bottom)`), edge auto-scroll suppression, and synthetic click protection.
- **Mobile Responsive Layout**: Adaptive quick-drop bar on compact screens (<1024px) and full desktop sidebar on widescreen tablets and laptops.

### 🚀 Production & Performance

- **Pre-compressed Assets**: Automated build-time Brotli (`.br`) and Gzip (`.gz`) asset compression.
- **Module Preload & Hints**: Optimized resource loading with immutable 1-year cache headers for static chunks.
- **High Availability**: Automatic database cluster failover between MongoDB Atlas primary and secondary clusters.

---

## 🏗️ Architecture & Security Blueprint

### Architecture Flowchart

```mermaid
flowchart TD
    subgraph Client["Client Application (Browser / PWA)"]
        UI["React 19 + TailwindCSS v4"]
        Editor["TipTap Rich Editor / Media Player"]
        CryptoEngine["WebCrypto / AES-256-GCM / PQC-Kyber"]
        LocalState["Zustand / IndexedDB Store"]

        UI --> Editor
        Editor --> CryptoEngine
        CryptoEngine --> LocalState
    end

    subgraph Transport["Encrypted Transport (HTTPS + WSS)"]
        HTTPS["HTTPS (REST API)"]
        WSS["WSS (Socket.IO Real-Time Push)"]
    end

    subgraph Backend["API Gateway & Server (Express 5 / Node 22)"]
        Helmet["Helmet Security Headers & CORS"]
        AuthMiddleware["JWT Auth & Rotating Refresh Cookies"]
        RateLimiter["IP / Route Rate Limiting & Overload Shield"]
        SyncController["Vault Sync & Conflict Arbiter"]

        Helmet --> RateLimiter
        RateLimiter --> AuthMiddleware
        AuthMiddleware --> SyncController
    end

    subgraph Storage["Storage Layer"]
        AtlasPrimary[("MongoDB Atlas (Primary Cluster)")]
        AtlasSecondary[("MongoDB Atlas (Failover Cluster)")]
        DiskUploads[("Encrypted File Storage")]
    end

    CryptoEngine -- "Encrypted Payloads Only" --> HTTPS
    LocalState <--> WSS
    HTTPS --> Helmet
    WSS <--> SyncController
    SyncController --> AtlasPrimary
    AtlasPrimary -. Failover .-> AtlasSecondary
    SyncController --> DiskUploads
```

### Zero-Trust Data Boundary

```
+---------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                    |
|   React 19 + Vite 8 + TypeScript + WebCrypto API + Sodium / PQC-Kyber + TipTap  |
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
|      Express 5 + Helmet Hardening + Rate Limiting + CSRF + Auth Middleware      |
|                                                                                 |
|  * JWT Bearer Access Tokens + HTTP-Only Rotating Refresh Cookies                |
|  * IP-Based & Route-Based Rate Throttling & Overload Protection                 |
|  * Sentinel Verification Check (__keycheck__) without exposing raw secrets     |
+----------------------------------------+----------------------------------------+
                                         |
                           Mongoose 9 / MongoDB Driver
                                         |
+----------------------------------------v----------------------------------------+
|                                DATABASE LAYER                                   |
|             MongoDB Atlas Cluster (Primary) + SRV Fallback Cluster              |
|                                                                                 |
|  * Encrypted Control Records (__settings__, __logs__, __profile__)              |
|  * Scoped encrypted user items & soft-deleted tombstones                        |
```

### 🛡️ 8-Layer Cryptographic Protocol & Security Architecture

The vault implements a comprehensive defense-in-depth security model across 8 distinct verification layers:

| Layer       | Security Domain                     | Technology & Standards                                                        | Cryptographic Specifications                                                                                                     |
| :---------- | :---------------------------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| **Layer 1** | **Key Derivation (KDF)**            | **Argon2id** (RFC 9106)                                                       | 64 MB RAM, 3 Iterations, 4 Parallel Lanes, 256-bit derived key, per-user unique salt, Web Worker offloading                      |
| **Layer 2** | **Post-Quantum Key Exchange**       | **X25519 + Kyber768 (ML-KEM)** (NIST FIPS 203, RFC 7748)                      | Post-quantum hybrid bridge combining Curve25519 ECDH + Kyber-768 lattice KEM; protects against HNDL quantum threats              |
| **Layer 3** | **Payload Encryption**              | **Dual Cascade: AES-256-GCM + ChaCha20-Poly1305** (NIST SP 800-38D, RFC 8439) | `VCAS01` multi-cipher cascade envelope with 64-byte dual DEKs (32-byte AES + 32-byte ChaCha20) and AAD binding                   |
| **Layer 4** | **Zero-Knowledge E2EE & Transport** | **RSA-OAEP 2048/4096 + TLS 1.3** (RFC 8017, RFC 8446)                         | Client-side asymmetric envelope encryption with SHA-256 digest; TLS 1.3 PFS transport, Helmet HSTS, and strict origin validation |
| **Layer 5** | **Device Integrity & Signatures**   | **Hardware Entropy + Ed25519** (RFC 8032, W3C Device API)                     | SHA-256 hardware/browser fingerprint (`X-Fingerprint-Id`) + libsodium Ed25519 digital signature message authenticity             |
| **Layer 6** | **Ephemeral RAM Protection**        | **60s Inactivity Key Shredder & Zeroization**                                 | Automated 60-second inactivity watchdog purges keys from memory; immediate explicit buffer zeroization (`.fill(0)`)              |
| **Layer 7** | **Key Isolation & Duress Defense**  | **Non-Extractable CryptoKey & Decoy Duress Shield** (W3C WebCrypto)           | Keys imported with `extractable: false` preventing JS exfiltration; duress decoy PIN seamlessly unlocks decoy workspace          |
| **Layer 8** | **Multi-Factor & Lockout Defense**  | **WebAuthn / FIDO2 Passkeys + TOTP** (RFC 6238, W3C WebAuthn Level 3)         | Phishing-resistant biometric passkeys, 6-digit TOTP, reCAPTCHA bot defense, and multi-tier brute-force emergency wipe            |

---

## 📂 Repository Structure

```text
vault/
├── doc/                    # 📚 Comprehensive technical architecture & protocol docs
│   ├── README.md           # Documentation index & role-based reading guide
│   ├── design.md           # System architecture & design blueprint
│   ├── security-and-crypto.md # 8-layer cryptographic specifications
│   ├── database-schemas.md # Data models, Mongoose schemas & indexing strategy
│   ├── threat-model.md     # STRIDE threat model & cryptographic risk analysis
│   ├── api-reference.md    # REST API & Socket.IO protocol reference
│   ├── sync-and-storage.md # Real-time sync & multi-cluster failover
│   ├── client-features.md  # TipTap notes, video PiP, PDF privacy shield
│   ├── testing-and-verification.md # Test architecture & CI/CD verification
│   ├── performance.md      # Asset optimization, Brotli pre-compression & Core Web Vitals
│   ├── setup-and-deployment.md # Setup, .env catalog, Render deployment
│   └── user-guide.md       # User-friendly handbook, everyday guide & shortcuts cheat sheet
├── public/                 # Static assets, icons, manifest, favicon
├── server/                 # Express 5 backend application
│   ├── boot/               # Server bootstrap & lifecycle handlers
│   ├── controllers/        # Route controllers (Auth, Vault, Sync, Media)
│   ├── middleware/         # Security, rate limit, JWT, CSRF, error middleware
│   ├── models/             # Mongoose schemas (User, Item, Session, Log)
│   ├── routes/             # REST API endpoint definitions
│   ├── security/           # Server-side cryptography, envelope KEK, tokens
│   ├── services/           # Geolocation, Sentry, keep-alive, socket services
│   ├── socket.ts           # Socket.IO connection & event handlers
│   └── vite.ts             # Vite SSR / production static compression server
├── src/                    # Frontend React 19 application
│   ├── api/                # Axios API client & interceptors
│   ├── components/         # Shared UI components & Radix primitives
│   ├── features/           # Feature modules (Vault, Notes, Media, Settings, Auth)
│   ├── hooks/              # Custom React hooks (sync, keyboard, crypto)
│   ├── lib/                # Client utilities & streaming engines
│   ├── security/           # WebCrypto, AES-256-GCM, PQC-Kyber, key derivation
│   ├── store/              # Zustand global application state
│   ├── App.tsx             # Root React component
│   └── main.tsx            # Client entry point
├── scripts/                # Build, analysis, backup, test & diagnostic scripts
├── tests/                  # Unit, security, crypto, and integration test suites
├── test.md                 # 🧪 Comprehensive test suite cheat sheet & test execution guide
├── .env.example            # Environment variable template
├── package.json            # Dependencies and npm script definitions
├── server.ts               # Main server entry point
├── vite.config.ts          # Vite build configuration & compression pipeline
└── vitest.config.ts        # Vitest testing configuration
```

---

## 🛠️ Technology Stack

<div style="overflow-x: auto;">

| Layer                       | Technologies & Key Libraries                                                                                                              |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend UI**             | **React 19.3**, **Vite 8.3**, **TypeScript ~7.0 / 5.x**, **TailwindCSS v4.3**, Framer Motion, Radix UI, Lucide Icons 1.47, Sonner Toast   |
| **Rich Text & Media**       | **TipTap Editor 3.31**, **HLS.js 1.7**, **Shaka Player 5.2**, Global Video Mini-Player (PiP), Sandboxed PDF Viewer, tsParticles, COBE 3D  |
| **Cryptography & Security** | WebCrypto API, **AES-256-GCM**, `libsodium-wrappers`, **`pqc-kyber`**, `hash-wasm` (Argon2id), Merkle Tree Tamper Alarms, Decoy Vault PIN |
| **Backend Framework**       | **Express 5.2**, **Node.js 22 (LTS)**, Socket.IO 4.8, Helmet 8.3, Express Rate Limit, Multer 2.4, Cookie Parser, Google reCAPTCHA v2/v3   |
| **Database & Cache**        | **MongoDB 7.x**, **Mongoose 9.10**, Node Cache, Multi-Cluster Atlas Failover Engine                                                       |
| **Asset Optimization**      | **Brotli & Gzip Pre-compression**, Module Preload Polyfills, OXC / Terser Minification, Aggressive Immutable Caching                      |
| **Testing & Quality**       | **Vitest 5.0 (97 Test Files • 67 Scripts)**, Supertest, Lighthouse CI Runner, Sentry 10.75 Error Tracking & Node Profiling                |

</div>

---

## ⚡ Performance & Asset Optimization

The platform implements an automated asset pipeline designed for sub-second load times and minimal bandwidth consumption:

- **Brotli & Gzip Pre-compression**:
  - Production bundles are pre-compressed into `.br` and `.gz` during build via [`vite.config.ts`](./vite.config.ts).
  - Express directly streams matching pre-compressed assets via [`server/vite.ts`](./server/vite.ts) based on client `Accept-Encoding`, avoiding runtime CPU bottlenecks.
- **Module Preloading & Code Splitting**:
  - Critical JavaScript chunks are prefetched with `<link rel="modulepreload">` tags during initial HTML parse.
  - Granular code splitting separates heavy libraries (TipTap, Shaka Player, COBE Globe, Crypto) into on-demand chunks.
- **Aggressive Caching Strategy**:
  - Content-hashed static bundles (`/assets/*.js`, `/assets/*.css`) serve with `Cache-Control: public, max-age=31536000, immutable`.
  - HTML and Service Worker scripts (`index.html`, `/sw.js`) enforce strict validation with `Cache-Control: no-cache, no-store, must-revalidate`.

---

## ⚙️ Environment Configuration

### Quick Start Setup

#### 1. Clone & Install Dependencies

```bash
git clone https://github.com/adadarsh23/vault.git
cd vault
npm install
```

#### 2. Configure Environment Variables

```bash
# Copy template configuration
cp .env.example .env

# Edit .env and supply your MongoDB URI and secure secret keys
```

#### 3. Start Development Server

```bash
# Run backend server with live reload
npm run dev

# (Optional) Run client independently in Vite dev mode
npm run dev:client
```

---

### 📚 Environment Variables Reference

#### 1. Server & Runtime Environment

<div style="overflow-x: auto;">

| Variable                      | Description                                               | Default / Example          |  Required  |
| :---------------------------- | :-------------------------------------------------------- | :------------------------- | :--------: |
| `NODE_ENV`                    | Runtime environment (`development`, `production`, `test`) | `production`               |    Yes     |
| `PORT`                        | HTTP server port                                          | `4000`                     |     No     |
| `RENDER_SERVICE_ID`           | Render cloud service identifier                           | `srv-d6njnj4r85hc73fpivtg` |     No     |
| `DISABLE_ORIGIN_PROTECTION`   | Bypass strict origin check when SPA & API share host      | `true`                     |     No     |
| `ALLOW_LOCAL_CORS_ORIGINS`    | Allow localhost origins in production                     | `false`                    |     No     |
| `TRUST_PROXY`                 | Upstream proxy count (1 for Render / Cloudflare)          | `1`                        | Yes (Prod) |
| `KEEP_ALIVE_ENABLED`          | Background keep-alive self-ping                           | `true`                     |     No     |
| `ENABLE_COMPRESSION`          | Automatic Brotli / Gzip response compression              | `true`                     |     No     |
| `ENABLE_OVERLOAD_PROTECTION`  | Event loop lag monitoring & load shedding                 | `true`                     |     No     |
| `EVENT_LOOP_LAG_THRESHOLD_MS` | Overload trigger threshold in ms                          | `1000`                     |     No     |

</div>

#### 2. Database Configuration (MongoDB Atlas)

<div style="overflow-x: auto;">

| Variable                       | Description                                                    | Default / Example                                                | Required |
| :----------------------------- | :------------------------------------------------------------- | :--------------------------------------------------------------- | :------: |
| `MONGODB_URI`                  | Primary MongoDB Atlas connection string (SRV)                  | `mongodb+srv://<user>:<password>@cluster0.xxx.mongodb.net/vault` |   Yes    |
| `MONGODB_URI_FALLBACK`         | Secondary fallback MongoDB cluster URI                         | `mongodb+srv://<user>:<password>@cluster1.xxx.mongodb.net/vault` |    No    |
| `MONGODB_URI_DIRECT`           | Direct non-SRV replica-set URI for DNS-restricted environments | `mongodb://user:pass@host1:27017...`                             |    No    |
| `MONGODB_DB`                   | MongoDB database name                                          | `vault`                                                          |    No    |
| `MONGODB_ALLOW_LOCAL_FALLBACK` | Fallback to in-memory mock store if DB is down                 | `false`                                                          |    No    |
| `MONGODB_DNS_SERVERS`          | Primary DNS resolvers for Atlas SRV lookups                    | `1.1.1.1,8.8.8.8`                                                |    No    |
| `MONGODB_DNS_RETRY_SERVERS`    | Fallback DNS resolvers for retry                               | `8.8.8.8,1.1.1.1`                                                |    No    |
| `ATLAS_KEEPALIVE_MINUTES`      | Interval for database keep-alive ping                          | `10`                                                             |    No    |
| `SKIP_MONGO_CONNECT`           | Skip DB connection (mock testing mode)                         | `false`                                                          |    No    |

</div>

#### 3. Authentication, Cryptography & Security

<div style="overflow-x: auto;">

| Variable                             | Description                                                 | Default / Example     |  Required  |
| :----------------------------------- | :---------------------------------------------------------- | :-------------------- | :--------: |
| `JWT_SECRET`                         | 256-bit+ HMAC secret for access token signing               | `64+ char hex string` |    Yes     |
| `JWT_EXPIRES_IN`                     | Access token lifespan                                       | `12h`                 |     No     |
| `REFRESH_TOKEN_SECRET`               | 256-bit+ HMAC secret for refresh token signing              | `64+ char hex string` | Yes (Prod) |
| `REFRESH_TOKEN_EXPIRES_IN`           | Refresh token lifespan                                      | `30d`                 |     No     |
| `CSRF_SECRET`                        | Secret key for double-submit HMAC CSRF token validation     | `64+ char hex string` | Yes (Prod) |
| `SIGNED_URL_SECRET`                  | Secret key for signed media URLs & temporary download links | `64+ char hex string` | Yes (Prod) |
| `VAULT_ENCRYPTION_KEY`               | Master server envelope encryption key (32-byte hex/base64)  | `64+ char hex string` | Yes (Prod) |
| `AUTH_PEPPER`                        | Server-side pepper for password hashing                     | `64+ char hex string` | Yes (Prod) |
| `BCRYPT_ROUNDS`                      | Salt rounds for bcrypt hashing                              | `12`                  |     No     |
| `REQUIRE_ES256_IN_PRODUCTION`        | Enforce asymmetric ES256 key rings                          | `false`               |     No     |
| `REQUIRE_ENVELOPE_KEK_IN_PRODUCTION` | Enforce KMS envelope KEK                                    | `false`               |     No     |
| `RECAPTCHA_SECRET_KEY`               | Google reCAPTCHA v2 secret key for backend verification     | `YourSecretKey`       | Yes (Prod) |
| `VITE_RECAPTCHA_SITE_KEY`            | Google reCAPTCHA v2 site key for frontend widget            | `YourSiteKey`         | Yes (Prod) |
| `ALLOW_RECAPTCHA_TEST_HOST`          | Allow Google test-key host validation in production         | `false`               |     No     |

</div>

#### 4. Client & Public URLs

<div style="overflow-x: auto;">

| Variable                    | Description                                              | Default / Example                     |  Required  |
| :-------------------------- | :------------------------------------------------------- | :------------------------------------ | :--------: |
| `CLIENT_URL`                | Allowed frontend origin for CORS & cookie policies       | `https://my-vault-cic6.onrender.com/` | Yes (Prod) |
| `PUBLIC_URL`                | Canonical public URL for keep-alive pings & signed links | `https://my-vault-cic6.onrender.com`  | Yes (Prod) |
| `VITE_APP_PUBLIC_URL`       | Frontend public root URL injected into Vite runtime      | `https://my-vault-cic6.onrender.com/` | Yes (Prod) |
| `VITE_API_BASE_URL`         | Primary client API base endpoint                         | `https://my-vault-cic6.onrender.com/` | Yes (Prod) |
| `VITE_DEV_API_BASE_URL`     | Development API endpoint for local Vite server           | `http://localhost:4000`               |     No     |
| `VITE_DEFAULT_API_BASE_URL` | Fallback API endpoint                                    | `http://127.0.0.1:4000`               |     No     |
| `VITE_DNS_PREFETCH_HOST`    | Pre-connect DNS host hint for HTML head                  | `//my-vault-cic6.onrender.com`        |     No     |
| `VITE_CSP_CONNECT_SRC`      | CSP `connect-src` whitelist                              | `https://my-vault-cic6.onrender.com`  |     No     |
| `VITE_APP_RELEASE`          | Frontend release version tag                             | `1.0.0`                               |     No     |

</div>

#### 5. Storage, Sessions & Limits

<div style="overflow-x: auto;">

| Variable                   | Description                                  | Default / Example | Required |
| :------------------------- | :------------------------------------------- | :---------------- | :------: |
| `REFRESH_COOKIE_SAME_SITE` | SameSite cookie policy (`strict`, `lax`)     | `strict`          |    No    |
| `REFRESH_COOKIE_SECURE`    | HTTPS-only cookie flag                       | `true`            |   Yes    |
| `SESSION_RETENTION_MS`     | Max session retention duration (7 days)      | `604800000`       |    No    |
| `MAX_ACTIVE_DEVICES`       | Maximum active device sessions per user      | `25`              |    No    |
| `UPLOAD_DIR`               | Directory for persistent vault file storage  | `uploads`         |    No    |
| `MAX_FILE_SIZE_MB`         | Server maximum file upload size limit        | `500` (or `4096`) |    No    |
| `API_RATE_LIMIT_WINDOW_MS` | General API rate limit window in ms (15 min) | `900000`          |    No    |
| `API_RATE_LIMIT_MAX`       | Max general API requests per window          | `1000`            |    No    |
| `AUTH_RATE_LIMIT_MAX`      | Max auth attempts per window                 | `100`             |    No    |

</div>

---

### 🚀 Render Production Deployment Guide

When deploying Vault to Render ([my-vault-cic6.onrender.com](https://my-vault-cic6.onrender.com)):

1. **Service Type**: Web Service (Node.js runtime).
2. **Build Command**: `npm run build`
3. **Start Command**: `npm start`
4. **Health Check Path**: `/health`
5. **Environment Variables**: Populate all production variables referencing [`.env.example`](./.env.example) in the Render Dashboard under **Environment**.

#### Zero-Downtime Database Failover

The backend supports automatic database cluster failover. If `MONGODB_URI` becomes unreachable or experiences an SRV lookup timeout, the server automatically connects to `MONGODB_URI_FALLBACK`:

```env
MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.ncuxgch.mongodb.net/vault?retryWrites=true&w=majority&appName=Cluster0"
MONGODB_URI_FALLBACK="mongodb+srv://<username>:<password>@cluster0.dxhm8nx.mongodb.net/vault?retryWrites=true&w=majority&appName=Cluster0"
```

---

## 📡 API Reference

### Authentication Endpoints

<div style="overflow-x: auto;">

| Method | Endpoint                    | Description                                                   | Auth Required |
| :----- | :-------------------------- | :------------------------------------------------------------ | :-----------: |
| `POST` | `/api/auth/register`        | Register new user account & initialize device session         |      ❌       |
| `POST` | `/api/auth/login`           | Authenticate user credentials & issue JWT + Session Cookie    |      ❌       |
| `POST` | `/api/auth/refresh`         | Rotate long-lived refresh cookie & issue new JWT access token |      ❌       |
| `POST` | `/api/auth/logout`          | Invalidate current device refresh token & clear cookies       |      ❌       |
| `GET`  | `/api/auth/me`              | Fetch active user profile & active device sessions            |      🔐       |
| `POST` | `/api/auth/sessions/revoke` | Revoke specific device session or all remote sessions         |      🔐       |

</div>

#### Request Example (`POST /api/auth/register`):

```json
{
  "username": "vault_user",
  "password": "SecurePassword123!",
  "masterKey": "LocalVaultEncryptionKeyProof",
  "deviceId": "desktop-client-01"
}
```

#### Response Example (`POST /api/auth/login`):

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "65f0a82bc194d...",
      "username": "vault_user"
    }
  }
}
```

---

### Vault Storage Endpoints

<div style="overflow-x: auto;">

| Method   | Endpoint                           | Description                                                  | Auth Required |
| :------- | :--------------------------------- | :----------------------------------------------------------- | :-----------: |
| `GET`    | `/api/vault/items`                 | Fetch all encrypted vault records for the authenticated user |      🔐       |
| `POST`   | `/api/vault/items/:itemId`         | Upsert (create or update) an encrypted vault item record     |      🔐       |
| `DELETE` | `/api/vault/items/:itemId`         | Soft-delete vault item & emit tombstone for sync clients     |      🔐       |
| `GET`    | `/api/vault/sync`                  | Query updated items since timestamp (`since` query param)    |      🔐       |
| `GET`    | `/api/vault/legacy/:vaultId/items` | Legacy compatibility endpoint for older vault formats        |      🔐       |

</div>

### Internal Control Records

Vault utilizes structured, encrypted control records stored in the items collection to persist application settings without exposing them:

- `__settings__`: Client interface configuration, theme preferences, and shortcuts (encrypted).
- `__logs__`: Client activity audit logs and security telemetry (encrypted).
- `__profile__`: User profile metadata & optional registration IP telemetry.
- `__keycheck__`: Encrypted sentinel record used to verify client vault passphrase correctness without exposing raw secrets.

---

## 🔄 Synchronization Strategy

```text
[Device A: Local Edit]
        |
        v Encrypt item locally (AES-256-GCM)
[POST /api/vault/items/:id]
        |
        v Save to Database with updatedAt timestamp
[Server: Socket.IO Broadcaster]
        |
        +------> Broadcast "vault:changed" event to user channel
        |
        v
[Device B: Connected via WSS]
        |
        v Fetch delta via GET /api/vault/sync?since=<lastSync>
        v Decrypt locally & update IndexedDB / Zustand store
```

- **Real-Time WebSocket Push**: Real-time change events are broadcast over Socket.IO on the `vault:changed` event channel.
- **Incremental Delta Polling**: Polling clients query `/api/vault/sync?since=<timestamp>` for lightweight delta updates.
- **Conflict Arbitration**: Concurrent cross-device edits resolve using **latest-update-wins** based on client timestamp (`updatedAt`).
- **Tombstone Preservation**: Deleted items are soft-deleted (`isDeleted: true`, `deletedAt: <timestamp>`) to propagate deletion seamlessly across all synced devices.

---

## 🔒 Security & Hardening Notes

1. **Bcrypt Password Hashing**: Passwords are salted with configurable rounds and optional server pepper before database storage.
2. **AES-256-GCM Envelope Encryption**: Vault items and sensitive records are encrypted client-side using AES-256-GCM.
3. **Dedicated Keycheck Sentinel**: High-entropy `__keycheck__` records allow instant validation of client-entered passphrase without decrypting actual user payload data.
4. **Helmet Security Headers**: Enforces strict Content Security Policy (CSP), Cross-Origin Resource Policy (CORP), Frameguard, and `X-Content-Type-Options`.
5. **Session Isolation**: HTTP-Only, `SameSite=Strict` cookies protect refresh tokens against XSS-based theft.
6. **Rate Limiting & Overload Protection**: Protects against brute-force attacks and monitors Node.js event-loop lag to shed load under denial-of-service conditions.

---

## 🧪 Development & Verification Commands

### Development Server

```bash
# Start backend server with live reload (tsx watch)
npm run dev

# Start Vite client development server
npm run dev:client

# Start Vite client exposed to local network
npm run dev:host
```

### Build & Production Packaging

```bash
# Type-check and compile Vite production bundle
npm run build

# Build with OXC minification
npm run build:prod

# Analyze bundle sizes with rollup-plugin-visualizer
npm run build:analyze

# Create production deployment ZIP package
npm run zip:prod
```

### Testing Suite & Test Reference (`test.md`)

Vault features an extensive test suite consisting of **97 test files** (57 unit, 4 integration, 36 component/feature specs) and **67 specialized npm test scripts** verifying client-side zero-knowledge encryption, post-quantum key exchange, authentication boundaries, WebSocket synchronization, mobile document shields, picture-in-picture media, and security perimeters.

> [!TIP]
> **Complete Testing Manual Available**
> All 67 npm test scripts, single-file isolation commands, domain suites (crypto, auth, sync, media, settings, mini-player, mobile PDF), watch modes, coverage reports, stress testing loops, and debugging flags are fully documented in **[`test.md`](./test.md)**.

```bash
# Safe single-worker default test run
npm test

# Standard full test run in parallel
npm run test:run

# Run all 57 unit tests (tests/unit/)
npm run test:unit

# Run all integration tests (tests/integration/)
npm run test:integration

# Run all 36 client component & feature specs (src/)
npm run test:components
npm run test:client

# Run security & cryptographic verification tests
npm run test:crypto
npm run test:security
npm run test:security:integration

# Run authentication integration tests
npm run test:auth

# Interactive Vitest UI dashboard
npm run test:ui

# Generate code coverage and automatically open HTML report
npm run test:coverage:open

# Run full suite repeat stress test
npm run test:repeat 5

# Full CI verification (Doctor + Lint + Vitest CI + Vite Build)
npm run verify:ci
```

#### Quick Test Directory Mapping:

| Test Domain              | Target Path                                            | Dedicated Command          |                                   Full Reference                                   |
| :----------------------- | :----------------------------------------------------- | :------------------------- | :--------------------------------------------------------------------------------: |
| **Unit Tests**           | `tests/unit/` (57 files)                               | `npm run test:unit`        |     [`test.md §1.2 - §1.5`](./test.md#12-unit--cryptography-keys--zk-security)     |
| **Integration Tests**    | `tests/integration/` (4 files)                         | `npm run test:integration` |         [`test.md §1.1`](./test.md#11-integration-tests-testsintegration)          |
| **Component Specs**      | `src/**/*.test.tsx` (36 files)                         | `npm run test:components`  |          [`test.md §1.6`](./test.md#16-source--components--features-src)           |
| **Cryptography & Keys**  | `tests/unit/encryption.test.ts` ...                    | `npm run test:crypto`      |    [`test.md §5`](./test.md#5-cryptography-zero-knowledge--key-management-npm)     |
| **Auth & Sessions**      | `tests/unit/auth-*`, `tests/integration/auth.*`        | `npm run test:auth`        |          [`test.md §4`](./test.md#4-authentication--session-security-npm)          |
| **Hardened 2FA & Bot**   | `tests/unit/recaptchaMiddleware.test.ts` ...           | `npx vitest run ...`       |        [`test.md §2`](./test.md#hardened-2fa-recaptcha--bot-defense-suite)         |
| **Cloud Sync & Stores**  | `tests/unit/sync-*`                                    | `npm run test:sync`        |                       [`test.md §7`](./test.md#sync--state)                        |
| **Media & Streaming**    | `src/features/vault/components/MediaVault` ...         | `npm run test:media`       |                  [`test.md §7`](./test.md#media-streaming-camera)                  |
| **Mini-Player (PiP)**    | `src/components/ui/GlobalVideoMiniPlayer.test.tsx` ... | `npx vitest run ...`       | [`test.md §2`](./test.md#floating-video--picture-in-picture-pip-mini-player-suite) |
| **Mobile PDF & Shield**  | `tests/unit/mobile-pdf-document-handling.test.tsx`     | `npx vitest run ...`       |     [`test.md §2`](./test.md#mobile-pdf-viewer--anti-screenshot-shield-suite)      |
| **Settings Vault**       | `src/features/vault/__tests__/SettingsVault`           | `npm run test:settings`    |                  [`test.md §7`](./test.md#settings--ui-controls)                   |
| **Monitoring & Logs**    | `tests/unit/sentry-*`, `logrocket-*`                   | `npm run test:monitoring`  |                     [`test.md §7`](./test.md#monitoring--logs)                     |
| **Drag & Drop Polyfill** | `tests/unit/vault-drag-drop.test.ts`                   | `npm run test:vault:core`  |            [`test.md §13`](./test.md#13-drag--drop--deep-test-commands)            |
| **Inspector & Debug**    | Single file or suite                                   | `npm run test:debug:brk`   |          [`test.md §8`](./test.md#8-test-runner-modes--debugging-options)          |
| **Stress Testing**       | Full suite or single file in loops                     | `npm run test:repeat`      |   [`test.md §31`](./test.md#31-stress-testing-repeat--race-condition-detection)    |
| **Mock Diagnostics**     | `tests/unit/test-setup-mocks.test.ts`                  | `npx vitest run ...`       | [`test.md §32`](./test.md#32-mock-registry-verification--test-harness-diagnostics) |
| **Local CI Simulation**  | Full pipeline replay                                   | `npm run verify:ci`        | [`test.md §33`](./test.md#33-local-ci-simulation--pre-commit--pre-push-workflows)  |
| **Supertest Backend**    | `tests/unit/auth-api.test.ts` ...                      | `npx vitest run ...`       |     [`test.md §34`](./test.md#34-network-rest-api--supertest-backend-commands)     |

### Code Quality & Maintenance

```bash
# Run TypeScript type check across client and server
npm run typecheck:all

# Check and format codebase with Prettier
npm run format
npm run format:check

# Run system doctor diagnostics
npm run doctor

# Verify environment configuration integrity
npm run env:check

# Ping database connections
npm run db:ping

# Full CI verification (Doctor + Lint + Tests + Build)
npm run verify:ci
```

---

## 📑 Comprehensive Testing Guide (`test.md`)

For exhaustive details on testing Vault, refer directly to **[`test.md`](./test.md)**. It serves as the repository's central test handbook across 34 dedicated sections:

- 🎯 **[1. Run a Single Test File (Isolated Execution)](./test.md#1-run-a-single-test-file--isolated-execution)**: Direct `npx vitest run <file>` commands for all 97 unit and integration test files.
- ⚡ **[2. Domain-Specific Batch Test Suites](./test.md#2-domain-specific-batch-suites--direct-vitest)**: Targeted batch test suites for Cryptography, Auth, Sync, Settings, Mini-Player, Mobile PDF, and Media.
- 📦 **[3. Main & All-in-One Test Suites (npm)](./test.md#3-main--all-in-one-test-suites-npm)**: High-level test runners (`npm test`, `npm run test:run`, `npm run test:all`, `npm run test:ci`, `npm run test:server`, `npm run test:client`).
- 🔐 **[4. Authentication & Session Security Tests](./test.md#4-authentication--session-security-npm)**: Focused commands for login, registration, token rotation, and device revocation.
- 🛡️ **[5. Cryptography, Zero-Knowledge & Key Management Tests](./test.md#5-cryptography-zero-knowledge--key-management-npm)**: Client-side AES-256-GCM, PQC Kyber, Argon2 KDF, and master key rotation checks.
- 🌐 **[6. Comprehensive Security Integration Tests](./test.md#6-comprehensive-security-integration-npm)**: Multipart encryption, streaming privacy, and UI sandbox boundaries.
- 🧩 **[7. Feature & Module Tests](./test.md#7-feature--module-tests-npm)**: Scoped suites for Vault items, Sync engine, Media/Camera, Settings cards, and Sentry/LogRocket.
- 🐞 **[8. Test Runner Modes & Debugging Options](./test.md#8-test-runner-modes--debugging-options)**: Interactive UI, fast fail, memory tracking, verbose mode, V8 CPU profiling, and Chrome DevTools / VS Code debugging (`--inspect-brk`).
- 🔄 **[9. Test Watch Modes](./test.md#9-test-watch-modes)**: Instant re-run on save during active development across all 97 specs.
- 📊 **[10. Code Coverage & Reports](./test.md#10-code-coverage--reports)**: Terminal summaries, Cobertura XML, JSON summary, and browser-based HTML reports.
- ⚙️ **[11. Advanced Vitest Filtering & CLI Flags](./test.md#11-advanced-vitest-filtering--cli-flags)**: Filter by test name (`-t`), inverted patterns, path regex (`--testPathPattern`), GitHub Actions annotations, and thread pools.
- 🚀 **[12. Standalone Test Runner & Verification Pipelines](./test.md#12-standalone-runner--verification-pipelines)**: Standalone crypto assertion runner and full CI pipelines (`verify:quick`, `verify:ci`, `verify:full`).
- 👆 **[13. Drag & Drop — Deep Test Commands](./test.md#13-drag--drop--deep-test-commands)**: Touch polyfill, DataTransfer, payload encoding, and drop target resolution tests.
- 🔁 **[31. Stress Testing & Race-Condition Detection](./test.md#31-stress-testing-repeat--race-condition-detection)**: Loop testing in PowerShell & Bash, `npm run test:repeat`, `--retry=N`, and randomized execution orders.
- 🧪 **[32. Mock Registry Verification & Test Harness Diagnostics](./test.md#32-mock-registry-verification--test-harness-diagnostics)**: Validating canvas, observers, storage polyfills, and sandbox leakage.
- 🚀 **[33. Local CI Simulation & Pre-Commit / Pre-Push Workflows](./test.md#33-local-ci-simulation--pre-commit--pre-push-workflows)**: Replaying GitHub Actions environment and lightweight pre-commit/pre-push bundles.
- 📡 **[34. Network, REST API & Supertest Backend Commands](./test.md#34-network-rest-api--supertest-backend-commands)**: Express endpoints, reCAPTCHA middleware, signed URLs, and rate limit tests.

---

## 📄 License & Authors

- **Author**: [Adarsh](https://github.com/adadarsh23)
- **License**: [Personal / Proprietary Software License](./LICENSE.md)
- **Security Policy**: [Security Guidelines & Vulnerability Reporting](./SECURITY.md)
- **Contributing**: [Contribution Guidelines](./CONTRIBUTING.md)

---

<p align="center">
  <sub>Built with ❤️ for privacy and zero-trust personal data security.</sub>
</p>
