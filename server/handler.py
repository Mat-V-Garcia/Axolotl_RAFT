"""
MagisAI Training & Inference Handler - RunPod Serverless

Build: docker build -t matvg621/magisai-training:v9 .
Push:  docker push matvg621/magisai-training:v9

Deploy as a Serverless Endpoint on RunPod.

Supports two actions:
- "train": Fine-tune a model with Axolotl
- "inference": Generate responses from a fine-tuned model
"""

import runpod
import os
import json
import yaml
import subprocess
import torch
from datetime import datetime
from pathlib import Path

# Global model cache for inference (persists across requests on same worker)
_model_cache = {
    "model": None,
    "tokenizer": None,
    "model_id": None
}


def generate_axolotl_config(base_model: str, data_path: str, output_dir: str, config: dict) -> dict:
    """Generate Axolotl YAML configuration optimized for 80GB+ GPUs."""

    method = config.get("method", "qlora")
    use_raft = config.get("use_raft", False)

    axolotl_config = {
        "base_model": base_model,
        "model_type": "AutoModelForCausalLM",
        "tokenizer_type": "AutoTokenizer",
        "trust_remote_code": True,

        "datasets": [{
            "path": data_path,
            "type": "chat_template",  # New Axolotl format (replaces deprecated sharegpt)
            "chat_template": "chatml",
            "message_field_role": "from",
            "message_field_content": "value",
            "field_messages": "conversations",
        }],

        "output_dir": output_dir,
        "sequence_len": config.get("max_seq_length", 2048),
        "sample_packing": True,  # Enabled for 80GB+ GPUs - faster training
        "pad_to_sequence_len": True,

        "num_epochs": config.get("num_epochs", 3),
        "micro_batch_size": config.get("batch_size", 4),  # Larger batch for 80GB GPUs
        "gradient_accumulation_steps": config.get("gradient_accumulation_steps", 4),
        "learning_rate": float(config.get("learning_rate", 2e-4)),
        "optimizer": "adamw_torch",
        "lr_scheduler": "cosine",
        "warmup_ratio": 0.05,

        "gradient_checkpointing": True,
        "gradient_checkpointing_kwargs": {
            "use_reentrant": False
        },

        # Use flash attention for speed (80GB GPUs support it well)
        "flash_attention": True,
        "sdp_attention": False,

        "logging_steps": 10,
        "save_strategy": "steps",
        "save_steps": 100,
        "save_total_limit": 2,

        "bf16": "auto",  # Let Axolotl decide based on GPU
        "fp16": False,
        "tf32": True,
        "seed": 42,
        "strict": False,
    }

    # Method-specific config
    if method == "qlora":
        axolotl_config.update({
            "adapter": "qlora",
            "load_in_4bit": True,
            "bnb_4bit_compute_dtype": "bfloat16",
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_use_double_quant": True,
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
            "lora_target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            "lora_target_linear": True,
            # Optional: Use 8-bit base model for even faster training on 80GB GPUs
            # "load_in_8bit": True,  # Uncomment for faster training with minimal quality loss
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
    """Convert training data to Axolotl-compatible JSONL format (ShareGPT).

    Both SFT and RAFT data use ShareGPT format. For RAFT, the context/documents
    are embedded in the user message by the frontend.
    """

    with open(output_path, "w") as f:
        for item in training_data:
            # Always use ShareGPT format - works for both SFT and RAFT
            if "messages" in item:
                # Convert OpenAI/ChatML format to ShareGPT
                convos = []
                for msg in item["messages"]:
                    role = "human" if msg["role"] == "user" else "gpt"
                    convos.append({"from": role, "value": msg["content"]})
                f.write(json.dumps({"conversations": convos}) + "\n")
            elif "conversations" in item:
                # Already in ShareGPT format
                f.write(json.dumps(item) + "\n")
            elif "instruction" in item:
                # Legacy RAFT format - convert to ShareGPT
                user_content = item.get("instruction", "")
                if item.get("context"):
                    user_content = f"{item['context']}\n\n{user_content}"
                assistant_content = item.get("cot_answer", item.get("answer", ""))
                convos = [
                    {"from": "human", "value": user_content},
                    {"from": "gpt", "value": assistant_content}
                ]
                f.write(json.dumps({"conversations": convos}) + "\n")
            else:
                # Fallback - write as-is
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


def load_model_for_inference(model_id: str, base_model: str = None):
    """Load a model (with optional LoRA adapter) for inference."""
    global _model_cache

    # Return cached model if same model_id
    if _model_cache["model"] is not None and _model_cache["model_id"] == model_id:
        print(f"Using cached model: {model_id}")
        return _model_cache["model"], _model_cache["tokenizer"]

    print(f"Loading model: {model_id}")

    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel, PeftConfig

    # Try to detect if this is a LoRA adapter or full model
    try:
        peft_config = PeftConfig.from_pretrained(model_id)
        is_adapter = True
        if base_model is None:
            base_model = peft_config.base_model_name_or_path
        print(f"Detected LoRA adapter. Base model: {base_model}")
    except Exception:
        is_adapter = False
        base_model = model_id
        print(f"Loading as full model: {model_id}")

    # Load base model
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        device_map="auto",
        torch_dtype=torch.bfloat16,
        trust_remote_code=True
    )

    # Load adapter if applicable
    if is_adapter:
        model = PeftModel.from_pretrained(model, model_id)
        print("LoRA adapter loaded successfully")

    # Load tokenizer from adapter (has chat template) or base model
    tokenizer = AutoTokenizer.from_pretrained(model_id if is_adapter else base_model)

    # Cache the model
    _model_cache["model"] = model
    _model_cache["tokenizer"] = tokenizer
    _model_cache["model_id"] = model_id

    print("Model ready for inference")
    return model, tokenizer


def run_inference(model, tokenizer, messages: list, config: dict) -> str:
    """Generate a response from the model."""

    # Apply chat template
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )

    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    # Generation parameters
    gen_config = {
        "max_new_tokens": config.get("max_new_tokens", 512),
        "temperature": config.get("temperature", 0.7),
        "top_p": config.get("top_p", 0.9),
        "do_sample": config.get("temperature", 0.7) > 0,
        "pad_token_id": tokenizer.eos_token_id,
    }

    with torch.no_grad():
        outputs = model.generate(**inputs, **gen_config)

    # Decode and extract assistant response
    full_response = tokenizer.decode(outputs[0], skip_special_tokens=True)

    # Try to extract just the assistant's response
    if "<|im_start|>assistant" in full_response:
        response = full_response.split("<|im_start|>assistant")[-1].strip()
    elif "assistant\n" in full_response:
        response = full_response.split("assistant\n")[-1].strip()
    else:
        # Return everything after the last user message
        response = full_response

    return response


