# Multi-stage Enterprise Production Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source files & compile production build
COPY . .
RUN npm run build

# Stage 2: Minimal Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Security: Create non-root user and group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package manifests and install runtime dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public

# Set permissions for nodejs non-root execution
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 4000

# Health check endpoint verification
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/v1/system/health || exit 1

CMD ["node", "build/server.js"]

