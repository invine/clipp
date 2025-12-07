FROM node:25-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts --fund=false --audit=false

# Bring in the rest of the source
COPY . .

ENV NODE_ENV=production
ENV RELAY_HOST=0.0.0.0
ENV RELAY_PORT=47891
ENV RELAY_STATUS_INTERVAL_MS=15000
ENV RELAY_MAX_RESERVATIONS=500
ENV RELAY_RESERVATION_TTL_MS=7200000

EXPOSE 47891

CMD ["npm", "run", "relay:websocket"]
