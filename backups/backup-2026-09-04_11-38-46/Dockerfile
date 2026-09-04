# ==========================================
# Stage 1: Build Dependencies (deps)
# ==========================================
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ==========================================
# Stage 2: Production Dependencies (prod-deps)
# ==========================================
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps \
    && npm cache clean --force

# ==========================================
# Stage 3: Builder (Frontend & Backend Build)
# ==========================================
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 1. Compile Frontend (Vite) -> /app/build (includes public assets)
# 2. Compile Backend (esbuild) -> /app/dist/server.js
RUN npm run build:all

# ==========================================
# Stage 4: Production Runner (runner)
# ==========================================
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production
ENV PORT=4000

# Security: Non-root user and group
RUN addgroup -g 1001 -S nodejs \
    && adduser -S -u 1001 -G nodejs nodejs

# Runtime dependencies & package manifests
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package.json ./

# Production builds & runtime error fallback
COPY --from=builder --chown=nodejs:nodejs /app/build ./build
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/overload.html ./overload.html
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Pre-create logs, upload and temporary multipart directories with correct ownership
RUN mkdir -p /app/logs /tmp/vault/multipart-uploads /app/uploads \
    && chown -R nodejs:nodejs /app/logs /tmp/vault /app/uploads

USER nodejs

EXPOSE 4000

# Health check verification
HEALTHCHECK --interval=30s \
            --timeout=5s \
            --start-period=10s \
            --retries=3 \
            CMD wget --no-verbose --tries=1 --spider \
            http://127.0.0.1:4000/health || exit 1

# Direct native Node execution
CMD ["node", "dist/server.js"]