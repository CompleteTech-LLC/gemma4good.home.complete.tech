#!/usr/bin/env node
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXPECTED_FILES = [
  'AGENTS.md',
  'DOMAIN_CONTEXT.md',
  'README.md',
  'TODO.md',
  'remote.ps1',
  'api/package.json',
  'api/server.mjs',
  'api/server.test.mjs',
  'docs/architecture.md',
  'docs/deployment.md',
  'public/menu/index.html',
  'public/menu/fieldreport/index.html',
  'public/menu/missioncontrol/index.html',
];

const SECRET_PATHS = [
  '.env',
  '.env.local',
  '.env.production',
  '.vscode/mcp.json',
];

const ALLOWED_CATEGORIES = new Set(['water_quality', 'sanitation', 'infrastructure', 'health_risk']);
const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

export function detectOneDrivePath(inputPath) {
  const normalized = String(inputPath || '').replaceAll('\\', '/').toLowerCase();
  return normalized.split('/').some((segment) => segment === 'onedrive' || segment.startsWith('onedrive '));
}

export async function validateRepoShape(root) {
  const failures = [];
  for (const relativePath of EXPECTED_FILES) {
    if (!await exists(join(root, ...relativePath.split('/')))) {
      failures.push(`Missing expected file: ${relativePath}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

export async function validateDemoData(root) {
  const demoRoot = join(root, 'demo-images');
  const failures = [];
  let checked = 0;

  if (!await exists(demoRoot)) {
    return { ok: false, checked, failures: ['Missing demo-images directory'] };
  }

  const jsonFiles = await walkFiles(demoRoot, (file) => file.endsWith('.json'));
  for (const jsonFile of jsonFiles) {
    checked += 1;
    let metadata;
    try {
      metadata = JSON.parse(await readFile(jsonFile, 'utf8'));
    } catch (error) {
      failures.push(`${relativeFrom(root, jsonFile)} is not valid JSON: ${error.message}`);
      continue;
    }

    const imageFile = typeof metadata.image_file === 'string' && metadata.image_file.trim()
      ? metadata.image_file.trim()
      : `${jsonFile.slice(0, -5)}.jpg`;
    const imagePath = imageFile === metadata.image_file ? join(dirname(jsonFile), imageFile) : imageFile;
    if (!await exists(imagePath)) {
      failures.push(`${relativeFrom(root, jsonFile)} references missing image ${imageFile}`);
    }

    const categories = Array.isArray(metadata.categories) ? metadata.categories : [];
    if (!categories.length || categories.some((category) => !ALLOWED_CATEGORIES.has(category))) {
      failures.push(`${relativeFrom(root, jsonFile)} has invalid categories`);
    }

    if (!ALLOWED_SEVERITIES.has(metadata.severity)) {
      failures.push(`${relativeFrom(root, jsonFile)} has invalid severity`);
    }
  }

  return { ok: failures.length === 0, checked, failures };
}

export async function findRepoRoot(start = process.cwd()) {
  let current = resolve(start);
  while (true) {
    if (await exists(join(current, 'AGENTS.md')) && await exists(join(current, 'DOMAIN_CONTEXT.md'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Could not find repo root from ${start}`);
    }
    current = parent;
  }
}

async function runDoctor(root) {
  if (detectOneDrivePath(root)) {
    printFailure('Workspace is under OneDrive. Move or clone this repo outside OneDrive before working here.');
    return 1;
  }

  const checks = [];
  checks.push(checkNodeVersion());
  checks.push(await checkCommand('git', ['--version'], 'git is available'));
  checks.push(await checkGitCleanReadable(root));

  const shape = await validateRepoShape(root);
  checks.push({
    ok: shape.ok,
    label: 'repo shape matches expected files',
    details: shape.failures,
  });

  checks.push(await checkTrackedSecrets(root));

  printChecks('doctor', checks);
  return checks.every((check) => check.ok) ? 0 : 1;
}

async function runDemoData(root) {
  if (detectOneDrivePath(root)) {
    printFailure('Workspace is under OneDrive. Demo-data checks are blocked here.');
    return 1;
  }

  const result = await validateDemoData(root);
  if (result.ok) {
    console.log(`OK demo-data: checked ${result.checked} metadata files`);
    return 0;
  }

  printFailure(`demo-data: checked ${result.checked} metadata files with ${result.failures.length} failure(s)`);
  for (const failure of result.failures) console.error(`- ${failure}`);
  return 1;
}

async function runApiTest(root) {
  if (detectOneDrivePath(root)) {
    printFailure('Workspace is under OneDrive. API tests are blocked here.');
    return 1;
  }

  return runInherited(process.execPath, ['--test'], join(root, 'api'));
}

