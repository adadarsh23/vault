<p align="center">
  <img
    src="./public/favicon.svg"
    alt="Vault Logo"
    width="96"
    style="padding: 14px; border: 3px solid #0f172a; border-radius: 20px; background: #000000; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.9);"
  />
</p>

# Vault

Securely store your files, notes, and sensitive data with end-to-end peace of mind.

## Features

- User registration with bcrypt password hashing
- JWT authentication for protected routes
- AES-256-GCM encryption for notes, vault passwords, and secret keys
- Secure file uploads with type and size validation

## Environment

Copy `.env.example` to `.env` and set:

- `MONGODB_URI`
- `MONGODB_URI_FALLBACK` for a non-SRV Atlas URI if `mongodb+srv` is blocked
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `VAULT_ENCRYPTION_KEY`
- `CLIENT_URL`
- `PUBLIC_URL` if you want local/self-hosted keep-alive pings outside Render
- `VITE_APP_PUBLIC_URL` for canonical/Open Graph HTML metadata
- `VITE_DNS_PREFETCH_HOST` for the HTML DNS prefetch host
- `RENDER_SERVICE_ID` if you want Render service metadata included in startup/keep-alive logs
- `VITE_API_BASE_URL`
- `VITE_DEV_API_BASE_URL`
- `VITE_DEFAULT_API_BASE_URL` for non-browser/server-side fallback API resolution
- `VITE_CSP_CONNECT_SRC`
- `ANALYZE_BUNDLE=true` only when you want a bundle report generated during build
- `MAX_JSON_BODY_MB` to tune JSON request body size safely
- `API_RATE_LIMIT_MAX` to tune general API throttling
- `AUTH_RATE_LIMIT_WINDOW_MS` and `AUTH_RATE_LIMIT_MAX` to harden auth endpoints separately
- `TRUST_PROXY=1` when running behind a single reverse proxy or load balancer so login/activity logs store the real client IP without weakening IP-based rate limiting
- `REFRESH_TOKEN_EXPIRES_IN` to tune long-lived session expiry
- `REFRESH_COOKIE_SAME_SITE`, `REFRESH_COOKIE_SECURE`, and `REFRESH_COOKIE_DOMAIN` to align session cookies with your production domain strategy
- `REGISTRATION_PROFILE_CAPTURE_ENABLED=true` if you want to store signup IP intelligence from `free.freeipapi.com`, `ipwho.is`, and `ipinfo.io`
- `REGISTRATION_PROFILE_TIMEOUT_MS` to control third-party lookup timeout
- `FREE_IP_API_URL_TEMPLATE`, `IPWHOIS_URL_TEMPLATE`, `IPINFO_IO_URL_TEMPLATE`, and `IPGEOLOCATION_URL_TEMPLATE` if you want the registration lookup providers controlled from env

For Render deployments, the server will also use `RENDER_EXTERNAL_URL` automatically for keep-alive if `PUBLIC_URL` is not set. If you define `RENDER_SERVICE_ID` or `SERVICE_ID`, the server will include that service identity in keep-alive logging for easier production diagnostics.

If Atlas SRV DNS lookups fail on your machine, use either:

- A direct Mongo URI in `MONGODB_URI_FALLBACK`
- A local MongoDB URI such as `mongodb://127.0.0.1:27017/personal-vault`
- Alias names are also supported: `MONGODB_URL`, `MONGODB_URL_FALLBACK`

