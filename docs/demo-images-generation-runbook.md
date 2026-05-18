# Gemma4Good Demo Image Generation Runbook

This dataset is ready for direct per-record image regeneration, but a generation backend must be available before running a 300-image batch.

## Current Backend Status

Run:

```bash
node scripts/check-demo-image-generation-prereqs.mjs
```

Current diagnosis from this machine after repair:

- `OPENAI_API_KEY` is not set.
- Local ComfyUI exists at `/mnt/c/users/timot/documents/projects/ai-models/stable-diffusion/stable-diffusion/ComfyUI`.
- The checkpoint exists at `ComfyUI/models/checkpoints/v1-5-pruned-emaonly.ckpt`.
- A repaired venv exists at `ComfyUI\.venv-timot`.
- `ComfyUI\.venv-timot` uses Python 3.12.10 and CUDA Torch `2.12.0+cu130`.
- ComfyUI is reachable at `http://127.0.0.1:8188/system_stats` when started with `.venv-timot`.
- The original ComfyUI `.venv/pyvenv.cfg` still points to stale user path `C:\Users\romge\AppData\Local\Programs\Python\Python312`.
- The older Stable Diffusion WebUI `venv/pyvenv.cfg` points to stale user path `C:\Users\romge\AppData\Local\Programs\Python\Python310`.

The bundled launcher currently fails with:

```text
No Python at '"C:\Users\romge\AppData\Local\Programs\Python\Python312\python.exe'
```

## Option A: Use OpenAI Image Generation

Set an API key in the shell and run a small batch first:

```bash
OPENAI_API_KEY=... node scripts/regenerate-demo-images.mjs --limit 3
node scripts/verify-demo-images.mjs
```

Then run the full batch:

```bash
OPENAI_API_KEY=... node scripts/regenerate-demo-images.mjs --limit 300
```

## Option B: Use Repaired Local ComfyUI

Python 3.12 was installed at user scope with `winget`, and a new venv was created beside the stale one:

```powershell
winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
cd C:\Users\timot\Documents\projects\ai-models\stable-diffusion\stable-diffusion\ComfyUI
C:\Users\timot\AppData\Local\Programs\Python\Python312\python.exe -m venv .venv-timot
.\.venv-timot\Scripts\python.exe -m pip install --upgrade pip
.\.venv-timot\Scripts\pip.exe install -r requirements.txt
.\.venv-timot\Scripts\pip.exe install --force-reinstall torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130
```

Start ComfyUI with the repaired venv:

```powershell
cd C:\Users\timot\Documents\projects\ai-models\stable-diffusion\stable-diffusion\ComfyUI
.\.venv-timot\Scripts\python.exe main.py --listen 0.0.0.0 --port 8188
```

If CUDA is unavailable, add `--cpu`, but the full dataset run should use CUDA.

From WSL, ComfyUI can also be started as a Windows background process:

```powershell
Start-Process `
  -WorkingDirectory 'C:\Users\timot\Documents\projects\ai-models\stable-diffusion\stable-diffusion\ComfyUI' `
  -FilePath 'C:\Users\timot\Documents\projects\ai-models\stable-diffusion\stable-diffusion\ComfyUI\.venv-timot\Scripts\python.exe' `
  -ArgumentList 'main.py --listen 0.0.0.0 --port 8188'
```

Confirm it is reachable from this repo:

```bash
node scripts/check-demo-image-generation-prereqs.mjs
```

Generate a small test batch:

```bash
COMFYUI_URL=http://127.0.0.1:8188 node scripts/regenerate-demo-images-comfyui.mjs --limit 3
node scripts/verify-demo-images.mjs
```

## QA And Completion

Build the review sheet:

```bash
node scripts/build-demo-image-qa-index.mjs
```

Mark records after reviewing regenerated images:

```bash
node scripts/update-demo-image-quality.mjs --id <record-id> --status approved
node scripts/update-demo-image-quality.mjs --id <record-id> --status rejected
```

The goal is complete only when:

```bash
node scripts/verify-demo-images.mjs --strict
```

exits successfully and `docs/demo-images-verification-report.json` shows `"complete": true`.
