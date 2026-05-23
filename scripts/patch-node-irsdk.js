#!/usr/bin/env node
/**
 * Patches node-irsdk to build on Node 22 + VS2026.
 *
 * Fixes applied:
 *   1. Strip UTF-8 BOM from binding.gyp (Python gyp rejects it)
 *   2. Update bundled nan to latest (old nan uses removed V8 APIs)
 *   3. node::AtExit() → node::AddEnvironmentCleanupHook() (Node 12+ API)
 *   4. arr->Set(i, v) → Nan::Set(arr, i, v) (V8 context-aware API)
 *   5. Silence "Missing converter for bitField: irsdk_PaceFlags" console spam
 *
 * Run after pnpm install:  pnpm run patch:irsdk
 */

'use strict';

const { execSync } = require('child_process');
const { readFileSync, writeFileSync, readdirSync, statSync } = require('fs');
const path = require('path');

// ── Locate the package ────────────────────────────────────────────────────────

let pkgPath;
try {
  pkgPath = path.dirname(
    require.resolve('node-irsdk/package.json', {
      paths: [
        path.join(__dirname, '..', 'apps', 'client'),
        path.join(__dirname, '..'),
      ],
    })
  );
} catch {
  console.log('node-irsdk not installed — nothing to patch (expected on Linux/CI).');
  process.exit(0);
}

console.log('Patching node-irsdk at:', pkgPath);

// ── Helpers ───────────────────────────────────────────────────────────────────

function patch(filePath, description, fn) {
  const original = readFileSync(filePath, 'utf8');
  const patched = fn(original);
  if (patched === original) {
    console.log(`  (already applied) ${description}`);
    return;
  }
  writeFileSync(filePath, patched, 'utf8');
  console.log(`  ✓ ${description}`);
}

function findJsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findJsFiles(full));
    else if (entry.name.endsWith('.js')) results.push(full);
  }
  return results;
}

// ── 1. Strip BOM from binding.gyp ─────────────────────────────────────────────

patch(
  path.join(pkgPath, 'binding.gyp'),
  'Strip UTF-8 BOM from binding.gyp',
  (s) => s.replace(/^﻿/, '')
);

// ── 2. Update bundled nan ─────────────────────────────────────────────────────

console.log('  Installing nan@latest inside node-irsdk...');
execSync('npm install nan@latest --no-save', { cwd: pkgPath, stdio: 'pipe' });
console.log('  ✓ nan updated');

// ── 3. node::AtExit → AddEnvironmentCleanupHook ───────────────────────────────

patch(
  path.join(pkgPath, 'src', 'cpp', 'IrSdkNodeBindings.h'),
  'Fix node::AtExit() → node::AddEnvironmentCleanupHook()',
  (s) =>
    s.replace(
      'node::AtExit(cleanUp);',
      'node::AddEnvironmentCleanupHook(v8::Isolate::GetCurrent(), cleanUp, nullptr);'
    )
);

// ── 4. v8::Object::Set → Nan::Set ────────────────────────────────────────────

patch(
  path.join(pkgPath, 'src', 'cpp', 'IrSdkBindingHelpers.cpp'),
  'Fix arr->Set(i, v) → Nan::Set(arr, i, v)',
  (s) => s.replace('arr->Set(i,', 'Nan::Set(arr, i,')
);

// ── 5. Silence irsdk_PaceFlags console spam ───────────────────────────────────

let silenced = 0;
for (const file of findJsFiles(pkgPath)) {
  patch(file, `Silence PaceFlags noise in ${path.relative(pkgPath, file)}`, (s) => {
    const patched = s.replace(
      /console\.log\(\s*['"`]Missing converter for bitField.*?['"`][^)]*\)/g,
      '(void 0) /* suppressed: irsdk_PaceFlags bitfield not needed */'
    );
    if (patched !== s) silenced++;
    return patched;
  });
}
if (silenced === 0) console.log('  (PaceFlags log not found — may already be patched or location changed)');

// ── 6. Rebuild ────────────────────────────────────────────────────────────────

console.log('  Running node-gyp rebuild...');
try {
  execSync('node-gyp rebuild', { cwd: pkgPath, stdio: 'inherit' });
  console.log('  ✓ node-irsdk compiled successfully');
} catch {
  console.error('  ✗ node-gyp rebuild failed — see output above');
  process.exit(1);
}
