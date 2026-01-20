# MagisAI Training Hub - Setup Guide

## Architecture

```
┌─────────────────┐                    ┌──────────────────────────┐
│  Web Frontend   │  RunPod API        │  RunPod Serverless       │
│  (React/Vite)   │ ─────────────────► │  ┌────────────────────┐  │
│  localhost:5173 │                    │  │ handler.py         │  │
└─────────────────┘                    │  │ (Axolotl Training) │  │
                                       │  └────────────────────┘  │
                                       │  Auto-scales with demand │
                                       └──────────────────────────┘
```

## Step 1: Docker Image

**Image already available on Docker Hub:**
```
matvg621/magisai-training:v1
```

To rebuild (if needed):
```bash
cd server
docker build -t matvg621/magisai-training:v1 .
docker push matvg621/magisai-training:v1
```

## Step 2: Create RunPod Serverless Endpoint

1. Go to [RunPod Serverless](https://www.runpod.io/console/serverless)
2. Click **New Endpoint**
3. Configure:
   - **Name:** MagisAI-Training
   - **Docker Image:** `matvg621/magisai-training:v1`
   - **GPU:** L40S or A40 (48GB) for 14B models
   - **Max Workers:** 1-3 depending on budget
   - **Idle Timeout:** 5-10 seconds
   - **Enable Network Volume** at `/workspace` (optional, for model caching)
4. Click **Deploy**
5. Copy the **Endpoint ID** (looks like: `abc123xyz`)

## Step 3: Run the Frontend

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`

## Step 4: Connect and Train

1. Enter your **RunPod API Key** (from [RunPod Settings](https://www.runpod.io/console/user/settings))
2. Enter your **Endpoint ID** from Step 2
3. Click **Connect**
4. Upload your training data (JSONL format)
5. Configure training parameters
6. Click **Start Training**

## Training Data Formats

### ShareGPT Format (Chat)

```json
{"messages": [{"role": "user", "content": "What is 2+2?"}, {"role": "assistant", "content": "4"}]}
{"messages": [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi!"}]}
```

### RAFT Format (Document QA)

```json
{"instruction": "What does the document say about X?", "context": "Document content...", "cot_answer": "Based on the document..."}
```

## GPU Selection Guide

| Model Size | Method | Recommended GPU |
|------------|--------|-----------------|
| 7B | QLoRA | RTX 4090 (24GB) |
| 7B | LoRA | A40 (48GB) |
| 14B | QLoRA | L40S/A40 (48GB) |
| 70B | QLoRA | A100 (80GB) |

## Cost Optimization

- **Serverless = pay per second of compute**
- Set low idle timeout (5s) to minimize costs
- Jobs auto-queue when all workers are busy
- Cold start adds ~2-5 min for model loading

## Troubleshooting

### "Connection failed"
- Check API key is correct
- Check endpoint ID is correct
- Ensure endpoint is deployed and active

### Job stuck in "IN_QUEUE"
- Endpoint may be cold starting (wait 2-5 min)
- Check RunPod console for worker status

### Training failed
- Check job output for error details
- Try reducing batch_size
- Ensure data format matches selected mode (RAFT vs ShareGPT)
