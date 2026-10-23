# 📄 Product Requirements Document (PRD) — Vault

## 1. Executive Summary & Objective
**Vault** is a secure, lightweight secret and credential management service designed to store, manage, and retrieve sensitive environment variables, API keys, certificates, and secrets with end-to-end encryption, role-based access control (RBAC), and verifiable audit logging.

---

## 2. Target Audience & Personas
- **Developer**: Needs fast, zero-friction secret injection into local dev environments and CI/CD pipelines via CLI / API.
- **DevOps / Platform Engineer**: Needs centralized secret rotation, policy enforcement, multi-environment scoping (dev, staging, prod), and automated backups.
- **Security & Compliance Auditor**: Needs immutable, timestamped audit logs of all secret reads, writes, and modifications.

---

## 3. Core Functional Requirements

### 3.1 Secret Management
- **FR-01 (CRUD Operations)**: Create, read, update, and soft-delete secrets organized by namespace/project and environment.
- **FR-02 (Versioning)**: Maintain complete revision history for every secret with instant rollback capability.
- **FR-03 (TTL & Expiration)**: Support time-to-live (TTL) and scheduled auto-revocation or expiration alerts.

### 3.2 Access Control & Authentication
- **FR-04 (Authentication)**: Support API token auth, JWT bearer tokens, and OAuth2/OIDC integration.
- **FR-05 (RBAC & Scoping)**: Granular permissions per secret path (e.g., `production/*` requires `admin` or `deployer` role).

### 3.3 Audit Logging & Compliance
- **FR-06 (Immutable Audit Trail)**: Log every read/write event including actor identity, IP address, user-agent, action, and timestamp.
- **FR-07 (Exportable Logs)**: Provide SIEM-compatible log streaming / exports in JSON format.

---

## 4. Non-Functional Requirements
- **NFR-01 (Security)**: Secrets must be encrypted at rest using AES-256-GCM. Master keys must never be stored in plain text.
- **NFR-02 (Performance)**: P99 secret read latency < 25ms under 500 RPS.
- **NFR-03 (Availability)**: 99.9% uptime target with zero data loss guarantee across restarts.
- **NFR-04 (Observability)**: Standard Prometheus health check (`/health`) and metrics (`/metrics`) endpoints.

---

## 5. Scope & Release Milestones
- **Phase 1 (MVP)**: Core REST API, AES-256 encryption at rest, API key authentication, file/SQLite or Postgres backend.
- **Phase 2 (v1.1)**: Secret versioning, TTL/expiration, and audit log viewer.
- **Phase 3 (v1.2)**: CLI client, role-based access control (RBAC), and SIEM integration.