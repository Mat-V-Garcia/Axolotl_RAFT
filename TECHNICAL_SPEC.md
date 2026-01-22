# MagisAI Training Hub - Technical Specification

This document provides detailed specifications for each component of the application. Use this as your reference when implementing each module.

---

## 1. Data Models

### QAPair Dataclass

This is the core data structure representing a single question-answer pair:

```python
@dataclass
class QAPair:
    id: str                          # Unique identifier (use uuid4)
    question: str                    # The question text
    answer: str                      # The answer text (can be edited)
    source_document: str = ""        # Optional source reference
    status: str = "pending"          # pending | accepted | rejected | edited | flagged
    score: Optional[float] = None    # 0-1 evaluation score (set after evaluation)
    model_response: Optional[str] = None  # Model's generated response (for flagged review)
    reviewer_notes: str = ""         # Optional notes from human reviewer
    created_at: str                  # ISO timestamp
    updated_at: str                  # ISO timestamp
```

Status flow:
- `pending` → Initial state when extracted from CSV
- `accepted` → Human approved this pair for training
- `rejected` → Human excluded this pair from training  
- `edited` → Human modified the answer, then accepted
- `flagged` → Low evaluation score, needs human review

### RAFTSample Dataclass

Represents a single RAFT training example with distractors:

```python
@dataclass
class RAFTSample:
    id: str
    question: str
    documents: list[dict]      # List of {"id": str, "content": str, "is_oracle": bool}
    answer_with_cot: str       # Chain-of-thought answer citing document numbers
    oracle_doc_id: str         # Which document contains the answer
```

### EvaluationResult Dataclass

Stores the result of evaluating a single model response:

```python
@dataclass
class EvaluationResult:
    qa_id: str
    question: str
    expected_answer: str
    model_response: str
    score: float               # 0-1 normalized score
    raw_score: int             # 1-5 original judge rating
    explanation: str           # Judge's reasoning
    is_flagged: bool           # True if below threshold
    evaluated_at: str          # ISO timestamp
```

---

## 2. Core Module: data_manager.py

### DataManager Class

This class handles all data operations:

**CSV Extraction Method:**
```python
def extract_qa_from_CSV(self, CSV_path: Path) -> list[QAPair]:
    """
    Extract Q&A pairs from a CSV containing tables.
    
    Uses CSVplumber to:
    1. Iterate through all pages
    2. Find tables on each page
    3. Identify Question and Answer columns (by header text or position)
    4. Extract each row as a QAPair
    
    Column identification logic:
    - Look for headers containing "question", "q", "answer", "a" (case-insensitive)
    - If no recognizable headers, assume column 0 = question, column 1 = answer
    - Also look for "source", "document", "reference" columns for source_document field
    """
```

**Key Methods:**
```python
def load_from_CSV(self, CSV_path: Path) -> int:
    """Load Q&A pairs from CSV into memory. Returns count."""

def load_from_json(self, json_path: Path) -> int:
    """Load previously saved session from JSON. Returns count."""

def save_to_json(self, output_path: Optional[Path] = None) -> Path:
    """Save current Q&A pairs to JSON. Auto-generates timestamped filename if not provided."""

def get_pending(self) -> list[QAPair]:
    """Return all pairs with status 'pending'."""

def get_accepted(self) -> list[QAPair]:
    """Return all pairs with status 'accepted' or 'edited'."""

def get_flagged(self) -> list[QAPair]:
    """Return all pairs with status 'flagged'."""

def update_status(self, qa_id: str, status: str, notes: str = "") -> bool:
    """Update status of a Q&A pair. Returns True if found."""

def update_answer(self, qa_id: str, new_answer: str) -> bool:
    """Update the answer text and set status to 'edited'."""

def flag_low_scores(self, threshold: float = 0.7) -> int:
    """Flag all pairs with score below threshold. Returns count flagged."""

def get_statistics(self) -> dict:
    """Return counts: total, pending, accepted, rejected, flagged, progress_percent."""

def export_for_training(self, output_path: Optional[Path] = None) -> Path:
    """Export accepted pairs as JSONL in chat format for SFT training."""
```

---

## 3. Core Module: raft_preparer.py

### RAFT Data Preparation

RAFT (Retrieval-Augmented Fine-Tuning) trains the model to:
1. Handle a mix of relevant and irrelevant (distractor) documents
2. Identify which document actually answers the question
3. Generate chain-of-thought reasoning that cites the source

