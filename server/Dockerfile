# MagisAI Training & Inference - RunPod Serverless Endpoint
#
# Build: docker build -t matvg621/magisai-training:v10 .
# Push:  docker push matvg621/magisai-training:v10
#
# Deploy as Serverless Endpoint on RunPod with GPU (80GB+ for 14B LoRA)
# Supports both training (Axolotl) and inference (LoRA adapters from HF Hub)
#
# Security improvements in v10:
# - Pinned dependency versions where possible
# - Added healthcheck
# - Cleaned up apt cache
# - Minimal installed packages

# Use PyTorch base with CUDA 12.4 for Blackwell GPU support (sm_120)
FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-devel

# Security: Set labels for image metadata
LABEL maintainer="MagisAI" \
      version="10" \
      description="Secure LLM fine-tuning with Axolotl"

# Install minimal dependencies and Axolotl
# Note: Running as root is required for RunPod serverless (GPU access, /workspace)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    pip install --no-cache-dir packaging && \
    pip install --no-cache-dir "axolotl[deepspeed] @ git+https://github.com/axolotl-ai-cloud/axolotl.git@main" && \
    pip install --no-cache-dir "torchvision>=0.23" "torchaudio>=2.8"

WORKDIR /app

# Install RunPod SDK and dependencies with pinned versions
RUN pip install --no-cache-dir \
    runpod==1.7.0 \
    pyyaml==6.0.1 \
    peft==0.11.1

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/workspace/huggingface \
    AXOLOTL_NCCL_TIMEOUT=3600 \
    # Security: Disable pip warnings about running as root
    PIP_ROOT_USER_ACTION=ignore

# Copy handler last (best cache utilization)
COPY handler.py /app/handler.py

# Healthcheck - verify Python and runpod can import
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import runpod; import torch; print('healthy')" || exit 1

# Start the serverless handler
CMD ["python", "-u", "/app/handler.py"]
