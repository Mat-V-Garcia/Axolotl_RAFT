# MagisAI Training Hub - Project Brief

## Overview

I need you to build a desktop application called **MagisAI Training Hub** using Python and CustomTkinter. This is a human-in-the-loop (HITL) training tool for my theological Q&A application called MagisAI, which serves hundreds of thousands of Catholic users.

The application has three main purposes:

1. **Data Curation**: Extract Q&A pairs from CSV documents and allow me to review, accept, reject, or edit each pair before it becomes training data.

2. **Training Preparation**: Prepare the curated data for fine-tuning using the RAFT (Retrieval-Augmented Fine-Tuning) methodology, which involves adding distractor documents from my Weaviate vector database.

3. **Evaluation & Human Review**: After training and evaluation, surface low-scoring model responses so I can correct them. These corrections then become new high-quality training data for the next iteration.

---

## My Current Setup

Here's the technical context you need to know about my existing infrastructure:

**Model**: I'm using `Qwen/Qwen2.5-14B-Instruct-AWQ` running on RunPod. Training happens remotely on RunPod, not locally. This desktop app handles data preparation and exports files that I then transfer to RunPod.

**Vector Database**: I have an existing Weaviate instance that stores theological documents (Church documents, Catechism, papal encyclicals, etc.). The RAFT preparation step should pull distractor documents from this database.

**Data Source**: My Q&A training data comes from CSVs that contain tables/grids with Question and Answer columns. The app needs to parse these CSVs and extract the Q&A pairs.

**Operating System**: I'm on Windows, but the code should be cross-platform compatible.

---

## Core User Workflow

Here's how I'll use the application day-to-day:

### Phase 1: Data Curation
1. I load a CSV containing a Q&A grid (questions in one column, answers in another)
2. The app extracts all Q&A pairs from the CSV tables
3. I review each pair one at a time, using keyboard shortcuts for speed:
   - Press **A** to accept a good Q&A pair
   - Press **R** to reject a problematic pair
   - Press **E** to edit the answer, then accept
   - Arrow keys to navigate between pairs
4. My progress is saved so I can resume later

### Phase 2: Training Preparation
1. I select the curated dataset (accepted Q&A pairs)
2. I choose the training type (SFT or RAFT)
3. For RAFT, the app retrieves distractor documents from Weaviate and formats the training data with:
   - The question
   - A mix of the "oracle" document (contains the answer) and distractor documents
   - A chain-of-thought formatted answer that cites the oracle
4. I configure hyperparameters (learning rate, epochs, batch size, LoRA rank)
5. I export the training data as JSONL files to transfer to RunPod

### Phase 3: Evaluation Review (The Key Feature)
1. After training on RunPod, I run evaluation which scores model responses
2. I load the evaluation results into this app
3. The app shows me a **review queue** of responses that scored below the threshold
4. For each flagged item, I see:
   - The original question
   - The model's poor response
   - The expected answer (which I can edit/correct)
5. I correct the answer and accept it, or reject the pair entirely
6. These corrections become new training data for the next iteration

This creates a virtuous feedback loop where the model's weakest responses get human attention and feed back into training.

---

## Technical Requirements

### Dependencies

The application should use these Python packages:

```
customtkinter>=5.2.0      # UI framework
pillow>=10.0.0            # Image handling for CustomTkinter
CSVplumber>=0.10.0        # CSV table extraction
pandas>=2.0.0             # Data manipulation
matplotlib>=3.7.0         # Charts in the metrics dashboard
weaviate-client>=4.4.0    # Connect to my Weaviate instance
transformers>=4.40.0      # Model utilities
datasets>=2.18.0          # Dataset handling
sentence-transformers     # For simple similarity scoring
python-dotenv>=1.0.0      # Environment variable management
tqdm>=4.66.0              # Progress bars
```

### Project Structure

Please create this directory structure:

```
magisai-training-hub/
├── .venv/                    # Virtual environment
├── src/
│   ├── __init__.py
│   ├── main.py              # Entry point
│   ├── config/
│   │   ├── __init__.py
│   │   └── settings.py      # All configuration constants
│   ├── core/
│   │   ├── __init__.py
│   │   ├── data_manager.py  # CSV extraction, data loading/saving
│   │   ├── raft_preparer.py # RAFT training data preparation
│   │   └── evaluator.py     # Scoring and flagging logic
│   └── ui/
│       ├── __init__.py
│       ├── app.py           # Main CustomTkinter application
│       └── frames/
│           ├── __init__.py
│           ├── data_review.py   # Q&A curation screen
│           ├── training.py      # Training configuration screen
│           └── metrics.py       # Metrics and flagged review screen
├── data/
│   ├── raw/                 # Where I put source CSVs
│   ├── curated/             # Saved curated Q&A (JSON files)
│   ├── training/            # Exported training data (JSONL)
│   ├── metrics/             # Evaluation reports
│   └── flagged/             # Low-score items for review
├── requirements.txt
├── .env.example             # Template for environment variables
├── .env                     # Actual credentials (gitignored)
└── README.md
```

### Configuration via Environment Variables

The app should read these from a `.env` file:

```
WEAVIATE_URL=http://localhost:8080
WEAVIATE_API_KEY=
WEAVIATE_COLLECTION=MagisDocuments

RUNPOD_API_KEY=
RUNPOD_ENDPOINT_ID=

JUDGE_MODEL=Qwen/Qwen2.5-14B-Instruct-AWQ
```

---

## UI Design

The application should have a **sidebar navigation** on the left with three main sections:

1. **📋 Data Review** - The Q&A curation interface
2. **🎯 Training** - Training configuration and data preparation
3. **📊 Metrics** - Evaluation results and flagged item review

Use CustomTkinter's dark mode by default. The interface should be clean and professional, optimized for rapid keyboard-driven workflows.

---

## Success Criteria

The project is complete when:

1. I can run `python src/main.py` and the CustomTkinter window opens without errors
2. I can load a CSV and see extracted Q&A pairs in the Data Review screen
3. Keyboard shortcuts (A, R, E, arrows) work for rapid curation
4. The Training screen lets me prepare RAFT data (even if Weaviate isn't connected, it should use fallback distractors)
5. The Metrics screen displays a review queue where I can correct flagged responses
6. All data is persisted to JSON files in the data/ directories

---

## Next Steps

After you read this brief, please proceed to read the detailed technical specification in `TECHNICAL_SPEC.md`, then follow the setup instructions in `SETUP_INSTRUCTIONS.md`.
