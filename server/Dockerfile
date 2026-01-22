# MagisAI Training - RunPod Serverless Endpoint
#
# Build: docker build -t matvg621/magisai-training:v3 .
# Push:  docker push matvg621/magisai-training:v3
#
# Deploy as Serverless Endpoint on RunPod with GPU (L40S/A40 for 14B models)

# Use RunPod's pre-built Axolotl image (saves ~15 min build time)
FROM winglian/axolotl:main-latest

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
