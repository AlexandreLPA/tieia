# Tiê AI — Claude Code Context

## Project Overview

Tiê AI is a local-first, open-source AI video editor. Editing and the AI models (Whisper, Chatterbox, Coqui XTTS, diffusers, pyannote, MediaPipe, the local LLMs) run on the machine; cloud services are opt-in: LLMs through OpenRouter with the user's own key, the KLIPY GIF search, and the cloud TTS and video-generation providers. It is a monorepo using Bun/Turborepo with a Next.js frontend and 7 Python (FastAPI) microservices.

## Architecture

- **Frontend:** `apps/web/` — Next.js 16, TypeScript, TailwindCSS, Zustand
- **AI Backend:** `services/ai-backend/` — FastAPI, port 8420, the main API gateway
- **TurboQuant Service:** `services/turboquant-service/` — FastAPI, port 8430, HuggingFace LLM inference with KV cache compression
- **Whisper Service:** `services/whisper-service/` — port 8421, faster-whisper
- **TTS Service:** `services/tts-service/` — port 8422, Coqui TTS
- **Chatterbox Service:** `services/chatterbox-service/` — port 8428, Chatterbox Multilingual voice cloning (torch 2.8 / CUDA 12.8, apart from tts-service; GPU via `docker-compose.gpu.yml`)
- **Image Service:** `services/image-service/` — port 8423, diffusers
- **Speaker Service:** `services/speaker-service/` — port 8424, pyannote
- **Face Service:** `services/face-service/` — port 8425, MediaPipe

## LLM Backend System

Three backends for LLM inference (`services/ai-backend/app/services/model_backend.py`):
1. **Ollama** — local GGUF models, port 11434, any quantization
2. **TurboQuant** — local HuggingFace models, port 8430, 4-bit NF4 + KV cache compression (2-bit GPU, 3-bit CPU)
3. **OpenRouter** — cloud LLMs with the user's `OPENROUTER_API_KEY`. Only `:free` models run unless `OPENROUTER_ALLOW_PAID=true`; when a text request to the cloud fails it falls back to the local model (requests with images do not)

The OpenRouter key comes from `.env` or from the editor (first-run steps and "Gerenciar serviços de IA", `POST /api/llm/openrouter-key`). A key typed in the editor is saved in `/app/models/secrets.json` and overrides `.env`; it must never go under `/app/generated`, which the backend serves over HTTP.

Selection: `OPENCUTAI_AI_LLM_BACKEND=auto|ollama|turboquant|openrouter` (`.env`: `AI_LLM_BACKEND`). The default is `auto`: TurboQuant when it has a model loaded, otherwise Ollama. OpenRouter is used when `AI_LLM_BACKEND=openrouter` or when a cloud model is picked in the editor ("Gerenciar serviços de IA"); that choice is saved in `/app/generated/llm-runtime.json` and overrides `.env`.

## Supported Model Families

### LLM (Ollama GGUF — 3 tiers)

| Tier | RAM | Models |
|------|-----|--------|
| Lite | 4-8 GB | Llama 3.2 1B Q4, **Kimi K2 Q3**, Llama 3.2 3B Q3 |
| Standard | 8-16 GB | Llama 3.2 3B Q4, **Kimi K2 Q4**, Gemma 4 E2B (5B) Q4, Mistral 7B Q4 |
| Pro | 16-32+ GB | Llama 3.1 8B Q4, **Kimi K2 Q5**, Gemma 4 E4B (8B) Q4, Gemma 4 26B MoE Q4, Gemma 4 31B Dense Q4, Llama 3.1 8B Q3 TurboQuant |

### LLM (TurboQuant HuggingFace — 4-bit NF4)

