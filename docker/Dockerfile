# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Add compiler tools for native modules (like argon2)
RUN apk add --no-cache g++ make python3 \
    && npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ---- Stage 2: Production runtime ----
FROM node:20-alpine 

WORKDIR /app

ENV NODE_ENV=production

# 🌐 ADD OPENSSL ALONG WITH COMPILER TOOLS SO PRISMA MATCHES ALPINE LINUX
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./

RUN apk add --no-cache --virtual .build-deps g++ make python3 \
    && npm ci --omit=dev \
    && apk del .build-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# Run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 4000

CMD ["node", "dist/server.js"]
