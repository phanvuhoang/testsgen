# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDeps needed for build)
# NODE_ENV must NOT be set here — production mode skips devDependencies
RUN npm ci --legacy-peer-deps

# Generate Prisma client
RUN npx prisma generate

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Do NOT set NODE_ENV=production here — Next.js build needs devDependencies
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js app
RUN npm run build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Only set NODE_ENV=production in the runtime stage
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma files for migrations at runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy startup script and its dependencies
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create uploads directory with correct ownership
RUN mkdir -p public/uploads && chown -R nextjs:nodejs public/uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# On startup: migrate DB → seed admin → start Next.js
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx scripts/startup.ts && node server.js"]
