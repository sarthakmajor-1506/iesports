# whatsapp-web.js sender service for Railway (always-on).
# Uses the system Chromium instead of puppeteer's bundled download so the
# container is smaller and launches reliably headless.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates fonts-liberation \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 libatspi2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Skip puppeteer's Chromium download; use the apt one above.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    WWEBJS_DATA_PATH=/data/.wwebjs_auth \
    NODE_ENV=production

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

# Session persists in the mounted volume at /data; QR is scanned once.
CMD ["npm", "start"]
