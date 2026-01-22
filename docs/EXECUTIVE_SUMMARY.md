# MagisAI Training Hub - Executive Summary

## What Is This?

MagisAI Training Hub is a desktop application that helps you **create a custom AI assistant** specialized in theological Q&A. Think of it as a "training gym" for AI models where humans review and approve the training data before the AI learns from it.

---

## The Problem It Solves

Building a reliable theological Q&A AI faces two challenges:

1. **Generic AI models make mistakes** on specialized theological topics
2. **Fully automated training** can amplify errors without human oversight

MagisAI Training Hub solves this with a **human-in-the-loop** approach: humans review every piece of training data and correct AI mistakes, creating a continuous improvement cycle.

---

## How It Works (5 Simple Steps)

```
    YOUR DATA                    HUMAN REVIEW                 AI TRAINING
   ┌─────────┐               ┌───────────────┐            ┌─────────────┐
   │  CSV/   │  ──Extract──▶ │  Review Each  │ ──Send──▶  │  Train on   │
   │  PDF    │               │  Q&A Pair     │            │   RunPod    │
   └─────────┘               └───────────────┘            └─────────────┘
                                    │                            │
                                    │                            ▼
                             ┌──────┴──────┐              ┌─────────────┐
                             │   Accept/   │              │  Improved   │
                             │   Reject/   │  ◀──Flag───  │    Model    │
                             │    Edit     │   Low Scores │             │
                             └─────────────┘              └─────────────┘
```

### Step 1: Import Your Q&A Data
Load your theological Q&A pairs from CSV or PDF files. The app extracts questions and answers automatically.

### Step 2: Human Review (Data Curation)
A human reviewer examines each Q&A pair and decides:
- **Accept** - Good quality, use for training
- **Reject** - Poor quality, exclude
- **Edit** - Fix errors before accepting

### Step 3: Prepare Training Data
The app formats your approved data using **RAFT** (Retrieval-Augmented Fine-Tuning), which teaches the AI to find and cite relevant information rather than just memorizing answers.

### Step 4: Train on Cloud GPUs
Training happens on **RunPod** (cloud GPU service). You don't need expensive hardware - just click "Start Training" and the app handles everything.

### Step 5: Review & Improve
After training, the app evaluates the AI's responses. Low-scoring answers are flagged for human review. Corrections become new training data, creating a **continuous improvement loop**.

---

## Key Benefits

| Benefit | Description |
|---------|-------------|
| **Quality Control** | Humans approve all training data before AI learns from it |
| **No GPU Required** | Training runs on cloud GPUs (RunPod), not your computer |
| **Continuous Improvement** | AI mistakes get corrected and fed back into training |
| **Cost Effective** | Pay only for GPU time you use (~$0.50-2/hour) |
| **Specialized Knowledge** | Creates AI that understands theological nuances |

---

## Technical Overview (For the Curious)

### What Technologies Are Used?

| Component | Technology | Purpose |
|-----------|------------|---------|
| Desktop App | Python + CustomTkinter | User interface |
| Base Models | Qwen 2.5 (7B-14B parameters) | Starting point for training |
| Training Method | LoRA (Low-Rank Adaptation) | Efficient fine-tuning |
| Cloud GPUs | RunPod Serverless | Remote training infrastructure |
| Vector Database | Weaviate | Store documents for RAFT distractors |

### What is LoRA?

Instead of retraining the entire AI model (billions of parameters), LoRA only trains a small "adapter" layer (~1-5% of parameters). This means:
- **Faster training** (hours instead of days)
- **Lower cost** ($5-20 per training run)
- **Less memory needed** (runs on consumer GPUs)

### What is RAFT?

RAFT (Retrieval-Augmented Fine-Tuning) trains the AI to:
1. Read multiple documents (some relevant, some distractors)
2. Identify which document contains the answer
3. Extract and cite the relevant information
4. Explain its reasoning step-by-step

This creates more reliable, citation-based responses rather than AI that just "makes things up."

---

## Cost Estimate

| Item | Cost | Frequency |
|------|------|-----------|
| RunPod GPU (A6000) | ~$0.79/hour | Per training session |
| Typical training run | ~$5-15 | Per 1000 Q&A pairs |
| Weaviate Cloud | Free tier available | Monthly |
| Software | Free (open source) | One-time setup |

**Example**: Training on 388 Q&A pairs with a 14B model takes ~30-60 minutes, costing approximately $1-2.

---

## Getting Started

### Prerequisites
- Windows/Mac/Linux computer
- Python 3.10+
- RunPod account ($25 minimum credit)
- Your Q&A training data (CSV format recommended)

### Quick Start
```bash
# 1. Install
pip install -r requirements.txt

# 2. Configure (add your API keys to .env)
RUNPOD_API_KEY=your_key
RUNPOD_ENDPOINT_ID=your_endpoint

# 3. Run
python src/main.py
```

---

## Workflow Summary

```
Week 1: Data Preparation
├── Collect theological Q&A pairs
├── Import into MagisAI Training Hub
└── Human review and curation (accept/reject/edit)

Week 2: Initial Training
├── Prepare RAFT training data
├── Configure hyperparameters (or use defaults)
├── Run training on RunPod (~1 hour)
└── Review training metrics

Week 3+: Iteration
├── Evaluate model responses
├── Review flagged low-quality answers
├── Correct mistakes (becomes new training data)
└── Retrain with improved dataset
```

---

## Glossary

| Term | Definition |
|------|------------|
| **Fine-tuning** | Adapting a pre-trained AI model for a specific task |
| **LoRA** | Efficient training method that updates only a small part of the model |
| **RAFT** | Training approach that teaches AI to find and cite sources |
| **Serverless** | Cloud computing where you pay per use, not for idle time |
| **Inference** | Using a trained model to generate responses |
| **Hyperparameters** | Settings that control how training works (learning rate, epochs, etc.) |
| **Human-in-the-loop** | System design where humans review and approve AI outputs |

---

## Support

- **Documentation**: See `docs/USER_GUIDE.md` for detailed instructions
- **Technical Issues**: See `docs/SETUP_PROGRESS.md` for troubleshooting
- **Questions**: Contact mat.garcia@mvgconsulting.dev
