# Agents

Agents is a minimal web GUI and desktop application for coding agents.

**This project is a fork of the agents app (agents.chat).**

## Key Additions & Differences

- **Gemini Support**: Gemini use is enabled and fully supported.
- **Tauri Builds**: The desktop application is built entirely using [Tauri](https://v2.tauri.app/), providing a fast, native, and lightweight experience.
- **No Electron**: We have completely removed Electron from the stack in favor of Tauri.

## How to use

> [!WARNING]
> You may need to have [Codex CLI](https://github.com/openai/codex) installed and authorized for Agents to work depending on your chosen provider.

### Running the Desktop App (Tauri) from source

**Prerequisites:**
- [Bun](https://bun.sh/)
- [Rust](https://rustup.rs/)
- [Tauri's system dependencies](https://v2.tauri.app/start/prerequisites/) for your specific OS.

From the repository root, you can use the following commands:

- **Development** (Web dev server + Tauri window with hot reload):
  ```bash
  bun run dev:desktop
  ```

- **Production** (Build all assets and start the desktop app):
  ```bash
  bun run start:desktop
  ```

- **Build Only** (Build the web, server, and desktop app):
  ```bash
  bun run build:desktop
  ```
  *Outputs will be located under `apps/desktop/src-tauri/target/release/` (or `target/debug/` for dev builds).*

### Running via CLI / Web

You can still use Agents as a web application running in your browser:

```bash
# Start the web and server dev runner
bun run dev

# Or via npx
npx agents
```

## Notes

We are very early in this project. Expect bugs. 
