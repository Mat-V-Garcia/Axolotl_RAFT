#!/bin/bash
# Setup script for RunPod pod - Run this once when the pod starts

set -e

echo "=== MagisAI Training Server Setup ==="

# Install Axolotl
echo "Installing Axolotl..."
pip install --upgrade pip
pip install packaging ninja
pip install "axolotl[flash-attn,deepspeed] @ git+https://github.com/axolotl-ai-cloud/axolotl.git@main"

# Install server dependencies
echo "Installing server dependencies..."
pip install fastapi uvicorn[standard] python-multipart pyyaml pydantic

# Set environment variables
export HF_HOME=/workspace/huggingface
export AXOLOTL_NCCL_TIMEOUT=3600

echo "=== Setup complete ==="
echo "Start the server with: python main.py"
echo "Or: uvicorn main:app --host 0.0.0.0 --port 8000"
