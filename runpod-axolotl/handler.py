"""
MagisAI Axolotl Training Handler for RunPod Serverless

Uses Axolotl for flexible fine-tuning with support for:
- LoRA / QLoRA
- RAFT (Retrieval-Augmented Fine-Tuning)
- Full fine-tuning
- DeepSpeed

Expected input format:
{
    "input": {
        "base_model": "Qwen/Qwen2.5-14B-Instruct",
        "training_data": [
            {"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
        ],
        "config": {
            "method": "qlora",           # lora, qlora, full
            "num_epochs": 3,
            "learning_rate": 2e-4,
            "batch_size": 4,
            "gradient_accumulation_steps": 4,
            "max_seq_length": 2048,
            "lora_r": 32,
            "lora_alpha": 64,
            "use_raft": false,           # Enable RAFT format
            "hub_model_id": null,        # Push to HF Hub (optional)
            "hub_token": null            # HF token for push
        }
    }
}
"""

import runpod
import os
import json
import yaml
import subprocess
from datetime import datetime
from pathlib import Path


def generate_axolotl_config(
    base_model: str,
    data_path: str,
    output_dir: str,
    config: dict
) -> dict:
    """Generate Axolotl YAML configuration."""

    method = config.get("method", "qlora")
    use_raft = config.get("use_raft", False)

    # Base configuration
    axolotl_config = {
        "base_model": base_model,
        "model_type": "AutoModelForCausalLM",
        "tokenizer_type": "AutoTokenizer",
        "trust_remote_code": True,

        # Dataset configuration
        "datasets": [{
            "path": data_path,
            "type": "sharegpt" if not use_raft else "raft",
            "conversation": "chatml",
        }],

        # Output
        "output_dir": output_dir,

        # Training parameters
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

        # Memory optimization
        "gradient_checkpointing": True,
        "flash_attention": True,

        # Logging
        "logging_steps": 10,
        "save_strategy": "steps",
        "save_steps": 100,
        "save_total_limit": 2,

        # Precision
        "bf16": True,
        "tf32": True,

        # Misc
        "seed": 42,
        "strict": False,
    }

    # Method-specific configuration
    if method == "qlora":
        axolotl_config.update({
            "adapter": "qlora",
            "load_in_4bit": True,
            "lora_r": config.get("lora_r", 32),
            "lora_alpha": config.get("lora_alpha", 64),
            "lora_dropout": 0.05,
            "lora_target_modules": [
                "q_proj", "k_proj", "v_proj", "o_proj",
                "gate_proj", "up_proj", "down_proj"
            ],
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
        # Full fine-tuning - no adapter
        axolotl_config["load_in_8bit"] = False
        axolotl_config["load_in_4bit"] = False

    # Hub push configuration
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
                # RAFT format expects: instruction, context, cot_answer
                # Map from our format if needed
                raft_item = {
                    "instruction": item.get("instruction", item.get("question", "")),
                    "context": item.get("context", item.get("documents", "")),
                    "cot_answer": item.get("cot_answer", item.get("answer", "")),
                }
                f.write(json.dumps(raft_item) + "\n")
            else:
                # ShareGPT/messages format
                if "messages" in item:
                    f.write(json.dumps({"conversations": item["messages"]}) + "\n")
                elif "conversations" in item:
                    f.write(json.dumps(item) + "\n")
                elif "text" in item:
                    # Convert text format to conversations
                    f.write(json.dumps({
                        "conversations": [
                            {"from": "human", "value": ""},
                            {"from": "gpt", "value": item["text"]}
                        ]
                    }) + "\n")
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
    last_progress = ""

    for line in process.stdout:
        line = line.strip()
        if line:
            print(line)
            output_lines.append(line)

            # Parse progress from Axolotl output
            if "loss" in line.lower() and "step" in line.lower():
                last_progress = line
                runpod.serverless.progress_update(job, f"Training: {line[:100]}")

    process.wait()

    return {
        "return_code": process.returncode,
        "output": "\n".join(output_lines[-50:]),  # Last 50 lines
        "last_progress": last_progress
    }


def handler(job):
    """Main handler for Axolotl training jobs."""

    job_input = job["input"]

    # Extract parameters
    base_model = job_input.get("base_model", "Qwen/Qwen2.5-14B-Instruct")
    training_data = job_input.get("training_data", [])
    config = job_input.get("config", {})

    # Validate
    if not training_data:
        return {"status": "error", "error": "No training data provided"}

    print(f"Received Axolotl training job:")
    print(f"  Base model: {base_model}")
    print(f"  Training samples: {len(training_data)}")
    print(f"  Method: {config.get('method', 'qlora')}")
    print(f"  RAFT mode: {config.get('use_raft', False)}")

    try:
        # Create working directories
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        work_dir = Path("/workspace") if Path("/workspace").exists() else Path("/tmp")
        job_dir = work_dir / f"axolotl_{timestamp}"
        job_dir.mkdir(parents=True, exist_ok=True)

        output_dir = job_dir / "output"
        output_dir.mkdir(exist_ok=True)

        data_path = job_dir / "train.jsonl"
        config_path = job_dir / "config.yaml"

        print(f"Working directory: {job_dir}")

        # Prepare training data
        runpod.serverless.progress_update(job, "Preparing training data...")
        use_raft = config.get("use_raft", False)
        prepare_training_data(training_data, str(data_path), use_raft)
        print(f"Training data written to: {data_path}")

        # Generate Axolotl config
        runpod.serverless.progress_update(job, "Generating Axolotl config...")
        axolotl_config = generate_axolotl_config(
            base_model=base_model,
            data_path=str(data_path),
            output_dir=str(output_dir),
            config=config
        )

        with open(config_path, "w") as f:
            yaml.dump(axolotl_config, f, default_flow_style=False)
        print(f"Config written to: {config_path}")

        # Run training
        result = run_axolotl_training(str(config_path), job)

        if result["return_code"] != 0:
            return {
                "status": "error",
                "error": f"Training failed with code {result['return_code']}",
                "output": result["output"]
            }

        runpod.serverless.progress_update(job, "Training complete!")

        # Check for output files
        adapter_path = output_dir / "adapter_model.safetensors"
        model_path = output_dir / "model.safetensors"

        has_adapter = adapter_path.exists()
        has_model = model_path.exists()

        return {
            "status": "success",
            "message": "Training completed successfully",
            "output_dir": str(output_dir),
            "base_model": base_model,
            "method": config.get("method", "qlora"),
            "samples_trained": len(training_data),
            "has_adapter": has_adapter,
            "has_model": has_model,
            "training_output": result["output"],
            "hub_model_id": config.get("hub_model_id"),
        }

    except Exception as e:
        import traceback
        error_msg = f"Training failed: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }


# Start the RunPod serverless worker
runpod.serverless.start({"handler": handler})
