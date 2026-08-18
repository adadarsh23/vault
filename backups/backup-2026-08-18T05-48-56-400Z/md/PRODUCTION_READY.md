# Full Deep Production-Readiness Audit, Repair, Security Hardening, UI/UX Upgrade, and Performance Optimization

You are a senior staff-level full-stack engineer, application security engineer, performance engineer, SRE, QA engineer, accessibility specialist, and UI/UX engineer.

Your task is to deeply audit, repair, refactor, optimize, secure, test, and production-harden the entire repository.

This is a security-sensitive encrypted personal vault application. Treat user data, encryption keys, authentication tokens, sessions, uploaded files, private media, and metadata as highly sensitive.

Tech stack identified:

- Frontend: React 19, Vite 8, TypeScript, Tailwind CSS, Zustand, React Router
- Backend: Node.js, Express 5, TypeScript, Socket.IO
- Database: MongoDB/Mongoose
- Security: WebCrypto, AES-GCM, libsodium, JWT, bcrypt, TOTP, CSRF, Helmet, rate limiting
- Rich content/media: TipTap, Markdown, HLS/Shaka, file uploads and streaming
- Testing: Vitest, Playwright, Supertest
- Observability: Sentry, LogRocket
- Main folders: `src/`, `server/`, `tests/`, `scripts/`, `.github/`

The objective is not cosmetic cleanup. Deliver a stable, secure, fast, accessible, responsive, maintainable, tested application that can be responsibly deployed.

Do not claim “production ready” unless all relevant checks actually pass and remaining risks are documented.

---

## Non-Negotiable Rules

1. Start with a full repository audit. Do not immediately rewrite files.
2. Read architecture, routes, controllers, services, models, middleware, crypto code, storage code, client state, API clients, config, tests, Docker files, workflows, and environment examples.
3. Maintain an internal issue register grouped as `P0`, `P1`, `P2`, `P3`.
4. Fix root causes, not visible symptoms.
5. Do not weaken security, disable linting, loosen TypeScript, skip tests, remove tests, use unsafe casts, or hide errors merely to make checks pass.
6. Do not expose or print `.env` values, secrets, passwords, tokens, cookies, decrypted vault data, encryption keys, or personally identifiable information.
7. Do not blindly upgrade dependencies. Check compatibility, changelogs, lockfile impact, and tests first.
8. Do not rewrite working architecture without a clearly documented reason.
9. Make small, logically grouped changes. Run targeted verification after each major group.
10. Preserve backwards compatibility unless a security vulnerability requires a documented migration.
11. Never trust the frontend for authorization.
12. Do not use frontend route guards as a security boundary.
13. Do not call the product “zero knowledge”, “end-to-end encrypted”, “AES-256 secure”, or “post-quantum secure” unless the actual threat model and implementation verify the claim.
14. Do not invent test results, performance measurements, or security guarantees.

---

# Phase 0: Repository and Architecture Discovery

Inspect all relevant files, including:

- `package.json`, `package-lock.json`
- `tsconfig.json`, `tsconfig.server.json`
- `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`
- `Dockerfile`, `docker-compose.yml`
- `.env.example`, `.gitignore`, `.github/workflows/**`
- `server.ts`
- all files inside `src/`
- all files inside `server/`
- all test files under `tests/` and `src/**`
- scripts under `scripts/`
- existing Lighthouse, coverage, and Playwright reports

Determine and document:

- Frontend entry points, routes, layouts, providers, state stores, API client, error boundaries.
- Backend server startup order, middleware order, API routes, Socket.IO authorization, database connection lifecycle.
- Authentication lifecycle:
  browser login → API → password verification → JWT/access token → refresh cookie → token refresh → session management → logout → revocation.
- Encryption lifecycle:
  password/master key handling → derivation → browser memory → encryption → upload → database/storage → retrieval → decryption → key rotation/recovery.
- File lifecycle:
  upload → temporary disk/memory → validation → encryption → storage/GridFS/object storage → metadata → signed URL or streaming → browser rendering → deletion/cleanup.
- Authorization lifecycle for every user-owned resource.
- Error-handling path from API error → frontend presentation.
- Deployment model, reverse proxy requirements, CORS origins, HTTPS assumptions, environment configuration.
- Test coverage and missing test boundaries.

Create an issue list before implementation:

