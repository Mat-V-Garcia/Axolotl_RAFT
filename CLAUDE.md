# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MagisAI Training Hub - a web-based LLM fine-tuning platform using [Axolotl](https://github.com/axolotl-ai-cloud/axolotl) on RunPod Serverless. Supports LoRA/QLoRA, RAFT (Retrieval-Augmented Fine-Tuning), and full fine-tuning with Hugging Face Hub integration.

## Architecture

```
web/ (React)  ───RunPod API───►  RunPod Serverless (handler.py + Axolotl)
localhost:5173                   Auto-scaling GPU workers
```

## Directory Structure

```
server/
├── handler.py      # RunPod serverless handler (main)
├── Dockerfile      # Build image for serverless deployment
├── main.py         # FastAPI server (alternative for persistent pods)
└── requirements.txt

web/
├── src/
│   ├── App.jsx     # Main React component
│   ├── App.css     # Styles
│   └── main.jsx    # Entry point
├── package.json
└── vite.config.js

AX/                 # Legacy (deprecated, use server/ instead)
```

## Commands

```bash
# Build and push Docker image
cd server
docker build -t matvg621/magisai-training:v1 .
docker push matvg621/magisai-training:v1

# Run frontend
cd web
npm install
npm run dev
```

## Deployment

1. Build and push Docker image
2. Create RunPod Serverless Endpoint with image `matvg621/magisai-training:v1`
3. Select GPU: L40S/A40 (48GB) for 14B models
4. Get Endpoint ID from RunPod console
5. Connect frontend with API key + Endpoint ID

## Data Formats

**ShareGPT (chat):**
```json
{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

**RAFT (document QA):**
```json
{"instruction": "...", "context": "...", "cot_answer": "..."}
```

## Training Defaults

- Base model: `Qwen/Qwen2.5-14B-Instruct`
- Method: `qlora` (4-bit quantized)
- LoRA: r=32, alpha=64
- Sequence length: 2048
- Batch: 4, gradient accumulation: 4

## Environment Variables (.env)

- `RUNPOD_API_KEY` - RunPod authentication
- `HF_TOKEN` - Hugging Face token for Hub push
- `WEAVIATE_URL`, `WEAVIATE_API_KEY` - For RAG features (optional)

## Setup

See `SETUP.md` for detailed deployment instructions.
