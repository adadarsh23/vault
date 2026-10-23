# 📜 Vault Manifest Schemas (`schemas/`)

<p align="left">
  <a href="../README.md">← Back to Main Repository</a> •
  <a href="#-specification-overview">Specification</a> •
  <a href="#-project-relative-architecture">Project Layout</a> •
  <a href="#-cryptography--security-baseline">Crypto Baseline</a> •
  <a href="#-validation--local-testing">CLI & Testing</a> •
  <a href="#-ide--vs-code-integration">IDE Setup</a>
</p>

Production-grade, non-permissive JSON Schema specifications governing Vault project configuration, project-relative architectural layouts, Zero-Knowledge cryptographic profiles, storage topologies, and deployment manifests.

---

## 📋 Specification Overview

| Schema File                                                  | Specification Version         | Canonical URI / ID                                                                           | Scope & Purpose                                                                                              |
| :----------------------------------------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| [`vault-manifest.schema.json`](./vault-manifest.schema.json) | **JSON Schema Draft 2020-12** | `https://raw.githubusercontent.com/adadarsh23/vault/main/schemas/vault-manifest.schema.json` | Validates `metadata.json`, automated backup manifests, security posture baselines, and deployment manifests. |

---

## 🏛️ Project-Relative Architecture

The schema mandates explicit declaration of repository boundaries and modular vault subsystems:

### 1. Project Directory Boundaries (`paths`)

Defines the relative filesystem layout of the Vault monorepo:

- **`root`**: Project root (`.`)
- **`schemas`**: JSON Schema definitions directory (`./schemas`)
- **`uploads`**: Local chunked upload staging and encrypted blob directory (`./uploads`)
- **`backups`**: Automated system snapshots and metadata archive directory (`./backups`)
- **`logs`**: Structured runtime logs and security audit records (`./logs`)
- **`dist`**: Backend server production bundle (`./dist`)
- **`build`**: Frontend client Vite/React production assets (`./build`)
- **`public`**: Static web assets and PWA manifest (`./public`)
- **`src`**: Frontend React/TypeScript source code (`./src`)
- **`server`**: Backend Express/Node.js source code (`./server`)
- **`tests`**: Vitest unit, integration, and security test suites (`./tests`)
- **`doc`**: Engineering roadmaps and architecture decision records (`./doc`)

### 2. Modular Vault Subsystems (`modules`)

Validates the 20 active zero-knowledge vault subsystems:

- `photo`, `video`, `audio`, `document`, `note`, `chat`, `todo`, `password`, `secret`, `contact`, `location`, `file`, `other-files`, `other`, `settings`, `system`, `users`, `card`, `identity`, `wifi`
- **Real Vault Ecosystem**: Cross-category unified navigation (`realVaultEcosystem: true`)
- **Device Sessions**: Remote device session monitoring and instant revocation (`deviceSessions: true`)
- **Privacy Shield**: Screenshot blurring and tab-visibility protection (`privacyInterface: true`)
- **Picture-in-Picture Mini-Player**: Global cross-route encrypted video player (`videoMiniPlayer: true`)

---

## 🔐 Cryptography & Security Baseline

The schema enforces strict cryptographic specifications:

- **Dual Cascade `VCAS01` AEAD**: `AES-256-GCM` + `ChaCha20-Poly1305` (122-byte header, 64-byte DEK).
- **Envelope Encryption (`VENV02`)**: Key Encryption Key (KEK) and Data Encryption Key (DEK) domain separation.
- **Sentinel Verification**: Zero-knowledge key validation via `__keycheck__`.
- **Post-Quantum Cryptography (PQC)**: Hybrid ML-KEM-768 / Kyber-768 key encapsulation.
- **Key Derivation (KDF)**: WebAssembly-accelerated Argon2id (memoryCost: 65536, iterations: 3, parallelism: 4) and PBKDF2-SHA-256 (600,000 iterations).
- **Duress Protection**: Decoy vault auto-wiping after 3 consecutive failed PIN attempts.
- **Database High-Availability**: MongoDB multi-cluster auto-failover and GridFS blob storage.

---

## ⚡ Validation & Local Testing

### 1. Rapid Standalone CLI Validation

Validate `metadata.json` against the schema with detailed ANSI diagnostics:

```bash
# Validate default metadata.json
npm run schema:validate

# Validate metadata.json and all backup archives
npm run schema:validate -- --all

# Validate a custom manifest file
node scripts/validate-schema.mjs path/to/custom-manifest.json
```

### 2. Automated Vitest Suite

Execute full schema regression tests including negative test vectors (type mismatches, missing required fields, illegal semver strings, out-of-bounds iterations, invalid hex colors, etc.):

```bash
# Run schema vitest unit test suite
npm run test:schema

# Watch mode during development
npx vitest tests/unit/vault-manifest-schema.test.ts --watch
```

---

## 🛠️ IDE & VS Code Integration

To get instant syntax highlighting, tooltips, autocompletion, and real-time schema validation in Visual Studio Code, include the schema association in `.vscode/settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["metadata.json", "backups/**/metadata.json"],
      "url": "./schemas/vault-manifest.schema.json"
    }
  ]
}
```

Alternatively, declare the `$schema` reference directly inside your JSON file:

```json
{
  "$schema": "./schemas/vault-manifest.schema.json",
  "name": "vault",
  "version": "1.0.0"
}
```
