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

## Local Automation Stack

This Mac runs the local assistant stack from user LaunchAgents and Homebrew
tooling:

- API LaunchAgent:
  `/Users/sixx/Library/LaunchAgents/com.sixx.openjarvis.api.plist`
- UI LaunchAgent:
  `/Users/sixx/Library/LaunchAgents/com.sixx.openjarvis.ui.plist`
- Ollama Homebrew service:
  `/Users/sixx/Library/LaunchAgents/homebrew.mxcl.ollama.plist`
- Wrapper scripts:
  `/Users/sixx/.openjarvis/bin`
- Logs:
  `/Users/sixx/.openjarvis/logs`

Start or restart the local stack:

```bash
/Users/sixx/.openjarvis/bin/start-openjarvis.sh
```

The wrapper waits up to 180 seconds for each health endpoint. Cold starts can
be slower after a venv refresh or Rust bridge rebuild.

Stop API and UI only:

```bash
/Users/sixx/.openjarvis/bin/stop-openjarvis.sh
```

Stop API, UI, and Ollama:

```bash
/Users/sixx/.openjarvis/bin/stop-openjarvis.sh --all
```

The active local model policy is intentionally small:

```text
qwen3:0.6b
nomic-embed-text:latest
```

Do not pull larger Ollama models on this machine without explicit approval.

The Apple MCP server is launched through:

```text
/Users/sixx/.openjarvis/bin/apple-mcp-openjarvis.sh
```

That wrapper uses Homebrew Bun and filters non-JSON Apple MCP stdout before it
reaches OpenJarvis' stdio MCP transport.

## Local Secret Handling

Do not store API keys directly in `~/.openjarvis/config.toml`, LaunchAgent
plists, shell scripts, or Docker container environment variables.

Keep local telemetry disabled in `~/.openjarvis/config.toml` unless there is an
explicit debugging need to send startup/runtime telemetry off-machine.

OpenJarvis cloud fallback should read Anthropic credentials from the macOS
Keychain item named `openjarvis-anthropic-api-key`:

```bash
security add-generic-password \
  -a "$USER" \
  -s openjarvis-anthropic-api-key \
  -w 'PASTE_NEW_KEY_HERE' \
  -U
```

If a GitHub MCP server is needed, prefer the Docker MCP Toolkit's OS Keychain
secret support or this app's GitHub connector. Do not run
`ghcr.io/github/github-mcp-server` with `GITHUB_PERSONAL_ACCESS_TOKEN` injected
directly as a container environment variable; local `docker inspect` can expose
it.

After changing secrets, restart the stack:

```bash
/Users/sixx/.openjarvis/bin/start-openjarvis.sh
```

## Local Health Checks

```bash
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:11434/api/tags
curl -fsSI http://127.0.0.1:5173/
curl -fsS http://127.0.0.1:8000/v1/models
```

Inspect LaunchAgent state:

```bash
launchctl print "gui/$(id -u)/com.sixx.openjarvis.api"
launchctl print "gui/$(id -u)/com.sixx.openjarvis.ui"
brew services list
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
