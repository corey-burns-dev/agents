# Release Checklist

This document covers how to run desktop releases from one tag, first without signing, then with signing.

## What the workflow does

- Trigger: push tag matching `v*.*.*`.
- Runs quality gates first: lint, typecheck, test.
- Builds three artifacts in parallel:
  - Linux `x64` AppImage
  - Linux `x64` Flatpak (single-file `.flatpak` bundle)
  - Windows `x64` NSIS installer
- Publishes one GitHub Release with all produced files.
  - Versions with a suffix after `X.Y.Z` (for example `1.2.3-alpha.1`) are published as GitHub prereleases.
  - Only plain `X.Y.Z` releases are marked as the repository's latest release.
- Desktop artifacts are produced by Tauri build (AppImage, NSIS); auto-update metadata (Tauri updater manifest) can be added in future.
- Publishes the CLI package (`apps/server`, npm package `agents`) with OIDC trusted publishing.
- Signing is optional and auto-detected per platform from secrets.

## Desktop auto-update notes

- Desktop is built with Tauri 2. The updater is currently stubbed (no automatic update checks).
- To enable updates later: configure Tauri’s built-in updater in `apps/desktop/tauri/src-tauri`, generate a Tauri-compatible update manifest in CI/release, and map updater state to the existing `DesktopUpdateState` contract so the Sidebar update UI continues to work.
- Release artifacts are produced by `scripts/build-desktop-artifact.ts` (runs `bun run build:desktop` or `build:desktop:no-bundle` for Flatpak, then copies from `apps/desktop/tauri/src-tauri/target/release/bundle/` or runs `flatpak-builder` for Flatpak).

## 0) npm OIDC trusted publishing setup (CLI)

The workflow publishes the CLI with `bun publish` from `apps/server` after bumping
the package version to the release tag version.

Checklist:

1. Confirm npm org/user owns package `agents` (or rename package first if needed).
2. In npm package settings, configure Trusted Publisher:
   - Provider: GitHub Actions
   - Repository: this repo
   - Workflow file: `.github/workflows/release.yml`
   - Environment (if used): match your npm trusted publishing config
3. Ensure npm account and org policies allow trusted publishing for the package.
4. Create release tag `vX.Y.Z` and push; workflow will:
   - set `apps/server/package.json` version to `X.Y.Z`
   - build web + server
   - run `bun publish --access public`

## 1) Dry-run release without signing

Use this first to validate the release pipeline.

1. Confirm no signing secrets are required for this test.
2. Create a test tag:
   - `git tag v0.0.0-test.1`
   - `git push origin v0.0.0-test.1`
3. Wait for `.github/workflows/release.yml` to finish.
4. Verify the GitHub Release contains all platform artifacts.
5. Download each artifact and sanity-check installation on each OS.

## 2) Azure Trusted Signing setup (Windows)

Required secrets used by the workflow:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`
- `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`

Checklist:

1. Create Azure Trusted Signing account and certificate profile.
2. Record ATS values:
   - Endpoint
   - Account name
   - Certificate profile name
   - Publisher name
3. Create/choose an Entra app registration (service principal).
4. Grant service principal permissions required by Trusted Signing.
5. Create a client secret for the service principal.
6. Add Azure secrets listed above in GitHub Actions secrets.
7. Re-run a tag release and confirm Windows installer is signed.

## 3) Ongoing release checklist

1. Ensure `main` is green in CI.
2. Bump app version as needed.
3. Create release tag: `vX.Y.Z`.
4. Push tag.
5. Verify workflow steps:
   - preflight passes
   - all matrix builds pass
   - release job uploads expected files
6. Smoke test downloaded artifacts.

## 4) Troubleshooting

- Linux AppImage build fails with "failed to run linuxdeploy":
  - The build script sets `APPIMAGE_EXTRACT_AND_RUN=1` so linuxdeploy runs without FUSE. If you run `bun run build:desktop` or `tauri build` directly, set that env var yourself, e.g. `APPIMAGE_EXTRACT_AND_RUN=1 bun run build:desktop`.
- Windows build unsigned when expected signed:
  - Check all Azure ATS and auth secrets are populated and non-empty.
- Build fails with signing error:
  - Retry with secrets removed to confirm unsigned path still works.
  - Re-check certificate/profile names and tenant/client credentials.
