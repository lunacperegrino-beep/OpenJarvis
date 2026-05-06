# Luna Desktop Polish v0.1.0 Alpha 1

This is an unofficial prerelease of Luna's desktop-focused OpenJarvis fork for
macOS Apple Silicon.

## Download

- `OpenJarvis-Luna-Desktop-0.1.0-alpha.1-macOS-arm64.zip`

SHA-256:

```text
5fd13c7673e7bfa9ae8d751e1d682c78dc9dc5f20ebce3da5c4b7ed6a138597a
```

Unzip it, move `OpenJarvis.app` into `/Applications`, then open it. Because this
build is not Apple-notarized yet, macOS may require right-clicking the app and
choosing **Open**, or approving it from **System Settings > Privacy & Security**.

If macOS says the app is damaged, clear the quarantine flag:

```bash
xattr -cr /Applications/OpenJarvis.app
```

## Highlights

- Generated images now render as chat artifacts with preview, path, Open,
  Reveal in Finder, Copy, and Regenerate actions.
- Chat supports audio uploads, image uploads, and drag-and-drop file attachments.
- Audio files can be transcribed through the local speech backend.
- Apple Silicon systems can use `mlx-whisper` with `large-v3-turbo` for faster
  local transcription.
- Transcript messages include one-click actions for speakers, summary, action
  items, translation, cleanup, copy, and Markdown export.
- Transcript-derived replies keep those transcript actions attached to the
  relevant transcript context.
- The Artifacts page collects generated images, uploaded media, and transcripts
  across local conversations.
- The system panel shows readiness for backend API, Ollama, selected model,
  speech, Draw Things, and image folder permissions.

## First-Run Behavior

If the desktop app cannot find an existing OpenJarvis checkout, it now clones
Luna's fork branch:

```bash
git clone -b codex/openjarvis-image-artifacts https://github.com/lunacperegrino-beep/OpenJarvis.git ~/OpenJarvis
```

This keeps downloaded desktop builds aligned with the forked feature set instead
of silently bootstrapping the upstream repository.

## Recommended Local Tools

- Ollama for local chat models.
- Draw Things with its API server enabled for local image generation.
- Apple Silicon macOS for the fastest MLX Whisper transcription path.

## Known Limitations

- This is an alpha fork build, not an upstream release.
- The app is not Apple-notarized yet.
- DMG packaging still fails in the local release pipeline, so this release ships
  as a zipped `.app` bundle.
- Image uploads are displayed as artifacts; full visual question answering is
  not wired into this build yet.