| Priority | Meaning                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| P0       | Credential/key exposure, authorization bypass, remote code execution, data loss, unsafe crypto, severe privacy breach |
| P1       | Serious security, reliability, corruption, session, upload, or deployment issue                                       |
| P2       | Important performance, accessibility, maintainability, UX, logging, or test weakness                                  |
| P3       | Polish, consistency, documentation, low-risk cleanup                                                                  |

Fix in this order:

`P0 security/data integrity → P1 security/auth/errors → API/database reliability → performance → UI/UX/accessibility → code quality → tests/CI → final verification`

---

# Phase 1: Dependency, Scripts, Build, and Configuration Audit

Audit `package.json`, lockfile, scripts, and tooling.

Specifically investigate:

- Duplicate scripts, including duplicate `verify` entries.
- Scripts that reference missing test files or non-existent commands.
- Scripts that are Windows-only (`set`, `start`) and whether deployment/CI needs cross-platform support.
- `npm run test:all` and other aggregate scripts that reference invalid test targets.
- `npm audit` issues and whether fixes are compatible.
- Direct and transitive dependencies that are unused, duplicate, abandoned, or vulnerable.
- Multiple libraries serving the same purpose.
- Production dependencies incorrectly placed in development dependencies and vice versa.
- Oversized browser dependencies such as media players, TipTap, animation libraries, particles, globe rendering, analytics, session replay, QR tools, and crypto libraries.

Fix requirements:

- Ensure every documented npm script exists and works.
- Remove duplicate or misleading script definitions.
- Keep a clear minimum CI command, such as:
  `format:check → typecheck → typecheck:server → test → build`
- Add separate targeted commands only where useful.
- Do not run `npm audit fix --force`.
- Ensure `packageManager`, Node engine, npm engine, Docker base image, CI runtime, and local documentation agree.
- Ensure `.env` is ignored and `.env.example` contains names, descriptions, safe defaults, and no secrets.
- Add startup-time configuration validation with clear errors.
- Fail fast for missing security-critical production configuration.
- Ensure production source maps, debug flags, verbose errors, diagnostics endpoints, and development-only tooling are disabled or protected.

---

# Phase 2: Deep Authentication, Authorization, Session, and JWT Audit

Audit all code related to:

- `server/routes/authRoutes.ts`
- `server/controllers/authController.ts`
- `server/services/authService.ts`
- `server/services/accountSessionService.ts`
- authentication middleware
- JWT utilities
- cookie utilities
- refresh-token persistence/revocation
- WebSocket/Socket.IO authentication
- frontend auth client/store/session utilities

Verify and fix:

## Authentication

- Passwords must use a modern password hash. Never store a decryptable password or password hash encrypted in a reversible server-side scheme unless there is a documented, necessary reason and separate threat model.
- Do not decrypt stored password hashes merely to compare them.
- Use `bcrypt.compare()` against the stored hash or a modern KDF such as Argon2id if migration is safely implemented.
- Implement timing-safe handling for invalid user/password paths where relevant.
- Ensure registration, login, password reset, password change, unlock, MFA verification, and username checks have appropriate rate limits.
- Prevent account enumeration through response messages, timing differences, and user lookup behavior where practical.
- Ensure MFA secrets are encrypted at rest and are never returned unnecessarily.
- Require recent authentication/re-authentication for password changes, master-key changes, recovery actions, session management, exports, and other sensitive operations.

## JWT and access tokens

- Use strong, environment-provided signing keys with minimum length validation.
- Explicitly restrict accepted JWT algorithms.
- Validate `exp`, `nbf`, `iss`, `aud`, token type, and session identifier when applicable.
- Never authorize based on `jwt.decode()` without signature verification.
- Keep access tokens short-lived.
- Never store long-lived tokens in `localStorage`.
- Prevent tokens from appearing in URLs, logs, analytics, crash reports, error messages, browser history, or referrers.
- Do not return duplicate token fields unless backwards compatibility requires it.
- Ensure clock-skew handling is intentional and bounded.

## Refresh tokens and sessions

- Store only hashes of refresh tokens server-side.
- Use one-time refresh-token rotation.
- Detect refresh-token replay and revoke the token family/session family when replay occurs.
- Ensure logout revokes the actual current session and clears cookies correctly.
- Ensure “logout all devices” revokes all active sessions.
- Enforce maximum active sessions/devices per user if appropriate.
- Store only necessary device metadata; minimize fingerprinting/privacy risks.
- Ensure refresh cookies are:
  - `HttpOnly`
  - `Secure` in production
  - `SameSite=Lax` or `Strict` unless cross-site architecture explicitly requires `None`
  - `SameSite=None` only with `Secure`
  - scoped to the narrowest valid path/domain
  - cleared with matching cookie attributes
