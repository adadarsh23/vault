# Sentry Integration Guide

## Architecture

- Frontend SDK module: `src/lib/sentry.js`
- Frontend Sentry boundary: `src/components/ErrorBoundary.jsx`
- Backend SDK module: `server/lib/sentry.js`
- Backend middleware wiring: `server.ts` + `server/middleware/errorHandler.ts`

## Production Behavior

- Sentry initializes only when DSN is present and either:
- explicit enable flag is on, or
- runtime is production.
- Frontend is blocked on localhost unless `VITE_SENTRY_ENABLE_LOCALHOST=true`.
- Sensitive backend fields are filtered before send (`password`, `token`, `authorization`, `cookie`, `set-cookie`).

## Source Maps + Release

- Source maps are production-enabled by default via `VITE_SENTRY_SOURCEMAPS=true`.
- Frontend release tags use `VITE_SENTRY_RELEASE` or `VITE_APP_RELEASE`.
- Backend release tags use `SENTRY_RELEASE`.

## Deployment Examples

### Vercel

- Frontend env vars:
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_ENVIRONMENT=production`
- `VITE_SENTRY_RELEASE=$VERCEL_GIT_COMMIT_SHA`
- `VITE_SENTRY_SOURCEMAPS=true`
- Backend env vars (if using Node server runtime):
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_RELEASE=$VERCEL_GIT_COMMIT_SHA`

### Render

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_RELEASE=$RENDER_GIT_COMMIT`
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_RELEASE=$RENDER_GIT_COMMIT`

### Railway

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_RELEASE=$RAILWAY_GIT_COMMIT_SHA`
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_RELEASE=$RAILWAY_GIT_COMMIT_SHA`

### VPS

- Export env vars in process manager config (PM2/systemd shell env):
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_RELEASE=$(git rev-parse --short HEAD)`
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_RELEASE=$(git rev-parse --short HEAD)`

## Best Practices

- Keep sample rates low first, then tune up.
- Use release tags consistently across frontend and backend for cross-stack debugging.
- Keep replay disabled by default; enable with low sample rates.
- Avoid manual duplicate captures of the same error path.
- Alert on:
- new issue spike,
- API 5xx bursts,
- startup crashes.
