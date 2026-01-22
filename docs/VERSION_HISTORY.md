# MagisAI Training Hub - Version History

## Docker Image Versions

Track of all Docker image versions and their changes.

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| v1 | 2026-01-16 | Initial release with autoawq, pinned transformers | Deprecated |
| v2 | 2026-01-17 | Fixed max_seq_length → max_length in SFTConfig | Deprecated |
| v3 | 2026-01-17 | Removed autoawq, flexible transformers version | Deprecated |
| v4 | 2026-01-18 | Pinned requirements.txt, memory optimizations | Deprecated |
| v5 | 2026-01-18 | Message-to-text conversion, target_modules="all-linear" | Deprecated |
| v6 | 2026-01-18 | padding_side fix, EOS token, warmup fix, debug logging | Deprecated |
| v7 | 2026-01-18 | DataCollator for batching, data validation, truncation_side | **Current** |

---

## Detailed Change Log

### v7 (Current) - 2026-01-18
**Fixes tokenization/batching errors**

- Added `DataCollatorForLanguageModeling` for proper batch padding
- Added `truncation_side = "left"` to keep assistant responses when truncating
- Added data validation loop to ensure all text fields are strings
- Handles nested lists by flattening them
- Filters out empty samples
- Added error message for invalid training data

### v6 - 2026-01-18
**Fixes training loss=0 issue**

- Added `tokenizer.padding_side = "right"` (required for causal LM)
- Added EOS token at end of each training sample
- Changed `warmup_ratio=0.1` → `warmup_steps=10`
- Added `remove_unused_columns=False`
- Added `dataloader_pin_memory=False`
- Added debug logging (sample text preview, token count)

### v5 - 2026-01-18
**Message format conversion**

- Added automatic conversion from chat messages format to text
- Changed `target_modules=["q_proj",...]` → `target_modules="all-linear"`
- Added gradient checkpointing
- Added `attn_implementation="eager"`
- Added output directory fallback (`/workspace` → `/tmp`)

### v4 - 2026-01-18
**Pinned dependencies**

- Created `requirements.txt` with pinned versions
- Updated Dockerfile to use requirements.txt
- Optimized layer ordering for faster rebuilds

### v3 - 2026-01-17
**Removed autoawq**

- Removed autoawq package (not needed for LoRA training)
- Changed transformers from `==4.45.0` to `>=4.45.0`
- Upgraded pip before installing packages

### v2 - 2026-01-17
**SFTConfig parameter fix**

- Changed `max_seq_length` to `max_length` in SFTConfig
- (Later reverted - TRL API inconsistency)

### v1 - 2026-01-16
**Initial release**

- Basic SFTTrainer with LoRA support
- autoawq for AWQ model support
- Pinned transformers==4.45.0

---

## Bug Fix History

| Date | Issue | Error Message | Solution |
|------|-------|---------------|----------|
| 2026-01-16 | GraphQL query | `400 Bad Request` | Removed `serverlessDiscount` field |
| 2026-01-16 | API URL | `404 Not Found` | Changed `api.runpod.io` → `api.runpod.ai` |
| 2026-01-16 | AWQ model | `Loading AWQ requires auto-awq` | Use non-AWQ models |
| 2026-01-16 | Disk space | `No space left on device` | 100GB Network Volume |
| 2026-01-17 | SFTConfig | `unexpected keyword 'max_seq_length'` | Move to SFTTrainer |
| 2026-01-17 | SFTConfig | `unexpected keyword 'max_length'` | Move back to SFTConfig |
| 2026-01-18 | SFTTrainer | `unexpected keyword 'max_seq_length'` | Use in SFTConfig |
| 2026-01-18 | SFTTrainer | `unexpected keyword 'processing_class'` | Use `tokenizer=` instead |
| 2026-01-18 | Dataset | `KeyError: 'text'` | Add message-to-text conversion |
| 2026-01-18 | Training | `loss: 0.0, grad_norm: nan` | padding_side, EOS token fixes |
| 2026-01-18 | Timeout | `executionTimeout exceeded` | Increase RunPod timeout |
| 2026-01-18 | Batching | `Unable to create tensor...excessive nesting` | DataCollator, data validation |

---

## TRL API Compatibility Notes

The TRL (Transformer Reinforcement Learning) library has inconsistent API across versions:

| TRL Version | `max_seq_length` Location | `tokenizer` Parameter |
|-------------|--------------------------|----------------------|
| 0.8.x | SFTTrainer | `tokenizer=` |
| 0.9.x | SFTConfig | `tokenizer=` |
| 0.10+ | SFTConfig | `processing_class=` |

Current handler (v6) uses:
- `max_seq_length` in `SFTConfig`
- `tokenizer=tokenizer` in `SFTTrainer`

This is compatible with TRL 0.9.x (pinned in requirements.txt).

---

## How to Update Docker Image

When making changes to `handler.py`:

```bash
cd data/runpod

# Increment version number
docker build -t matvg621/magisai-trainer:v7 .
docker push matvg621/magisai-trainer:v7

# Update RunPod endpoint to use new version
# Dashboard → Serverless → Edit Endpoint → Change image tag
```

**Important:** Always increment version to ensure RunPod pulls the new image.
