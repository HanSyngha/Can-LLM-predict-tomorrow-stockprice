# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Install chromium for search agent
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy production dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/server/db/migrations ./src/server/db/migrations

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=4001
ENV DB_PATH=/app/data/stock-evolving.db

EXPOSE 4001

CMD ["node", "dist/server/index.js"]