**WeaviateClient Class:**
```python
class WeaviateClient:
    """Handles connection to Weaviate for retrieving distractor documents."""
    
    def search_similar(self, query: str, limit: int = 10, exclude_content: str = "") -> list[dict]:
        """
        Search for documents similar to query.
        Exclude documents containing exclude_content (the correct answer).
        Returns list of {"id": str, "content": str}
        """
```

**RAFTDataPreparer Class:**
```python
class RAFTDataPreparer:
    def __init__(self, data_manager: DataManager):
        self.data_manager = data_manager
        self.weaviate_client = WeaviateClient()
        
        # Config from settings
        self.num_distractors = 3          # Number of distractor docs per sample
        self.oracle_probability = 0.8     # Probability of including oracle doc
    
    def prepare_raft_sample(self, qa_pair: QAPair, all_qa_pairs: list[QAPair]) -> RAFTSample:
        """
        Create a single RAFT training sample:
        1. Create oracle document from the Q&A pair
        2. Retrieve distractors from Weaviate (or use fallback)
        3. Randomly shuffle document order
        4. Generate chain-of-thought answer citing the oracle position
        """
    
    def prepare_all_samples(self, output_path: Optional[Path] = None) -> Path:
        """
        Process all accepted Q&A pairs into RAFT format.
        Save as JSONL file with chat-formatted messages.
        """
```

**Fallback Distractor Strategy:**

If Weaviate isn't available, use other Q&A pairs from the same dataset as distractors:
```python
def _create_fallback_distractors(self, qa_pairs: list[QAPair], current_qa: QAPair) -> list[dict]:
    """Use other Q&A pairs as distractors when Weaviate unavailable."""
    other_pairs = [qa for qa in qa_pairs if qa.id != current_qa.id]
    selected = random.sample(other_pairs, min(self.num_distractors, len(other_pairs)))
    return [{"id": qa.id, "content": f"{qa.question}\n\n{qa.answer}", "is_oracle": False} for qa in selected]
```

**Chain-of-Thought Answer Format:**
```python
def _generate_cot_answer(self, question: str, answer: str, oracle_position: int) -> str:
    return f"""Let me analyze the provided documents to answer: {question}

Looking at Document {oracle_position}, I find relevant information that addresses this question.

Based on Document {oracle_position}, the answer is:

{answer}"""
```

**Training Output Format:**

Each RAFT sample becomes a chat-formatted training example:
```json
{
  "messages": [
    {
      "role": "user", 
      "content": "Based on the following documents, answer the question...\n\n[Document 1]\n...\n\n[Document 2]\n...\n\nQuestion: What is..."
    },
    {
      "role": "assistant",
      "content": "Let me analyze the provided documents... Based on Document 2, the answer is..."
    }
  ]
}
```

---

## 4. Core Module: evaluator.py

### Evaluation System

Two evaluation approaches are supported:

**SimpleScorer (Fast, Local):**
Uses sentence-transformers to compute semantic similarity between expected and generated answers. Good for quick iteration during development.

```python
class SimpleScorer:
    def __init__(self):
        self._model = None  # Lazy load SentenceTransformer("all-MiniLM-L6-v2")
    
    def score(self, expected: str, response: str) -> float:
        """Return cosine similarity score 0-1."""
```

**LLM-as-Judge (Thorough, Requires Model):**
Uses a language model to evaluate response quality on a 1-5 scale.

```python
JUDGE_PROMPT_TEMPLATE = """You are evaluating the quality of an AI assistant's response to a Catholic theological question.

Question: {question}
Expected Answer: {expected_answer}
Model Response: {model_response}

Rate the response on a scale of 1-5:
1 = Completely incorrect or contradicts Church teaching
2 = Mostly incorrect with some accurate elements
3 = Partially correct but missing key points
4 = Mostly correct with minor omissions
5 = Fully correct and well-explained

Provide your rating as a single number, then a brief explanation.
Rating:"""
```

**Evaluator Class:**
```python
class Evaluator:
    def __init__(self, score_threshold: float = 0.7):
        self.score_threshold = score_threshold
    
    def set_inference_function(self, fn: Callable[[str], str]):
        """Set the function to call for judge LLM inference."""
    
    def evaluate_single(self, question, expected, response, qa_id) -> EvaluationResult:
        """Evaluate a single response using judge LLM."""
    
    def evaluate_batch(self, qa_pairs, response_generator, judge_fn, progress_callback) -> EvaluationReport:
        """Evaluate a batch of Q&A pairs. Returns aggregate report."""
```

