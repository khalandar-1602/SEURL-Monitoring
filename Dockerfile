FROM node:20-slim

# Install Chromium and its dependencies (including CA certs for HTTPS)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-freefont-ttf \
    fonts-noto-color-emoji \
    ca-certificates \
    dbus \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip downloading Chrome and use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Optimize Node.js memory for Render free tier (512MB RAM)
ENV NODE_OPTIONS="--max-old-space-size=384"

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create screenshots directory
RUN mkdir -p screenshots

EXPOSE 3000

CMD ["node", "server.js"]
