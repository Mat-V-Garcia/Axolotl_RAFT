# MagisAI Training Hub - User Guide

A desktop application for human-in-the-loop AI training of theological Q&A models.

## Getting Started

### 1. Launch the App
```bash
cd /mnt/c/Users/matvg/Q_MagisAI/magisai-training-hub/magisai-training-hub
.venv\Scripts\activate   # Windows
python src/main.py
```

### 2. Configure Your .env File
Make sure your `.env` file has:
```
RUNPOD_API_KEY=your_api_key
RUNPOD_ENDPOINT_ID=your_endpoint_id
```

---

## Tab 1: Data Review

This is where you curate your Q&A training data.

### Loading Data

**From CSV (Recommended):**
1. Click **"Load Data"**
2. Select your CSV file
3. CSV should have columns like `Question` and `Answer` (or `Queries` and `Expected Response`)

**From JSON (Resume Previous Session):**
1. Click **"Resume"**
2. Select a previously saved `.json` session file

### Reviewing Q&A Pairs

Each Q&A pair is shown one at a time. For each pair:

| Action | Button | Keyboard | What it does |
|--------|--------|----------|--------------|
| Accept | Green ✓ | `A` | Mark as good for training |
| Reject | Red ✗ | `R` | Mark as bad, won't be used |
| Edit | Blue ✎ | `E` | Modify the answer text |
| Previous | ← | `Left Arrow` | Go to previous pair |
| Next | → | `Right Arrow` | Go to next pair |

### Bulk Actions

- **Accept All**: Accepts all pending Q&A pairs at once (with confirmation)
- **Save**: Saves your progress to a JSON file (can resume later)

### Progress Bar

Shows: `Reviewed X of Y (Z pending)`

---

## Tab 2: Training

This is where you configure and launch training jobs on RunPod.

### Step 1: Connect to RunPod

1. Click **"Connect"** in the RunPod section
2. Wait for "Connected" status (green)
3. Your endpoint should appear in the dropdown

### Step 2: Prepare Training Data

**Option A - Prepare from Curated Data:**
1. Click **"Prepare RAFT Data"**
2. This takes your accepted Q&A pairs and formats them for training
3. Wait for "Training data saved" message

**Option B - Load Existing Data:**
1. Click **"Load Existing"**
2. Select a previously prepared `.jsonl` file

### Step 3: Configure Training

**Training Type:**
- **SFT** (Supervised Fine-Tuning): Standard approach, learns from examples
- **RAFT** (Retrieval-Augmented): Includes context documents, good for Q&A
- **DPO** (Direct Preference): Learns preferences, needs paired data

**Model Selection:**
- Choose your base model from the dropdown
- Default: `Qwen/Qwen2.5-7B-Instruct`
- All models in the list are LoRA-compatible (non-AWQ)

**Hyperparameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| Learning Rate | 2e-5 | How fast the model learns |
| Epochs | 3 | Number of passes through data |
| Batch Size | 4 | Samples per training step |
| LoRA Rank | 16 | LoRA adapter size (higher = more capacity) |
| LoRA Alpha | 32 | LoRA scaling factor |
| Max Seq Length | 2048 | Maximum token length |

### Step 4: Start Training

1. Click **"Start Training"**
2. Confirm the dialog
3. Watch the progress indicator and console:
   - **Progress bar** appears with status messages
   - "Submitting job..." → "Waiting in queue..." → "Training in progress..."
   - Console shows detailed status updates
   - Final metrics displayed when complete

**Progress Indicator States:**
| Status | Meaning |
|--------|---------|
| Submitting job... | Sending data to RunPod |
| Waiting in queue... | Job queued, waiting for GPU |
| Training in progress... | Model is actively training |

### Export Options

- **Export Config**: Save your training configuration to JSON
- **Export Data**: Save your training data to a file

---

## Tab 3: Metrics & Evaluation

Review training results and flag low-quality responses.

### Running Evaluation

1. Click **"Run Quick Evaluation"**
2. The system scores each response
3. Results appear in the table

### Score Colors

| Color | Score Range | Meaning |
|-------|-------------|---------|
| Red | < 0.4 | Poor quality |
| Orange | 0.4 - 0.6 | Needs improvement |
| Yellow | 0.6 - 0.8 | Acceptable |
| Green | > 0.8 | Good quality |

### Reviewing Flagged Items

Low-scoring items appear in the "Flagged for Review" section:
1. Click on an item to view details
2. Edit the response if needed
3. Add reviewer notes
4. Click **"Save & Next"** or **"Skip"**

---

## Typical Workflow

```
1. PREPARE DATA
   └── Load CSV with Q&A pairs
   └── Review each pair (Accept/Reject/Edit)
   └── Save your session

2. TRAIN MODEL
   └── Connect to RunPod
   └── Prepare RAFT data
   └── Configure hyperparameters
   └── Start training
   └── Wait for completion

3. EVALUATE
   └── Run evaluation on test set
   └── Review flagged responses
   └── Make corrections

4. ITERATE
   └── Add corrected data to training set
   └── Retrain with improved data
```

---

## Keyboard Shortcuts Reference

| Key | Action | Tab |
|-----|--------|-----|
| `A` | Accept current Q&A | Data Review |
| `R` | Reject current Q&A | Data Review |
| `E` | Edit current answer | Data Review |
| `←` | Previous Q&A | Data Review |
| `→` | Next Q&A | Data Review |
| `Ctrl+S` | Save session | Data Review |

---

## Troubleshooting

### "RunPod API key not configured"
→ Add `RUNPOD_API_KEY=your_key` to your `.env` file

### "No endpoints found"
→ Create a serverless endpoint in RunPod dashboard first

### "Job stuck in IN_QUEUE"
→ Check if your RunPod endpoint has available workers
→ Workers may need to spin up (cold start)

### Training fails immediately
→ Check the console output for error messages
→ Verify your endpoint is using the correct Docker image

### Out of memory during training
→ Reduce batch size in hyperparameters
→ Reduce max sequence length
→ Use a smaller model

### "SFTConfig unexpected keyword argument"
→ Your RunPod endpoint is using an old Docker image
→ Update to `matvg621/magisai-trainer:v3` in RunPod dashboard

### "No module named 'transformers.models.qwen3'"
→ AWQ models require incompatible library versions
→ Use non-AWQ models (all models in dropdown are compatible)

### "No space left on device"
→ Create a Network Volume in RunPod (100GB recommended)
→ Attach the volume to your serverless endpoint

### Python path error on Windows
→ The virtual environment was created from WSL
→ Recreate it from Windows PowerShell:
```powershell
Remove-Item -Recurse -Force .venv
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

---

## File Locations

| Type | Location |
|------|----------|
| Raw data | `data/raw/` |
| Curated data | `data/curated/` |
| Training data | `data/training/` |
| Metrics | `data/metrics/` |
| Flagged items | `data/flagged/` |

---

## Tips

1. **Start small**: Test with a few Q&A pairs before loading your full dataset
2. **Save often**: Use the Save button to checkpoint your curation progress
3. **Use keyboard shortcuts**: Much faster than clicking buttons
4. **Monitor the console**: Training progress and errors appear there
5. **Check your data format**: CSV works best with clear Question/Answer columns
