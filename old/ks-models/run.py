"""Run base vs base+adapter (linked). CPU slow for 5B - use GPU host for real inference."""
from pathlib import Path
import torch
from transformers import AutoProcessor, AutoModelForMultimodalLM
from peft import PeftModel

HERE = Path(__file__).parent
BASE = "google/gemma-4-E2B-it"
ADAPTER = str(HERE / "my-gemma4-e2b-lora")
prompt = "<bos><|turn>user\nSay hello in pirate style<turn|>\n<|turn>model\n"

proc = AutoProcessor.from_pretrained(BASE)
tok = proc.tokenizer
if tok.pad_token is None:
    tok.pad_token = tok.eos_token

print("load base...")
base = AutoModelForMultimodalLM.from_pretrained(BASE, dtype=torch.bfloat16, device_map="cpu", low_cpu_mem_usage=True)
base.eval()
inp = tok(prompt, return_tensors="pt")
with torch.no_grad():
    out = base.generate(**inp, max_new_tokens=20, do_sample=False, pad_token_id=tok.eos_token_id)
print("BASE:", tok.decode(out[0], skip_special_tokens=True))

print("link adapter...")
model = PeftModel.from_pretrained(base, ADAPTER)
model.eval()
with torch.no_grad():
    out2 = model.generate(**inp, max_new_tokens=20, do_sample=False, pad_token_id=tok.eos_token_id)
print("BASE+ADAPTER:", tok.decode(out2[0], skip_special_tokens=True))
