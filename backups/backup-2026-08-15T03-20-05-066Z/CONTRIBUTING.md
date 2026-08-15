# Contributing Guide

Thanks for contributing to Vault. This guide explains how to contribute safely and consistently.

## Code of Conduct

By participating, you agree to:

- Be respectful and professional in all interactions.
- Give constructive feedback focused on code and behavior, not people.
- Avoid harassment, discrimination, and abusive language.
- Assume good intent and collaborate in good faith.

If you experience or witness unacceptable behavior, contact the maintainers privately.

## Prerequisites

- Node.js `>=20`
- npm `>=10`
- MongoDB connection configured in `.env`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. (Optional) Start client only:

```bash
npm run dev:client
```

## Branching

- Create a feature/fix branch from the default branch.
- Keep PRs focused and small when possible.

## Coding Standards

- Use TypeScript and existing project patterns.
- Prefer clear naming and small, testable functions.
- Do not commit secrets, API keys, or private credentials.
- Keep changes backward compatible unless the PR clearly documents breaking changes.

## Validation Before PR

Run these locally before opening a pull request:

```bash
npm run lint
npm run test
npm run build
```

For auth-related changes, also run:

```bash
npm run test:auth
```

## Commit Guidelines

- Use clear, descriptive commit messages.
- Reference related issue IDs when available.
- Group related changes in one commit; avoid unrelated edits.

## Pull Request Checklist

- Describe what changed and why.
- Include testing notes (commands and results).
- Include screenshots/videos for UI changes.
- Mention any environment variable or migration changes.
- Confirm no secrets are included.

## Security Reporting

Do not open public issues for sensitive vulnerabilities.  
Report security issues privately to project maintainers.
