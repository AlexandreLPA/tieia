"""What a Hugging Face model has on this computer, and the graphics card here.

The same file lives in each service that downloads models (image, whisper):
the editor shows, beside each model, whether it is downloaded, how far a
download got, and whether the card has the video memory the model needs.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

# A model counts as downloaded once this share of its listed size is on disk
# (the listed sizes are estimates; the GPU and CPU variants differ a little)
_COMPLETE_SHARE = 0.6


def _hub_dir() -> Path:
    try:
        from huggingface_hub import constants

        return Path(constants.HF_HUB_CACHE)
    except Exception:
        home = os.getenv("HF_HOME") or str(Path.home() / ".cache" / "huggingface")
        return Path(home) / "hub"


def repo_dir(repo_id: str) -> Path:
    return _hub_dir() / ("models--" + repo_id.replace("/", "--"))


def disk_state(repo_id: str, size_mb: float) -> dict:
    """MB on disk for the model and whether it is complete.

    Counts every file in the model's cache folder once (links are skipped:
    with them the snapshot only points at the blob). A file still ending in
    .incomplete means a download is running, or was cut and resumes on the
    next load.
    """
    folder = repo_dir(repo_id)
    total = 0
    partial = False
    if folder.is_dir():
        for root, _dirs, files in os.walk(folder):
            for name in files:
                path = os.path.join(root, name)
                try:
                    if os.path.islink(path):
                        continue
                    total += os.lstat(path).st_size
                except OSError:
                    continue
                if name.endswith(".incomplete"):
                    partial = True
    on_disk_mb = round(total / 1_048_576)
    return {
        "downloaded_mb": on_disk_mb,
        "downloaded": not partial and on_disk_mb >= size_mb * _COMPLETE_SHARE,
    }


def remove(repo_id: str) -> bool:
    """Deletes the model's files. False when there was nothing to delete."""
    folder = repo_dir(repo_id)
    if not folder.is_dir():
        return False
    shutil.rmtree(folder)
    return True


@lru_cache(maxsize=1)
def gpu() -> dict | None:
    """The NVIDIA card's name and video memory in GB, or None without one."""
    try:
        import torch

        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            return {
                "name": props.name,
                "vram_gb": round(props.total_memory / 1024**3, 1),
            }
    except Exception:
        pass
    # Services without torch (whisper): ask the driver
    try:
        out = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        line = out.stdout.strip().splitlines()[0] if out.returncode == 0 else ""
        name, memory = (part.strip() for part in line.split(",", 1))
        return {"name": name, "vram_gb": round(int(memory) / 1024, 1)}
    except Exception:
        return None
