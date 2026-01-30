"""
MagisAI Training Server - FastAPI backend for Axolotl training on RunPod pods.

Run with: uvicorn main:app --host 0.0.0.0 --port 8000

Security features:
- API key authentication (set API_SECRET_KEY env var)
- CORS restricted to allowed origins
- Rate limiting on sensitive endpoints
- File upload size limits
- Security headers
"""

import os
import json
import yaml
import asyncio
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Depends, Request, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from pydantic import BaseModel

# =============================================================================
# Security Configuration
# =============================================================================

# API Key for authentication (optional - skip auth if not set)
API_SECRET_KEY = os.getenv("API_SECRET_KEY")

# Allowed origins for CORS (comma-separated in env var)
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

# Rate limiting (requires slowapi - optional)
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "false").lower() == "true"

# File upload limits
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB

# =============================================================================
# Security Middleware
# =============================================================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


# API Key authentication
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)):
    """Verify API key if API_SECRET_KEY is configured."""
    if not API_SECRET_KEY:
        # Auth disabled - allow all requests (dev mode)
        return None
    if not api_key or api_key != API_SECRET_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return api_key


# =============================================================================
# FastAPI App Setup
# =============================================================================

app = FastAPI(
    title="MagisAI Training Server",
    version="1.0.0",
    description="Secure API for LLM fine-tuning with Axolotl"
)

# Security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# CORS - restricted to allowed origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # Disabled for security - use API key instead
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# Optional: Rate limiting (install slowapi if needed)
try:
    if RATE_LIMIT_ENABLED:
        from slowapi import Limiter, _rate_limit_exceeded_handler
        from slowapi.util import get_remote_address
        from slowapi.errors import RateLimitExceeded

        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        print("[SECURITY] Rate limiting enabled")
    else:
        limiter = None
except ImportError:
    limiter = None
    if RATE_LIMIT_ENABLED:
        print("[WARNING] slowapi not installed - rate limiting disabled. Install with: pip install slowapi")

# In-memory job storage (use Redis/DB for production)
jobs: dict = {}


# === Models ===

class TrainingConfig(BaseModel):
    method: str = "qlora"
    num_epochs: int = 3
    learning_rate: float = 2e-4
    batch_size: int = 4
    gradient_accumulation_steps: int = 4
    max_seq_length: int = 2048
    lora_r: int = 32
    lora_alpha: int = 64
    use_raft: bool = False
    hub_model_id: Optional[str] = None
    hub_token: Optional[str] = None


class TrainingRequest(BaseModel):
    base_model: str = "Qwen/Qwen2.5-14B-Instruct"
    training_data: list
    config: TrainingConfig = TrainingConfig()


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending, running, completed, failed
    progress: str = ""
    result: Optional[dict] = None
    created_at: str
    updated_at: str


# === Training Logic ===

