# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /workspace

# Install essential system tools
RUN apk add --no-cache \
    ripgrep \
    fd \
    git \
    tree \
    curl \
    wget \
    jq \
    make \
    g++ \
    python3 \
    openssh-client \
    zip \
    unzip \
    tar

# Create a non-root user? 
# The spec doesn't explicitly require it, but it's good practice. 
# However, for simplicity and to avoid permission issues with mounted volumes 
# in this bridge context, we'll stick to default user or ensure permissions are managed.
# Given the instructions "lightweight Alpine", "essential dev tools", we stick to root for now 
# unless specified otherwise, as it simplifies tool usage (apk installs etc if needed later).
# But usually running as root inside container is fine for this agent.

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json

# Set environment variables
ENV NODE_ENV=production

# Entrypoint
CMD ["node", "/app/dist/index.js"]
