<p align="center">
  <img src="apps/web/public/icons/icon-192x192.png" alt="TiêIA logo" width="96" />
</p>

<h1 align="center">TiêIA</h1>

<p align="center">
  An open-source, AI-native, local-first video editor. A fork of OpenCut.
</p>

<p align="center">
  <a href="README.pt-BR.md">Leia em português</a>
</p>

---

TiêIA is a browser-based video editor with an AI suite built in. The editor
runs on your own computer, the AI models run in Docker containers on your own
computer, and your projects stay in your browser's storage. The only parts
that reach the internet are the ones you turn on, such as a cloud LLM through
[OpenRouter](https://openrouter.ai/) or the GIF search from
[KLIPY](https://klipy.com/) (see [Privacy](#privacy)).

The interface is in Brazilian Portuguese. It is aimed at short-form video:
YouTube Shorts, Reels, TikTok and TikTok Shop sales videos.

TiêIA is a fork of [OpenCut AI](https://github.com/Ekaanth/OpenCut-AI), which
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
- **Speaker diarization**, **face tracking** for 9:16 reframing, **local
  translation** and **local image generation**, each in its own service.

In development:

- **Hybrid scene search** over transcripts (lexical + semantic). It is not
  part of this branch yet.

## Architecture

```
Browser (Edge app window, http://localhost:3100)
  └─ Next.js editor (apps/web), runs natively on Windows, 127.0.0.1 only
       ├─ projects and media: browser storage (IndexedDB / OPFS)
       ├─ KLIPY GIF search ─────────────────────────────► api.klipy.com
       └─ AI calls ──► ai-backend (FastAPI, :8420), the gateway
                          ├─ whisper-service    :8421  faster-whisper (GPU)
                          ├─ tts-service        :8422  Coqui TTS
                          ├─ image-service      :8423  diffusers
                          ├─ speaker-service    :8424  pyannote
                          ├─ face-service       :8425  MediaPipe
                          ├─ clip-service       :8426  CLIP embeddings
                          ├─ translate-service  :8427  NLLB-200
                          ├─ chatterbox-service :8428  voice cloning (GPU)
                          ├─ turboquant-service :8430  local HF LLMs
                          ├─ ollama             :11434 local GGUF LLMs
                          └─ OpenRouter (optional) ──► openrouter.ai
Docker also runs PostgreSQL and Redis.
```

Everything in Docker publishes its ports on `127.0.0.1` only.

The LLM backend is chosen with `AI_LLM_BACKEND` in `.env`:

| Value | What runs |
|---|---|
| `auto` (default) | TurboQuant locally, falling back to Ollama |
| `ollama` | Ollama locally (GGUF models) |
| `turboquant` | TurboQuant service locally (Hugging Face models, 4-bit, compressed KV cache) |
| `openrouter` | A cloud model through OpenRouter, with your own API key |

With OpenRouter, paid models are blocked unless `OPENROUTER_ALLOW_PAID=true`.
If a model fails, the backend tries the next free models.

## Running it

### Requirements

- Windows 11 with [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  (WSL 2 backend).
- [Bun](https://bun.sh/).
- An NVIDIA GPU with the NVIDIA container support enabled in Docker Desktop.
  `docker-compose.yml` reserves the GPU for the Whisper service
  (`WHISPER_DEVICE=cuda`), and Chatterbox uses it through
  `docker-compose.gpu.yml`.

### First time

```bash
git clone https://github.com/AlexandreLPA/tieia.git
cd tieia
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

To use a cloud LLM, create a key at
[openrouter.ai/keys](https://openrouter.ai/keys) and set it in `.env`
(never commit this file):

```env
AI_LLM_BACKEND=openrouter
OPENROUTER_API_KEY=<your key>
```

Then build the AI services once:

```bash
docker compose build
```

### Daily use (hybrid mode)

The launcher starts Docker Desktop if needed, brings up the AI services, the
database and Redis, builds the editor when its code changed (about 30 s), and
serves it hidden on `127.0.0.1:3100`. Then it opens an Edge app window.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1        # production build
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Dev   # next dev, hot reload
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Stop  # editor and Docker services off
```

- The editor's log goes to `%LOCALAPPDATA%\OpenCut-AI\editor.log`.
- `-NoBrowser` starts it without opening a window.
- Keep port **3100**: projects live in the browser's storage per address, so
  another port shows an empty project list.
- A desktop shortcut can run the same command; `-Stop` makes a "close"
  shortcut.

### Other ways to run

```bash
# Everything in Docker, editor included
docker compose --profile docker-web up -d --build web

# Rebuild the backend after changing it
docker compose up -d --build ai-backend

# Turboquant and Chatterbox on the GPU
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

### Tests

```bash
bun test
cd services/ai-backend && python -m pytest   # needs requirements.txt and requirements-dev.txt installed
```

## Privacy

What stays on your computer:

- Your videos, images, audio and projects (browser storage).
- Transcription, voice cloning, speech synthesis, diarization, face tracking,
  translation, image generation, CLIP search and the local LLMs (Ollama,
  TurboQuant).

What leaves it, and only when you use it:

| Feature | Destination | What is sent |
|---|---|---|
| Cloud LLM (`AI_LLM_BACKEND=openrouter`) | OpenRouter and the model's provider | Prompts, transcripts, the open project's context and, for the virality score and the TikTok Shop check, video frames |
| GIFs and stickers panel | KLIPY, called from the browser with your key | Search terms. Results are shown, not stored |
| Stickers, icons and fonts | Iconify, Google Fonts, called from the browser | Icon searches and font requests |
| Create video with AI | Pexels (your key), Wikimedia Commons | Search terms for stock media |
| YouTube links you paste | YouTube | A download request (yt-dlp) |
| AI video generation | Replicate or PiAPI (your key) | Prompt and source image |
| Sarvam AI / Smallest AI voices and transcription | Sarvam, Smallest (your key) | Text or audio |
| Sound search | Freesound (your key) | Search terms |
| Publishing to TikTok | TikTok, after you sign in | The exported video |

With the default `AI_LLM_BACKEND=auto` and no keys set, no text, audio or
video goes to an AI provider.

## Why the name

The tiê-sangue (*Ramphocelus bresilius*) is a bright red bird of the
Brazilian Atlantic Forest, a common sight in Rio de Janeiro. TiêIA is the
tiê plus *IA*, Portuguese for AI. The icon is the bird drawn in a single
white line on red, with a play button in its beak. Where accents are not
allowed (code, URLs, package names), the name is written `tieia`.

## License and credits

MIT. See [LICENSE](LICENSE), which keeps the copyright notices of the
projects TiêIA comes from.

- [OpenCut](https://github.com/OpenCut-app/OpenCut), by the OpenCut
  contributors: the video editor at the core of TiêIA.
- [OpenCut AI](https://github.com/Ekaanth/OpenCut-AI), by
  [Ekaanth](https://github.com/Ekaanth): the AI services and features built
  around OpenCut.

TiêIA is maintained by [Alexandre](https://github.com/AlexandreLPA).
