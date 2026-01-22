"""
Axolotl Training Client for RunPod Serverless

Submit fine-tuning jobs to your Axolotl RunPod endpoint.

Usage:
    from client import AxolotlClient

    client = AxolotlClient()
    result = client.train(
        training_data=[...],
        base_model="Qwen/Qwen2.5-14B-Instruct",
        method="qlora"
    )
"""

import os
import json
import time
from typing import Optional
from pathlib import Path

try:
    import runpod
except ImportError:
    runpod = None

try:
    import requests
except ImportError:
    requests = None


class AxolotlClient:
    """Client for submitting Axolotl training jobs to RunPod."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint_id: Optional[str] = None,
    ):
        """
        Initialize the client.

        Args:
            api_key: RunPod API key (defaults to RUNPOD_API_KEY env var)
            endpoint_id: RunPod endpoint ID (defaults to AXOLOTL_ENDPOINT_ID env var)
        """
        self.api_key = api_key or os.getenv("RUNPOD_API_KEY")
        self.endpoint_id = endpoint_id or os.getenv("AXOLOTL_ENDPOINT_ID")

        if not self.api_key:
            raise ValueError("RunPod API key required. Set RUNPOD_API_KEY env var or pass api_key.")
        if not self.endpoint_id:
            raise ValueError("Endpoint ID required. Set AXOLOTL_ENDPOINT_ID env var or pass endpoint_id.")

        # Initialize RunPod SDK if available
        if runpod:
            runpod.api_key = self.api_key
            self.endpoint = runpod.Endpoint(self.endpoint_id)
        else:
            self.endpoint = None

        self.base_url = f"https://api.runpod.ai/v2/{self.endpoint_id}"

    def train(
        self,
        training_data: list,
        base_model: str = "Qwen/Qwen2.5-14B-Instruct",
        method: str = "qlora",
        num_epochs: int = 3,
        learning_rate: float = 2e-4,
        batch_size: int = 4,
        gradient_accumulation_steps: int = 4,
        max_seq_length: int = 2048,
        lora_r: int = 32,
        lora_alpha: int = 64,
        use_raft: bool = False,
        hub_model_id: Optional[str] = None,
        hub_token: Optional[str] = None,
        wait: bool = True,
        poll_interval: int = 10,
    ) -> dict:
        """
        Submit a training job.

        Args:
            training_data: List of training examples
            base_model: Hugging Face model ID
            method: Training method (qlora, lora, full)
            num_epochs: Number of training epochs
            learning_rate: Learning rate
            batch_size: Micro batch size
            gradient_accumulation_steps: Gradient accumulation steps
            max_seq_length: Maximum sequence length
            lora_r: LoRA rank
            lora_alpha: LoRA alpha
            use_raft: Enable RAFT format
            hub_model_id: Push to this HF Hub repo
            hub_token: HF token for push
            wait: Wait for completion
            poll_interval: Seconds between status checks

        Returns:
            Job result dict
        """
        payload = {
            "input": {
                "base_model": base_model,
                "training_data": training_data,
                "config": {
                    "method": method,
                    "num_epochs": num_epochs,
                    "learning_rate": learning_rate,
                    "batch_size": batch_size,
                    "gradient_accumulation_steps": gradient_accumulation_steps,
                    "max_seq_length": max_seq_length,
                    "lora_r": lora_r,
                    "lora_alpha": lora_alpha,
                    "use_raft": use_raft,
                }
            }
        }

        if hub_model_id:
            payload["input"]["config"]["hub_model_id"] = hub_model_id
        if hub_token:
            payload["input"]["config"]["hub_token"] = hub_token

        print(f"Submitting training job:")
        print(f"  Model: {base_model}")
        print(f"  Method: {method}")
        print(f"  Samples: {len(training_data)}")
        print(f"  Epochs: {num_epochs}")

        # Submit job
        if self.endpoint:
            # Use RunPod SDK
            if wait:
                result = self.endpoint.run_sync(payload, timeout=3600)
            else:
                job = self.endpoint.run(payload)
                return {"job_id": job.job_id, "status": "IN_QUEUE"}
        else:
            # Use requests
            result = self._submit_with_requests(payload, wait, poll_interval)

        return result

    def _submit_with_requests(self, payload: dict, wait: bool, poll_interval: int) -> dict:
        """Submit job using requests library."""
        if not requests:
            raise ImportError("Install requests or runpod: pip install requests")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        # Submit
        response = requests.post(
            f"{self.base_url}/run",
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        data = response.json()
        job_id = data.get("id")

        if not wait:
            return {"job_id": job_id, "status": "IN_QUEUE"}

        # Poll for completion
        print(f"Job submitted: {job_id}")
        while True:
            status_response = requests.get(
                f"{self.base_url}/status/{job_id}",
                headers=headers
            )
            status_response.raise_for_status()
            status_data = status_response.json()

            status = status_data.get("status")
            print(f"Status: {status}")

            if status == "COMPLETED":
                return status_data.get("output", {})
            elif status in ("FAILED", "CANCELLED"):
                return {"status": "error", "error": status_data.get("error", status)}

            time.sleep(poll_interval)

    def train_from_file(
        self,
        data_path: str,
        **kwargs
    ) -> dict:
        """
        Submit a training job from a JSONL file.

        Args:
            data_path: Path to JSONL training data file
            **kwargs: Additional arguments passed to train()

        Returns:
            Job result dict
        """
        data_path = Path(data_path)
        if not data_path.exists():
            raise FileNotFoundError(f"Training data not found: {data_path}")

        training_data = []
        with open(data_path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    training_data.append(json.loads(line))

        print(f"Loaded {len(training_data)} samples from {data_path}")
        return self.train(training_data=training_data, **kwargs)

    def status(self, job_id: str) -> dict:
        """Check status of a job."""
        if self.endpoint:
            job = runpod.Job(job_id, self.endpoint_id)
            return {"status": job.status()}

        headers = {"Authorization": f"Bearer {self.api_key}"}
        response = requests.get(f"{self.base_url}/status/{job_id}", headers=headers)
        response.raise_for_status()
        return response.json()


def main():
    """Example usage."""
    import argparse

    parser = argparse.ArgumentParser(description="Submit Axolotl training job")
    parser.add_argument("--data", required=True, help="Path to training data JSONL")
    parser.add_argument("--model", default="Qwen/Qwen2.5-14B-Instruct", help="Base model")
    parser.add_argument("--method", default="qlora", choices=["qlora", "lora", "full"])
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--raft", action="store_true", help="Use RAFT format")
    parser.add_argument("--hub-repo", help="Push to HF Hub repo")
    parser.add_argument("--no-wait", action="store_true", help="Don't wait for completion")
    args = parser.parse_args()

    client = AxolotlClient()
    result = client.train_from_file(
        data_path=args.data,
        base_model=args.model,
        method=args.method,
        num_epochs=args.epochs,
        use_raft=args.raft,
        hub_model_id=args.hub_repo,
        wait=not args.no_wait,
    )

    print("\nResult:")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
