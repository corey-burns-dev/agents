import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@agents/contracts";

import { DESKTOP_CHANNELS } from "./channels";

let cachedWsUrl: string | null = null;

function showContextMenu<T extends string>(
  items: readonly { id: T; label: string; destructive?: boolean }[],
  position?: { x: number; y: number },
): Promise<T | null> {
  return ipcRenderer.invoke(DESKTOP_CHANNELS.contextMenu, items, position) as Promise<T | null>;
}

const desktopBridge: DesktopBridge = {
  getWsUrl: () => cachedWsUrl,
  pickFolder: () => ipcRenderer.invoke(DESKTOP_CHANNELS.pickFolder) as Promise<string | null>,
  listChildDirectories: (parentPath) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.listChildDirectories, parentPath) as Promise<string[]>,
  confirm: (message) => ipcRenderer.invoke(DESKTOP_CHANNELS.confirm, message) as Promise<boolean>,
  showContextMenu,
  openExternal: (url) => ipcRenderer.invoke(DESKTOP_CHANNELS.openExternal, url) as Promise<boolean>,
  onMenuAction: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action === "string") {
        listener(action);
      }
    };
    ipcRenderer.on(DESKTOP_CHANNELS.menuAction, handler);
    return () => ipcRenderer.removeListener(DESKTOP_CHANNELS.menuAction, handler);
  },
  getUpdateState: () =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.getUpdateState) as ReturnType<
      DesktopBridge["getUpdateState"]
    >,
  downloadUpdate: () =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.downloadUpdate) as ReturnType<
      DesktopBridge["downloadUpdate"]
    >,
  installUpdate: () =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.installUpdate) as ReturnType<
      DesktopBridge["installUpdate"]
    >,
  onUpdateState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (state && typeof state === "object") {
        listener(state as Parameters<typeof listener>[0]);
      }
    };
    ipcRenderer.on(DESKTOP_CHANNELS.onUpdateState, handler);
    return () => ipcRenderer.removeListener(DESKTOP_CHANNELS.onUpdateState, handler);
  },
};

contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);

void ipcRenderer.invoke(DESKTOP_CHANNELS.getWsUrl).then((wsUrl) => {
  cachedWsUrl = typeof wsUrl === "string" ? wsUrl : null;
});
