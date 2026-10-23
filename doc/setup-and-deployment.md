# ⚙️ Setup, Configuration & Production Deployment Guide (`doc/setup-and-deployment.md`)

This guide covers local development, environment configuration, build pipelines, production deployment to Render, and verification procedures for **Vault**.

---

## 1. System Requirements & Prerequisites

- **Node.js**: Version `>= 18.20.0` (LTS v22.x recommended)
- **npm**: Version `>= 10.0.0` (npm 12.x tested)
- **Database**: MongoDB 7.x+ (MongoDB Atlas replica set with SRV connection)
- **Operating Systems**: Linux (Ubuntu 22.04+), macOS 13+, Windows 10/11 (PowerShell 7+ or Command Prompt)

---

## 2. Quick-Start Local Development

### Step 1: Clone Repository & Install Dependencies

```bash
git clone https://github.com/adadarsh23/vault.git
cd vault
npm install
```

### Step 2: Environment Configuration

Copy the template configuration file:

```bash
cp .env.example .env
```

Edit `.env` and configure your database URI and secure cryptographic secrets (see Section 3).

### Step 3: Run Environment Health Doctor

```bash
npm run doctor
```

Verifies Node version, TypeScript configs, essential directories, environment secrets, and toolchain integrity.

### Step 4: Launch Development Servers

```bash
# Start backend server with tsx live-reload (port 4000)
npm run dev

# (Optional) Run Vite frontend client in independent dev mode (port 5173)
npm run dev:client
```

Open your browser at `http://localhost:4000` (or `http://localhost:5173` for client dev mode).

---

## 3. Environment Variables Reference Catalog

### 3.1 Server & Runtime Environment

| Variable                      | Description                                               | Default / Example          |  Required  |
| :---------------------------- | :-------------------------------------------------------- | :------------------------- | :--------: |
| `NODE_ENV`                    | Runtime environment (`development`, `production`, `test`) | `production`               |    Yes     |
| `PORT`                        | HTTP server listening port                                | `4000`                     |     No     |
| `RENDER_SERVICE_ID`           | Render cloud service identifier                           | `srv-d6njnj4r85hc73fpivtg` |     No     |
| `DISABLE_ORIGIN_PROTECTION`   | Bypass strict origin check when SPA & API share host      | `true`                     |     No     |
| `ALLOW_LOCAL_CORS_ORIGINS`    | Allow localhost origins in production                     | `false`                    |     No     |
| `TRUST_PROXY`                 | Upstream proxy hops (1 for Render / Cloudflare)           | `1`                        | Yes (Prod) |
| `KEEP_ALIVE_ENABLED`          | Background self-ping keep-alive service                   | `true`                     |     No     |
| `ENABLE_COMPRESSION`          | Automatic Brotli / Gzip response compression              | `true`                     |     No     |
| `ENABLE_OVERLOAD_PROTECTION`  | Event loop lag monitoring & load shedding                 | `true`                     |     No     |
| `EVENT_LOOP_LAG_THRESHOLD_MS` | Lag threshold in ms before triggering 503 load shed       | `1000`                     |     No     |

### 3.2 Database Configuration (MongoDB Atlas)

| Variable                  | Description                                            | Default / Example                                        | Required |
| :------------------------ | :----------------------------------------------------- | :------------------------------------------------------- | :------: |
| `MONGODB_URI`             | Primary MongoDB Atlas SRV connection string            | `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/vault` |   Yes    |
| `MONGODB_URI_FALLBACK`    | Secondary standby cluster connection string            | `mongodb+srv://user:pass@cluster1.xxx.mongodb.net/vault` |    No    |
| `MONGODB_URI_DIRECT`      | Direct replica set URI for DNS-restricted environments | `mongodb://user:pass@host1:27017...`                     |    No    |
| `MONGODB_DB`              | Database name                                          | `vault`                                                  |    No    |
| `MONGODB_DNS_SERVERS`     | Primary DNS resolvers for Atlas SRV queries            | `1.1.1.1,8.8.8.8`                                        |    No    |
| `ATLAS_KEEPALIVE_MINUTES` | Frequency of database keep-alive pings                 | `10`                                                     |    No    |

