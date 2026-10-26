FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir -r requirements.txt
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
RUN mkdir -p /app/data && chown node:node /app/data

ENV NODE_ENV=production \
    YTDLP_BIN=/opt/yt-dlp/bin/yt-dlp \
    STATE_FILE=/app/data/state.json
USER node
CMD ["npm", "start"]
