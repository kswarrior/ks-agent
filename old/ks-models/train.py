"""Gemma 4 E2B LoRA fine-tune - CPU smoke test (2 steps). Same pattern works on GPU for real runs."""
from pathlib import Path
import torch
from datasets import load_dataset
from transformers import AutoProcessor, AutoModelForMultimodalLM, TrainingArguments, Trainer, DataCollatorForLanguageModeling
from peft import LoraConfig, get_peft_model

HERE = Path(__file__).parent
MID = "google/gemma-4-E2B-it"

print(f"torch {torch.__version__}")
proc = AutoProcessor.from_pretrained(MID)
tok = proc.tokenizer
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
print(f"tok vocab {len(tok)}")

print("load model bf16 cpu...")
model = AutoModelForMultimodalLM.from_pretrained(MID, dtype=torch.bfloat16, device_map="cpu", low_cpu_mem_usage=True)
print(f"model params {sum(p.numel() for p in model.parameters())}")

print("apply LoRA r=4 (language_model only - audio/vision use Gemma4ClippableLinear, unsupported by PEFT)...")
cfg = LoraConfig(r=4, lora_alpha=8, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM", target_modules=r".*language_model.*(q_proj|v_proj)$")
model = get_peft_model(model, cfg)
model.print_trainable_parameters()
model.config.pad_token_id = tok.eos_token_id

print("load dataset train.jsonl...")
ds = load_dataset("json", data_files=str(HERE / "train.jsonl"), split="train")
def f(x):
    o = tok(x["text"], truncation=True, max_length=64)
    o["labels"] = o["input_ids"].copy()
    return o
ds = ds.map(f)
print(f"dataset {len(ds)}")

# For real GPU run: r=16, max_steps=300-500, use Unsloth FastLanguageModel 4-bit on T4.
args = TrainingArguments(output_dir=str(HERE / "outputs"), per_device_train_batch_size=1, max_steps=2, logging_steps=1, save_steps=10, save_total_limit=1, learning_rate=2e-4, report_to="none", use_cpu=True, seed=3407)
trainer = Trainer(model=model, args=args, train_dataset=ds, data_collator=DataCollatorForLanguageModeling(tok, mlm=False))
print("=== TRAIN START ===")
r = trainer.train()
print(f"=== DONE loss={r.training_loss:.4f} steps={r.global_step} ===")
model.save_pretrained(str(HERE / "my-gemma4-e2b-lora"))
print("saved adapter to ks-models/my-gemma4-e2b-lora")
