<div align="center">
  <img alt="OpenJarvis" src="assets/OpenJarvis_Horizontal_Logo.png" width="400">

  <p><i>Personal AI, On Personal Devices.</i></p>

  <p>
    <a href="https://scalingintelligence.stanford.edu/blogs/openjarvis/"><img src="https://img.shields.io/badge/project-OpenJarvis-blue" alt="Project"></a>
    <a href="https://open-jarvis.github.io/OpenJarvis/"><img src="https://img.shields.io/badge/docs-mkdocs-blue" alt="Docs"></a>
    <img src="https://img.shields.io/badge/python-%3E%3D3.10-blue" alt="Python">
    <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License">
    <a href="https://discord.gg/YZZRxCAhmm"><img src="https://img.shields.io/badge/discord-join-7289da?logo=discord&logoColor=white" alt="Discord"></a>
  </p>
</div>

---

> **[Documentation](https://open-jarvis.github.io/OpenJarvis/)**
>
> **[Project Site](https://scalingintelligence.stanford.edu/blogs/openjarvis/)**
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
| Image uploads | The desktop chat can attach image files and display them as file artifacts, even though full visual understanding is not wired into this build yet. |
| Health/status panel | The system panel shows readiness for the backend API, Ollama, selected model, speech backend, Draw Things, and image folder permissions. |
| Settings polish | Settings can show the configured default model and active orchestrator tools exposed by the backend. |
| Safer development flow | Changes are kept as Git savepoints and verified with frontend builds, Python lint checks, and focused tests before pushing. |

### Try This Branch

This branch is not an official upstream release. It is best for macOS users who
want the desktop app experience with local Ollama, Draw Things, and MLX Whisper.

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

If you already have an installed app, keep a backup before replacing it:

```bash
mv /Applications/OpenJarvis.app /Applications/OpenJarvis.app.backup
ditto frontend/src-tauri/target/release/bundle/macos/OpenJarvis.app /Applications/OpenJarvis.app
open /Applications/OpenJarvis.app
```

The rest of this README is the original OpenJarvis project documentation.

## Why OpenJarvis?

Personal AI agents are exploding in popularity, but nearly all of them still route intelligence through cloud APIs. Your "personal" AI continues to depend on someone else's server. At the same time, our [Intelligence Per Watt](https://www.intelligence-per-watt.ai/) research showed that local language models already handle 88.7% of single-turn chat and reasoning queries, with intelligence efficiency improving 5.3× from 2023 to 2025. The models and hardware are increasingly ready. What has been missing is the software stack to make local-first personal AI practical.

OpenJarvis is that stack. It is an opinionated framework for local-first personal AI, built around three core ideas: shared primitives for building on-device agents; evaluations that treat energy, FLOPs, latency, and dollar cost as first-class constraints alongside accuracy; and a learning loop that improves models using local trace data. The goal is simple: make it possible to build personal AI agents that run locally by default, calling the cloud only when truly necessary. OpenJarvis aims to be both a research platform and a production foundation for local AI, in the spirit of PyTorch.

## Installation

### Prerequisites

| Tool | Install |
|------|---------|
| **Python 3.10+** | [python.org](https://www.python.org/downloads/) |
| **uv** (Python package manager) | `curl -LsSf https://astral.sh/uv/install.sh \| sh` — or `brew install uv` on macOS |
| **Rust** | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Git** | [git-scm.com](https://git-scm.com/) — or `brew install git` on macOS |

> **macOS users:** see the full [macOS Installation Guide](https://open-jarvis.github.io/OpenJarvis/getting-started/macos/) for a step-by-step walkthrough including Homebrew setup.

### Setup

```bash
git clone https://github.com/open-jarvis/OpenJarvis.git
cd OpenJarvis
uv sync                           # core framework
uv sync --extra server             # + FastAPI server

# Build the Rust extension
uv run maturin develop -m rust/crates/openjarvis-python/Cargo.toml
```

> **Python 3.14+:** set `PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1` before the `maturin` command.

You also need a local inference backend: [Ollama](https://ollama.com), [vLLM](https://github.com/vllm-project/vllm), [SGLang](https://github.com/sgl-project/sglang), or [llama.cpp](https://github.com/ggerganov/llama.cpp). Alternatively, use the `cloud` engine with [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), [Google Gemini](https://ai.google.dev), [OpenRouter](https://openrouter.ai), or [MiniMax](https://www.minimax.io) by setting the corresponding API key environment variable.

## Quick Start

```bash
# 1. Install and detect hardware
git clone https://github.com/open-jarvis/OpenJarvis.git
cd OpenJarvis
uv sync
uv run maturin develop -m rust/crates/openjarvis-python/Cargo.toml   # required for memory + security features
uv run jarvis init

# 2. Start Ollama and pull a model
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull qwen3.5:4b   # CPU-friendly default; use qwen3.5:9b or larger if you have a GPU

# 3. Ask a question
uv run jarvis ask "What is the capital of France?"
```

`jarvis init` auto-detects your hardware and recommends the best engine and model size. Run `uv run jarvis doctor` at any time to diagnose issues.

## Starter Configs

Install any preset with one command:

```bash
uv run jarvis init --preset morning-digest-mac   # or any preset below
```

> Prefix every `jarvis ...` invocation with `uv run`, or activate the venv first (`source .venv/bin/activate`) so plain `jarvis ...` works for the rest of your shell session.

| Preset | Use Case | What it does |
|--------|----------|-------------|
| `morning-digest-mac` | Daily Briefing (Mac) | Spoken briefing from email, calendar, health, news with Jarvis voice |
| `morning-digest-linux` | Daily Briefing (Linux) | Same, with vLLM support for GPU servers |
| `morning-digest-minimal` | Daily Briefing (minimal) | Just Gmail + Calendar, runs on any machine |
| `deep-research` | Research Assistant | Multi-hop research across indexed docs with citations |
| `code-assistant` | Code Companion | Agent with code execution, file I/O, and shell access |
| `scheduled-monitor` | Persistent Monitor | Stateful agent that runs on a schedule with memory |
| `chat-simple` | Simple Chat | Lightweight conversation, no tools needed |

```bash
# Example: Morning Digest on Mac
uv run jarvis init --preset morning-digest-mac
uv run jarvis connect gdrive          # one OAuth flow covers Gmail, Calendar, Tasks
uv run jarvis digest --fresh          # generate and play your first briefing

# Example: Deep Research
uv run jarvis init --preset deep-research
uv run jarvis memory index ./docs/    # requires the Rust extension — see Setup above
uv run jarvis ask "Summarize all emails about Project X"
```

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

## Contributing

We welcome contributions! See the [Contributing Guide](CONTRIBUTING.md) for incentives, contribution types, and the PR process.

Quick start for contributors:

```bash
git clone https://github.com/open-jarvis/OpenJarvis.git
cd OpenJarvis
uv sync --extra dev
uv run pre-commit install
uv run pytest tests/ -v
```

Browse the [Roadmap](https://open-jarvis.github.io/OpenJarvis/development/roadmap/) for areas where help is needed. Comment **"take"** on any issue to get auto-assigned.

## About

OpenJarvis is part of [Intelligence Per Watt](https://www.intelligence-per-watt.ai/), a research initiative studying the efficiency of on-device AI systems. The project is developed at [Hazy Research](https://hazyresearch.stanford.edu/) and the [Scaling Intelligence Lab](https://scalingintelligence.stanford.edu/) at [Stanford SAIL](https://ai.stanford.edu/).

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
@misc{saadfalcon2026openjarvis,
  title={OpenJarvis: Personal AI, On Personal Devices},
  author={Jon Saad-Falcon and Avanika Narayan and Herumb Shandilya and Hakki Orhun Akengin and Robby Manihani and Gabriel Bo and John Hennessy and Christopher R\'{e} and Azalia Mirhoseini},
  year={2026},
  howpublished={\url{https://scalingintelligence.stanford.edu/blogs/openjarvis/}},
}
```

## License

[Apache 2.0](LICENSE)
