# Scripts

- `bun run dev` — Builds contracts, then starts server and web in parallel.
- `bun run dev:server` — Starts just the WebSocket server (uses Bun TypeScript execution).
- `bun run dev:web` — Starts just the Vite dev server for the web app.
- Dev commands default `AGENTS_STATE_DIR` to `~/.agents/dev` to keep dev state isolated from desktop/prod state.
- Override server CLI-equivalent flags from root dev commands with `--`, for example:
  `bun run dev -- --state-dir ~/.agents/another-dev-state`
- `bun run start` — Runs the production server (serves built web app as static files).
- `bun run build` — Builds contracts, server, web app, and desktop in dependency order.
- `bun run typecheck` — Strict TypeScript checks for all packages.
- `bun run test` — Runs workspace tests.
- `bun run dist:desktop:artifact -- --platform <linux|mac|win> --target <target> --arch <arch>` — Builds a desktop artifact for a specific platform/target/arch.
- `bun run dist:desktop:linux` — Builds a Linux AppImage into `./release`.
- `bun run dist:desktop:mac` — Builds a macOS `.dmg` into `./release`.
- `bun run dist:desktop:win` — Builds a Windows NSIS installer into `./release`.

## Desktop packaging notes

- Desktop production windows load the bundled UI from the packaged `apps/server/dist/client/index.html`.
- Desktop packaging includes `apps/server/dist` (the `agents` backend) and starts it on loopback with an auth token for WebSocket/API traffic.
- Windows `--signed` is accepted by the root packaging flow, but the current Electron path still emits an unsigned artifact and only logs the signing request.
- Historical Azure Trusted Signing environment variables are still passed through for future Electron signing work:
  `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
  `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, and `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`.
- Azure authentication env vars are also required (for example service principal with secret):
  `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

## Running multiple dev instances

Set `AGENTS_DEV_INSTANCE` to any value to deterministically shift all dev ports together.

- Default ports: server `3773`, web `5733`
- Shifted ports: `base + offset` (offset is hashed from `AGENTS_DEV_INSTANCE`)
- Example: `AGENTS_DEV_INSTANCE=branch-a bun run dev:desktop`

If you want full control instead of hashing, set `AGENTS_PORT_OFFSET` to a numeric offset.