**Flagging Logic:**
```python
def flag_and_save_low_scores(data_manager: DataManager, threshold: float = 0.7) -> int:
    """
    After evaluation, call this to:
    1. Mark all pairs with score < threshold as 'flagged'
    2. Save the updated data to JSON
    3. Return count of flagged items
    """
```

---

## 5. UI Module: app.py

### Main Application Structure

```python
class App(ctk.CTk):
    def __init__(self):
        # Set appearance mode and color theme
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        
        # Configure window
        self.title("MagisAI Training Hub")
        self.geometry("1200x800")
        self.minsize(900, 600)
        
        # Shared state
        self.data_manager = DataManager()
        
        # Frame cache for lazy loading
        self._frames: dict[Type, ctk.CTkFrame] = {}
        self._current_frame = None
        
        # Create layout: sidebar + content area
        self._create_layout()
        
        # Start with Data Review selected
        self._show_frame(DataReviewFrame)
```

**Frame Switching Pattern:**
```python
def _show_frame(self, frame_class: Type):
    """
    Switch to displaying the specified frame.
    Frames are created lazily on first access.
    Call frame.on_show() if it exists to refresh data.
    """
```

### Sidebar Component

The sidebar should contain:
1. App title "MagisAI" with subtitle "Training Hub"
2. Navigation buttons with icons:
   - 📋 Data Review
   - 🎯 Training  
   - 📊 Metrics
3. Version number at bottom

Buttons should have selected/unselected visual states.

---

## 6. UI Frame: data_review.py

### Data Review Screen Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Data Review                    [Load CSV] [Resume] [Save]       │
├──────────────────────────────────────────────────────────────────┤
│  file_name.CSV                                                   │
│  [████████████░░░░░░░░] 45/200 reviewed                          │
├──────────────────────────────────────────────────────────────────┤
│  Question                                        [PENDING]       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ What does the Church teach about...                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Answer                                                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ The Catechism states that...                               │  │
│  │ (editable when in edit mode)                               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [✓ Accept (A)]  [✎ Edit (E)]  [✗ Reject (R)]                   │
│                                                                  │
│  [← Previous]                                    [Next →]        │
└──────────────────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts

Bind these after the frame is created:
```python
SHORTCUTS = {
    "accept": "a",
    "reject": "r", 
    "edit": "e",
    "next": "Right",
    "previous": "Left",
    "save": "Control-s",
}
```

### Status Badge Colors

```python
STATUS_COLORS = {
    "pending": "gray40",
    "accepted": "green",
    "rejected": "red",
    "edited": "blue",
    "flagged": "orange",
}
```

---

## 7. UI Frame: training.py

### Training Screen Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Training Configuration                                          │
├──────────────────────────────────────────────────────────────────┤
│  Training Type:  ○ SFT   ● RAFT   ○ DPO (coming soon)           │
│                                                                  │
│  [Description of selected training type]                         │
├──────────────────────────────────────────────────────────────────┤
│  Base Model: [Qwen/Qwen2.5-14B-Instruct-AWQ        ▼]           │
│                                                                  │
│  Dataset: [Browse...]  curated_qa_2024.json                     │
│  Status: 234 accepted pairs ready for training                   │
├──────────────────────────────────────────────────────────────────┤
│  Hyperparameters                                                 │
│  Learning Rate: [2e-5    ]    Epochs: [3  ]                     │
│  Batch Size:    [4       ]    LoRA Rank: [16 ]                  │
├──────────────────────────────────────────────────────────────────┤
│  [📦 Prepare Data]  [📤 Export for RunPod]  [⚙️ Export Config]   │
├──────────────────────────────────────────────────────────────────┤
│  Console Output                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ > Preparing RAFT data from 234 accepted pairs...           │  │
│  │ > Retrieving distractors from Weaviate...                  │  │
│  │ > ✓ Saved to: raft_training_20240115.jsonl                 │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Training Type Descriptions

```python
TRAINING_DESCRIPTIONS = {
    "sft": "SFT fine-tunes directly on question-answer pairs. Simple but effective for basic instruction following.",
    "raft": "RAFT trains the model to identify relevant documents among distractors and cite sources. Best for RAG applications.",
    "dpo": "DPO training is not yet implemented.",
}
```

