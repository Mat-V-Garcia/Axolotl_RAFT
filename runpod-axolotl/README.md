# MagisAI Axolotl RunPod Worker

RunPod serverless worker for fine-tuning LLMs using [Axolotl](https://github.com/axolotl-ai-cloud/axolotl).

## Features

- **LoRA / QLoRA** - Memory-efficient fine-tuning
- **RAFT** - Retrieval-Augmented Fine-Tuning support
- **Full fine-tuning** - For smaller models or high-VRAM GPUs
- **Flash Attention** - Faster training
- **Hub Push** - Automatic upload to Hugging Face Hub

## Build & Deploy

```bash
# Build the image
docker build -t matvg621/magisai-axolotl:v1 .

# Push to Docker Hub
docker push matvg621/magisai-axolotl:v1
```

## RunPod Setup

1. Create a new **Serverless Endpoint** on RunPod
2. Set the Docker image: `matvg621/magisai-axolotl:v1`
3. Select GPU: **RTX 4090** (24GB) or **A40/A100** (48GB+)
4. Enable **Network Volume** at `/workspace` for persistent storage
5. Set environment variables:
   - `HF_TOKEN` - Hugging Face token (for private models/push)

## API Usage

### Standard Fine-Tuning (ShareGPT format)

```python
import runpod

runpod.api_key = "your_api_key"
endpoint = runpod.Endpoint("your_endpoint_id")

result = endpoint.run_sync({
    "input": {
        "base_model": "Qwen/Qwen2.5-14B-Instruct",
        "training_data": [
            {
                "messages": [
                    {"role": "user", "content": "What is the capital of France?"},
                    {"role": "assistant", "content": "The capital of France is Paris."}
                ]
            }
        ],
        "config": {
            "method": "qlora",
            "num_epochs": 3,
            "learning_rate": 2e-4,
            "batch_size": 4,
            "max_seq_length": 2048,
            "lora_r": 32,
            "lora_alpha": 64
        }
    }
})
```

### RAFT Fine-Tuning

```python
result = endpoint.run_sync({
    "input": {
        "base_model": "Qwen/Qwen2.5-14B-Instruct",
        "training_data": [
            {
                "instruction": "What does the document say about X?",
                "context": "Document content here with relevant information...",
                "cot_answer": "Based on the document, X is... [chain of thought reasoning]"
            }
        ],
        "config": {
            "method": "qlora",
            "use_raft": True,
            "num_epochs": 3
        }
    }
})
```

### Push to Hugging Face Hub

```python
result = endpoint.run_sync({
    "input": {
        "base_model": "Qwen/Qwen2.5-14B-Instruct",
        "training_data": [...],
        "config": {
            "method": "qlora",
            "hub_model_id": "your-username/model-name",
            "hub_token": "hf_..."
        }
    }
})
```

## Configuration Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `method` | `qlora` | Training method: `lora`, `qlora`, `full` |
| `num_epochs` | `3` | Number of training epochs |
| `learning_rate` | `2e-4` | Learning rate |
| `batch_size` | `4` | Micro batch size per GPU |
| `gradient_accumulation_steps` | `4` | Gradient accumulation |
| `max_seq_length` | `2048` | Maximum sequence length |
| `lora_r` | `32` | LoRA rank |
| `lora_alpha` | `64` | LoRA alpha |
| `use_raft` | `false` | Enable RAFT format |
| `hub_model_id` | `null` | HF Hub repo to push to |
| `hub_token` | `null` | HF token for push |

## GPU Requirements

| Model Size | Method | Recommended GPU |
|------------|--------|-----------------|
| 7B | QLoRA | RTX 4090 (24GB) |
| 7B | LoRA | A40 (48GB) |
| 14B | QLoRA | A40 (48GB) |
| 70B | QLoRA | A100 (80GB) |

## Response Format

```json
{
    "status": "success",
    "message": "Training completed successfully",
    "output_dir": "/workspace/axolotl_20240115_120000/output",
    "base_model": "Qwen/Qwen2.5-14B-Instruct",
    "method": "qlora",
    "samples_trained": 100,
    "has_adapter": true,
    "hub_model_id": "your-username/model-name"
}
```

## Retrieving Trained Model

If using a network volume, the trained adapter is saved to `/workspace/axolotl_<timestamp>/output/`.

To download:
1. SSH into a RunPod pod with the same network volume
2. Use `huggingface-cli upload` or copy files manually

Or use `hub_model_id` to automatically push to Hugging Face Hub.
