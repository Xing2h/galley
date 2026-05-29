#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const managedRoot = path.join(repoRoot, "managed-ga");
const codeRoot = path.join(managedRoot, "code");
const manifestPath = path.join(managedRoot, "manifest.json");
const tauriConfigPath = path.join(repoRoot, "core", "tauri.conf.json");
const patchRoot = path.join(managedRoot, "patches");

const errors = [];
const pythonAssetPathPattern =
  /os\.path\.join\([^)\n]*script_dir[^)\n]*(?:f?["']assets\/|["']assets\/)/;

function fail(message) {
  errors.push(message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`invalid JSON: ${relative(file)} (${error.message})`);
    return null;
  }
}

function requireFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    fail(`missing file: ${relative(file)}`);
  }
}

function requireDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    fail(`missing directory: ${relative(dir)}`);
  }
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

function walk(dir) {
  const pending = [dir];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      files.push(entryPath);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      }
    }
  }
  return files;
}

requireDir(managedRoot);
requireDir(codeRoot);
requireFile(manifestPath);
requireFile(path.join(patchRoot, "manifest.md"));
requireFile(path.join(codeRoot, "agentmain.py"));
requireFile(path.join(codeRoot, "agent_loop.py"));
requireFile(path.join(codeRoot, "llmcore.py"));
if (fs.existsSync(path.join(managedRoot, "galley-prompts"))) {
  fail("managed prompt profile is embedded in Core; remove managed-ga/galley-prompts");
}

const tauriConfig = readJson(tauriConfigPath);
const resourceMap = tauriConfig?.bundle?.resources;
if (!resourceMap || resourceMap["../managed-ga"] !== "managed-ga") {
  fail("core/tauri.conf.json must bundle ../managed-ga as managed-ga");
}
const externalBin = tauriConfig?.bundle?.externalBin;
if (
  !Array.isArray(externalBin) ||
  !externalBin.includes("target/tauri-sidecars/galley")
) {
  fail("core/tauri.conf.json must bundle the Galley CLI via target/tauri-sidecars/galley");
}

const manifest = readJson(manifestPath);
if (manifest) {
  if (manifest.schemaVersion !== 1) {
    fail(`managed-ga/manifest.json schemaVersion must be 1, got ${manifest.schemaVersion}`);
  }
  if (!manifest.upstream?.commit) {
    fail("managed-ga/manifest.json must pin upstream.commit");
  }
  if (!manifest.patchStack?.id) {
    fail("managed-ga/manifest.json must declare patchStack.id");
  }
  const patches = manifest.patchStack?.patches;
  if (!Array.isArray(patches) || patches.length === 0) {
    fail("managed-ga/manifest.json must list at least one replayable patch");
  } else {
    const listedPatches = new Set();
    for (const patchName of patches) {
      if (
        typeof patchName !== "string" ||
        patchName.includes("/") ||
        patchName.includes("\\") ||
        patchName.includes("..")
      ) {
        fail(`invalid managed GA patch name: ${patchName}`);
        continue;
      }
      listedPatches.add(patchName);
      requireFile(path.join(patchRoot, patchName));
    }
    for (const entry of fs.readdirSync(patchRoot)) {
      if (entry.endsWith(".patch") && !listedPatches.has(entry)) {
        fail(`managed-ga/manifest.json must list patch file: patches/${entry}`);
      }
    }
  }
}

const forbiddenNames = new Set([
  ".DS_Store",
  "__pycache__",
  ".git",
  ".venv",
  "venv",
  "env",
  "mykey.py",
  "mykey.json",
  ".env",
  "auth.json",
]);
const forbiddenRootState = new Set([
  "memory",
  "sop",
  "skills",
  "temp",
  "model_responses",
]);

if (fs.existsSync(codeRoot)) {
  for (const entryPath of walk(codeRoot)) {
    const name = path.basename(entryPath);
    if (forbiddenNames.has(name) || name.endsWith(".pyc")) {
      fail(`managed GA payload contains generated/secret artifact: ${relative(entryPath)}`);
    }
    if (entryPath.endsWith(".py")) {
      const source = fs.readFileSync(entryPath, "utf8");
      if (pythonAssetPathPattern.test(source)) {
        fail(`managed GA Python must join assets with path segments, not slash strings: ${relative(entryPath)}`);
      }
    }
  }
  for (const name of forbiddenRootState) {
    const entryPath = path.join(codeRoot, name);
    if (fs.existsSync(entryPath)) {
      fail(`managed GA payload contains user-state root: ${relative(entryPath)}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[managed-ga-payload] ${error}`);
  }
  process.exit(1);
}

console.log("[managed-ga-payload] OK");