---

## 8. UI Frame: metrics.py

### Metrics Screen Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Metrics & Review              [📂 Load Eval] [▶ Run Evaluation] │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Total    │ │ Avg Score│ │ Flagged  │ │ Reviewed │            │
│  │   500    │ │   78.5%  │ │    23    │ │    12    │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
├──────────────────────────────────────────────────────────────────┤
│  Score Distribution                                              │
│  ⭐1: 5  |  ⭐2: 18  |  ⭐3: 42  |  ⭐4: 156  |  ⭐5: 279       │
├──────────────────────────────────────────────────────────────────┤
│  🔍 Flagged Items for Human Review          Threshold: [0.7]    │
├──────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ [Score: 45%]                                    ID: abc123 │  │
│  │ Question: What is the Church's teaching on...              │  │
│  │                                                            │  │
│  │ Model Response (Low Score):     │ Expected Answer:         │  │
│  │ "I'm not sure about this..."    │ "The Catechism states..." │  │
│  │                                                            │  │
│  │ [✓ Accept Correction]  [✗ Reject]  [Skip]                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│  (scrollable list of flagged items)                             │
└──────────────────────────────────────────────────────────────────┘
```

### Flagged Item Card

Each flagged item should display:
1. Score badge with color coding (red for very low, orange for borderline)
2. The original question
3. Side-by-side comparison: Model's response vs Expected answer
4. Editable expected answer textbox (so reviewer can correct it)
5. Action buttons: Accept Correction, Reject, Skip

### Score Color Coding

```python
def get_score_color(score: float) -> str:
    if score < 0.3:
        return "#8B0000"  # Dark red
    elif score < 0.5:
        return "#CD5C5C"  # Indian red  
    elif score < 0.7:
        return "#DAA520"  # Goldenrod/orange
    else:
        return "#228B22"  # Forest green
```

---

## 9. Configuration: settings.py

```python
"""All configuration constants for the application."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# === Paths ===
PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
CURATED_DATA_DIR = DATA_DIR / "curated"
TRAINING_DATA_DIR = DATA_DIR / "training"
METRICS_DIR = DATA_DIR / "metrics"
FLAGGED_DIR = DATA_DIR / "flagged"

# === Weaviate ===
WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://localhost:8080")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY", "")
WEAVIATE_COLLECTION_NAME = os.getenv("WEAVIATE_COLLECTION", "MagisDocuments")

# === RunPod ===
RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "")
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID", "")

# === Models ===
DEFAULT_BASE_MODEL = "Qwen/Qwen2.5-14B-Instruct-AWQ"
SUPPORTED_MODELS = [
    "Qwen/Qwen2.5-14B-Instruct-AWQ",
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-14B-Instruct",
]

# === Training Defaults ===
DEFAULT_TRAINING_CONFIG = {
    "learning_rate": 2e-5,
    "num_epochs": 3,
    "batch_size": 4,
    "gradient_accumulation_steps": 4,
    "lora_rank": 16,
    "lora_alpha": 32,
}

# === RAFT ===
RAFT_CONFIG = {
    "num_distractor_docs": 3,
    "oracle_probability": 0.8,
    "retrieval_top_k": 10,
}

# === Evaluation ===
EVAL_CONFIG = {
    "score_threshold": 0.7,
    "batch_size": 8,
}

# === UI ===
UI_CONFIG = {
    "appearance_mode": "dark",
    "color_theme": "blue",
    "window_width": 1200,
    "window_height": 800,
    "sidebar_width": 200,
}

# === Shortcuts ===
SHORTCUTS = {
    "accept": "a",
    "reject": "r",
    "edit": "e",
    "next": "Right",
    "previous": "Left",
    "save": "Control-s",
}
```

---

## 10. Error Handling Guidelines

1. **CSV Parsing Errors**: If a CSV doesn't contain recognizable tables, show a helpful message suggesting the expected format.

2. **Weaviate Connection**: If Weaviate isn't available, gracefully fall back to using other Q&A pairs as distractors. Log a warning but don't crash.

3. **File Operations**: Always use try/except around file I/O and show user-friendly error messages via messagebox.

4. **Empty States**: Handle cases where no data is loaded (show helpful prompts instead of errors).

5. **Thread Safety**: UI updates from background threads must use `self.after(0, callback)` to run on the main thread.
