# OpenJarvis Decisions

Last updated: 2026-06-11

## 2026-06-11 Upstream Sync

Decision: merge `origin/main` into `codex/openjarvis-image-artifacts` instead of rebasing the fork branch.

Reason: the branch carries desktop-specific work that should remain visible as fork commits while still preserving upstream history so GitHub can correctly report the branch as caught up.

## Conflict Resolution

Decision: preserve desktop fork behavior while accepting upstream fixes where they improve baseline OpenJarvis behavior.

Key examples:

- Keep desktop chat attachments, transcripts, image artifacts, Draw Things defaults, and MLX Whisper support.
- Keep upstream deep research, analytics, approval, connector, installer, mining, and Rust workspace changes.
- Use upstream safer desktop startup behavior that attaches to a healthy backend on port `8000` instead of killing existing listeners.
- Keep MCP auto-agent behavior while adopting upstream MCP loader and resolved-tool reuse.
- Keep connector manual-sync behavior and add upstream background sync helpers.

## Rust Toolchain

Decision: use rustup Cargo from `$HOME/.cargo/bin` for this repo.

Reason: Homebrew Cargo is currently broken on this machine due to a stale `libgit2` to `llhttp` dynamic library path after a failed Homebrew reinstall. The upstream repo now pins Rust `1.88`, and rustup can satisfy that pin directly.

## Desktop Build

Decision: build local desktop app bundles with updater artifacts disabled unless release signing keys are present.

Reason: the Tauri config has an updater public key. Release updater artifacts require `TAURI_SIGNING_PRIVATE_KEY`; local app builds do not need updater signing.

Command:

```bash
PATH="$HOME/.cargo/bin:$PATH" npm --prefix frontend run tauri -- build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

## Dependency Audits

Decision: do not run automatic npm audit fixes as part of the upstream sync.

Reason: `npm audit fix` can change dependency versions and behavior beyond the scope of a merge/update. Audit findings should be triaged in a separate dependency-maintenance pass.
