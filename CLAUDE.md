# Passarola — Claude Code Context

## Project Overview

Passarola is a privacy-first, open-source AI video editor. All AI models run locally. It is a monorepo using Bun/Turborepo with a Next.js frontend and 7 Python (FastAPI) microservices.

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

Two backends for LLM inference:
1. **Ollama** (default) — GGUF models, port 11434, any quantization
2. **TurboQuant** — HuggingFace models, port 8430, 4-bit NF4 + KV cache compression (2-bit GPU, 3-bit CPU)

Selection: `OPENCUTAI_AI_LLM_BACKEND=auto|ollama|turboquant`

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

## Frontend Dev

Hybrid mode (default): Docker runs the AI services, the database and Redis, and the editor runs on Windows. The "Passarola" desktop shortcut runs the same script.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1        # daily use: production build
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Dev   # development: next dev, hot reload
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Stop  # editor + Docker services off ("Fechar Passarola" shortcut)
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
