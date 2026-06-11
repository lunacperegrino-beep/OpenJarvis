# OpenJarvis Handoff

Last updated: 2026-06-11

## Current State

- Branch: `codex/openjarvis-image-artifacts`
- Fork remote: `fork` -> `lunacperegrino-beep/OpenJarvis`
- Upstream remote: `origin` -> `open-jarvis/OpenJarvis`
- This branch has been merged with upstream `origin/main` as of 2026-06-11.
- The local desktop app was rebuilt and installed at `/Applications/OpenJarvis.app`.
- The prior installed desktop app was backed up at `/Applications/OpenJarvis.app.backup-20260611-185932`.

## What This Fork Adds

This fork keeps upstream OpenJarvis and adds desktop-focused behavior:

- Chat attachments and artifact handling for generated images, uploaded files, audio, and transcripts.
- Local Draw Things image generation defaults.
- MLX Whisper transcription support on Apple Silicon.
- Transcript follow-up context and transcript action shortcuts.
- Desktop health/status panels and active tool visibility.
- Local-first desktop flow that can still call cloud models for harder tasks.

## Upstream Sync Notes

The 2026-06-11 sync pulled in upstream features including:

- Deep research UI and backend routes.
- Hybrid/search connector updates and Google OAuth refinements.
- Analytics, approvals, install, mining, pearl, and framework-comparison additions.
- Rust workspace updates and a pinned Rust `1.88` toolchain under `rust/rust-toolchain.toml`.
- New frontend dependencies for upstream UI features.

Conflict resolution preserved the fork's desktop additions while accepting upstream fixes in:

- `frontend/src-tauri/src/lib.rs`
- `frontend/src/components/Chat/InputArea.tsx`
- `frontend/src/components/Chat/MessageBubble.tsx`
- `frontend/src/components/Chat/SystemPanel.tsx`
- `frontend/src/components/Chat/XRayFooter.tsx`
- `frontend/src/lib/store.ts`
- `frontend/src/pages/DataSourcesPage.tsx`
- `frontend/src/pages/SettingsPage.tsx`
- `src/openjarvis/cli/ask.py`
- `src/openjarvis/cli/serve.py`
- `src/openjarvis/connectors/pipeline.py`
- `src/openjarvis/server/connectors_router.py`
- `src/openjarvis/server/routes.py`

## Verification

Checks run during the upstream sync:

- `git diff --check`
- `.venv/bin/python -m compileall -q src/openjarvis`
- `.venv/bin/python -c "import openjarvis_rust; print(openjarvis_rust.__file__)"`
- `PATH="$HOME/.cargo/bin:$PATH" .venv/bin/maturin develop -m rust/crates/openjarvis-python/Cargo.toml`
- `uv pip check`
- `npm --prefix frontend run build`
- `PATH="$HOME/.cargo/bin:$PATH" npm --prefix frontend run tauri -- build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`
- `./scripts/test.sh tests/server/test_connectors_router.py tests/server/test_routes.py tests/cli/test_serve_model_resolution.py`
- `codesign --verify --deep --strict /Applications/OpenJarvis.app`

The focused Python test suite printed `39 passed, 54 warnings`. After printing the completed result, the `uv`/pytest wrapper stayed open and had to be terminated manually.

## Known Risks

- Homebrew Cargo is currently broken on this machine because a failed `brew reinstall libgit2` left `/opt/homebrew/opt/libgit2` pointing at a missing cellar path. Use rustup Cargo from `$HOME/.cargo/bin` for this repo until Homebrew is repaired.
- Full Tauri release packaging with updater artifacts requires `TAURI_SIGNING_PRIVATE_KEY`; local app builds should disable updater artifacts unless release signing is configured.
- Tauri emits existing Rust warnings from the macOS Objective-C bridge code, plus a dead-code warning for `kill_listeners_on_port`.
- `npm install` reported 16 npm audit findings. These were not auto-fixed because dependency upgrades can affect the app.
- The focused Python tests pass, but the post-summary hang should be investigated before relying on unattended CI-style local test runs.

## Next Steps

- Repair Homebrew's `libgit2` or remove Homebrew Rust from PATH so rustup remains the primary Cargo provider.
- Investigate the pytest process hang after focused server route tests finish.
- Decide whether updater signing should be configured locally or whether local build docs should always use `createUpdaterArtifacts=false`.
- Triage npm audit findings separately from the upstream merge.
