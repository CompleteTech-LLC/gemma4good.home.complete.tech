import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_COMFY_ROOT = '/mnt/c/users/timot/documents/projects/ai-models/stable-diffusion/stable-diffusion/ComfyUI';
const comfyRoot = process.env.COMFYUI_ROOT || DEFAULT_COMFY_ROOT;
const comfyUrl = (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const checkpoint = process.env.COMFYUI_CHECKPOINT || 'v1-5-pruned-emaonly.ckpt';

const checks = [];
checks.push({
  name: 'OPENAI_API_KEY',
  ok: Boolean(process.env.OPENAI_API_KEY),
  detail: process.env.OPENAI_API_KEY ? 'available' : 'not set',
});

checks.push(await pathCheck('ComfyUI root', comfyRoot));
checks.push(await pathCheck('ComfyUI checkpoint', join(comfyRoot, 'models', 'checkpoints', checkpoint)));
checks.push(await pathCheck('ComfyUI Windows venv config', join(comfyRoot, '.venv', 'pyvenv.cfg')));
checks.push(await pyvenvCheck(join(comfyRoot, '.venv', 'pyvenv.cfg')));
checks.push(await pathCheck('ComfyUI repaired venv', join(comfyRoot, '.venv-timot', 'Scripts', 'python.exe')));
checks.push(await repairedVenvCheck(join(comfyRoot, '.venv-timot', 'Scripts', 'python.exe')));
checks.push(await comfyApiCheck(comfyUrl));

const usable = checks.some((check) => (
  (check.name === 'OPENAI_API_KEY' && check.ok)
  || (check.name === 'ComfyUI API' && check.ok)
));

const report = {
  ok: usable,
  summary: usable
    ? 'At least one image-generation backend appears usable.'
    : 'No usable image-generation backend is currently available from this shell.',
  comfyUrl,
  comfyRoot,
  checkpoint,
  checks,
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = usable ? 0 : 1;

async function pathCheck(name, path) {
  try {
    await access(path);
    return { name, ok: true, detail: path };
  } catch {
    return { name, ok: false, detail: `${path} not found` };
  }
}

async function pyvenvCheck(path) {
  try {
    const cfg = await readFile(path, 'utf8');
    const home = (cfg.match(/^home = (.+)$/m) || [])[1] || '';
    const executable = (cfg.match(/^executable = (.+)$/m) || [])[1] || '';
    const staleUser = /\\Users\\romge\\/i.test(home) || /\\Users\\romge\\/i.test(executable);
    return {
      name: 'ComfyUI venv points to this user',
      ok: !staleUser,
      detail: staleUser ? `stale pyvenv.cfg path: ${home || executable}` : `pyvenv.cfg home: ${home || 'unknown'}`,
    };
  } catch {
    return { name: 'ComfyUI venv points to this user', ok: false, detail: `${path} could not be read` };
  }
}

async function repairedVenvCheck(path) {
  try {
    await access(path);
    return { name: 'ComfyUI repaired venv runtime', ok: true, detail: `${path} exists; expected Python 3.12 + CUDA Torch` };
  } catch {
    return { name: 'ComfyUI repaired venv runtime', ok: false, detail: `${path} not found` };
  }
}

async function comfyApiCheck(url) {
  try {
    const response = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(2000) });
    return { name: 'ComfyUI API', ok: response.ok, detail: response.ok ? `${url}/system_stats reachable` : `HTTP ${response.status}` };
  } catch (error) {
    return { name: 'ComfyUI API', ok: false, detail: `${url}/system_stats not reachable: ${error.message}` };
  }
}
