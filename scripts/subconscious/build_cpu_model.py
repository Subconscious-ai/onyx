"""Build the native model server with CPU PyTorch on a CPU-only host."""

import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = (root / "backend/Dockerfile.model_server").read_text()
start = source.index("RUN awk ")
end = source.index("# TODO: drop --no-deps", start)
replacement = """RUN uv pip install --python /app/.venv/bin/python --no-cache-dir --no-deps \\
        --index-url https://download.pytorch.org/whl/cpu 'torch==2.9.1+cpu' && \\
    awk '/^[[:alnum:]]/ { keep = ($0 !~ /^(torch|nvidia-[a-z0-9-]+|triton)==/) } keep' /tmp/requirements.txt > /tmp/cpu-requirements.txt && \\
    mv /tmp/cpu-requirements.txt /tmp/requirements.txt

"""
with tempfile.NamedTemporaryFile(mode="w", suffix=".Dockerfile") as file:
    file.write(source[:start] + replacement + source[end:])
    file.flush()
    subprocess.run(
        [
            "docker",
            "build",
            "--memory",
            "3g",
            "-f",
            file.name,
            "-t",
            "burn-model-cpu:onyx-a93ef9a24b",
            str(root / "backend"),
        ],
        check=True,
    )
