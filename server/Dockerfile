# MagisAI Training - RunPod Serverless Endpoint
#
# Build: docker build -t matvg621/magisai-training:v1 .
# Push:  docker push matvg621/magisai-training:v1
#
# Deploy as Serverless Endpoint on RunPod with GPU (L40S/A40 for 14B models)

FROM runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir packaging

# Install Axolotl (without flash-attn - works fine, just slightly slower)
RUN pip install --no-cache-dir "axolotl[deepspeed] @ git+https://github.com/axolotl-ai-cloud/axolotl.git@main"

# Install RunPod SDK and YAML
RUN pip install --no-cache-dir runpod pyyaml

# Copy handler
COPY handler.py /app/handler.py

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/workspace/huggingface
ENV AXOLOTL_NCCL_TIMEOUT=3600

# Start the serverless handler
CMD ["python", "-u", "/app/handler.py"]
