# OpenJarvis Runbook

Last updated: 2026-06-11

## Local Environment

- Repo path: `/Users/sixx/OpenJarvis`
- Desktop app path: `/Applications/OpenJarvis.app`
- Python venv: `/Users/sixx/OpenJarvis/.venv`
- Rust toolchain for this repo: rustup Cargo at `/Users/sixx/.cargo/bin/cargo`
- Upstream remote: `origin`
- Fork remote: `fork`

Prefer rustup Cargo for Rust and Tauri commands:

```bash
PATH="$HOME/.cargo/bin:$PATH" cargo --version
```

## Backend Checks

Compile Python sources:

```bash
.venv/bin/python -m compileall -q src/openjarvis
```

Check the Rust bridge import:

```bash
.venv/bin/python -c "import openjarvis_rust; print(openjarvis_rust.__file__)"
```

Run focused tests through the repo wrapper:

```bash
./scripts/test.sh tests/server/test_connectors_router.py tests/server/test_routes.py tests/cli/test_serve_model_resolution.py
```

If the test wrapper prints a completed result but does not exit, inspect and terminate leftover `uv` or `pytest` processes.

## Rebuild Python Rust Bridge

Use rustup Cargo, not Homebrew Cargo:

```bash
PATH="$HOME/.cargo/bin:$PATH" .venv/bin/maturin develop -m rust/crates/openjarvis-python/Cargo.toml
```

## Frontend Build

Install or refresh frontend dependencies:

```bash
npm --prefix frontend install
```

Build the server static frontend:

```bash
npm --prefix frontend run build
```

## Desktop App Build

For a local app bundle, disable updater artifacts unless the private updater signing key is configured:

```bash
PATH="$HOME/.cargo/bin:$PATH" npm --prefix frontend run tauri -- build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

The app bundle is produced at:

```text
frontend/src-tauri/target/release/bundle/macos/OpenJarvis.app
```

## Install Desktop App

Keep a backup of the installed app before replacement:

```bash
mv /Applications/OpenJarvis.app /Applications/OpenJarvis.app.backup-YYYYMMDD-HHMMSS
ditto frontend/src-tauri/target/release/bundle/macos/OpenJarvis.app /Applications/OpenJarvis.app
codesign --verify --deep --strict /Applications/OpenJarvis.app
```

## Sync With Upstream

Fetch both remotes:

```bash
git fetch --all --prune
```

Check ahead/behind against upstream:

```bash
git rev-list --left-right --count HEAD...origin/main
```

Merge upstream into the fork branch:

```bash
git merge --no-ff origin/main
```

After resolving conflicts, run the checks above, commit the merge, then push to the fork remote.

## Operational Risks

- Homebrew Rust/Cargo is not reliable on this machine until the Homebrew `libgit2` path is repaired.
- Release updater artifacts require private signing configuration.
- The installed app is ad-hoc signed and not notarized, so macOS may still show standard trust prompts.
