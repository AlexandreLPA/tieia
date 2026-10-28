FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.9.28 /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch 2.8 built for CUDA 12.8: the only build with kernels for Blackwell GPUs
# (RTX 50xx). It runs on the CPU too when no GPU is attached. The lock was
# compiled with overrides.txt and lists every package, so it installs without
# re-resolving chatterbox-tts's own torch pin.
COPY requirements.txt overrides.txt requirements.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    if [ -f requirements.lock ]; then \
      uv pip install --system \
        --index-strategy unsafe-best-match \
        --extra-index-url https://download.pytorch.org/whl/cu128 \
        --no-deps -r requirements.lock ; \
    else \
      uv pip install --system \
        --index-strategy unsafe-best-match \
        --extra-index-url https://download.pytorch.org/whl/cu128 \
        --override overrides.txt \
        -r requirements.txt ; \
    fi

COPY app.py analysis.py ./

RUN mkdir -p generated/voices

EXPOSE 8428

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8428"]