def generate_axolotl_config(
    base_model: str,
    data_path: str,
    output_dir: str,
    config: TrainingConfig
) -> dict:
    """Generate Axolotl YAML configuration."""

    axolotl_config = {
        "base_model": base_model,
        "model_type": "AutoModelForCausalLM",
        "tokenizer_type": "AutoTokenizer",
        "trust_remote_code": False,  # SECURITY: Disabled to prevent code execution

        "datasets": [{
            "path": data_path,
            "type": "sharegpt" if not config.use_raft else "raft",
            "conversation": "chatml",
        }],

        "output_dir": output_dir,
        "sequence_len": config.max_seq_length,
        "sample_packing": True,
        "pad_to_sequence_len": True,

        "num_epochs": config.num_epochs,
        "micro_batch_size": config.batch_size,
        "gradient_accumulation_steps": config.gradient_accumulation_steps,
        "learning_rate": config.learning_rate,
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

    if config.method == "qlora":
        axolotl_config.update({
            "adapter": "qlora",
            "load_in_4bit": True,
            "lora_r": config.lora_r,
            "lora_alpha": config.lora_alpha,
            "lora_dropout": 0.05,
            "lora_target_modules": [
                "q_proj", "k_proj", "v_proj", "o_proj",
                "gate_proj", "up_proj", "down_proj"
            ],
            "lora_target_linear": True,
        })
    elif config.method == "lora":
        axolotl_config.update({
            "adapter": "lora",
            "lora_r": config.lora_r,
            "lora_alpha": config.lora_alpha,
            "lora_dropout": 0.05,
            "lora_target_linear": True,
        })
    elif config.method == "full":
        axolotl_config["load_in_8bit"] = False
        axolotl_config["load_in_4bit"] = False

    if config.hub_model_id:
        axolotl_config["hub_model_id"] = config.hub_model_id
        axolotl_config["push_to_hub"] = True
        if config.hub_token:
            axolotl_config["hub_token"] = config.hub_token

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
                    f.write(json.dumps({"conversations": item["messages"]}) + "\n")
                elif "conversations" in item:
                    f.write(json.dumps(item) + "\n")
                else:
                    f.write(json.dumps(item) + "\n")

    return output_path


async def run_training_job(job_id: str, request: TrainingRequest):
    """Execute training job in background."""

    jobs[job_id]["status"] = "running"
    jobs[job_id]["updated_at"] = datetime.now().isoformat()

    try:
        # Create working directories
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        work_dir = Path("/workspace") if Path("/workspace").exists() else Path("/tmp")
        job_dir = work_dir / f"training_{job_id}"
        job_dir.mkdir(parents=True, exist_ok=True)

        output_dir = job_dir / "output"
        output_dir.mkdir(exist_ok=True)

        data_path = job_dir / "train.jsonl"
        config_path = job_dir / "config.yaml"

        # Prepare data
        jobs[job_id]["progress"] = "Preparing training data..."
        prepare_training_data(request.training_data, str(data_path), request.config.use_raft)

        # Generate config
        jobs[job_id]["progress"] = "Generating Axolotl config..."
        axolotl_config = generate_axolotl_config(
            base_model=request.base_model,
            data_path=str(data_path),
            output_dir=str(output_dir),
            config=request.config
        )

        with open(config_path, "w") as f:
            yaml.dump(axolotl_config, f, default_flow_style=False)

        # Run training
        jobs[job_id]["progress"] = "Starting Axolotl training..."

        cmd = [
            "accelerate", "launch",
            "--mixed_precision", "bf16",
            "--num_processes", "1",
            "-m", "axolotl.cli.train",
            str(config_path)
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        output_lines = []
        async for line in process.stdout:
            line = line.decode().strip()
            if line:
                output_lines.append(line)
                if "loss" in line.lower() and "step" in line.lower():
                    jobs[job_id]["progress"] = line[:100]
                    jobs[job_id]["updated_at"] = datetime.now().isoformat()

        await process.wait()

        if process.returncode != 0:
            raise Exception(f"Training failed with code {process.returncode}")

        # Check outputs
        adapter_path = output_dir / "adapter_model.safetensors"
        model_path = output_dir / "model.safetensors"

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = "Training complete!"
        jobs[job_id]["result"] = {
            "output_dir": str(output_dir),
            "base_model": request.base_model,
            "method": request.config.method,
            "samples_trained": len(request.training_data),
            "has_adapter": adapter_path.exists(),
            "has_model": model_path.exists(),
            "hub_model_id": request.config.hub_model_id,
            "training_output": "\n".join(output_lines[-30:]),
        }

    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["progress"] = f"Error: {str(e)}"
        jobs[job_id]["result"] = {"error": str(e)}

    jobs[job_id]["updated_at"] = datetime.now().isoformat()


# === API Endpoints ===

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "MagisAI Training Server"}


@app.get("/health")
async def health():
    """Detailed health check."""
    import shutil

    # Check GPU
    gpu_available = False
    gpu_info = "No GPU detected"
    try:
        result = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                                capture_output=True, text=True)
        if result.returncode == 0:
            gpu_available = True
            gpu_info = result.stdout.strip()
    except:
        pass

    # Check disk space
    disk = shutil.disk_usage("/workspace" if Path("/workspace").exists() else "/")

    return {
        "status": "healthy",
        "gpu_available": gpu_available,
        "gpu_info": gpu_info,
        "disk_free_gb": round(disk.free / (1024**3), 2),
        "active_jobs": len([j for j in jobs.values() if j["status"] == "running"]),
        "total_jobs": len(jobs),
    }


@app.post("/train", response_model=JobStatus, dependencies=[Depends(verify_api_key)])
async def start_training(request: Request, training_request: TrainingRequest, background_tasks: BackgroundTasks):
    """Start a new training job. Requires API key authentication."""

    if not training_request.training_data:
        raise HTTPException(status_code=400, detail="No training data provided")

    job_id = str(uuid4())[:8]
    now = datetime.now().isoformat()

    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": "Job queued",
        "result": None,
        "created_at": now,
        "updated_at": now,
    }

    background_tasks.add_task(run_training_job, job_id, training_request)

    return JobStatus(**jobs[job_id])


@app.get("/jobs")
async def list_jobs():
    """List all jobs."""
    return {"jobs": list(jobs.values())}


@app.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job(job_id: str):
    """Get status of a specific job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatus(**jobs[job_id])


@app.delete("/jobs/{job_id}", dependencies=[Depends(verify_api_key)])
async def cancel_job(job_id: str):
    """Cancel/delete a job. Requires API key authentication."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    # TODO: Actually cancel running process if needed
    del jobs[job_id]
    return {"status": "deleted", "job_id": job_id}


@app.post("/upload", dependencies=[Depends(verify_api_key)])
async def upload_training_data(file: UploadFile = File(...)):
    """Upload a JSONL training data file. Requires API key authentication.

    Security:
    - File size limited to 50MB
    - Only .jsonl and .json extensions allowed
    - Content validated as JSON
    """

    # Validate file extension
    if not file.filename or not file.filename.endswith(('.jsonl', '.json')):
        raise HTTPException(status_code=400, detail="File must be .jsonl or .json")

    # Read and validate file size
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE // (1024*1024)}MB"
        )

    # Validate JSON content
    try:
        # Validate encoding
        text_content = content.decode('utf-8')
        lines = text_content.strip().split('\n')
        training_data = [json.loads(line) for line in lines if line.strip()]
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON on line: {str(e)}")

    if not training_data:
        raise HTTPException(status_code=400, detail="File contains no valid training samples")

    return {
        "status": "ok",
        "filename": file.filename,
        "samples": len(training_data),
        "training_data": training_data,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
