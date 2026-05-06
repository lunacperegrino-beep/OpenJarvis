# Luna Desktop Assistant Roadmap

This roadmap captures the OpenClaw-inspired direction for Luna's desktop-focused
OpenJarvis fork. The goal is not to copy OpenClaw's broad channel/platform
surface. The goal is to keep OpenJarvis strong as a polished local desktop app,
then add carefully chosen always-on assistant capabilities.

## Product Direction

Keep the fork centered on a local-first macOS desktop experience:

- Make the app feel like a dependable desktop cockpit for chat, artifacts,
  transcription, images, local models, and system readiness.
- Add an optional always-on assistant mode for background tasks and phone access.
- Increase agent autonomy through explicit permission tiers, task history, and
  model escalation suggestions.
- Prefer a curated workflow library over a large unreviewed marketplace.

## Priority Features

### Always-On Assistant Mode

Add a mode where OpenJarvis can keep running in the background, receive tasks,
send progress updates, and resume work across app restarts.

Expected behavior:

- A clear on/off toggle in the desktop app.
- A visible status indicator when the assistant is listening or working.
- A local task queue for pending, running, completed, failed, and waiting-for-user
  tasks.
- Notifications when a task completes or needs approval.
- Autonomy settings that define what the assistant can do without asking.

Guardrail:

- This mode should be opt-in and easy to pause. The app should never silently
  become a remote-control surface for powerful tools.

### Messaging App Access

Let the user reach the local assistant from a phone through a free or low-cost
messaging channel.

Recommended order:

1. Telegram: best first target because bot setup is free, common, and relatively
   simple.
2. Signal: stronger privacy story, but usually more setup friction through
   `signal-cli`.
3. WhatsApp: useful, but the official Meta Cloud API path has business-account
   friction and unofficial bridges are fragile.

Expected behavior:

- Pair a messaging account from the desktop app.
- Send tasks to Jarvis from the phone.
- Receive task status, completion summaries, and artifact links/previews.
- Require pairing/allowlist checks so unknown senders cannot control the agent.

### More Agentic Autonomy

Increase the assistant's ability to complete multi-step tasks while making
permissions clear.

Suggested permission tiers:

- Observe: read context and answer questions.
- Draft: prepare messages, files, summaries, or plans, but do not send or modify.
- Ask before acting: execute actions only after user approval.
- Autopilot allowlist: execute approved workflow/tool combinations without
  approval.

Initial autonomy targets:

- Run transcript post-processing workflows in the background.
- Generate images and save artifacts without blocking chat.
- Prepare summaries, action items, and follow-up drafts.
- Monitor a folder or chat thread and create a task when new files arrive.

### Local-First Cloud Escalation Advisor

OpenJarvis already has local and cloud engines, plus a heuristic query complexity
analyzer. Today that analyzer scores a query using signals such as length, code,
math, reasoning, multi-step structure, and creative generation, then routes among
models available on the active engine.

The missing desktop feature is an explicit escalation advisor:

- Score each request before generation.
- Estimate whether the selected local model is likely to struggle.
- Show a small suggestion such as "This looks complex. Use GPT-5.4 / Claude Opus
  / OpenRouter for this one?"
- Include estimated cost, privacy warning, and reason for the suggestion.
- Let the user choose once, always for this workflow, or stay local.

Escalation should consider:

- Complexity tier from the existing router.
- Task type: coding, legal/medical drafting, research synthesis, long documents,
  multi-file edits, ambiguous planning, or high-stakes reasoning.
- Context sensitivity: transcripts, health details, private files, API keys, and
  personal messages should default to local unless the user explicitly approves.
- Previous failure signals: repeated loops, low-confidence answers, tool errors,
  or user corrections.

### Background Task History

Add a durable task history view so the user can see what Jarvis did while working
in the background.

Each task record should show:

- User request and source channel.
- Status: queued, running, waiting, completed, failed, canceled.
- Model and engine used.
- Tools called and artifacts produced.
- Runtime, token usage, estimated cost, and local/cloud route.
- Approval prompts and user decisions.
- Error messages and retry history.

This should be user-facing, not just raw logs. Raw traces can remain available
behind a disclosure control for debugging.

### Curated Skills And Workflows

Build a small reviewed library of useful workflows instead of chasing a large
skills marketplace.

Initial curated workflows:

- Meeting/transcript studio: speakers, summary, action items, cleanup,
  translation, Markdown export.
- Medical appointment prep: organize notes, questions, symptoms, and follow-ups
  from transcripts or files.
- Image generation studio: prompt polish, generate, regenerate, compare, reveal,
  and archive images.
- Research brief: collect sources, summarize with citations, and create an
  artifact.
- Daily brief: calendar/tasks/weather/news summary with local-first routing.
- File organizer: classify dropped files and suggest folders before moving.
- GitHub release helper: changelog, release notes, build checklist, and upload
  verification.

Workflow requirements:

- Each workflow should explain what it can access.
- Risky actions should require approval.
- Workflows should produce artifacts that appear in the Artifacts page.
- The desktop UI should make workflow status obvious.

## Design Principle

OpenClaw's strength is breadth: channels, plugins, daemon, background automation,
and tool reach. This fork should aim for trust and polish: fewer workflows, better
visibility, clear permissions, local-first defaults, and desktop artifacts that
make the result easy to inspect.