- Do not rely on a client-supplied user ID, username, role, device ID, session ID, or permission field.
- Make session revocation checks happen server-side for sensitive requests.

## Authorization and IDOR/BOLA

For every API route and Socket.IO event, verify:

- The authenticated user owns the target resource.
- Ownership checks use server-side identity from verified authentication.
- IDs from URL/query/body never choose another user’s namespace.
- Signed URL creation requires ownership and has short expiry.
- File/content download and streaming re-check authorization.
- Folders, notes, passwords, media, contacts, avatars, notifications, logs, keys, backups, and settings cannot be accessed by changing an ID.
- Admin features require a server-verified role and cannot be enabled by client state.
- Soft-deleted records cannot be accessed accidentally.
- Cross-user resource references are rejected.

Add tests for cross-user access attempts.

---

# Phase 3: Cryptography, Master-Key, and Zero-Knowledge Threat-Model Audit

This application handles encrypted vault data. Treat crypto changes with extreme caution.

Inspect in detail:

- `src/lib/encryption.ts`
- `src/lib/cryptoPrimitives.ts`
- client key derivation worker(s)
- client key persistence/caching
- key check / rotation utilities
- `server/utils/crypto.ts`
- `server/services/masterKeyService.ts`
- `server/services/accountSessionService.ts`
- `server/controllers/masterKeyController.ts`
- models that store password, master-key, envelope, key-check, recovery, or key-history data

Required checks:

## Key architecture

- Clearly separate:
  - account authentication password
  - password hash
  - client vault encryption key
  - key-encryption key
  - data-encryption key
  - server secrets
  - JWT signing keys
  - recovery keys
- The server must not receive/store plaintext vault encryption keys if the product claims zero knowledge.
- The server must not possess a reversible encryption key that enables decrypting user master keys or passwords.
- If server-side encryption of data exists, document that it is not true zero knowledge and define the threat model accurately.
- Ensure master key material is never sent to analytics, Sentry, LogRocket, console logs, localStorage, sessionStorage, URL parameters, browser crash reports, or unencrypted IndexedDB.
- Reduce key lifetime in memory where practical. Avoid accidental copies and clear references after lock/logout where possible.
- Never log ciphertext previews if they can reveal sensitive metadata or create correlation risk.

## Cryptographic primitives

- Use WebCrypto or audited libraries correctly.
- AES-GCM must use:
  - unique random nonce/IV per encryption operation
  - a 96-bit IV where the API/library expects it
  - authenticated decryption
  - no nonce reuse under the same key
- Use `crypto.getRandomValues()` or Node `crypto.randomBytes()` for security values. Never `Math.random()`.
- Store encoding/version/algorithm/KDF parameters with ciphertext so future migration is possible.
- Use a versioned envelope format.
- Validate ciphertext, IV, salt, tags, lengths, and encoding before decrypting.
- Reject malformed or oversized cryptographic payloads early.
- Use authenticated additional data (AAD) where it binds ciphertext to user ID, record ID, version, type, or context.
- Prevent ciphertext swapping attacks between users or record types.
- Ensure encryption failures fail closed and do not silently store plaintext.
- Ensure decryption failures do not corrupt or overwrite existing encrypted data.

## Password derivation

- If using Argon2id, validate memory, iterations, parallelism, salt length, output length, and browser capability.
- If PBKDF2 is present, document migration path and use sufficiently high iteration counts based on current guidance and measured device constraints.
- Never derive encryption keys directly from raw password text without a per-user random salt and appropriate KDF.
- Never reuse a password hash as an encryption key.
- Ensure password changes correctly re-wrap/re-encrypt required key material without exposing plaintext to the server.

## Post-quantum claims

- Do not use a post-quantum library merely for branding.
- Verify actual use, implementation correctness, browser compatibility, payload size, and fallback behavior.
- If the application uses hybrid encryption, document which classical and PQ components protect which operation.
- If it is unused or unnecessary, lazy load or remove it rather than shipping it to every user.
- Do not claim post-quantum protection unless an expert-reviewed protocol actually provides it.

