# 🏛️ Architecture Decision Records (ADR) — Vault (`doc/architecture-decision-records.md`)

<p align="left">
  <a href="./README.md">← Back to Documentation Hub</a> •
  <a href="#adr-001-zero-knowledge-dual-key-architecture">ADR-001</a> •
  <a href="#adr-002-vcas01-double-cascade-encryption">ADR-002</a> •
  <a href="#adr-003-post-quantum-kyber-768-ml-kem">ADR-003</a> •
  <a href="#adr-004-socketio-with-delta-polling-sync">ADR-004</a> •
  <a href="#adr-005-tiptap-client-side-streaming-encryption">ADR-005</a> •
  <a href="#adr-006-multiclusterpool-database-failover">ADR-006</a> •
  <a href="#adr-007-duress-decoy-partition-model">ADR-007</a>
</p>

This document maintains an immutable historical record of key architectural decisions, tradeoffs, context, and rationale adopted throughout the lifecycle of the Vault platform.

---

## ADR-001: Zero-Knowledge Dual-Key Architecture

- **Status**: Accepted & Implemented
- **Date**: 2026-03-15
- **Context**:
  Vault requires authentication to backend services while ensuring that server operators, database administrators, or compromised cloud servers can never inspect user notes, passwords, or files.
- **Decision**:
  Implement client-side Argon2id key derivation splitting into two non-derivable 256-bit keys:
  1. `MasterAuthKey (MAK)`: Hashed via SHA-256 and transmitted to verify identity.
  2. `MasterEncryptionKey (MEK)`: Kept strictly client-side in RAM; never leaves browser memory.
- **Consequences**:
  - Positive: Complete mathematical zero-knowledge privacy. Even under full database compromise, data remains encrypted.
  - Negative: Traditional "forgot password" email reset is impossible without the user's 24-word recovery kit.

---

## ADR-002: VCAS01 Double Cascade Encryption (AES-256-GCM + ChaCha20-Poly1305)

- **Status**: Accepted & Implemented
- **Date**: 2026-04-10
- **Context**:
  Single ciphers (e.g. standard AES) may have undiscovered implementation vulnerabilities, hardware side-channel leaks, or future algebraic breakthroughs.
- **Decision**:
  Implement a dual-cipher cascade envelope designated `VCAS01`:
  $$\text{Ciphertext} = \text{ChaCha20-Poly1305}(\text{AES-256-GCM}(\text{Plaintext}, K_1), K_2)$$
  Derived via HKDF from the master encryption secret with independent sub-salts.
- **Consequences**:
  - Positive: Defence-in-depth against single-cipher algorithmic failure or side channels.
  - Negative: Slight cryptographic computational overhead (~15-20% higher CPU utilization during massive multi-megabyte bulk encryptions), mitigated via Web Workers.

---

## ADR-003: Post-Quantum Kyber-768 ML-KEM Hybrid Key Exchange

- **Status**: Accepted
- **Date**: 2026-06-01
- **Context**:
  Harvest-Now-Decrypt-Later (HNDL) attacks threaten classical elliptic curve key exchanges (ECDH P-256 / X25519) with the emergence of cryptanalytically relevant quantum computers (CRQCs).
- **Decision**:
  Integrate FIPS 203 standardized ML-KEM-768 (Kyber-768) lattice cryptography in hybrid mode alongside classical ECDH.
- **Consequences**:
  - Positive: Long-term post-quantum forward secrecy for cross-device shared keys and multi-device synchronization.
  - Negative: Larger public key sizes (~1,184 bytes for Kyber-768 vs 64 bytes for ECDH), requiring optimized wire serialization.

---

## ADR-004: Socket.IO with Delta Polling Dual Synchronization

- **Status**: Accepted & Implemented
- **Date**: 2026-07-22
- **Context**:
  Vault clients operate across varying network conditions: unstable mobile connections, strict enterprise firewalls that block WebSockets, and high-latency cellular networks.
- **Decision**:
  Implement a dual-pipeline sync engine:
  1. **Primary**: Low-latency Socket.IO WebSocket push events for immediate cross-tab and cross-device sync.
  2. **Fallback**: Adaptive HTTP delta polling (`/api/vault/sync/delta?since=timestamp`) when WebSockets are blocked or disconnected.
- **Consequences**:
  - Positive: Seamless real-time sync with robust offline and firewall fallback.
  - Negative: Requires maintaining dual sync client event handlers and latest-update-wins conflict arbitration.

---

## ADR-005: TipTap 3.32 Client-Side Streaming Rich-Text Encryption

- **Status**: Accepted & Implemented
- **Date**: 2026-08-14
- **Context**:
  Users require rich text editing with live formatting, embedded tables, and images without transmitting plaintext markdown to any server or cloud API.
- **Decision**:
  Adopt TipTap 3.32 with a headless Prosemirror document model. Documents are serialized to JSON in memory, encrypted using `VCAS01` via a dedicated Web Worker on a 300ms debounce cycle, and saved as encrypted blobs.
- **Consequences**:
  - Positive: Desktop-class rich text editing with zero plaintext data exposure.
  - Negative: Requires careful serialization to avoid DOM freezing on large multi-megabyte documents.

---

## ADR-006: MultiClusterPool MongoDB Failover Engine

- **Status**: Accepted & Implemented
- **Date**: 2026-09-05
- **Context**:
  Cloud database cluster outages or DNS resolution failures must not bring down the Vault API or prevent authenticated sessions from completing.
- **Decision**:
  Construct `MultiClusterPool` on the Node.js Express server to maintain active health checks against primary and secondary MongoDB Atlas clusters, switching transparently upon consecutive connection timeouts.
- **Consequences**:
  - Positive: High-availability 99.9% uptime and automated disaster recovery.
  - Negative: Requires configuring standby cluster replication and monitoring connection states.

---

## ADR-007: Duress Decoy Partitioning with Ephemeral Memory Zeroization

- **Status**: Accepted & Implemented
- **Date**: 2026-10-02
- **Context**:
  Users facing physical coercion, border inspections, or hostile interrogations must have a plausible defense without revealing their primary master password.
- **Decision**:
  Provide an optional Duress PIN. When entered:
  1. All primary keys in RAM are immediately shredded with cryptographically random noise.
  2. The UI switches silently to a decoy partition with authentic mock documents and zero indicator that duress mode is active.
- **Consequences**:
  - Positive: Maximum personal safety and plausible deniability.
  - Negative: Requires users to configure and maintain decoy content so it appears natural.
