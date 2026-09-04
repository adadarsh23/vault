# 🐳 Docker & Containerization Guide

This guide provides complete instructions for building, running, testing, managing, and deploying **Vault** using Docker and Docker Compose.

---

## 📑 Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Docker Compose Workflows](#-docker-compose-workflows)
- [Standalone Docker Workflows](#-standalone-docker-workflows)
- [Running Tests in Docker](#-running-tests-in-docker)
- [Environment Variables](#-environment-variables)
- [Healthchecks & Monitoring](#-healthchecks--monitoring)
- [Production Deployment (Render, Cloud, VPS)](#-production-deployment-render-cloud-vps)
- [Security & Optimization](#-security--optimization)
- [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🏗️ Architecture Overview

The production container uses a **4-Stage Multi-Stage Build** on minimal **Alpine Linux (Node.js 22)**:

```text
                    ┌────────────────────────┐
                    │ package.json / lock    │
                    └───────────┬────────────┘
                                │
             ┌──────────────────┴──────────────────┐
             ↓                                     ↓
       ┌───────────┐                         ┌────────────┐
       │   deps    │                         │ prod-deps  │
       │ All deps  │                         │ Prod only  │
       │ (for build)│                         │ (--omit=dev)│
       └─────┬─────┘                         └──────┬─────┘
             │                                      │
             ↓                                      │
       ┌───────────┐                                │
       │  builder  │                                │
       │ Vite: build/                               │
       │ esbuild: dist/server.js                    │
       └─────┬─────┘                                │
             │                                      │
             └──────────────────┬───────────────────┘
                                ↓
                         ┌─────────────┐
                         │   runner    │
                         │             │
                         │ build/      │ (Frontend React SPA + Assets)
                         │ dist/       │ (Backend Compiled JS)
                         │ overload.html│ (503 Overload Fallback)
                         │ node_modules│ (Production Only)
                         │ non-root    │ (User: nodejs:1001)
                         │             │
                         │ node dist/  │ (Native Node.js ESM)
                         └─────────────┘
```

### Key Architectural Highlights:

1. **Zero Runtime Transpilation:** TypeScript backend is precompiled to `dist/server.js` using `esbuild`. No `tsx` overhead in production.
2. **Separated Public vs Private Code:** Frontend assets live in `build/` (publicly served via Express), while backend code is in `dist/` (private execution).
3. **Non-Root Execution:** Runs under UID/GID `1001:1001` (`nodejs`) with pre-configured directory write permissions (`logs/`).
4. **Signal Forwarding (Graceful Shutdown):** Directly executed by `node dist/server.js` ensuring proper propagation of `SIGTERM` / `SIGINT` to safely drain database connections and open requests.

---

## ⚙️ Prerequisites

Before starting, ensure you have:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or **Docker Engine + Docker Compose Plugin** (Linux).
- Verify installation:
  ```bash
  docker --version
  docker compose version
  ```

---

## 🚀 Quick Start

### 1. Create Environment File

Copy the example environment configuration:

```bash
cp .env.example .env
```

_(Windows PowerShell: `Copy-Item .env.example .env`)_

### 2. Build and Start Services

```bash
docker compose up -d --build
```

### 3. Open in Browser

Visit **[http://localhost:4000](http://localhost:4000)** in your browser.

---

## 🎛️ Docker Compose Workflows

Docker Compose manages both the **Vault Application** and the **MongoDB database** container.

### Start Containers

```bash
# Start in background (Detached mode)
docker compose up -d

# Start with automatic rebuild of code changes
docker compose up -d --build

# Start in foreground (Live console output)
docker compose up
```

### View Live Logs

```bash
# Follow logs for all services
docker compose logs -f

# Follow logs only for the application
docker compose logs -f app

# Follow logs only for MongoDB
docker compose logs -f mongodb

# View last 100 log lines
docker compose logs --tail=100 app
```

### Container Status & Inspection

```bash
# List running services and health status
docker compose ps

# View real-time CPU, Memory, and Network usage
docker stats
```

### Stop & Restart Containers

```bash
# Stop containers (Preserves database volume)
docker compose down

# Restart all services
docker compose restart

# Restart only the application container
docker compose restart app

# Stop containers and DELETE all database data (Fresh start)
docker compose down -v
```

---

## 📦 Standalone Docker Workflows (Without Compose)

If you are connecting to an external database (such as **MongoDB Atlas**) and only want to run the standalone app container:

### 1. Build the Docker Image

```bash
docker build -t vault-app:latest .
```

### 2. Run the Container

```bash
docker run -d \
  --name vault-app \
  -p 4000:4000 \
  --env-file .env \
  -e MONGODB_URI="mongodb+srv://<username>:<password>@cluster.mongodb.net/vault" \
  vault-app:latest
```

### 3. Inspect & Manage Container

```bash
# View logs
docker logs -f vault-app

# Execute interactive shell inside running container
docker exec -it vault-app sh

# Stop & remove container
docker stop vault-app
docker rm vault-app
```

---

## 🧪 Running Tests in Docker

You can run your linting, typechecking, and test suite directly inside the Docker environment to ensure 100% parity with production.

### Run Tests Inside Active Compose Service

```bash
# Run all unit tests
docker compose exec app npm test

# Run full test suite with coverage
docker compose exec app npm run test:coverage

# Run TypeScript typechecks
docker compose exec app npm run typecheck:all
```

### Run Tests in an Isolated One-Off Container

```bash
# Build builder stage and run tests
docker build --target builder -t vault-test .
docker run --rm vault-test npm run test:unit
```

---

## 🔐 Environment Variables

| Variable               | Docker Value / Requirement                                  |   Required    | Description                                                 |
| :--------------------- | :---------------------------------------------------------- | :-----------: | :---------------------------------------------------------- |
| `NODE_ENV`             | `production`                                                |      Yes      | Application environment mode                                |
| `PORT`                 | `4000`                                                      |      Yes      | Internal HTTP port the server binds to                      |
| `MONGODB_URI`          | `${MONGODB_URI:?MONGODB_URI is required}`                   | **Mandatory** | MongoDB connection URI (Local or Atlas)                     |
| `MONGO_ROOT_USERNAME`  | `admin`                                                     |  Local only   | Root username for local MongoDB container                   |
| `MONGO_ROOT_PASSWORD`  | `vault_secure_password_123`                                 |  Local only   | Root password for local MongoDB container                   |
| `JWT_SECRET`           | `${JWT_SECRET:?JWT_SECRET is required}`                     | **Mandatory** | Cryptographic secret for signing access JWTs (min 32 chars) |
| `REFRESH_TOKEN_SECRET` | `${REFRESH_TOKEN_SECRET:?REFRESH_TOKEN_SECRET is required}` | **Mandatory** | Secret for signing refresh tokens                           |
| `VAULT_ENCRYPTION_KEY` | `${VAULT_ENCRYPTION_KEY:?VAULT_ENCRYPTION_KEY is required}` | **Mandatory** | 32-byte Base64 key for envelope encryption                  |
| `AUTH_PEPPER`          | `${AUTH_PEPPER:?AUTH_PEPPER is required}`                   | **Mandatory** | Password hashing pepper string                              |
| `MAX_FILE_SIZE_MB`     | `4096`                                                      |      No       | Maximum upload file size in megabytes                       |

### 🗄️ MongoDB Connection URI Formats:

- **Local Docker Compose (with Auth):**
  ```env
  MONGODB_URI=mongodb://admin:vault_secure_password_123@mongodb:27017/personal-vault?authSource=admin
  ```
- **Production (MongoDB Atlas):**
  ```env
  MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/personal-vault?retryWrites=true&w=majority
  ```

> 🔒 **Security Hardening:** In `docker-compose.yml`, required secrets use `${VARIABLE:?error}` syntax. If any secret is missing from your `.env` file, Docker Compose will immediately abort startup rather than falling back to vulnerable development defaults.
> ⚠️ **First-time Local Mongo Auth:** If you previously ran an unauthenticated local MongoDB container, run `docker compose down -v` once to reset the volume with the authenticated root user.

---

## 🩺 Healthchecks & Monitoring

The container includes built-in automated health checks:

### App Healthcheck

- **Endpoint:** `http://127.0.0.1:4000/health`
- **Interval:** 30 seconds
- **Timeout:** 5 seconds
- **Retries:** 3
- **Tool:** Alpine BusyBox `wget`

### MongoDB Healthcheck (Authenticated)

- **Command:** `mongosh --username "$$MONGO_INITDB_ROOT_USERNAME" --password "$$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.adminCommand('ping')"`
- **Interval:** 10 seconds
- **Sync:** `condition: service_healthy` ensures Node.js never starts until MongoDB has completed authentication setup and is responsive.

---

## ☁️ Production Deployment (Render, Cloud, VPS)

### Deploying to Render.com

#### Method A: Docker Web Service (Recommended)

1. In Render Dashboard, click **New +** ➔ **Web Service**.
2. Connect your Git repository.
3. Select **Docker** as the Environment.
4. Set **Health Check Path** to `/health`.
5. Add your Environment Variables (`JWT_SECRET`, `MONGODB_URI`, `VAULT_ENCRYPTION_KEY`, etc.).
6. Click **Deploy Web Service**. Render will automatically execute the multi-stage `Dockerfile`.

#### Method B: Native Node Web Service

1. Environment: **Node**
2. Build Command:
   ```bash
   npm install --legacy-peer-deps && npm run build && npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --outdir=dist
   ```
3. Start Command:
   ```bash
   node dist/server.js
   ```

---

### Deploying to a Linux VPS (Ubuntu / Debian)

1. Install Docker & Docker Compose on your server.
2. Clone your repository:
   ```bash
   git clone https://github.com/adadarsh23/vault.git /opt/vault
   cd /opt/vault
   ```
3. Create your `.env` file with production secrets.
4. Launch with Docker Compose:
   ```bash
   docker compose up -d --build
   ```
5. Configure Nginx / Caddy as a Reverse Proxy with HTTPS / SSL certificate pointing to port `4000`.

---

## 🛡️ Security & Optimization

- **`.dockerignore` Optimization:** Excludes host `node_modules`, `.env`, `.git`, temporary logs, and local caches to prevent build contamination and keep images minimal.
- **Read-Only / Principle of Least Privilege:** Execution user is unprivileged `nodejs` (UID 1001).
- **Persistent Data:** Named volumes (`mongodb_data`) protect database storage across container lifecycles.
- **Cache Clean:** Layer builds use `npm cache clean --force` and clean production dependencies (`--omit=dev`).

---

## ❓ Troubleshooting & FAQ

### Q1: `Error: listen EADDRINUSE: address already in use :::4000`

**Cause:** Another process or old container is using port 4000.  
**Fix:**

```bash
# Find and stop conflicting containers
docker compose down
docker ps
```

### Q2: MongoDB connection fails on startup (`ECONNREFUSED`)

**Cause:** The application container started before MongoDB was ready.  
**Fix:** Ensure your `docker-compose.yml` has `depends_on: mongodb: condition: service_healthy`.

### Q3: How do I completely wipe the local database and start fresh?

```bash
docker compose down -v
docker compose up -d --build
```

### Q4: How do I view log files generated by the server inside Docker?

Logs are written to `/app/logs/server.jsonl`. You can stream them with:

```bash
docker compose exec app tail -f logs/server.jsonl
```
