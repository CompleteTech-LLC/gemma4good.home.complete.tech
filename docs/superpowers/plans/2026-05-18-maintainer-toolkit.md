# Maintainer Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dependency-free local maintenance commands and docs for `gemma4good.home.complete.tech`.

**Architecture:** Implement a Node 22 CLI in `scripts/maintain.mjs`, tested by `node --test`, with local-only checks for repo shape, OneDrive path safety, API tests, demo metadata, and read-only remote health guidance. Wire the commands into docs, README, AGENTS.md, and VS Code tasks.

**Tech Stack:** Node 22 built-ins, PowerShell command examples, existing VS Code tasks.

---

### Task 1: Maintainer CLI Tests

**Files:**
- Create: `scripts/maintain.test.mjs`

- [ ] **Step 1: Write failing tests**

Create tests that import pure helpers from `scripts/maintain.mjs` and verify:

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  detectOneDrivePath,
  validateRepoShape,
  validateDemoData,
} from './maintain.mjs';

test('detectOneDrivePath flags OneDrive-backed paths', () => {
  assert.equal(detectOneDrivePath('C:\\Users\\Admin\\OneDrive\\Documents\\Repo'), true);
  assert.equal(detectOneDrivePath('C:\\Users\\Admin\\src\\Repo'), false);
});

test('validateRepoShape reports missing expected files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'g4g-shape-'));
  await writeFile(join(root, 'README.md'), '# test\n');
  const result = await validateRepoShape(root);
  assert.equal(result.ok, false);
  assert(result.failures.some((failure) => failure.includes('AGENTS.md')));
});

test('validateDemoData accepts paired demo metadata and image files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'g4g-demo-'));
  const dir = join(root, 'demo-images', 'water_quality');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'sample.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await writeFile(join(dir, 'sample.json'), JSON.stringify({
    id: 'sample',
    image_file: 'sample.jpg',
    categories: ['water_quality'],
    severity: 'high',
    timestamp: '2026-05-18T00:00:00.000Z',
    location: { city: 'Mogadishu', country: 'Somalia' }
  }));
  const result = await validateDemoData(root);
  assert.equal(result.ok, true);
  assert.equal(result.checked, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/maintain.test.mjs`

Expected: fail because `scripts/maintain.mjs` does not exist.

### Task 2: Maintainer CLI Implementation

**Files:**
- Create: `scripts/maintain.mjs`

- [ ] **Step 1: Implement exported helpers and CLI**

Implement:

```js
export function detectOneDrivePath(inputPath) {}
export async function validateRepoShape(root) {}
export async function validateDemoData(root) {}
```

Add CLI subcommands:

```text
doctor
demo-data
api-test
remote-health
help
```

- [ ] **Step 2: Run focused tests**

Run: `node --test scripts/maintain.test.mjs`

Expected: pass.

### Task 3: Documentation And Editor Tasks

**Files:**
- Create: `docs/maintenance.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.vscode/tasks.json`

- [ ] **Step 1: Document maintainer workflow**

Add local clone location, OneDrive ban, maintainer commands, remote health boundaries, and verification checklist.

- [ ] **Step 2: Add VS Code tasks**

Add tasks for:

```text
maintain: doctor
maintain: demo data
maintain: api tests
maintain: remote health
```

### Task 4: Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run maintainer checks**

Run:

```powershell
node scripts/maintain.mjs doctor
node scripts/maintain.mjs demo-data
node scripts/maintain.mjs api-test
node --test scripts/maintain.test.mjs
```

- [ ] **Step 2: Review diff**

Run:

```powershell
git diff --stat
git diff --check
```

Expected: no whitespace errors.
