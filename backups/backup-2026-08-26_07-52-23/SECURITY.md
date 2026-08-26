# Security Policy

## Supported Versions

Only the latest release and the default `main` branch receive security patches.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| `< 1.0` | :x:                |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in this project, please report it privately:

1. **GitHub Security Advisory (Preferred):** Open an advisory via the [Security Advisories](https://github.com/adadarsh23/vault/security/advisories/new) tab.
2. **Direct Contact:** If advisory submission is unavailable, reach out privately via GitHub [@adadarsh23](https://github.com/adadarsh23) or your contact email `adrajpu523@gmail.om`.

### What to Include

To help us triage and resolve the issue quickly, please provide:

- A description of the vulnerability and its potential impact.
- Step-by-step instructions or a safe Proof of Concept (PoC) to reproduce the issue.
- Affected components, endpoints, or cryptographic flows.
- Any suggested fixes or mitigations (optional).

---

## Scope

### In Scope

- Client-side encryption, key derivation, and cryptographic routines.
- Authentication, authorization, and session handling (JWT, cookies).
- Data exposure and unauthorized cross-user access.
- Injection attacks (SQL/NoSQL injection, XSS, SSRF).
- Critical supply chain / dependency vulnerabilities.

### Out of Scope

- Denial of Service (DoS/DDoS) attacks requiring massive traffic volumes.
- Social engineering, phishing, or physical attacks.
- Non-exploitable UI bugs or static analyzer warnings with no proven vector.
- Self-XSS or vulnerabilities requiring rooted/compromised client devices.

---

## Response Process & Timelines

As a personal project, issues are handled on a best-effort basis:

- **Initial Acknowledgment:** Typically within 48–72 hours.
- **Triage & Patching:** High-severity issues are prioritized and patched on the `main` branch.
- **Coordination:** We will keep you informed as the fix is developed and tested.

---

## Safe Harbor & Disclosure

- Please allow reasonable time for a fix before disclosing any vulnerability publicly.
- If you conduct security research in good faith in accordance with this policy, we will not pursue legal action against you.
- Valid security contributions will be credited in the release notes / changelog upon request.
