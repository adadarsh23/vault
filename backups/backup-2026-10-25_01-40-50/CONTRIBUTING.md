# Contributing to Vault

Thank you for your interest in contributing to **Vault**! Contributions of all kinds are welcome, including bug fixes, documentation improvements, security hardening, testing, performance improvements, and new features.

This document explains the development setup, contribution workflow, coding standards, security requirements, testing procedures, and pull request expectations.

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [How to Contribute](#-how-to-contribute)

  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Security Vulnerabilities](#security-vulnerabilities)

- [Prerequisites and Development Setup](#-prerequisites-and-development-setup)
- [Development Workflow](#-development-workflow)

  - [Branching Strategy](#branching-strategy)
  - [Commit Message Guidelines](#commit-message-guidelines)

- [Coding Standards and Security Guidelines](#-coding-standards-and-security-guidelines)

  - [Zero-Knowledge and Cryptography Best Practices](#zero-knowledge-and-cryptography-best-practices)
  - [TypeScript and Code Quality](#typescript-and-code-quality)

- [Testing and Verification](#-testing-and-verification)

  - [Key Verification Commands](#key-verification-commands)
  - [Specialized Test Suites](#specialized-test-suites)

- [Pull Request Process and Checklist](#-pull-request-process-and-checklist)
- [Community and Support](#-community-and-support)

---

## 📜 Code of Conduct

All contributors and participants are expected to follow the project's [Code of Conduct](CODE_OF_CONDUCT.md).

Please read it before contributing to the project or participating in project discussions.

---

## 🤝 How to Contribute

### Reporting Bugs

Before opening a bug report, search the existing issues to make sure the problem has not already been reported.

A useful bug report should include:

- **Clear and descriptive title**
- **Steps to reproduce** the issue
- **Expected behavior**
- **Actual behavior**
- **Minimal reproduction steps or code**, when applicable
- **Environment details**, including:

  - Operating system
  - Browser and version
  - Node.js version
  - npm version

- **Relevant console errors or logs**

> **Important:** Remove passwords, authentication tokens, encryption keys, personal information, vault contents, and other sensitive data before sharing logs.

### Suggesting Enhancements

Feature requests and improvement ideas are welcome.

Before opening an enhancement request, check existing issues and discussions for similar proposals.

Please include:

- The problem or use case you are trying to solve
- The proposed solution
- Expected behavior
- Alternative solutions or workarounds you considered
- Any relevant security, privacy, performance, or compatibility considerations

### Security Vulnerabilities

> [!CAUTION]
> **Do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Security issues should be reported privately according to the project's [Security Policy](SECURITY.md).

When reporting a vulnerability, provide enough information for the maintainers to understand and reproduce the issue without unnecessarily exposing sensitive information.

---

## ⚙️ Prerequisites and Development Setup

### Prerequisites

Before contributing, make sure you have the following installed:

- **Node.js:** `>=20.0.0` with an actively supported LTS release recommended
- **npm:** `>=10.0.0`
- **MongoDB:** MongoDB Atlas or a compatible local MongoDB instance
- **Git:** A recent stable version

Check your installed versions:

```bash
node --version
npm --version
git --version
```

### Step-by-Step Setup

#### 1. Clone the repository

```bash
git clone https://github.com/adadarsh23/vault.git
cd vault
```

#### 2. Install dependencies

```bash
npm install
```

#### 3. Configure environment variables

Create your local environment file from the provided example:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Configure the required development values in `.env`.

> **Never commit `.env` or any file containing secrets, credentials, encryption keys, tokens, or private configuration.**

#### 4. Verify the development environment

Run the available environment and database checks:

```bash
npm run doctor
npm run env:check
npm run db:ping
```

If any command fails, resolve the issue before starting development.

#### 5. Start the development environment

Start the full-stack development environment:

```bash
npm run dev
```

To start only the client development server:

```bash
npm run dev:client
```

---

## 🔄 Development Workflow

### Branching Strategy

Create a dedicated branch from the latest `main` branch for every change.

First update your local repository:

```bash
git switch main
git pull --ff-only origin main
```

Then create a branch using an appropriate prefix:

```bash
git switch -c feat/my-new-feature
```

Recommended branch prefixes:

| Prefix      | Purpose                               |
| ----------- | ------------------------------------- |
| `feat/`     | New feature                           |
| `fix/`      | Bug fix                               |
| `docs/`     | Documentation                         |
| `refactor/` | Code restructuring                    |
| `test/`     | Tests                                 |
| `perf/`     | Performance improvement               |
| `security/` | Security-related changes              |
| `chore/`    | Tooling, dependencies, or maintenance |

Keep branches focused. Avoid combining unrelated changes in the same pull request.

### Commit Message Guidelines

Vault follows the [Conventional Commits](https://www.conventionalcommits.org/) format.

Use:

```text
<type>(<scope>): <short description>
```

Common types include:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting-only changes
- `refactor`: Code restructuring without changing behavior
- `test`: Adding or modifying tests
- `perf`: Performance improvements
- `security`: Security-related changes
- `chore`: Tooling, dependencies, or maintenance

Examples:

```text
feat(vault): add encrypted backup export
fix(auth): handle token refresh timeout gracefully
docs(readme): clarify encryption architecture
test(crypto): add invalid authentication tag coverage
security(auth): strengthen session validation
```

Keep commit messages concise and describe the actual change.

---

## 🔒 Coding Standards and Security Guidelines

Vault handles sensitive user data. Security, privacy, correctness, and reliability must be considered for every contribution.

### Zero-Knowledge and Cryptography Best Practices

Contributors working with encryption or sensitive data must follow these rules:

- **Never log secrets or plaintext sensitive data.**

  - Do not log passwords.
  - Do not log master keys.
  - Do not log decrypted vault contents.
  - Do not log authentication tokens.
  - Do not send sensitive values to analytics or error-reporting services.

- **Keep sensitive data client-side whenever the architecture requires it.**

  - Do not introduce new plaintext data transmission or server-side storage without explicitly reviewing the security implications.

- **Do not weaken existing cryptographic protections.**

  - Do not replace established cryptographic primitives with custom cryptography.
  - Do not reduce key sizes, authentication protections, or validation requirements without a documented security review.

- **Preserve cryptographic integrity checks.**

  - Existing verification mechanisms and sentinels, such as `__keycheck__`, must not be removed or bypassed without understanding their security purpose.

- **Validate untrusted input.**

  - Treat client input, API responses, uploaded files, database records, and external data as untrusted.

- **Minimize sensitive data lifetime.**

  - Avoid unnecessary copies of plaintext or key material.
  - Clear sensitive application state when appropriate during logout, session termination, or component cleanup.

- **Do not expose secrets through errors.**

  - Error messages must not reveal keys, credentials, plaintext vault data, or sensitive internal state.

- **Review security-sensitive changes carefully.**

  - Authentication, authorization, encryption, key management, session handling, file handling, and data synchronization changes should receive additional testing and review.

> Cryptographic changes should be treated as security-sensitive changes, even when the code change appears small.

### TypeScript and Code Quality

Use clear, maintainable TypeScript throughout the project.

- Prefer strong TypeScript types over `any`.
- Use explicit interfaces and types where they improve readability.
- Validate external input with appropriate schemas such as Zod where applicable.
- Keep modules focused and avoid unnecessary coupling.
- Avoid duplicated security-sensitive logic.
- Prefer existing project utilities and abstractions over creating parallel implementations.
- Handle errors explicitly.
- Do not silently swallow errors.
- Keep client and server responsibilities clearly separated.
- Avoid unnecessary dependencies.

Format code with Prettier:

```bash
npm run format
```

Check TypeScript across the supported project targets:

```bash
npm run typecheck:all
```

---

## 🧪 Testing and Verification

Every contribution should be tested according to the scope and risk of the change.

At minimum, changes should pass the project's required linting, type checking, automated tests, and build checks before merging.

### Key Verification Commands

For quick local validation:

```bash
npm run verify:quick
```

For standard project verification:

```bash
npm run verify
```

For CI-equivalent verification:

```bash
npm run verify:ci
```

For comprehensive verification:

```bash
npm run verify:full
```

Run the most appropriate level of verification before opening a pull request.

### Specialized Test Suites

Run targeted test suites when working in the corresponding areas:

#### Unit and Integration Tests

```bash
npm run test:unit
npm run test:integration
```

#### Security and Cryptography

```bash
npm run test:crypto
npm run test:security
npm run test:auth
```

Security-sensitive changes should include regression tests where practical.

#### Component and UI Tests

```bash
npm run test:components
```

#### Watch Mode

During active development:

```bash
npm run test:watch
```

If your changes affect multiple areas, run the broader verification suite rather than relying only on targeted tests.

---

## 🚀 Pull Request Process and Checklist

Before opening a pull request, make sure your branch is based on the latest `main`.

### 1. Update Your Branch

```bash
git fetch origin
git rebase origin/main
```

Resolve any conflicts locally and verify the project after the rebase.

### 2. Run Verification

Run the CI-equivalent verification suite:

```bash
npm run verify:ci
```

If the change is security-sensitive or affects multiple project areas, run the comprehensive suite as well:

```bash
npm run verify:full
```

### 3. Review Your Changes

Before submitting the pull request:

```bash
git status
git diff --check
git diff
```

Make sure there are no accidental files, secrets, generated artifacts, debug statements, or unrelated changes.

### 4. Submit the Pull Request

Pull requests should:

- Have a concise and descriptive title
- Explain what changed
- Explain why the change was needed
- Reference related issues when applicable
- Describe security or privacy implications when relevant
- Include tests for new or changed behavior
- Include documentation updates when necessary

For issue-linked changes, use references such as:

```text
Fixes #123
```

### PR Checklist

- [ ] My branch is based on the latest `main`.
- [ ] My code follows the project's coding standards.
- [ ] I have not committed secrets, credentials, tokens, or encryption keys.
- [ ] Sensitive data is not written to logs or telemetry.
- [ ] Security-sensitive changes have been reviewed carefully.
- [ ] I added or updated tests where appropriate.
- [ ] Relevant security and cryptographic tests pass.
- [ ] `npm run verify` passes locally.
- [ ] `npm run build` completes successfully.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] Documentation has been updated where necessary.
- [ ] The pull request contains only relevant changes.

---

## 💬 Community and Support

For development questions, architectural discussions, or feature ideas:

- Use **GitHub Discussions** when available for general questions and design discussions.
- Use **GitHub Issues** for reproducible bugs and actionable feature requests.
- Use the project's [Security Policy](SECURITY.md) for private security reports.
- Contact the maintainers through the project's official GitHub repository when appropriate.

For the project repository and maintainer profile:

- [Vault repository](https://github.com/adadarsh23/vault)
- [@adadarsh23](https://github.com/adadarsh23)

Thank you for helping make **Vault** more secure, reliable, maintainable, and useful. 🔐
