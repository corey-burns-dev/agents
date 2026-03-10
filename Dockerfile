# Stage 1: Build Frontend and Packages
FROM oven/bun:1.3.9 AS builder

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy necessary monorepo structure
COPY package.json bun.lock ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY scripts/package.json ./scripts/

# Install dependencies (including dev deps for building)
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/contracts ./packages/contracts
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY apps/server ./apps/server
COPY scripts ./scripts
COPY tsconfig.base.json biome.json ./

# Build dependencies
RUN bun run build:contracts

# Build frontend
RUN bun run --cwd apps/web build

# Build server
RUN bun run --cwd apps/server build

# Prune node_modules to keep only production dependencies
# This is tricky in Bun as there is no direct equivalent of `npm prune --production`
# that works exactly the same in all cases, but we can re-install.
# Actually, the bundle includes most of our code, so runtime deps are minimal.

# Stage 2: Runtime Image
FROM oven/bun:1.3.9-slim AS runtime

# Install runtime dependencies for node-pty and git
# node-pty needs libc and standard libraries, git is for app functionality.
# we also install gh (GitHub CLI) as it is used for PR management.
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts and node_modules (including node-pty binaries)
COPY --from=builder /app/package.json /app/bun.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Default environment variables
ENV AGENTS_HOST=0.0.0.0
ENV AGENTS_PORT=3773
ENV AGENTS_STATE_DIR=/app/state
ENV AGENTS_NO_BROWSER=true
ENV NODE_ENV=production

# Create state directory
RUN mkdir -p /app/state && chown -R bun:bun /app

USER bun

EXPOSE 3773

CMD ["bun", "apps/server/dist/index.mjs"]
