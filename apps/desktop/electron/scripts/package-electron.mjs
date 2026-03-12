import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, "..");

function readFlag(flagName) {
  const index = process.argv.indexOf(flagName);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(flagName) {
  return process.argv.includes(flagName);
}

const platform = readFlag("--platform");
const target = readFlag("--target");
const arch = readFlag("--arch");
const buildVersion = readFlag("--build-version");
const outputDir = readFlag("--output-dir") ?? resolve(desktopDir, "../../../release");
const verbose = hasFlag("--verbose");
const signed = hasFlag("--signed");

if (!platform || !target || !arch) {
  console.error(
    "Usage: node scripts/package-electron.mjs --platform <linux|win|mac> --target <target> --arch <x64|arm64>",
  );
  process.exit(1);
}

const platformFlag =
  platform === "mac"
    ? "--mac"
    : platform === "win"
      ? "--win"
      : platform === "linux"
        ? "--linux"
        : null;

if (!platformFlag) {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}

const args = [
  "electron-builder",
  platformFlag,
  target,
  `--${arch}`,
  "--config.directories.output",
  outputDir,
];

if (buildVersion) {
  args.push("--config.extraMetadata.version", buildVersion);
}

if (signed) {
  console.warn(
    "[desktop] code signing is not wired into the Electron packaging path yet; proceeding unsigned.",
  );
}

const result = spawnSync("bunx", args, {
  cwd: desktopDir,
  stdio: verbose ? "inherit" : ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
});

process.exit(result.status ?? 1);