## Key rotation and recovery

- Rotation must be atomic or safely resumable.
- Do not leave mixed old/new key records without a migration state.
- Backup original encrypted data before irreversible transformations where appropriate.
- Ensure a failed rotation can resume safely.
- Ensure key-check records do not reveal enough material for offline attacks beyond the normal password-verification risk.
- Test old key, wrong key, interrupted rotation, concurrent devices, partial sync, and recovery scenarios.

Do not alter crypto primitives casually. If an existing design is unsafe, provide:

1. exact issue,
2. attacker impact,
3. migration strategy,
4. backward compatibility plan,
5. tests required before rollout.

---

# Phase 4: API, Validation, Database, and Data Integrity Audit

Inspect all routes, controllers, services, MongoDB models, validators, upload handlers, and API client calls.

## Input validation

Validate all external input:

- URL params
- query params
- JSON bodies
- form data
- headers
- cookies
- Socket.IO payloads
- uploaded file metadata
- chunk-upload fields
- signed URL fields
- pagination/sort/filter values
- IDs and ObjectIds
- date/time values
- rich-text/Markdown payloads
- external URLs

Requirements:

- Use strict schemas.
- Reject unknown fields where safe.
- Apply length, type, count, nesting-depth, and size limits.
- Validate IDs before database queries.
- Normalize input intentionally, not indiscriminately.
- Avoid casting arbitrary request input to `any`.
- Do not use user input as MongoDB query operators or projection/sort keys without allowlists.
- Ensure custom Mongo sanitization correctly handles arrays, nested objects, nulls, and prototype-pollution keys such as `__proto__`, `prototype`, and `constructor`.

## API behavior

- Use correct HTTP methods and status codes.
- Make error response shape consistent.
- Include safe machine-readable error codes and request IDs.
- Return clear user-safe messages.
- Do not return raw Mongo errors, stacks, file paths, JWT errors, passwords, tokens, encryption metadata, or internal service details.
- Add idempotency protection for important creation/payment-like/mutation operations where duplicate submission can create corruption.
- Use request body limits and JSON parser limits.
- Set request timeouts, upstream timeouts, database timeouts, and abort handling.
- Do not blindly retry mutations.
- Use pagination/cursors or bounded page sizes for list endpoints.
- Use projections to avoid returning hidden fields.
- Avoid returning entire database documents by default.

## MongoDB/Mongoose

- Review schema constraints, indexes, unique constraints, validation, timestamps, TTL indexes, soft deletes, and migrations.
- Find all unbounded `.find()`, large `.populate()`, broad projections, and expensive aggregations.
- Identify N+1 patterns.
- Add indexes only after verifying query patterns.
- Ensure per-user query filters are always applied.
- Use transactions where multi-document consistency requires it and deployment supports it.
- Prevent race conditions in session rotation, key rotation, file metadata creation, folder moves, duplicate registration, and counters.
- Ensure deletion cascades are intentional and safe.
- Ensure backup/export endpoints do not bypass authorization or encryption boundaries.
- Verify graceful handling of database failure, reconnects, and shutdown.

---

# Phase 5: File Upload, Media, Streaming, and Storage Security

Deeply inspect:

- Multer setup
- file validators
- image pipeline
- GridFS/object storage adapters
- chunked uploads
- temporary file creation and cleanup
- signed URL logic
- download/media routes
- Range request support
- HLS/Shaka/HLS.js usage
- avatar pipeline
- file preview logic

Fix and verify:

- Enforce route-specific file size limits.
- Enforce per-user quotas and rate limits.
- Sanitize filenames. Do not use user filenames as storage paths.
- Generate server-controlled storage IDs and filenames.
- Prevent path traversal with canonicalized, allowlisted paths.
- Validate file type using magic bytes where possible, not only MIME header or extension.
- Treat SVG, HTML, PDF, archives, office files, and media as potentially dangerous.
- Decide explicitly whether SVG uploads are blocked, sanitized, or served with safe disposition/content type.
- Do not execute, render inline, or proxy untrusted HTML.
- Set safe `Content-Type`, `Content-Disposition`, `X-Content-Type-Options: nosniff`, and cache headers.
- Require authorization before metadata lookup, signed URL creation, range streaming, thumbnail creation, previewing, or deletion.
- Ensure Range parsing cannot trigger memory exhaustion, invalid ranges, or unauthorized partial disclosure.
- Ensure encrypted file chunks cannot be mixed across users/files/upload sessions.
- Ensure chunk uploads validate sequence/order/size/hash and clean up abandoned uploads.
- Clean temporary files after success, failure, cancellation, and process restart if possible.
- Protect against zip bombs, decompression bombs, oversized images, image parser vulnerabilities, and malicious file metadata.
- Add malware scanning integration boundaries. The existing TODO must not be silently treated as complete:
  - if ClamAV/YARA is not deployed, document residual risk;
  - quarantine uploads until scanning if the threat model requires it;
  - do not claim malware protection without a working scanner.
