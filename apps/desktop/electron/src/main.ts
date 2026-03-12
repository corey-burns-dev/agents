import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import type { MessageBoxOptions } from "electron";
import type {
  ContextMenuItem,
  DesktopUpdateActionResult,
  DesktopUpdateState,
} from "@agents/contracts";
import { readPathFromLoginShell } from "@agents/shared/shell";

import { DESKTOP_CHANNELS } from "./channels";

const WINDOW_WIDTH = 1100;
const WINDOW_HEIGHT = 780;
const WINDOW_MIN_WIDTH = 840;
const WINDOW_MIN_HEIGHT = 620;
const RESTART_BASE_DELAY_MS = 500;
const RESTART_MAX_DELAY_MS = 10_000;
const BACKEND_KILL_GRACE_MS = 2_000;

type ChildProcess = import("node:child_process").ChildProcess;

interface BackendLaunchTarget {
  readonly serverEntryPath: string;
  readonly clientIndexPath: string;
  readonly cwd: string;
}

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendRestartAttempt = 0;
let backendRestartTimer: ReturnType<typeof setTimeout> | null = null;
let backendWsUrl: string | null = null;
let isQuitting = false;

function fixPath(): void {
  if (process.platform !== "darwin") return;
  try {
    const shellPath = process.env.SHELL ?? "/bin/zsh";
    const resolvedPath = readPathFromLoginShell(shellPath);
    if (resolvedPath) {
      process.env.PATH = resolvedPath;
    }
  } catch {
    // Keep the inherited PATH if login-shell discovery fails.
  }
}

function resolveDisabledUpdateState(): DesktopUpdateState {
  return {
    enabled: false,
    status: "disabled",
    currentVersion: app.getVersion(),
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

function resolveDisabledUpdateActionResult(): DesktopUpdateActionResult {
  return {
    accepted: false,
    completed: false,
    state: resolveDisabledUpdateState(),
  };
}

function emitMenuAction(action: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(DESKTOP_CHANNELS.menuAction, action);
  }
}

function emitUpdateState(): void {
  const state = resolveDisabledUpdateState();
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(DESKTOP_CHANNELS.onUpdateState, state);
  }
}

function resolvePackagedTarget(): BackendLaunchTarget | null {
  if (!app.isPackaged) return null;
  const serverDistDir = path.join(process.resourcesPath, "apps", "server", "dist");
  const serverEntryPath = path.join(serverDistDir, "index.mjs");
  const clientIndexPath = path.join(serverDistDir, "client", "index.html");
  if (!fs.existsSync(serverEntryPath) || !fs.existsSync(clientIndexPath)) {
    return null;
  }
  return {
    serverEntryPath,
    clientIndexPath,
    cwd: serverDistDir,
  };
}

function resolveMonorepoTarget(): BackendLaunchTarget | null {
  let currentDir = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    const serverEntryPath = path.join(currentDir, "apps", "server", "dist", "index.mjs");
    const clientIndexPath = path.join(currentDir, "apps", "server", "dist", "client", "index.html");
    if (fs.existsSync(serverEntryPath) && fs.existsSync(clientIndexPath)) {
      return {
        serverEntryPath,
        clientIndexPath,
        cwd: currentDir,
      };
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}

function resolveBackendLaunchTarget(): BackendLaunchTarget {
  const packagedTarget = resolvePackagedTarget();
  if (packagedTarget) return packagedTarget;

  const monorepoTarget = resolveMonorepoTarget();
  if (monorepoTarget) return monorepoTarget;

  throw new Error("Could not locate apps/server/dist for Electron desktop runtime.");
}

function buildStateDir(): string {
  const configured = process.env.AGENTS_STATE_DIR?.trim();
  if (configured) {
    return configured;
  }
  return path.join(app.getPath("home"), ".agents", "userdata");
}

function buildBackendEnv(port: number, authToken: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AGENTS_MODE: "desktop",
    AGENTS_NO_BROWSER: "1",
    AGENTS_PORT: String(port),
    AGENTS_STATE_DIR: buildStateDir(),
    AGENTS_AUTH_TOKEN: authToken,
    ELECTRON_RUN_AS_NODE: "1",
  };
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const net = require("node:net") as typeof import("node:net");
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (port > 0) {
          resolve(port);
          return;
        }
        reject(new Error("Failed to reserve a loopback port for the backend server."));
      });
    });
    probe.on("error", reject);
  });
}

async function ensureBackendWsUrl(): Promise<string> {
  const developmentUrl = process.env.AGENTS_DESKTOP_WS_URL?.trim();
  if (developmentUrl) {
    backendWsUrl = developmentUrl;
    return developmentUrl;
  }

  if (backendWsUrl) {
    return backendWsUrl;
  }

  const { spawn } = await import("node:child_process");
  const launchTarget = resolveBackendLaunchTarget();
  const port = await reserveLoopbackPort();
  const authToken = randomBytes(24).toString("hex");
  backendWsUrl = `ws://127.0.0.1:${port}/?token=${encodeURIComponent(authToken)}`;

  const child = spawn(process.execPath, [launchTarget.serverEntryPath], {
    cwd: launchTarget.cwd,
    env: buildBackendEnv(port, authToken),
    stdio: "inherit",
  });
  backendProcess = child;

  child.once("spawn", () => {
    backendRestartAttempt = 0;
  });

  child.on("error", (error) => {
    if (backendProcess === child) {
      backendProcess = null;
    }
    scheduleBackendRestart(error instanceof Error ? error.message : String(error));
  });

  child.on("exit", (code, signal) => {
    if (backendProcess === child) {
      backendProcess = null;
    }
    if (isQuitting) {
      return;
    }
    scheduleBackendRestart(`code=${code ?? "null"} signal=${signal ?? "null"}`);
  });

  return backendWsUrl;
}