| Family | Models | Tier |
|--------|--------|------|
| **Kimi (MoonshotAI)** | `moonshotai/Kimi-K2-Instruct` (1T/32B active MoE, 22GB 4-bit, validated=False — GPU only), `moonshotai/Kimi-VL-A3B-Instruct` (3B active, 2.5GB 4-bit, turboquant_validated=True), `moonshotai/Kimi-VL-A3B-Thinking` (3B active, chain-of-thought, validated=False) | Pro / Standard |
| Llama | Llama 3.2 1B/3B, 3.1 8B | Lite/Standard/Pro |
| Mistral | Mistral 7B v0.3 | Standard |
| Phi | Phi 3.5 Mini (3.8B) | Standard |
| Gemma | Gemma 2 2B, Gemma 4 E2B/E4B/26B/31B | Standard/Pro |
| Qwen2.5 | 0.5B–14B Instruct, Coder 3B/7B (3B turboquant_validated=True) | Lite/Standard/Pro |

## Key Files

| File | Purpose |
|------|---------|
| `services/ai-backend/app/services/model_registry.py` | OLLAMA_MODEL_TIERS (Ollama GGUF), TURBOQUANT_HF_MODELS (HuggingFace), hardware detection, tier recommendation |
| `services/turboquant-service/app.py` | MODEL_CATALOG (22+ HF models), ModelManager, FastAPI inference endpoints |
| `apps/web/src/constants/turboquant-constants.ts` | Frontend MODEL_TIERS, KV_CACHE_CONFIGS, MEMORY_BUDGETS |
| `apps/web/src/app/models/page.tsx` | Public-facing model catalog page |
| `apps/web/src/components/editor/panels/assets/views/settings.tsx` | Settings panel with AI optimization section |
| `apps/web/src/components/editor/ai/model-wizard.tsx` | Model setup wizard (4-step: welcome → tier → download → done) |
| `apps/web/src/lib/editor-ui-map.ts` | Where each feature lives in the UI. The AI chat answers "where is X?" from it and its "Mostrar" button opens the place; add new features here, with a `data-ui-target` on the control |
| `services/ai-backend/app/config.py` | Pydantic settings, env prefix OPENCUTAI_ |
| `docker-compose.yml` | Main stack (CPU mode) |
| `docker-compose.gpu.yml` | GPU override for turboquant-service |

## Kimi Model Integration (added 2026-04-22)

MoonshotAI Kimi models are fully supported throughout:

### Ollama (GGUF) — pull from Ollama registry
- `kimi-k2:latest` — Q3_K_M ~1.4GB → Lite tier
- `kimi-k2:q4_K_M` — Q4_K_M ~3.0GB → Standard tier
- `kimi-k2:q5_K_M` — Q5_K_M ~7.0GB → Pro tier

### TurboQuant (HuggingFace) — download via `/api/turboquant/models/download`
- `moonshotai/Kimi-K2-Instruct` — 1T total/32B active MoE, 22GB 4-bit → Pro/GPU tier
- `moonshotai/Kimi-VL-A3B-Instruct` — 3B active multimodal, 2.5GB 4-bit → Standard tier (turboquant_validated=True)
- `moonshotai/Kimi-VL-A3B-Thinking` — 3B active + CoT reasoning → Standard tier