- Do not make private file URLs publicly cacheable.
- Do not put access tokens in file URLs.
- Test download/streaming authorization with two distinct users.

---

# Phase 6: XSS, CSRF, CSP, CORS, SSRF, and Browser Security

Audit all browser/server boundary code.

## XSS and rich content

Inspect all uses of:

- `dangerouslySetInnerHTML`
- `innerHTML`
- Markdown renderers
- `rehype-raw`
- `rehype-sanitize`
- TipTap HTML handling
- user-generated links
- note previews
- file names
- error messages rendered into UI
- URL search params

Requirements:

- Treat all user content as untrusted.
- Do not use `rehype-raw` unless there is a proven requirement and strict sanitization configuration.
- Ensure DOMPurify runs in the correct environment and policy.
- Use a strict allowlist for tags, attributes, styles, protocols, and iframe/media sources.
- Block `javascript:`, dangerous `data:` URLs, unsafe SVG content, and event-handler attributes.
- Sanitize on output and, where appropriate, normalize/canonicalize on input.
- Avoid rendering decrypted sensitive note content into third-party instrumentation.
- Ensure external links use safe `rel="noopener noreferrer"` when `target="_blank"` is used.

## CSRF

- Identify cookie-authenticated state-changing endpoints.
- Require CSRF tokens/origin validation using a robust pattern.
- Ensure CORS does not accidentally bypass CSRF assumptions.
- Validate `Origin`/`Referer` where applicable.
- Do not use `GET` for mutations.
- Do not rely on SameSite alone as the only CSRF defence for sensitive actions.

## CORS

- Use explicit allowlists, never `*` with credentials.
- Avoid reflecting arbitrary origins.
- Correctly configure `credentials`, allowed headers, methods, and preflight caching.
- Ensure local development origins are separate from production origins.
- Validate websocket origin separately.

## CSP and security headers

Configure based on actual application needs:

- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- frame-ancestors / clickjacking defense
- Cross-Origin-Opener-Policy where compatible
- Cross-Origin-Resource-Policy where compatible
- Cross-Origin-Embedder-Policy only after confirming media/third-party compatibility

Use nonces/hashes if inline scripts are unavoidable. Do not create a CSP that uses overly broad `unsafe-inline` or `unsafe-eval` unless unavoidable and explicitly documented.

## SSRF and redirects

- Validate all server-side fetched URLs.
- Block loopback, link-local, private networks, metadata service addresses, Unix sockets, and non-http(s) protocols.
- Disable/validate redirects.
- Resolve DNS safely if SSRF-relevant fetching exists.
- Allow only required outbound hosts.
- Validate redirect targets using an allowlist or safe relative paths.

---

# Phase 7: Error Handling, Logging, Monitoring, and Privacy

Audit frontend and backend error paths.

## Server

- Use a central async error handler.
- Define safe error classes and error codes.
- Return one consistent error format.
- Add request IDs to incoming requests, logs, and API responses.
- Avoid `res.send` monkey patches unless necessary and safe.
- Ensure error middleware is last.
- Handle 404, validation, auth, authz, database, multipart, malformed JSON, request-too-large, timeout, and unknown errors.
- Add graceful shutdown for HTTP server, Socket.IO, MongoDB, workers, temp file cleanup, and in-flight requests.
- Do not crash on unhandled rejection without controlled logging/shutdown policy.
- Prevent log injection and log sensitive-data leakage.
- Use structured logs in production.
- Do not log:
  - passwords
  - vault master keys
  - plaintext notes/files
  - access/refresh tokens
  - authorization headers
  - cookies
  - MFA secrets
  - raw decrypted profile data
  - full IP addresses unless necessary and privacy policy supports it

## Sentry and LogRocket

