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

  *Outputs will be located under `apps/desktop/tauri/src-tauri/target/release/` (or `target/debug/` for dev builds).*

### Flatpak (Linux)

A Flatpak build is produced on release and can be built locally:

**Prerequisites:** `flatpak`, `flatpak-builder`, and the Flathub remote (e.g. `flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo`).

```bash
# Build a .flatpak bundle (runs build:desktop:no-bundle then flatpak-builder)
bun run dist:desktop:flatpak
# Output: release/agents.flatpak (or agents-<version>.flatpak with --build-version)
```

Install locally: `flatpak-builder --user --install build flatpak/com.agents.agents.yml` (after `bun run build:desktop:no-bundle`).

### Running the Desktop App (Qt6) from source

An alternative desktop build uses **Qt6** (C++, no Python). It hosts the same web app in a Qt WebEngine view and connects to the same server.

**Prerequisites:**

- [Bun](https://bun.sh/)
- [Qt6](https://www.qt.io/download) with WebEngine support
- [CMake](https://cmake.org/) 3.16+

From the repository root:

- **Development** (Web dev server + Qt window with hot reload):

  ```bash
  bun run dev:qt6
  ```

- **Production** (Build all assets and start the Qt app):

  ```bash
  bun run start:qt6
  ```

- **Build Only**:

  ```bash
  bun run build:qt6
  ```

  *The Qt executable is built under `apps/desktop/qt6/build/`.*

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
