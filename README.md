<div align="center">

<img src="images/human.png" alt="Rocky" width="260" />

# Rocky

A desktop assistant for understanding neural network architectures — paper-grounded, not generic.

Short sentences. No filler. Dry humour. Occasional: *fist my bump*. Frequent: *dirty, dirty, dirty* when tensors misbehave.

[![Latest Release](https://img.shields.io/github/v/release/dev-ansh-r/rocky?style=flat-square&label=download&color=d97706)](https://github.com/dev-ansh-r/rocky/releases/latest)

</div>

## Download

Pre-built installers — no Python, no Rust, no nonsense.

| Platform | File | Notes |
| -------- | ---- | ----- |
| Windows | `.msi` or `.exe` | x86-64. Run installer, open Rocky. |
| macOS | `.dmg` | Apple Silicon (M1+). Drag to Applications. |
| Linux | `.AppImage` or `.deb` | x86-64. AppImage: `chmod +x`, run directly. |

→ **[Releases page](https://github.com/dev-ansh-r/rocky/releases/latest)**

Older builds: [all releases](https://github.com/dev-ansh-r/rocky/releases).

## Demo

<!-- Replace the URL below with your YouTube, Loom, or GitHub-hosted video link -->
[▶ Watch demo](https://github.com/dev-ansh-r/rocky/releases)

## Why

Ask any LLM *"why is this 1×1 Conv here?"* and you’ll get a polite lecture. Correct. Soulless.

Rocky is different. It inspects your actual graph. Detects motifs. Attaches paper-grounded rationale. Feeds that into your chosen LLM.

No hallucination. No vibes-only answers. Just your model, explained like it deserves.

When something looks wrong? Rocky says it. *Dirty, dirty, dirty.*

## Features

- **Open any ONNX file.** Local only. No uploads. No spying. Relax.
- **Click-to-inspect.** Every node. Every tensor. Shapes don’t lie.
- **Chat in the same window.** Anthropic, OpenAI, Gemini. Your key stays yours.
- **Motif detection.** Inverted residuals, SE blocks, attention heads. Named. Explained. Cited.
- **Context injection.** Your model becomes the prompt. Finally.
- **Dark workspace.** Because blinding white UIs are a crime.

## What Rocky sounds like

> **You:** hey rocky  
> **Rocky:** *fist my bump* MobileNetV2. 209 nodes. 3.5M params. Ready.  
>
> **You:** why such a big expand ratio on this block?  
> **Rocky:** Inverted residual. Expansion 6×. Standard MobileNetV2.  
> Low-dim manifold stays thin. Conv happens wide. Project back linear.  
> ReLU on the thin tensor? *Dead signal.* Don’t do that.  
> Sandler 2018, §3.3.

No fake enthusiasm. No padding. When it’s standard, Rocky says so. When it’s weird, Rocky squints at it like it owes him money.

## Quick start

### Prerequisites

- Python 3.10+
- Node.js 20+
- Rust 1.85+
- Windows: C++ Build Tools (yes, you need them, no, we can’t escape it)

### Install backend

```bash
pip install -e .
```

### Install frontend

```bash
cd rocky/ui
npm install
```

### Run dev

```bash
cd rocky/ui
npx tauri dev
```

First run: slow. Compiling everything. Be patient. Or don’t. It won’t go faster.

### Build release

The Python backend is bundled into the installer as a sidecar binary (PyInstaller),
so end users don't need Python installed.

```bash
# one-time: install PyInstaller into the same Python rocky is installed in
pip install -e ".[sidecar]"

# build the sidecar for your current platform
python scripts/build_sidecar.py

# build the Tauri installer (picks up the sidecar automatically)
cd rocky/ui
npx tauri build
```

Rebuild the sidecar whenever Python code under `rocky/` changes. CI does this
automatically — see [`.github/workflows/release.yml`](.github/workflows/release.yml).

## First-time setup

1. Open settings (gear icon).
2. Pick provider.
3. Paste API key.
4. Stored in OS keyring. Not your filesystem. Not ours. Not anyone’s.
5. Load `.onnx`.
6. Click node.
7. Ask something actually interesting.

If the key disappears? *Dirty, dirty, dirty.* Re-add it.

## Architecture

```
Tauri (Rust)
 ├─ Window + keyring + sidecar
React (TS)
 ├─ Graph + inspector + chat
Python (FastAPI)
 ├─ Parser + motifs + LLM adapters
```

Everything runs local. 127.0.0.1. No mysterious cloud detours.

## REST API

| Endpoint | Purpose |
|----------|--------|
| POST /api/load | Load model |
| GET /api/summary | Stats |
| GET /api/graph | Nodes + edges |
| GET /api/node | Node detail |
| GET /api/motifs | Detected patterns |
| POST /api/chat | Streaming chat |
| GET /api/health | Sanity check |

## Adding a motif

1. Write detector.
2. Register it.
3. Add knowledge entry.
4. Reload model.

If it works: nice.
If it doesn’t: *dirty, dirty, dirty.* Fix your logic.

## Privacy

- Keys → OS keyring
- Models → local only
- Calls → direct to provider
- Tracking → none

No hidden nonsense. If something leaks, it’s not Rocky. It’s you.

## Roadmap

- More motifs
- UI highlighting
- Tool-calling
- More formats
- Installers

Slowly. Properly. Not rushed garbage.

## Troubleshooting

**Key missing**  
Re-add it. Yes, again.

**Backend dead**  
Check install. Run CLI manually. Basic stuff.

**Linux keyring issues**  
No secret service. No storage. Not magic.

## License

MIT © 2026 Devansh

---

<div align="center">

<img src="images/projmary.png" alt="Project Hail Mary" width="110" />

<sub>Inspired by stubborn engineering, impossible problems, and not panicking when things go *dirty, dirty, dirty*.</sub>

</div>

---

Built for people who stare at graphs too long and start asking better questions.

*fist my bump* if that’s you.

