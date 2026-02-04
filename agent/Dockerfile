# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production && \
    npm install --only=dev typescript @types/node

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage - optimized for size
FROM node:20-alpine

WORKDIR /workspace

# Install only essential tools (removed: fd, wget, make, g++, python3, openssh-client, zip, unzip, tar)
RUN apk add --no-cache \
    ripgrep \
    git \
    tree \
    curl \
    jq

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json

ENV NODE_ENV=production

CMD ["node", "/app/dist/index.js"]
