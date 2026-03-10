#!/usr/bin/env bun
/**
 * update-deps.ts - Update all external dependencies in the monorepo.
 *
 * Handles:
 *  - Catalog entries in root package.json (workspaces.catalog)
 *  - Direct (non-catalog, non-workspace) deps in each workspace package.json
 *
 * Usage:
 *   bun scripts/update-deps.ts           # update all, then bun install
 *   bun scripts/update-deps.ts --check   # show outdated only, don't write
 */

import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CHECK_ONLY = process.argv.includes("--check") || process.argv.includes("-c");

// ─── Types ────────────────────────────────────────────────────────────────────

type DepMap = Record<string, string>;

type PackageJson = {
  name?: string;
  workspaces?: { packages?: string[]; catalog?: DepMap };
  dependencies?: DepMap;
  devDependencies?: DepMap;
  peerDependencies?: DepMap;
  [key: string]: unknown;
};

type Update = { pkg: string; from: string; to: string; location: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readJson(path: string): Promise<PackageJson> {
  return Bun.file(path).json();
}

async function writeJson(path: string, data: PackageJson): Promise<void> {
  await Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}

/** Skip workspace references, URLs, file: references, and prerelease versions */
function shouldSkip(version: string): boolean {
  if (
    version === "catalog:" ||
    version.startsWith("workspace:") ||
    version.startsWith("http") ||
    version.startsWith("file:")
  )
    return true;
  // Don't replace prereleases with npm's stable "latest" tag
  const bare = version.replace(/^[\^~>=<]+/, "");
  return bare.includes("-");
}

/** Preserve the range prefix (^, ~, >=, etc.) or empty for pinned versions */
function getRange(version: string): string {
  return version.match(/^([\^~>=<]+)/)?.[1] ?? "";
}

function stripRange(version: string): string {
  return version.replace(/^[\^~>=<]+/, "");
}

async function fetchLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version: string };
    return data.version;
  } catch {
    return null;
  }
}

async function resolveWorkspacePaths(): Promise<string[]> {
  const rootPkg = await readJson(join(ROOT, "package.json"));
  const patterns = rootPkg.workspaces?.packages ?? [];
  const paths: string[] = [];

  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const dir = join(ROOT, pattern.slice(0, -2));
      const glob = new Bun.Glob("*/package.json");
      for await (const file of glob.scan(dir)) {
        paths.push(join(dir, file));
      }
    } else {
      const pkgPath = join(ROOT, pattern, "package.json");
      if (await Bun.file(pkgPath).exists()) {
        paths.push(pkgPath);
      }
    }
  }

  return paths;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Checking for updates...\n");

  const rootPkgPath = join(ROOT, "package.json");
  const rootPkg = await readJson(rootPkgPath);
  const workspacePaths = await resolveWorkspacePaths();
  const workspacePkgs = await Promise.all(workspacePaths.map(readJson));

  // Collect all external packages across catalog + all workspaces
  const toCheck = new Set<string>();

  const catalog = rootPkg.workspaces?.catalog ?? {};
  for (const [pkg, ver] of Object.entries(catalog)) {
    if (!shouldSkip(ver)) toCheck.add(pkg);
  }

  for (const pkg of workspacePkgs) {
    for (const deps of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
      if (!deps) continue;
      for (const [name, ver] of Object.entries(deps)) {
        if (!shouldSkip(ver)) toCheck.add(name);
      }
    }
  }

  console.log(`Fetching latest versions for ${toCheck.size} packages...`);

  // Batch requests to avoid hammering the registry
  const BATCH = 20;
  const pkgList = [...toCheck];
  const latestMap: Record<string, string> = {};

  for (let i = 0; i < pkgList.length; i += BATCH) {
    const batch = pkgList.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (pkg) => [pkg, await fetchLatest(pkg)] as const),
    );
    for (const [pkg, ver] of results) {
      if (ver) latestMap[pkg] = ver;
    }
  }

  // ── Diff catalog ──────────────────────────────────────────────────────────

  const updates: Update[] = [];
  const newCatalog = { ...catalog };

  for (const [pkg, ver] of Object.entries(catalog)) {
    if (shouldSkip(ver)) continue;
    const latest = latestMap[pkg];
    if (!latest) continue;
    if (stripRange(ver) !== latest) {
      const newVer = `${getRange(ver)}${latest}`;
      newCatalog[pkg] = newVer;
      updates.push({
        pkg,
        from: ver,
        to: newVer,
        location: "package.json [catalog]",
      });
    }
  }

  // ── Diff each workspace ───────────────────────────────────────────────────

  const newWorkspacePkgs = workspacePkgs.map((pkg, i) => {
    const updated = { ...pkg };
    const relPath = workspacePaths[i].replace(`${ROOT}/`, "");

    for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
      const deps = pkg[field];
      if (!deps) continue;
      const newDeps = { ...deps };

      for (const [name, ver] of Object.entries(deps)) {
        if (shouldSkip(ver)) continue;
        const latest = latestMap[name];
        if (!latest) continue;
        if (stripRange(ver) !== latest) {
          const newVer = `${getRange(ver)}${latest}`;
          newDeps[name] = newVer;
          updates.push({ pkg: name, from: ver, to: newVer, location: relPath });
        }
      }

      (updated as Record<string, unknown>)[field] = newDeps;
    }

    return updated;
  });

  // ── Report ────────────────────────────────────────────────────────────────

  if (updates.length === 0) {
    console.log("\nAll packages are up to date!");
    return;
  }

  const byFile = new Map<string, Update[]>();
  for (const u of updates) {
    const list = byFile.get(u.location) ?? [];
    list.push(u);
    byFile.set(u.location, list);
  }

  console.log(`\nFound ${updates.length} update(s):\n`);
  for (const [file, fileUpdates] of byFile) {
    console.log(`  ${file}`);
    for (const u of fileUpdates) {
      console.log(`    ${u.pkg.padEnd(42)} ${u.from.padEnd(20)} → ${u.to}`);
    }
    console.log();
  }

  if (CHECK_ONLY) {
    console.log("(--check mode: no files written)");
    return;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  console.log("Writing updates...");

  if (rootPkg.workspaces) {
    const newRoot = {
      ...rootPkg,
      workspaces: { ...rootPkg.workspaces, catalog: newCatalog },
    };
    await writeJson(rootPkgPath, newRoot);
  }

  for (let i = 0; i < workspacePaths.length; i++) {
    await writeJson(workspacePaths[i], newWorkspacePkgs[i]);
  }

  console.log("Running bun install...\n");
  const proc = Bun.spawn(["bun", "install"], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    console.error("\nbun install failed");
    process.exit(code);
  }

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