- Initialize only when configured and consent allows.
- Strip or denylist authentication, vault, crypto, file, and personal data.
- Do not record full session replay in sensitive vault screens.
- Disable sensitive DOM capture.
- Scrub request headers, query params, breadcrumbs, exception values, URLs, and network bodies.
- Never assume third-party telemetry is safe by default.

## Frontend

- Add route/global error boundaries.
- Provide safe, helpful recovery UI.
- Add retry where safe.
- Handle API/network timeout/offline cases.
- Use abort controllers for fetches that outlive components.
- Avoid error toast floods.
- Ensure errors are announced accessibly.
- Do not expose stack traces in UI.

---

# Phase 8: UI/UX, Headings, Content, and Responsive Design

Audit every route, page, modal, form, dashboard panel, vault feature, settings screen, login flow, upload flow, file preview, and error screen.

## Heading hierarchy and semantic structure

For every page:

- Use one meaningful H1 where appropriate.
- Use H2 for main sections and H3 for subsections.
- Do not skip heading levels for visual styling.
- Do not use heading tags purely for size.
- Replace vague headings such as:
  - “Welcome”
  - “Details”
  - “Section”
  - “Stuff”
  - “Dashboard”
    when a clearer context-specific heading is possible.
- Use descriptive page titles and document titles.
- Fix corrupted text/encoding such as `â€¦`, `ðŸ`, `âœ`, or malformed symbols in README and user-facing UI.
- Use clear, concise, natural English in labels, action text, validation messages, empty states, and errors.

## User experience requirements

Every asynchronous UI must include suitable:

- initial loading state
- skeleton where layout matters
- success confirmation when action significance warrants it
- error state with safe explanation
- retry/recovery control where safe
- empty state with next action
- disabled/loading submit state
- cancellation behavior where relevant
- offline/no-connection state where relevant

Do not show blank pages, silent failures, endless spinners, or generic “Something went wrong” messages without recovery guidance.

## Forms

For every form:

- Use visible labels, not placeholder-only fields.
- Bind labels correctly.
- Provide helpful inline validation.
- Preserve safe user input after recoverable failures.
- Focus the first invalid field after submit.
- Prevent double submit.
- Make password controls accessible and provide show/hide labels.
- Support Enter key appropriately.
- Ensure errors are programmatically associated with fields.
- Validate client-side for fast feedback and server-side for authority.
- Avoid leaking account existence through UI messages.

## Responsive behavior

Test/fix at minimum:

- 320px width
- 375px width
- 390px width
- 768px width
- 1024px width
- 1280px width
- 1440px and above

Fix:

- horizontal overflow
- clipped text/buttons
- fixed-width cards/forms
- inaccessible mobile navigation
- unusable tables
- modal overflow
- small tap targets
- broken sidebars
- image distortion
- layout shift
- zoom/keyboard overlap on mobile
- poor touch drag-and-drop behavior

Use CSS Grid/Flexbox/containers rather than ad hoc absolute positioning.

## Accessibility

Target WCAG 2.2 AA where practical:

- semantic landmarks
- headings
- labels
- accessible names
- visible focus indicators
- keyboard-only navigation
- correct button/link semantics
- dialogs with focus trap, autofocus strategy, escape close, focus restoration
- error/success announcements through live regions where required
- contrast checks
- touch targets
- reduced motion
- alt text
- decorative image handling
- table semantics
- skip-to-content link
- no keyboard traps
- no reliance on color alone
- ARIA only when native HTML is insufficient

Run automated accessibility tests where available, then manually review critical flows.

---

# Phase 9: Frontend Performance and Loading Strategy

Measure before optimizing.

Inspect:

- initial bundle
- route chunks
- large dependencies
- dynamic imports
- CSS size
- font loading
- image sizes/formats
- third-party scripts
- API waterfalls
- hydration/rendering cost
- Zustand store subscriptions
- unnecessary state duplication
- memoization usage
- expensive list rendering
- media preview behavior
- background animations/particles/globe rendering
- service worker caching

Implement only justified improvements:

- Route-level lazy loading for non-critical routes.
- Lazy load heavy feature modules:
  - TipTap editor
  - media player libraries
  - HLS/Shaka
  - particles
  - globe
  - QR generation
  - emoji picker
  - export/image generation
  - post-quantum libraries if non-critical
