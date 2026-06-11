<div align="center">
  <img alt="OpenJarvis" src="assets/OpenJarvis_Horizontal_Logo.png" width="400">

  <p><i>Personal AI, On Personal Devices.</i></p>

  <p>
    <a href="https://scalingintelligence.stanford.edu/blogs/openjarvis/"><img src="https://img.shields.io/badge/project-OpenJarvis-blue" alt="Project"></a>
    <a href="https://open-jarvis.github.io/OpenJarvis/"><img src="https://img.shields.io/badge/docs-mkdocs-blue" alt="Docs"></a>
    <img src="https://img.shields.io/badge/python-%3E%3D3.10-blue" alt="Python">
    <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License">
    <a href="https://discord.gg/CMVBmDQ5Fj"><img src="https://img.shields.io/badge/discord-join-7289da?logo=discord&logoColor=white" alt="Discord"></a>
    <a href="https://x.com/OpenJarvisAI"><img src="https://img.shields.io/badge/X-@OpenJarvisAI-black?logo=x&logoColor=white" alt="X / Twitter"></a>
  </p>
</div>

---

<div align="center">
  <img alt="OpenJarvis demo reel" src="assets/openjarvis_demo_reel.webp" width="75%">
</div>

---

> **[Documentation](https://open-jarvis.github.io/OpenJarvis/)**
>
> **[Project Site](https://scalingintelligence.stanford.edu/blogs/openjarvis/)**
>
> **[Paper](https://arxiv.org/abs/2605.17172)**
>
> **[Leaderboard](https://open-jarvis.github.io/OpenJarvis/leaderboard/)**
>
> **[Roadmap](https://open-jarvis.github.io/OpenJarvis/development/roadmap/)**

## Luna's Desktop Polish Branch

This fork branch is an experimental OpenJarvis desktop build focused on making
the app feel useful as a daily driver, not just as a wrapper around the CLI.
It keeps the local-first OpenJarvis foundation, then adds practical desktop
workflows for image generation, audio transcription, file artifacts, and
health/status visibility.

Branch:
[`codex/openjarvis-image-artifacts`](https://github.com/lunacperegrino-beep/OpenJarvis/tree/codex/openjarvis-image-artifacts)

Compared with upstream OpenJarvis, this branch adds or improves:

| Area | What changed |
|------|--------------|
| Desktop image artifacts | Generated images now render as chat artifacts with preview, file path, Open, Reveal in Finder, Copy, and Regenerate actions. |
| Draw Things support | The `image_generate` tool defaults to local Draw Things generation, saving images to `~/Pictures/jarvis` when no output path is provided. OpenAI image generation remains available with `provider="openai"`. |
| Audio upload and transcription | The chat input accepts audio uploads and drag-and-drop audio files, then transcribes them directly in the conversation. |
| MLX Whisper on Apple Silicon | Adds a fast `mlx-whisper` speech backend for macOS/Apple Silicon, including `large-v3-turbo` support and automatic language detection. |
| Transcript follow-ups | Follow-up prompts like "format the transcript above" now attach the recent transcript explicitly, so the model should not ask you to paste text it just generated. |
| Transcript Studio actions | Transcript messages include one-click actions for speaker formatting, summaries, action items, translation, cleanup, copy, and Markdown export. |
| Artifact library | A new Artifacts page collects generated images, uploaded audio, uploaded images, and transcripts across local conversations with search, filters, preview, copy, open, reveal, export, and jump-to-chat actions. |
| Image uploads | The desktop chat can attach image files and display them as file artifacts, even though full visual understanding is not wired into this build yet. |
| Health/status panel | The system panel shows readiness for the backend API, Ollama, selected model, speech backend, Draw Things, and image folder permissions. |
| Settings polish | Settings can show the configured default model and active orchestrator tools exposed by the backend. |
| Safer development flow | Changes are kept as Git savepoints and verified with frontend builds, Python lint checks, and focused tests before pushing. |

The next desktop-assistant ideas are tracked in
[Luna Desktop Assistant Roadmap](docs/development/luna-desktop-assistant-roadmap.md).

### Try This Branch

This branch is not an official upstream release. It is best for macOS users who
want the desktop app experience with local Ollama, Draw Things, and MLX Whisper.

Download the current prerelease build:

> **macOS Apple Silicon:** [OpenJarvis Luna Desktop v0.1.0 Alpha 1](https://github.com/lunacperegrino-beep/OpenJarvis/releases/tag/luna-desktop-v0.1.0-alpha.1)

The packaged app is not Apple-notarized yet. On first open, macOS may require
right-clicking the app and choosing **Open**, or approving it from
**System Settings > Privacy & Security**.

If you want to build from source instead:

```bash
git clone -b codex/openjarvis-image-artifacts https://github.com/lunacperegrino-beep/OpenJarvis.git
cd OpenJarvis

# Python/backend dependencies
uv sync --extra server --extra speech-mlx

# Frontend/desktop dependencies
cd frontend
npm install
npm run tauri build
```

The macOS app bundle is produced at:

```text
frontend/src-tauri/target/release/bundle/macos/OpenJarvis.app
```

Optional local tools:

- [Ollama](https://ollama.com/) for local chat models.
- [Draw Things](https://drawthings.ai/) with its API server enabled for local image generation.
- Apple Silicon macOS for the fastest `mlx-whisper` transcription path.

### Support This Fork

If this desktop-focused fork helps you, you can support ongoing polish and
testing here:

> **Ko-fi:** [ko-fi.com/luna_sixx_](https://ko-fi.com/luna_sixx_)

If you already have an installed app, keep a backup before replacing it:

```bash
mv /Applications/OpenJarvis.app /Applications/OpenJarvis.app.backup
ditto frontend/src-tauri/target/release/bundle/macos/OpenJarvis.app /Applications/OpenJarvis.app
open /Applications/OpenJarvis.app
```

The rest of this README is the original OpenJarvis project documentation.

## Why OpenJarvis?

Personal AI agents are exploding in popularity, but nearly all of them still route intelligence through cloud APIs. Your "personal" AI continues to depend on someone else's server. At the same time, our [Intelligence Per Watt](https://www.intelligence-per-watt.ai/) research showed that local language models already handle 88.7% of single-turn chat and reasoning queries, with intelligence efficiency improving 5.3× from 2023 to 2025. The models and hardware are increasingly ready. What has been missing is the software stack to make local-first personal AI practical.

OpenJarvis is that stack. It is a framework for local-first personal AI, built around three core ideas: shared primitives for building on-device agents; evaluations that treat energy, FLOPs, latency, and dollar cost as first-class constraints alongside accuracy; and a learning loop that improves models using local trace data. The goal is simple: make it possible to build personal AI agents that run locally by default, calling the cloud only when truly necessary. OpenJarvis aims to be both a research platform and a production foundation for local AI, in the spirit of PyTorch.

## Installation

Pick your platform and run one command. Each installer handles [uv](https://docs.astral.sh/uv/), the Python venv, Ollama, and a starter model — about 3 minutes on broadband.

| Platform | One-liner |
|---|---|
| **macOS · Linux · WSL2** | `curl -fsSL https://open-jarvis.github.io/OpenJarvis/install.sh \| bash` |
| **Native Windows** | `irm https://open-jarvis.github.io/OpenJarvis/install.ps1 \| iex` |
| **Desktop GUI** | Download `.exe` / `.dmg` / `.deb` / `.rpm` / `.AppImage` from the [latest release](https://github.com/open-jarvis/OpenJarvis/releases) |

Then `jarvis` to start. The Rust extension and larger models continue downloading in the background; `jarvis doctor` shows status.

Platform-specific notes (WSL2 setup, native-Windows scheduled-task service, desktop prerequisites, manual / contributor install): see the [installation docs](https://open-jarvis.github.io/OpenJarvis/getting-started/install/).

## Quick Start

```bash
jarvis                          # start chatting (default: chat-simple)
jarvis init --preset <name>     # switch to a starter config
```

> Prefix `jarvis ...` with `uv run`, or `source .venv/bin/activate` first.

| Preset | What it does |
|---|---|
| `morning-digest-mac` / `morning-digest-linux` / `morning-digest-minimal` | Spoken daily briefing from email, calendar, health, news |
| `deep-research` | Multi-hop research across indexed docs with citations |
| `code-assistant` | Agent with code execution, file I/O, and shell access |
| `scheduled-monitor` | Stateful agent on a schedule with memory |
| `chat-simple` | Lightweight conversation, no tools |

Example:

```bash
jarvis init --preset morning-digest-mac
jarvis connect gdrive          # one OAuth covers Gmail / Calendar / Tasks
jarvis digest --fresh          # generate and play your first briefing
```

Per-preset deep dives: [morning digest](https://open-jarvis.github.io/OpenJarvis/user-guide/morning-digest/) · [deep research](https://open-jarvis.github.io/OpenJarvis/user-guide/deep-research/) · [code assistant](https://open-jarvis.github.io/OpenJarvis/user-guide/code-assistant/) · [scheduled monitor](https://open-jarvis.github.io/OpenJarvis/user-guide/scheduled-monitor/) · [chat simple](https://open-jarvis.github.io/OpenJarvis/user-guide/chat-simple/) · or the full [quickstart guide](https://open-jarvis.github.io/OpenJarvis/getting-started/quickstart/).

### Skills

Skills teach agents how to better use tools and improve their reasoning. Every skill is a tool — agents discover them from a catalog and invoke them on demand.

```bash
# Install skills from public sources
jarvis skill install hermes:arxiv
jarvis skill sync hermes --category research

# Use skills with any agent
jarvis ask "Use the code-explainer skill to explain this Python code: for i in range(5): print(i*2)"

# Optimize skills from your trace history
jarvis optimize skills --policy dspy

# Benchmark the impact
jarvis bench skills --max-samples 5 --seeds 42
```

Import from [Hermes Agent](https://github.com/NousResearch/hermes-agent) (~150 skills), [OpenClaw](https://github.com/openclaw/skills) (~13,700 community skills), or any GitHub repo. Skills follow the [agentskills.io](https://agentskills.io/specification) open standard.

See the [Skills User Guide](https://open-jarvis.github.io/OpenJarvis/user-guide/skills/) and [Skills Tutorial](https://open-jarvis.github.io/OpenJarvis/tutorials/skills-workflow/) for details.

### Built-in Agents

OpenJarvis ships with eight built-in agents across three execution modes (on-demand, scheduled, continuous):

| Agent | Type | What it does |
|-------|------|-------------|
| `morning_digest` | Scheduled | Daily briefing from email, calendar, health, news — with TTS audio |
| `deep_research` | On-demand | Multi-hop research with citations across web and local docs |
| `monitor_operative` | Continuous | Long-horizon monitoring with memory, compression, and retrieval |
| `orchestrator` | On-demand | Multi-turn reasoning with automatic tool selection |
| `native_react` | On-demand | ReAct (Thought-Action-Observation) loop agent |
| `operative` | Continuous | Persistent autonomous agent with state management |
| `native_openhands` | On-demand | CodeAct — generates and executes Python code |
| `simple` | On-demand | Single-turn chat, no tools |

See the [User Guide](https://open-jarvis.github.io/OpenJarvis/user-guide/morning-digest/) and [Tutorials](https://open-jarvis.github.io/OpenJarvis/tutorials/) for detailed setup instructions.

Full documentation — including Docker deployment, cloud engines, development setup, and tutorials — at **[open-jarvis.github.io/OpenJarvis](https://open-jarvis.github.io/OpenJarvis/)**.

## Community

- **GitHub:** [github.com/open-jarvis/OpenJarvis](https://github.com/open-jarvis/OpenJarvis)
- **Discord:** [discord.gg/CMVBmDQ5Fj](https://discord.gg/CMVBmDQ5Fj)
- **X / Twitter:** [@OpenJarvisAI](https://x.com/OpenJarvisAI)
- **Docs:** [open-jarvis.github.io/OpenJarvis](https://open-jarvis.github.io/OpenJarvis/)

## Contributing

We welcome contributions! See the [Contributing Guide](CONTRIBUTING.md) for incentives, contribution types, and the PR process.

Quick start for contributors:

```bash
git clone https://github.com/open-jarvis/OpenJarvis.git
cd OpenJarvis
uv sync --extra dev
uv run pre-commit install
./scripts/test.sh tests/ -v
```

For desktop development, prefer `./scripts/test.sh ...` over manually
installing pytest into `.venv`. The desktop app syncs a runtime-only
environment, while this wrapper asks `uv` for the `dev` extra only when tests
are run.

Browse the [Roadmap](https://open-jarvis.github.io/OpenJarvis/development/roadmap/) for areas where help is needed. Comment **"take"** on any issue to get auto-assigned.

## About

OpenJarvis is part of [Intelligence Per Watt](https://www.intelligence-per-watt.ai/), a research initiative studying the intelligence efficiency of AI systems. The project is developed at [Hazy Research](https://hazyresearch.stanford.edu/) and the [Scaling Intelligence Lab](https://scalingintelligence.stanford.edu/) at [Stanford SAIL](https://ai.stanford.edu/).

## Sponsors

<p>
  <a href="https://www.laude.org/">Laude Institute</a> &bull;
  <a href="https://datascience.stanford.edu/marlowe">Stanford Marlowe</a> &bull;
  <a href="https://cloud.google.com/">Google Cloud Platform</a> &bull;
  <a href="https://lambda.ai/">Lambda Labs</a> &bull;
  <a href="https://ollama.com/">Ollama</a> &bull;
  <a href="https://research.ibm.com/">IBM Research</a> &bull;
  <a href="https://hai.stanford.edu/">Stanford HAI</a>
</p>

## Citation
```bibtex
@misc{saadfalcon2026openjarvispersonalaipersonal,
      title={OpenJarvis: Personal AI, On Personal Devices},
      author={Jon Saad-Falcon and Avanika Narayan and Robby Manihani and Tanvir Bhathal and Herumb Shandilya and Hakki Orhun Akengin and Gabriel Bo and Andrew Park and Matthew Hart and Caia Costello and Chuan Li and Christopher Ré and Azalia Mirhoseini},
      year={2026},
      eprint={2605.17172},
      archivePrefix={arXiv},
      primaryClass={cs.LG},
      url={https://arxiv.org/abs/2605.17172},
}
```

## License

[Apache 2.0](LICENSE)
