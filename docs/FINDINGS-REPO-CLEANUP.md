# Repo Cleanup & Agents Rebrand – Prioritized Findings

Short prioritized list from the repo audit. Focus: current-stack improvements only; no broad stack migration.

## Addressed in This Pass

1. **Desktop bootstrap env drift** – Server and dev-runner now use canonical `AGENTS_*` env vars; dev-runner sets both `AGENTS_*` and `AGENTS_*` for compatibility. Server and desktop Rust read `AGENTS_*` first with `AGENTS_*` fallback.
2. **Tracked Tauri build outputs** – `apps/desktop/tauri/src-tauri/target` added to root and desktop `.gitignore`; Biome already excluded it. No tracked artifacts under `target/` were present.
3. **Stale Electron naming** – `isElectron` renamed to `isDesktopShell` across web app; comments updated to "desktop shell (Tauri)".
4. **Stale `agents` state/worktree paths** – Default state dir is `~/.agents/userdata`; worktrees use `~/.agents/worktrees/...`. Legacy `~/.agents` remains readable during migration (server/desktop read canonical first, then legacy where applicable).
5. **Product branding** – Desktop binary/crate name `agents-code` → `agents`; UI strings "Agents Code" → "Agents" in settings, dialogs, and smoke test.

## Follow-ups (Prioritized)

1. **Terminal Manager test** – `retries with fallback shells when preferred shell spawn fails` fails in CI/local (expects a fallback shell in `spawnInputs`). Unrelated to env/rebrand; investigate shell resolution or test environment.
2. **Legacy env/state removal** – Once migration is complete, remove `AGENTS_*` fallback and `.agents` path handling; document cutoff in changelog.
3. **A11y** – Biome a11y rules (e.g. `noSvgWithoutTitle`, `noLabelWithoutControl`) are currently set to `warn`. Consider fixing and promoting to `error`, or adding per-file suppressions with rationale.
4. **Pre-commit validation** – Manually confirm: staged changes get Biome `--write`, then full `bun run typecheck` runs; a type error blocks commit.

## References

- Pre-commit: `simple-git-hooks` + `lint-staged` (root `package.json`).
- Canonical env: `AGENTS_*`; legacy: `AGENTS_*` (temporary).
- Canonical paths: `~/.agents/...`; legacy: `~/.agents/...` (read-only during migration).
