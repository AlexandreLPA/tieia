FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.9.28 /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt requirements.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    if [ -f requirements.lock ]; then \
      uv pip install --system -r requirements.lock ; \
    else \
      uv pip install --system -r requirements.txt ; \
    fi

COPY . .

RUN mkdir -p uploads

# ctranslate2 (faster-whisper's backend) needs cuDNN/cuBLAS at runtime for GPU
# inference. This slim image has no system CUDA, so it loads them from the
# pip-installed nvidia-* wheels via this path instead.
ENV LD_LIBRARY_PATH="/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib:/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib"

EXPOSE 8421

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8421"]