- Ensure fallbacks are accessible and do not cause major layout shift.
- Do not lazy load critical login/vault shell unnecessarily.
- Use image dimensions, responsive images, `srcset`, modern formats, and lazy loading for below-fold images.
- Optimize font loading with correct `font-display`.
- Remove unused/preloaded assets.
- Avoid eager loading analytics, Sentry profiling, LogRocket, and replay on sensitive or unauthenticated screens.
- Prevent duplicate requests using cancellation, deduplication, cache discipline, and stable dependencies.
- Use virtualization only for demonstrably large lists.
- Use `useMemo` and `useCallback` only after identifying meaningful re-render costs.
- Use shallow/selective Zustand subscriptions.
- Avoid broad global store subscriptions that re-render the full app.
- Defer non-critical work using idle callbacks or user interaction where appropriate.
- Check service-worker update strategy and ensure it does not serve stale security-sensitive app code indefinitely.
- Validate cache keys and clear app data safely on logout where appropriate.

Report actual before/after bundle/Lighthouse values only if measured.

---

# Phase 10: Backend Performance, Scalability, and Availability

Audit:

- Mongo queries
- API response sizes
- indexes
- pagination
- connections
- CPU-heavy encryption/image/media work
- upload memory use
- compression
- caching
- rate-limit stores
- Socket.IO behavior
- blocking filesystem operations
- memory leaks
- resource cleanup
- graceful shutdown

Implement appropriately:

- Add indexes that match verified query patterns.
- Use projections and `.lean()` where safe.
- Paginate all potentially large collections.
- Add maximum limits and allowlist sort fields.
- Avoid N+1 database calls.
- Use streaming for large files.
- Avoid buffering entire uploads/downloads in memory.
- Move CPU-intensive work off the event loop when necessary.
- Use bounded queues/concurrency for image/media processing.
- Use cache-control correctly:
  - immutable caching for hashed static assets
  - no-store/private for sensitive API responses
  - do not publicly cache authenticated user data
- Ensure compression excludes encrypted/binary already-compressed content where it offers no benefit.
- Ensure proxy trust is explicitly configured, not blindly enabled.
- Do not use an in-memory cache/rate-limit store as the only production mechanism if horizontal scaling is expected.
- Document Redis/database-backed alternatives if production deployment is multi-instance.
- Add health/readiness endpoints that reveal no sensitive details.
- Ensure Docker deployment runs as non-root, exposes only required ports, handles signals, and uses a production Node image strategy.

---

# Phase 11: Tests, Security Tests, CI/CD, and Quality Gates

Audit current tests for meaningful coverage.

Add or fix tests for:

## Authentication and sessions

- valid/invalid login
- account enumeration resistance where testable
- access-token expiry
- refresh-token rotation
- replay detection
- logout and logout-all
- session revocation
- expired/revoked sessions
- MFA required/invalid/valid paths
- password change and session invalidation
- sensitive action re-authentication

## Authorization

Using two separate users, test:

- resource read/update/delete isolation
- folder ownership
- notes/passwords/media isolation
- avatar and profile access
- signed URL issuance and access
- upload session isolation
- streamed range access
- socket event authorization
- deleted-resource access

## Validation and security

- malformed JSON
- oversized body
- invalid ObjectIds
- NoSQL injection attempts
- prototype pollution attempts
- XSS payloads in rich text, Markdown, filenames, and URL fields
- path traversal
- SSRF attempts if URL fetching exists
- CSRF failures
- CORS invalid origins
- rate-limit behavior
- unsafe upload types
- corrupted encrypted payloads
- wrong vault key
- interrupted key rotation
- replayed refresh token

## UI

- heading hierarchy on key pages
- form labels and validation
- loading, empty, success, error, retry states
- keyboard navigation
- modal focus behavior
- responsive smoke tests
- login, protected routes, upload, vault item, settings, logout

## CI

Make CI reliable and explicit:

1. dependency install using lockfile
2. format check
3. frontend typecheck
4. backend typecheck
5. unit/integration tests
6. build
7. dependency audit with documented severity policy
8. E2E tests when environment is available
9. artifact collection for test failures

Do not make CI depend on hidden local `.env` files or external services without mock/staging configuration.

---

# Phase 12: Validation Commands and Final Acceptance Criteria

Run only commands supported by the actual repository. Fix scripts if necessary.

At minimum, run and report exact results:

```bash
npm run format:check
npm run typecheck
npm run typecheck:server
npm run test
npm run build
npm audit
```