### 3.3 Cryptography & Security Secrets

| Variable                  | Description                                                |  Required  |
| :------------------------ | :--------------------------------------------------------- | :--------: |
| `JWT_SECRET`              | 256-bit+ HMAC secret for signing access tokens             |    Yes     |
| `REFRESH_TOKEN_SECRET`    | 256-bit+ HMAC secret for signing rotating refresh cookies  | Yes (Prod) |
| `CSRF_SECRET`             | Secret key for double-submit HMAC CSRF validation          | Yes (Prod) |
| `SIGNED_URL_SECRET`       | Secret key for signed media URLs & temporary links         | Yes (Prod) |
| `VAULT_ENCRYPTION_KEY`    | Master server envelope encryption key (32-byte hex/base64) | Yes (Prod) |
| `AUTH_PEPPER`             | Server-side pepper for password hashing                    | Yes (Prod) |
| `BCRYPT_ROUNDS`           | Salt rounds for bcrypt hashing (default: `12`)             |     No     |
| `RECAPTCHA_SECRET_KEY`    | Google reCAPTCHA v2 secret key for backend validation      | Yes (Prod) |
| `VITE_RECAPTCHA_SITE_KEY` | Google reCAPTCHA v2 site key for frontend widget           | Yes (Prod) |

---

## 4. Build & Production Packaging

Vault features a multi-stage production build pipeline:

```bash
# Standard TypeScript compilation and Vite production build
npm run build

# Build with OXC minification (fastest, smallest bundle)
npm run build:prod

# Build with Terser minification
npm run build:minify:terser

# Analyze bundle size and visual chunk distribution
npm run build:analyze

# Create production deployment ZIP archive
npm run zip:prod
```

### Pre-compression Pipeline

During build time, [`vite.config.ts`](../vite.config.ts) runs Brotli and Gzip compression passes, generating:

- `dist/assets/*.js.br` and `dist/assets/*.js.gz`
- `dist/assets/*.css.br` and `dist/assets/*.css.gz`
  In production, Express directly streams pre-compressed files using [`server/vite.ts`](../server/vite.ts), achieving maximum network throughput with zero CPU penalty.

---

## 5. Render Production Deployment

When deploying to [Render](https://render.com) (Live at [my-vault-cic6.onrender.com](https://my-vault-cic6.onrender.com)):

1. **Service Type**: Web Service (Node.js runtime).
2. **Repository**: Point to GitHub repository.
3. **Build Command**:
   ```bash
   npm run build
   ```
4. **Start Command**:
   ```bash
   npm start
   ```
5. **Health Check Path**: `/health` (Responds with `{ status: "ok", timestamp: ... }`).
6. **Environment Variables**: Add all mandatory production variables referencing `.env.example`.

### Automatic Cluster Failover on Render:

To ensure high availability across cloud network disruptions, configure both primary and secondary MongoDB URIs:

```env
MONGODB_URI="mongodb+srv://<user>:<password>@cluster0.ncuxgch.mongodb.net/vault?retryWrites=true&w=majority"
MONGODB_URI_FALLBACK="mongodb+srv://<user>:<password>@cluster0.dxhm8nx.mongodb.net/vault?retryWrites=true&w=majority"
```

---

## 6. Verification & Testing Reference

Vault features a test suite with **97 test files** and **67 npm test scripts** covering cryptography, authentication, synchronization, UI components, and security perimeters.

> [!TIP]
> Consult **[`test.md`](../test.md)** for the complete testing cheat sheet, isolated test commands, coverage generation, and debugging guides.

```bash
# Full test run in single worker (default safe)
npm test

# Full parallel test suite
npm run test:run

# Unit tests only
npm run test:unit

# Cryptographic and zero-knowledge verification
npm run test:crypto

# Full CI verification pipeline
npm run verify:ci
```
