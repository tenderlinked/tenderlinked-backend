# ─── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production
RUN npx prisma generate

# ─── Stage 2: Build TypeScript ─────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install all deps (including devDependencies for build)
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

# ─── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy production node_modules and generated prisma client
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

# Copy compiled output
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Run DB migrations then start the app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
