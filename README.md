<p align="center">
  <img src="apps/web/public/icons/icon-192x192.png" alt="Tiê AI logo" width="96" />
</p>

<h1 align="center">Tiê AI</h1>

<p align="center">
  An open-source, AI-native, local-first video editor. A fork of OpenCut.
</p>

<p align="center">
  <a href="README.pt-BR.md">Leia em português</a>
</p>

---

Tiê AI is a video editor with an AI suite built in, packaged as a Windows
desktop app. The editor and the AI models run on your own computer, and your
projects stay there too. Each AI feature is a pack you install from the app,
and models download only when you choose them. The only parts that reach the
internet are the ones you turn on, such as a cloud LLM through
[OpenRouter](https://openrouter.ai/) or the GIF search from
[KLIPY](https://klipy.com/) (see [Privacy](#privacy)).

The interface is in Brazilian Portuguese. It is aimed at short-form video:
YouTube Shorts, Reels, TikTok and TikTok Shop sales videos.

Tiê AI is a fork of [OpenCut AI](https://github.com/Ekaanth/OpenCut-AI), which
is itself a fork of [OpenCut](https://github.com/OpenCut-app/OpenCut).

## Features

Editing (from OpenCut, extended):

- Multi-track timeline with video, audio, text and sticker tracks, a
  real-time canvas preview, transitions, effects, color filters and
  brightness/contrast/saturation adjustments.
- Text styles, including ransom-note cutouts and gradients.
- Right-click clip menu: split, copy, mute, detach audio, remove silences,
  hide, duplicate, delete.
- Export with format, resolution and quality settings, audio-only export
  (M4A, MP3, WAV) and loudness normalization to the social-media target
  (-14 LUFS).
- Brand kit: colors, fonts, logos and overlays.

AI features:

- **Transcription and captions**: speech to text with
  [faster-whisper](https://github.com/SYSTRAN/faster-whisper), automatic
  captions.
- **Voice cloning and narration**: record or upload 10 to 15 seconds of
  speech and clone the voice with Chatterbox Multilingual, running on your
  GPU. Type a text and get it spoken by a cloned or stock voice, then add it
  to the timeline or download it as MP3 or WAV.
- **AI Studio**: a chat that knows the open project, plus tools for scripts,
  ideas, B-roll, dubbing, background removal, chapters and reframing. The
  chat can answer "where is X?" and open that place in the interface.
- **Create video with AI**: builds a whole video from a topic, with stock
  footage from Pexels and Wikimedia Commons.
- **Podcast clips**: finds the best moments of a long video to turn into
  short clips.
- **Virality score and TikTok Shop compliance check**: scores the video and
  checks frames plus transcript against TikTok Shop rules, through the active
  vision model.
- **Search in the video**: finds moments by what is shown, using CLIP
  embeddings computed locally.
- **AI video generation**: clips from text or an image, through Replicate or
  PiAPI with your own key.
- **GIFs and stickers**: animated arrows, "click here" buttons and reactions
  from KLIPY, plus a TikTok Shop element kit, stickers and emojis.
- **Speaker diarization** (who speaks when, plus the emotion of the speech),
  **face tracking** for 9:16 reframing, **local translation** and **local
  image generation**, each in its own service.
- **Local models, picked where they are used**: the transcription model in
  Captions and the image model in Tiê Image, each showing its size, the video
  memory it needs, whether it is downloaded and which one suits your PC.
  "Configuração de IA" lists the downloaded models so you can free the space.

In development:

- **Hybrid scene search** over transcripts (lexical + semantic). It is not
  part of this branch yet.

## Architecture

```
Tiê AI desktop app (Electron, apps/desktop)
  └─ Next.js editor (apps/web), standalone server on 127.0.0.1:3100
       ├─ projects and media: the app's storage (IndexedDB / OPFS)
       ├─ database: PGlite (embedded Postgres)
       ├─ KLIPY GIF search ─────────────────────────────► api.klipy.com
       └─ AI calls ──► ai-backend (FastAPI, :8420), the gateway
                          ├─ whisper-service    :8421  faster-whisper
                          ├─ tts-service        :8422  Coqui XTTS
                          ├─ image-service      :8423  diffusers, rembg
                          ├─ speaker-service    :8424  SpeechBrain (pyannote with an HF token)
                          ├─ face-service       :8425  MediaPipe
                          ├─ clip-service       :8426  CLIP embeddings
                          ├─ translate-service  :8427  NLLB-200
                          ├─ chatterbox-service :8428  voice cloning
                          ├─ turboquant-service :8430  local HF LLMs
                          └─ OpenRouter (optional) ──► openrouter.ai
```

The AI services come in **packs**, installed from "Configuração de IA" in
the app. Each pack is its own Python environment, made with
[uv](https://docs.astral.sh/uv/), because the services need different PyTorch
versions:

| Pack | Services | Uses the GPU |
|---|---|---|
| Base de IA | ai-backend, whisper-service | Yes (transcription) |
| Voz clonada | chatterbox-service | Yes |
| Imagem | image-service | Yes |
| Vozes prontas | tts-service | Yes |
| Falantes | speaker-service | Yes |
| Rosto | face-service | No |
| Tradução e busca | translate-service, clip-service | Yes |
| Chat local | turboquant-service | Yes |

Installed packs start with the app and stop with it. Everything listens on
`127.0.0.1` only. The app keeps its data in `%APPDATA%\Tiê AI`: the database,
the packs (`packs`), the downloaded models (`ai\models`), cloned voices and
logs.

The LLM is picked in the chat, under the message field: a free cloud model
through OpenRouter, or a local model from the "Chat local" pack. With
OpenRouter, paid models are blocked unless `OPENROUTER_ALLOW_PAID=true`. If a
cloud model fails, the backend tries the next free models and then the local
model. Ollama is not bundled; the backend still uses it if you run it
yourself on port 11434.

## Running it

### Requirements

- Windows 11.
- [Bun](https://bun.sh/), [uv](https://docs.astral.sh/uv/) and
  [FFmpeg](https://ffmpeg.org/) on the `PATH`.
- An NVIDIA GPU is recommended. The packs use PyTorch built for CUDA 12.8,
  which also covers RTX 50 cards. Without a GPU the features still run, slower.

### First time

```bash
git clone https://github.com/AlexandreLPA/tieia.git
cd tieia
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
bun install
node apps/desktop/build-web.js
```

`build-web.js` builds the editor for the app (in `apps/web/.next-desktop`).
Run it again after changing the web code.

### Daily use

```bash
apps/desktop/node_modules/electron/dist/electron.exe apps/desktop
```

A desktop shortcut to that command is the easiest way to open it. The first
time, open "Configuração de IA" and install the packs you want; each one
downloads its libraries once (2 to 8 GB). For a cloud LLM, create a key at
[openrouter.ai/keys](https://openrouter.ai/keys) and paste it in the app; it
is saved on your computer only.

### With Docker (older setup)

The services also run in Docker, which is how Tiê AI ran before the desktop
app. Docker runs the AI services, PostgreSQL and Redis, and a launcher serves
the editor on `127.0.0.1:3100`:

```bash
docker compose build
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1        # production build
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Stop  # editor and Docker services off

# Everything in Docker, editor included
docker compose --profile docker-web up -d --build web

# Turboquant and Chatterbox on the GPU
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

In this setup the LLM backend can also be set with `AI_LLM_BACKEND` in `.env`
(`auto`, `ollama`, `turboquant` or `openrouter`).

### Tests

```bash
bun test
cd services/ai-backend && python -m pytest   # needs requirements.txt and requirements-dev.txt installed
```

## Privacy

What stays on your computer:

- Your videos, images, audio and projects (the app's storage).
- Transcription, voice cloning, speech synthesis, diarization, face tracking,
  translation, image generation, CLIP search and the local LLM (TurboQuant,
  or Ollama if you run it).

What leaves it, and only when you use it:

| Feature | Destination | What is sent |
|---|---|---|
| Cloud LLM (a cloud model picked in the chat) | OpenRouter and the model's provider | Prompts, transcripts, the open project's context and, for the virality score and the TikTok Shop check, video frames |
| GIFs and stickers panel | KLIPY, called from the browser with your key | Search terms. Results are shown, not stored |
| Stickers, icons and fonts | Iconify, Google Fonts, called from the browser | Icon searches and font requests |
| Create video with AI | Pexels (your key), Wikimedia Commons | Search terms for stock media |
| YouTube links you paste | YouTube | A download request (yt-dlp) |
| AI video generation | Replicate or PiAPI (your key) | Prompt and source image |
| Sarvam AI / Smallest AI voices and transcription | Sarvam, Smallest (your key) | Text or audio |
| Sound search | Freesound (your key) | Search terms |
| Publishing to TikTok | TikTok, after you sign in | The exported video |
| Installing a pack or a model | PyPI, PyTorch's package index, Hugging Face | Download requests (no project data) |

With no keys set, no text, audio or video goes to an AI provider.

## Why the name

The tiê-sangue (*Ramphocelus bresilius*) is a bright red bird of the
Brazilian Atlantic Forest, a common sight in Rio de Janeiro. Tiê AI is the
tiê plus AI. The icon is the bird drawn in a single
white line on red, with a play button in its beak. Where accents are not
allowed (code, URLs, package names), the name is written `tieia`.

## License and credits

MIT. See [LICENSE](LICENSE), which keeps the copyright notices of the
projects Tiê AI comes from.

- [OpenCut](https://github.com/OpenCut-app/OpenCut), by the OpenCut
  contributors: the video editor at the core of Tiê AI.
- [OpenCut AI](https://github.com/Ekaanth/OpenCut-AI), by
  [Ekaanth](https://github.com/Ekaanth): the AI services and features built
  around OpenCut.

Tiê AI is maintained by [Alexandre](https://github.com/AlexandreLPA).