Example Atlas production setup:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.ncuxgch.mongodb.net/personal-vault?retryWrites=true&w=majority&appName=Cluster0
CLIENT_URL=https://my-vault-cic6.onrender.com
PUBLIC_URL=https://my-vault-cic6.onrender.com
VITE_APP_PUBLIC_URL=https://my-vault-cic6.onrender.com/
VITE_DNS_PREFETCH_HOST=//my-vault-cic6.onrender.com
RENDER_SERVICE_ID=srv-your-render-service-id
VITE_API_BASE_URL=https://my-vault-cic6.onrender.com
VITE_DEV_API_BASE_URL=http://localhost:4000
VITE_DEFAULT_API_BASE_URL=http://127.0.0.1:4000
VITE_CSP_CONNECT_SRC=https://my-vault-cic6.onrender.com https://*.onrender.com
ANALYZE_BUNDLE=false
MAX_JSON_BODY_MB=5
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=100
REFRESH_COOKIE_SAME_SITE=strict
REFRESH_COOKIE_SECURE=true
FREE_IP_API_URL_TEMPLATE=https://free.freeipapi.com/api/json/{ip}
IPWHOIS_URL_TEMPLATE=https://ipwho.is/{ip}
IPINFO_IO_URL_TEMPLATE=https://ipinfo.io/{ip}/json
IPGEOLOCATION_URL_TEMPLATE=https://api.ipgeolocation.io/ipgeo?apiKey={apiKey}&ip={ip}
```

Example Atlas primary/fallback setup:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.ncuxgch.mongodb.net/personal-vault?retryWrites=true&w=majority&appName=Cluster0
MONGODB_URI_FALLBACK=mongodb+srv://<username>:<password>@cluster1.example.mongodb.net/personal-vault?retryWrites=true&w=majority&appName=Cluster1
CLIENT_URL=https://my-vault-cic6.onrender.com
PUBLIC_URL=https://my-vault-cic6.onrender.com
VITE_APP_PUBLIC_URL=https://my-vault-cic6.onrender.com/
VITE_DNS_PREFETCH_HOST=//my-vault-cic6.onrender.com
RENDER_SERVICE_ID=srv-your-render-service-id
VITE_API_BASE_URL=https://my-vault-cic6.onrender.com
VITE_DEV_API_BASE_URL=http://localhost:4000
VITE_DEFAULT_API_BASE_URL=http://127.0.0.1:4000
VITE_CSP_CONNECT_SRC=https://my-vault-cic6.onrender.com https://*.onrender.com
ANALYZE_BUNDLE=false
MAX_JSON_BODY_MB=5
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=100
REFRESH_COOKIE_SAME_SITE=strict
REFRESH_COOKIE_SECURE=true
FREE_IP_API_URL_TEMPLATE=https://free.freeipapi.com/api/json/{ip}
IPWHOIS_URL_TEMPLATE=https://ipwho.is/{ip}
IPINFO_IO_URL_TEMPLATE=https://ipinfo.io/{ip}/json
IPGEOLOCATION_URL_TEMPLATE=https://api.ipgeolocation.io/ipgeo?apiKey={apiKey}&ip={ip}
```

The server will try the primary URI first and then `MONGODB_URI_FALLBACK`.
If you use `MONGODB_URL` names instead, the server will read those too.

Important:

- `MONGODB_URI_FALLBACK` is optional and should only be used if you have a real backup database target.
- If you do not have a verified backup target, leave `MONGODB_URI_FALLBACK` empty.
- For most deployments, one healthy primary Atlas cluster is the recommended production setup.
- Frontend and CSP origins should be configured through env values instead of hardcoded production URLs.
- Canonical/public HTML metadata and third-party registration lookup endpoints are also env-driven now.
- Production static assets are cached aggressively while `index.html` stays non-cacheable so fresh deploys roll out cleanly.
- `REGISTRATION_PROFILE_CAPTURE_ENABLED` is off by default and should only be enabled if you intentionally want to persist third-party IP/geolocation metadata for new account registrations.

## API Overview

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/sessions/revoke`

Example register request:

```json
{
  "username": "ook",
  "password": "KW88P0E%NezFZs7!",
  "masterKey": "O4[qH:shrp95_Xd0",
  "deviceId": "laptop-main"
}
```

Note:

- `password` is the account authentication password.
- Demo vault passphrase (client-side unlock secret): `O4[qH:shrp95_Xd0`
- The vault encryption key is separate and is entered only on the client during unlock.
- Existing accounts can still use the same value for both if they choose, but production usage should treat them as separate secrets.

Example login response:

```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "65f0...",
      "username": "ook"
    }
  }
}
```

### Vault

- `GET /api/vault/items`
- `POST /api/vault/items/:itemId`
- `DELETE /api/vault/items/:itemId`
- `GET /api/vault/legacy/:vaultId/items`

Control records written into the active scoped vault:

- `__settings__`
- `__logs__`
- `__profile__`
- `__keycheck__`

Example note request:

```json
{
  "title": "Recovery codes",
  "content": "My private recovery data",
  "deviceId": "iphone-1",
  "clientUpdatedAt": "2026-03-19T10:45:00.000Z"
}
```

## Sync Strategy

- Real-time notifications are emitted over Socket.IO on `vault:changed`
- Polling clients can call `/api/vault/sync`
- Conflict resolution uses `latest-update-wins` based on `updatedAt`
- Soft deletes are retained with `isDeleted` and `deletedAt`

## Security Notes

- User passwords are hashed with bcrypt
- Sensitive vault values are encrypted with AES-256-GCM before MongoDB writes
- A dedicated encrypted `__keycheck__` sentinel verifies the vault key without relying on unrelated control records
- JWT is required for every vault route
- Refresh tokens rotate in HTTP-only cookies and can be revoked per device session
- Auth routes are rate limited aggressively, while general vault APIs use a broader limiter
- Helmet now enforces a CSP/CORP-based browser hardening policy driven by env configuration
