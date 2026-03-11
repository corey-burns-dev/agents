# Agents

Agents is a minimal coding-agent client with web and desktop frontends. This fork focuses on broader model support and native Linux desktop builds.

## What changed from upstream

- Gemini and Claude support alongside the original provider flow
- Tauri desktop app as the primary native client
- Qt6 desktop app for native Linux builds
- Electron removed from the stack

## Repo layout

- `apps/web`: browser UI
- `apps/server`: backend services
- `apps/desktop/tauri`: primary desktop app
- `apps/desktop/qt6`: Qt6 desktop build
- `packages/*`: shared contracts and utilities

## Quick start

```bash
bun install
bun run dev
```

Desktop targets:

```bash
bun run dev:desktop
bun run dev:qt6
```

## Notes

- Bun `1.3+` and Node `24+` are expected.
- Some providers require local CLIs or API credentials to be configured before use.