def handle_inference(job_input: dict):
    """Handle inference requests."""

    model_id = job_input.get("model_id")
    if not model_id:
        return {"status": "error", "error": "No model_id provided"}

    messages = job_input.get("messages", [])
    if not messages:
        return {"status": "error", "error": "No messages provided"}

    config = job_input.get("config", {})
    base_model = job_input.get("base_model")  # Optional override

    print(f"Inference request:")
    print(f"  Model: {model_id}")
    print(f"  Messages: {len(messages)}")

    try:
        model, tokenizer = load_model_for_inference(model_id, base_model)
        response = run_inference(model, tokenizer, messages, config)

        return {
            "status": "success",
            "model_id": model_id,
            "response": response,
            "messages_count": len(messages)
        }

    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }


def handle_training(job, job_input: dict):
    """Handle training requests."""

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
    print(f"  Batch size: {config.get('batch_size', 4)}")
    print(f"  Sequence length: {config.get('max_seq_length', 2048)}")
    print(f"  Optimized for 80GB+ GPUs")

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


def handler(job):
    """Main serverless handler - routes to training or inference."""

    job_input = job["input"]
    action = job_input.get("action", "train")  # Default to training for backwards compatibility

    if action == "inference":
        return handle_inference(job_input)
    else:
        return handle_training(job, job_input)


# Start RunPod serverless worker
runpod.serverless.start({"handler": handler})
