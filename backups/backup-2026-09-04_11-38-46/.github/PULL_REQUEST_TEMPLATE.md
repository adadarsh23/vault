## 📝 Description

<!-- Briefly describe the purpose of this PR and what problem it solves. -->

## 🔗 Related Issue

<!-- Fixes #issue_number or Closes #issue_number (if applicable) -->

Fixes #

## 🏷️ Type of Change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 🔒 Security hardening / Cryptographic fix
- [ ] ⚡ Performance optimization
- [ ] 🎨 Code style / Refactoring
- [ ] 📚 Documentation update
- [ ] 🧪 Tests / CI / Build tooling

## 🧪 How Has This Been Tested?

<!-- Describe the tests that you ran to verify your changes. Include details of your testing environment. -->

- [ ] Unit tests (`npm run test:unit`)
- [ ] Integration tests (`npm run test:integration`)
- [ ] Security / Cryptography tests (`npm run test:security`, `npm run test:crypto`)
- [ ] Full test suite (`npm test`)
- [ ] Manual verification in local development / Docker

**Test Environment Details:**

- OS:
- Node.js version:
- Browser (if UI changes):

## 🔐 Zero-Knowledge & Security Checklist

<!-- Vault enforces client-side zero-knowledge encryption. Verify that your changes uphold this policy. -->

- [ ] **No Plaintext Leakage**: Master passwords, raw encryption keys, or unencrypted vault payloads are never logged or sent to the server in plaintext.
- [ ] **Cryptographic Verification**: Any changes to Web Crypto API / PBKDF2 / AES-GCM are covered by automated unit tests.
- [ ] **Authentication**: Session tokens and cookies adhere to strict security attributes (`HttpOnly`, `SameSite=Strict`, `Secure`).
- [ ] **Input Sanitization**: User inputs are validated and sanitized to prevent XSS and NoSQL injection.

## ✅ Quality Checklist

- [ ] My code follows the code style and formatting guidelines of this project (`npm run format:check`).
- [ ] I have performed a self-review of my own code.
- [ ] TypeScript type checks pass with zero errors (`npm run typecheck:all`).
- [ ] I have commented my code in complex or non-obvious areas.
- [ ] I have updated the documentation where appropriate (`README.md`, `DOCKER.md`, `CHANGELOG.md`).
- [ ] My changes generate no new warnings or lint errors.
- [ ] Existing tests pass locally with my changes.
