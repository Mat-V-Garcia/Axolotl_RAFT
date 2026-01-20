"""
MagisAI Axolotl Training Handler - RunPod Serverless

Build: docker build -t matvg621/magisai-training:v1 .
Push:  docker push matvg621/magisai-training:v1

Deploy as a Serverless Endpoint on RunPod.
"""

import runpod
import os
import json
import yaml
import subprocess
from datetime import datetime
from pathlib import Path


def generate_axolotl_config(base_model: str, data_path: str, output_dir: str, config: dict) -> dict:
    """Generate Axolotl YAML configuration."""

    method = config.get("method", "qlora")
    use_raft = config.get("use_raft", False)

    axolotl_config = {
        "base_model": base_model,
        "model_type": "AutoModelForCausalLM",
        "tokenizer_type": "AutoTokenizer",
        "trust_remote_code": True,

        "datasets": [{
            "path": data_path,
            "type": "sharegpt" if not use_raft else "raft",
            "conversation": "chatml",
        }],

        "output_dir": output_dir,
        "sequence_len": config.get("max_seq_length", 2048),
        "sample_packing": True,
        "pad_to_sequence_len": True,

        "num_epochs": config.get("num_epochs", 3),
        "micro_batch_size": config.get("batch_size", 4),
        "gradient_accumulation_steps": config.get("gradient_accumulation_steps", 4),
        "learning_rate": float(config.get("learning_rate", 2e-4)),
        "optimizer": "adamw_torch",
        "lr_scheduler": "cosine",
        "warmup_ratio": 0.05,

        "gradient_checkpointing": True,
        "flash_attention": True,

        "logging_steps": 10,
        "save_strategy": "steps",
        "save_steps": 100,
        "save_total_limit": 2,

        "bf16": True,
        "tf32": True,
        "seed": 42,
        "strict": False,
    }

    # Method-specific config
    if method == "qlora":
        axolotl_config.update({
            "adapter": "qlora",
            "load_in_4bit": True,
            "lora_r": config.get("lora_r", 32),
            "lora_alpha": config.get("lora_alpha", 64),
            "lora_dropout": 0.05,
            "lora_target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            "lora_target_linear": True,
        })
    elif method == "lora":
        axolotl_config.update({
            "adapter": "lora",
            "lora_r": config.get("lora_r", 32),
            "lora_alpha": config.get("lora_alpha", 64),
            "lora_dropout": 0.05,
            "lora_target_linear": True,
        })
    elif method == "full":
        axolotl_config["load_in_8bit"] = False
        axolotl_config["load_in_4bit"] = False

    # Hub push
    if config.get("hub_model_id"):
        axolotl_config["hub_model_id"] = config["hub_model_id"]
        axolotl_config["push_to_hub"] = True
        if config.get("hub_token"):
            axolotl_config["hub_token"] = config["hub_token"]

    return axolotl_config


def prepare_training_data(training_data: list, output_path: str, use_raft: bool = False) -> str:
    """Convert training data to Axolotl-compatible JSONL format."""

    with open(output_path, "w") as f:
        for item in training_data:
            if use_raft:
                raft_item = {
                    "instruction": item.get("instruction", item.get("question", "")),
                    "context": item.get("context", item.get("documents", "")),
                    "cot_answer": item.get("cot_answer", item.get("answer", "")),
                }
                f.write(json.dumps(raft_item) + "\n")
            else:
                if "messages" in item:
                    # Convert OpenAI format to ShareGPT
                    convos = []
                    for msg in item["messages"]:
                        role = "human" if msg["role"] == "user" else "gpt"
                        convos.append({"from": role, "value": msg["content"]})
                    f.write(json.dumps({"conversations": convos}) + "\n")
                elif "conversations" in item:
                    f.write(json.dumps(item) + "\n")
                else:
                    f.write(json.dumps(item) + "\n")

    return output_path


def run_axolotl_training(config_path: str, job) -> dict:
    """Run Axolotl training via CLI."""

    cmd = [
        "accelerate", "launch",
        "--mixed_precision", "bf16",
        "--num_processes", "1",
        "-m", "axolotl.cli.train",
        config_path
    ]

    print(f"Running: {' '.join(cmd)}")
    runpod.serverless.progress_update(job, "Starting Axolotl training...")

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    output_lines = []
    for line in process.stdout:
        line = line.strip()
        if line:
            print(line)
            output_lines.append(line)
            if "loss" in line.lower() and "step" in line.lower():
                runpod.serverless.progress_update(job, f"Training: {line[:100]}")

    process.wait()

    return {
        "return_code": process.returncode,
        "output": "\n".join(output_lines[-50:]),
    }


def handler(job):
    """Main serverless handler for training jobs."""

    job_input = job["input"]

    # Extract parameters
    base_model = job_input.get("base_model", "Qwen/Qwen2.5-14B-Instruct")
    training_data = job_input.get("training_data", [])
    config = job_input.get("config", {})

    if not training_data:
        return {"status": "error", "error": "No training data provided"}

    print(f"Training job received:")
    print(f"  Base model: {base_model}")
    print(f"  Samples: {len(training_data)}")
    print(f"  Method: {config.get('method', 'qlora')}")
    print(f"  RAFT: {config.get('use_raft', False)}")

    try:
        # Create working directory
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        work_dir = Path("/workspace") if Path("/workspace").exists() else Path("/tmp")
        job_dir = work_dir / f"axolotl_{timestamp}"
        job_dir.mkdir(parents=True, exist_ok=True)

        output_dir = job_dir / "output"
        output_dir.mkdir(exist_ok=True)

        data_path = job_dir / "train.jsonl"
        config_path = job_dir / "config.yaml"

        # Prepare data
        runpod.serverless.progress_update(job, "Preparing training data...")
        prepare_training_data(training_data, str(data_path), config.get("use_raft", False))

        # Generate config
        runpod.serverless.progress_update(job, "Generating config...")
        axolotl_config = generate_axolotl_config(
            base_model=base_model,
            data_path=str(data_path),
            output_dir=str(output_dir),
            config=config
        )

        with open(config_path, "w") as f:
            yaml.dump(axolotl_config, f, default_flow_style=False)

        # Run training
        result = run_axolotl_training(str(config_path), job)

        if result["return_code"] != 0:
            return {
                "status": "error",
                "error": f"Training failed with code {result['return_code']}",
                "output": result["output"]
            }

        runpod.serverless.progress_update(job, "Training complete!")

        # Check outputs
        adapter_path = output_dir / "adapter_model.safetensors"
        model_path = output_dir / "model.safetensors"

        return {
            "status": "success",
            "message": "Training completed successfully",
            "output_dir": str(output_dir),
            "base_model": base_model,
            "method": config.get("method", "qlora"),
            "samples_trained": len(training_data),
            "has_adapter": adapter_path.exists(),
            "has_model": model_path.exists(),
            "hub_model_id": config.get("hub_model_id"),
            "training_output": result["output"],
        }

    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }


# Start RunPod serverless worker
runpod.serverless.start({"handler": handler})