### Docker env vars for Kimi
```bash
# Ollama with Kimi K2 Standard tier:
OLLAMA_DEFAULT_MODEL=kimi-k2:q4_K_M docker compose up -d

# TurboQuant with Kimi VL A3B (CPU/GPU):
TURBOQUANT_MODEL=moonshotai/Kimi-VL-A3B-Instruct docker compose up -d

# Kimi K2 on GPU (requires 24+ GB VRAM):
TURBOQUANT_MODEL=moonshotai/Kimi-K2-Instruct docker compose \
  -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

## Package Management

All Python services use `uv` (Astral). Install with `uv pip install --system --no-cache -r requirements.lock`. Never use pip directly in Dockerfiles.

## Desktop App (replacing Docker, migration in progress)

`apps/desktop` is an Electron app; the "Tiê AI" desktop shortcut opens it (`apps/desktop/node_modules/electron/dist/electron.exe apps/desktop`). The goal is to drop Docker: until every AI feature has its pack, the rest still runs in Docker.

- **Editor:** `node apps/desktop/build-web.js` builds a standalone Next.js server into `apps/web/.next-desktop` (its own folder, apart from the launcher's `.next`). The app runs it with Electron's Node on port **3100** and stops the launcher's editor if it is on that port. Rebuild after changing web code.
- **Data:** everything in `%APPDATA%\Tiê AI` — `db` (PGlite, an embedded Postgres; Drizzle migrations run at startup in `src/instrumentation.ts`), `packs`, `ai` (generated files, uploads, models, `secrets.json`, service logs), `editor.log`.
- **Desktop mode** (`OPENCUT_DESKTOP=1`, `src/lib/desktop.ts`): no Postgres or Redis; auth and rate limits use memory. Routes under `/api/desktop/*` only answer there.
- **Projects from Edge:** the app's browser storage is apart from Edge's. `/migrar` (opened in Edge by the card on the projects list) sends a copy of every IndexedDB database, OPFS file and localStorage entry; the app imports it (`src/lib/desktop-migration`).
- **AI packs** (`src/lib/desktop-packs`): one uv-made Python environment per pack in `packs/<id>`, installed from a card in "Configuração de IA" and started by the editor's server when it starts (they stop with the app). A pack lists its requirements files and services; services get their folders, ports and the CORS origin through env vars, the OpenRouter key comes from the repo `.env`. Packs can't share one environment: the services pin different torch versions (Chatterbox 2.8, Coqui 2.5, the others 2.11).
  - **Done:** `base` = ai-backend + whisper-service (cloud chat and GPU transcription); `voice` = chatterbox-service (torch 2.8 cu128 via `overrides.txt` and PyTorch's index; voices in `ai/chatterbox/voices`).
  - **Still in Docker:** TTS, image, speaker, face, translate, CLIP, Ollama, TurboQuant.
  - For now the packs use `uv` and `ffmpeg` from the user's PATH; an installer must bundle both.

## Frontend Dev (Docker launcher)

Hybrid mode: Docker runs the AI services, the database and Redis, and the editor runs on Windows. The "Tiê AI (Docker)" desktop shortcut runs the same script.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1        # daily use: production build
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Dev   # development: next dev, hot reload
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Stop  # editor + Docker services off ("Fechar Tiê AI" shortcut)
```

- **Dependencies:** when `bun.lock` or a `package.json` changes, the launcher runs `bun install --frozen-lockfile` first.
- **Editor process:** runs hidden and listens on 127.0.0.1 only. Its output goes to `%LOCALAPPDATA%\OpenCut-AI\editor.log`. `-NoBrowser` starts it without opening a window.

- **Default mode:** serves a native production build (`next start`).
  - It rebuilds (about 30 s) only when the editor's code fingerprint changed: the committed and uncommitted contents of `apps/web`, `packages`, `package.json` and `bun.lock`. Docs or AI-service changes don't count.
  - If the build fails, it falls back to dev mode.
  - State lives in `%LOCALAPPDATA%\OpenCut-AI\launcher.json`.
- **After changing web code:** clicking the shortcut again restarts the editor on a fresh build.
- **Port:** the editor must stay on **3100**, because projects live in the browser's storage per address.
- **Docker:** `docker compose up -d` no longer starts the `web` container (it has the `docker-web` profile). For the all-Docker setup, use `docker compose --profile docker-web up -d --build web`.
- **Backend changes** still need `docker compose up -d --build ai-backend`.

## GPU Support

NVIDIA only via nvidia-docker. GPU override: `docker-compose.gpu.yml`. The turboquant-service auto-detects CUDA → MPS → CPU. GPU uses 2-bit KV compression (cuTile kernels), CPU uses 3-bit (PyTorch fallback).
