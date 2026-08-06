# Contributing to Vault

Namaste! Thanks for contributing to Vault. This guide explains how to contribute safely, effectively, and consistently.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Prerequisites

- Node.js `>=20` (Node 22 recommended)
- npm `>=10`
- MongoDB connection configured in `.env`

## Development Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the dev server:

   ```bash
   npm run dev
   ```

3. (Optional) Start client only:
   ```bash
   npm run dev:client
   ```

## Pre-PR Validation Checklist

Run the following commands locally before opening a pull request:

```bash
npm run lint
npm run test
npm run build
```

For security or auth-related changes:

```bash
npm run test:auth
npm run test:security
```

## Commit Guidelines

- Write clear, concise commit messages.
- Reference issues where applicable (e.g., `fix #42` or `feat #101`).

## Security Vulnerabilities

Do **NOT** open public issues for security vulnerabilities. Please report security issues privately to the project maintainers.
