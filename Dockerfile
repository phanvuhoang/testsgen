# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install ALL deps (including devDeps needed for build)
# Do NOT set NODE_ENV here — production mode skips devDependencies
RUN npm ci --legacy-peer-deps

# Generate Prisma client
RUN npx prisma generate

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Do NOT set NODE_ENV=production during build (breaks devDep resolution)
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js (standard build, not standalone)
RUN npm run build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy everything needed to run the app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Copy Prisma files for db push at startup
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create uploads directory
RUN mkdir -p public/uploads && chown -R nextjs:nodejs public/uploads && \
    chown -R nextjs:nodejs .next

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# On startup: sync DB schema → seed admin → start Next.js
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --skip-generate && npx tsx scripts/startup.ts && npx next start -p 3000"]
