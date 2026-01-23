# MagisAI Training - RunPod Serverless Endpoint
#
# Build: docker build -t matvg621/magisai-training:v8 .
# Push:  docker push matvg621/magisai-training:v8
#
# Deploy as Serverless Endpoint on RunPod with GPU (80GB+ for 14B LoRA)

# Use newer PyTorch base for Blackwell GPU support (sm_120)
FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-devel

# Install git and Axolotl from source
# Axolotl will upgrade torch to 2.8.0, so we upgrade torchvision/torchaudio to match
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir packaging && \
    pip install --no-cache-dir "axolotl[deepspeed] @ git+https://github.com/axolotl-ai-cloud/axolotl.git@main" && \
    pip install --no-cache-dir "torchvision>=0.23" "torchaudio>=2.8"

WORKDIR /app

# Install only what's not in base image (RunPod SDK)
RUN pip install --no-cache-dir runpod pyyaml

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/workspace/huggingface
ENV AXOLOTL_NCCL_TIMEOUT=3600

# Copy handler last (best cache utilization - only this layer rebuilds on code changes)
COPY handler.py /app/handler.py

# Start the serverless handler
CMD ["python", "-u", "/app/handler.py"]
