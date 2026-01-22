# MagisAI Axolotl Training Handler for RunPod Serverless
#
# Build: docker build -t matvg621/magisai-axolotl:v1 .
# Push:  docker push matvg621/magisai-axolotl:v1
#
# Optimized for 24GB+ GPUs (RTX 4090, A40, A100)
# Supports: LoRA, QLoRA, full fine-tune, RAFT

FROM runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Axolotl and dependencies
# Using pip install from git for latest features
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir packaging ninja && \
    pip install --no-cache-dir torch==2.2.1 --index-url https://download.pytorch.org/whl/cu121

# Install flash-attn (optional but recommended for speed)
RUN pip install --no-cache-dir flash-attn --no-build-isolation

# Install Axolotl with all extras
RUN pip install --no-cache-dir "axolotl[flash-attn,deepspeed] @ git+https://github.com/axolotl-ai-cloud/axolotl.git@main"

# Install RunPod SDK
RUN pip install --no-cache-dir runpod

# Copy handler
COPY handler.py /app/handler.py

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/workspace/huggingface
ENV AXOLOTL_NCCL_TIMEOUT=3600

# Run the handler
CMD ["python", "-u", "/app/handler.py"]
