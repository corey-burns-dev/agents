import { spawnSync } from "node:child_process";

import electronmon from "electronmon";
import waitOn from "wait-on";

import { desktopDir, resolveElectronPath } from "./electron-launcher.mjs";

const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5733";
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

await waitOn({
  resources: [
    `http-get://${new URL(devServerUrl).host}`,
    "file:dist-electron/main.cjs",
    "file:dist-electron/preload.cjs",
  ],
  cwd: desktopDir,
});

const monitor = await electronmon({
  cwd: desktopDir,
  args: ["dist-electron/main.cjs"],
  env: {
    ...childEnv,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
  electronPath: resolveElectronPath(),
});

let shuttingDown = false;

function killChildTree(signal) {
  if (process.platform === "win32") {
    return;
  }
  spawnSync("pkill", [`-${signal}`, "-P", String(process.pid)], { stdio: "ignore" });
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    await Promise.race([monitor.destroy(), new Promise((resolve) => setTimeout(resolve, 1_500))]);
  } catch {
    // Best effort cleanup only.
  }

  killChildTree("TERM");
  setTimeout(() => {
    killChildTree("KILL");
  }, 1_200).unref();

  process.exit(exitCode);
}

process.once("SIGINT", () => {
  void shutdown(130);
});
process.once("SIGTERM", () => {
  void shutdown(143);
});
process.once("SIGHUP", () => {
  void shutdown(129);
});
