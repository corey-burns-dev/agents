#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = process.cwd();

type DesktopPlatform = "linux" | "mac" | "win";
type DesktopArch = "arm64" | "x64";

const DEFAULT_TARGET_BY_PLATFORM: Record<DesktopPlatform, string> = {
  linux: "AppImage",
  mac: "dmg",
  win: "nsis",
};

function readFlag(flagName: string): string | undefined {
  const index = process.argv.indexOf(flagName);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(flagName: string): boolean {
  return process.argv.includes(flagName);
}

function readPlatform(): DesktopPlatform {
  const raw = readFlag("--platform") ?? process.env.AGENTS_DESKTOP_PLATFORM;
  if (raw === "linux" || raw === "mac" || raw === "win") {
    return raw;
  }

  switch (process.platform) {
    case "darwin":
      return "mac";
    case "win32":
      return "win";
    default:
      return "linux";
  }
}

function readArch(platform: DesktopPlatform): DesktopArch {
  const raw = readFlag("--arch") ?? process.env.AGENTS_DESKTOP_ARCH;
  if (raw === "arm64" || raw === "x64") {
    return raw;
  }
  if (platform === "mac" && process.arch === "arm64") {
    return "arm64";
  }
  return "x64";
}

function run(command: string, args: string[], verbose: boolean): void {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: verbose ? "inherit" : ["ignore", "inherit", "inherit"],
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const platform = readPlatform();
const target =
  readFlag("--target") ?? process.env.AGENTS_DESKTOP_TARGET ?? DEFAULT_TARGET_BY_PLATFORM[platform];
const arch = readArch(platform);
const buildVersion = readFlag("--build-version") ?? process.env.AGENTS_DESKTOP_VERSION;
const outputDir = path.resolve(
  REPO_ROOT,
  readFlag("--output-dir") ?? process.env.AGENTS_DESKTOP_OUTPUT_DIR ?? "release",
);
const verbose = hasFlag("--verbose") || process.env.AGENTS_DESKTOP_VERBOSE === "1";
const skipBuild = hasFlag("--skip-build") || process.env.AGENTS_DESKTOP_SKIP_BUILD === "1";
const signed = hasFlag("--signed") || process.env.AGENTS_DESKTOP_SIGNED === "1";

if (!skipBuild) {
  run("bun", ["run", "build:desktop"], verbose);
}

const packageArgs = [
  "run",
  "--cwd",
  "apps/desktop/electron",
  "package",
  "--",
  "--platform",
  platform,
  "--target",
  target,
  "--arch",
  arch,
  "--output-dir",
  outputDir,
];

if (buildVersion) {
  packageArgs.push("--build-version", buildVersion);
}
if (verbose) {
  packageArgs.push("--verbose");
}
if (signed) {
  packageArgs.push("--signed");
}

run("bun", packageArgs, true);