async function runRemoteHealth(root) {
  if (detectOneDrivePath(root)) {
    printFailure('Workspace is under OneDrive. Remote health checks are blocked here.');
    return 1;
  }

  console.log('Read-only remote health workflow:');
  console.log('  .\\remote.ps1 pwd');
  console.log('  .\\remote.ps1 "ls -la"');
  console.log('  curl.exe -k -I https://gemma4good.home.complete.tech/');
  console.log('  curl.exe -k -I https://gemma4good.home.complete.tech/api/fieldreport/health');
  console.log('');
  console.log('Remote mutation, deploys, restarts, and file edits require explicit maintainer approval.');

  const urls = [
    'https://gemma4good.home.complete.tech/',
    'https://gemma4good.home.complete.tech/api/fieldreport/health',
  ];
  let failed = false;
  for (const url of urls) {
    try {
      const status = await headUrl(url);
      const ok = status >= 200 && status < 400;
      console.log(`${ok ? 'OK' : 'FAIL'} ${url} -> HTTP ${status}`);
      if (!ok) failed = true;
    } catch (error) {
      failed = true;
      console.error(`FAIL ${url}: ${error.message}`);
    }
  }

  return failed ? 1 : 0;
}

async function headUrl(url) {
  return new Promise((resolveStatus, rejectStatus) => {
    const req = httpsRequest(url, {
      method: 'HEAD',
      rejectUnauthorized: false,
      timeout: 10000,
    }, (res) => {
      res.resume();
      resolveStatus(res.statusCode || 0);
    });
    req.on('timeout', () => {
      req.destroy(new Error('request timed out'));
    });
    req.on('error', rejectStatus);
    req.end();
  });
}

function printHelp() {
  console.log(`gemma4good maintainer toolkit

Usage:
  node scripts/maintain.mjs doctor
  node scripts/maintain.mjs demo-data
  node scripts/maintain.mjs api-test
  node scripts/maintain.mjs remote-health

Commands:
  doctor        Validate local workspace safety and repo shape.
  demo-data     Validate demo image metadata and referenced image files.
  api-test      Run the existing API test command in api/.
  remote-health Print safe remote health commands and run read-only URL checks.
`);
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  return {
    ok: major >= 22,
    label: `Node.js ${process.versions.node} satisfies >=22`,
    details: major >= 22 ? [] : ['Install or select Node.js 22 or newer.'],
  };
}

async function checkCommand(command, args, label) {
  const result = await runCaptured(command, args, process.cwd());
  return {
    ok: result.status === 0,
    label,
    details: result.status === 0 ? [] : [`${command} ${args.join(' ')} failed with exit ${result.status}`],
  };
}

async function checkGitCleanReadable(root) {
  const result = await runCaptured('git', ['status', '--short', '--branch'], root);
  return {
    ok: result.status === 0,
    label: 'git status is readable',
    details: result.status === 0 ? [] : [result.stderr.trim() || 'git status failed'],
  };
}

async function checkTrackedSecrets(root) {
  const result = await runCaptured('git', ['ls-files', ...SECRET_PATHS], root);
  const tracked = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    ok: result.status === 0 && tracked.length === 0,
    label: 'known local secret files are not tracked',
    details: tracked.map((path) => `Tracked secret-like path: ${path}`),
  };
}

function printChecks(group, checks) {
  for (const check of checks) {
    console.log(`${check.ok ? 'OK' : 'FAIL'} ${group}: ${check.label}`);
    for (const detail of check.details || []) console.log(`  - ${detail}`);
  }
}

function printFailure(message) {
  console.error(`FAIL ${message}`);
}

async function runCaptured(command, args, cwd) {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolveResult({ status: 1, stdout, stderr: error.message });
    });
    child.on('close', (status) => {
      resolveResult({ status, stdout, stderr });
    });
  });
}

async function runInherited(command, args, cwd) {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: 'inherit',
    });
    child.on('error', (error) => {
      console.error(error.message);
      resolveResult(1);
    });
    child.on('close', (status) => {
      resolveResult(status ?? 1);
    });
  });
}

async function walkFiles(dir, predicate) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath, predicate));
    } else if (entry.isFile() && predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function relativeFrom(root, path) {
  return path.slice(root.length + 1).replaceAll('\\', '/');
}

async function main() {
  const command = process.argv[2] || 'help';
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }

  const root = await findRepoRoot();
  switch (command) {
    case 'doctor':
      return runDoctor(root);
    case 'demo-data':
      return runDemoData(root);
    case 'api-test':
      return runApiTest(root);
    case 'remote-health':
      return runRemoteHealth(root);
    default:
      printHelp();
      console.error(`Unknown command: ${command}`);
      return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      printFailure(error.message);
      process.exitCode = 1;
    });
}