function scheduleBackendRestart(reason: string): void {
  if (isQuitting || backendRestartTimer || process.env.AGENTS_DESKTOP_WS_URL) {
    return;
  }

  const delayMs = Math.min(
    RESTART_BASE_DELAY_MS * 2 ** backendRestartAttempt,
    RESTART_MAX_DELAY_MS,
  );
  backendRestartAttempt += 1;
  console.error(`[desktop] backend exited unexpectedly (${reason}); restarting in ${delayMs}ms`);

  backendRestartTimer = setTimeout(() => {
    backendRestartTimer = null;
    backendWsUrl = null;
    void ensureBackendWsUrl().catch((error: unknown) => {
      console.error("[desktop] backend restart failed", error);
      scheduleBackendRestart(String(error));
    });
  }, delayMs);
  backendRestartTimer.unref?.();
}

function stopBackend(): void {
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }

  const child = backendProcess;
  backendProcess = null;
  if (!child || child.killed) {
    return;
  }

  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }, BACKEND_KILL_GRACE_MS).unref();
}

function buildApplicationMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          id: "open-settings",
          label: "Settings...",
          accelerator: "CmdOrCtrl+,",
          click: () => emitMenuAction("open-settings"),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          id: "check-updates",
          label: "Check for Updates...",
          click: () => emitMenuAction("check-updates"),
        },
      ],
    },
  ]);
}

async function loadWindowContent(window: BrowserWindow): Promise<void> {
  if (isDevelopment) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    return;
  }

  const target = resolveBackendLaunchTarget();
  await window.loadFile(target.clientIndexPath);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void loadWindowContent(window);
  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle(DESKTOP_CHANNELS.getWsUrl, async () => ensureBackendWsUrl());
  ipcMain.handle(DESKTOP_CHANNELS.pickFolder, async () => {
    const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
    const dialogOptions = {
      properties: ["openDirectory", "createDirectory"] as Array<
        "openDirectory" | "createDirectory"
      >,
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(DESKTOP_CHANNELS.listChildDirectories, async (_event, parentPath: string) => {
    try {
      const entries = await fs.promises.readdir(parentPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(parentPath, entry.name))
        .toSorted((left, right) => left.localeCompare(right));
    } catch {
      return [];
    }
  });
  ipcMain.handle(DESKTOP_CHANNELS.confirm, async (_event, message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return false;
    const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
    const dialogOptions: MessageBoxOptions = {
      type: "warning",
      buttons: ["Yes", "No"],
      defaultId: 0,
      cancelId: 1,
      message: trimmed,
      title: "Agents",
    };
    const result = owner
      ? await dialog.showMessageBox(owner, dialogOptions)
      : await dialog.showMessageBox(dialogOptions);
    return result.response === 0;
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.contextMenu,
    async (
      event,
      items: ReadonlyArray<ContextMenuItem>,
      position?: { readonly x: number; readonly y: number },
    ) => {
      if (items.length === 0) {
        return null;
      }

      const browserWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      if (!browserWindow) {
        return null;
      }

      return await new Promise<string | null>((resolve) => {
        let resolved = false;
        const menu = Menu.buildFromTemplate(
          items.map((item) => ({
            label: item.label,
            click: () => {
              resolved = true;
              resolve(item.id);
            },
          })),
        );

        menu.popup({
          window: browserWindow,
          ...(position
            ? {
                x: Math.round(position.x),
                y: Math.round(position.y),
              }
            : {}),
          callback: () => {
            if (!resolved) {
              resolve(null);
            }
          },
        });
      });
    },
  );
  ipcMain.handle(DESKTOP_CHANNELS.openExternal, async (_event, url: string) => {
    if (!/^https?:\/\//.test(url)) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle(DESKTOP_CHANNELS.getUpdateState, () => resolveDisabledUpdateState());
  ipcMain.handle(DESKTOP_CHANNELS.downloadUpdate, () => {
    const result = resolveDisabledUpdateActionResult();
    emitUpdateState();
    return result;
  });
  ipcMain.handle(DESKTOP_CHANNELS.installUpdate, () => {
    const result = resolveDisabledUpdateActionResult();
    emitUpdateState();
    return result;
  });
}

async function bootstrap(): Promise<void> {
  fixPath();
  registerIpcHandlers();
  await ensureBackendWsUrl();
  Menu.setApplicationMenu(buildApplicationMenu());
  mainWindow = createWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  stopBackend();
});

app.whenReady().then(() => {
  void bootstrap();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
