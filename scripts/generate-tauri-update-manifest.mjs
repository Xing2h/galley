#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const PLATFORM_ARTIFACTS = [
  {
    key: "darwin-aarch64",
    packagePattern: /^Galley_(.+)_macOS_aarch64\.app\.tar\.gz$/,
  },
  {
    key: "darwin-x86_64",
    packagePattern: /^Galley_(.+)_macOS_x64\.app\.tar\.gz$/,
  },
  {
    key: "windows-x86_64",
    packagePattern: /^Galley_(.+)_Windows_x64-setup\.exe$/,
  },
];

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

const artifactsDir = requiredArg(args, "artifacts");
const repo = requiredArg(args, "repo");
const tag = requiredArg(args, "tag");
const outPath = args.out ?? "latest.json";
const version = args.version ?? tag.replace(/^v/, "");
const assetBaseUrl = (
  args["asset-base-url"] ??
  `https://github.com/${repo}/releases/download/${encodePathSegment(tag)}`
).replace(/\/$/, "");
const pubDate = args["pub-date"] ?? new Date().toISOString();
const notes = args.notes ?? `https://github.com/${repo}/releases/tag/${encodePathSegment(tag)}`;

const artifactFiles = listFiles(artifactsDir);
const filesByBaseName = indexByBaseName(artifactFiles);
const platforms = {};

for (const platform of PLATFORM_ARTIFACTS) {
  const packageFile = findPackageFile(artifactFiles, platform.packagePattern);
  const packageName = path.basename(packageFile);
  const packageVersion = packageName.match(platform.packagePattern)?.[1];
  if (packageVersion !== version) {
    throw new Error(
      `Artifact ${packageName} has version ${packageVersion}, expected ${version}.`,
    );
  }

  const signatureName = `${packageName}.sig`;
  const signatureFile = filesByBaseName.get(signatureName);
  if (!signatureFile) {
    throw new Error(`Missing updater signature artifact: ${signatureName}`);
  }

  platforms[platform.key] = {
    signature: fs.readFileSync(signatureFile, "utf8").trim(),
    url: `${assetBaseUrl}/${encodePathSegment(packageName)}`,
  };
}

const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms,
};

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outPath}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function requiredArg(parsed, key) {
  const value = parsed[key];
  if (!value) {
    printUsage();
    throw new Error(`Missing required --${key}`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage:
  node scripts/generate-tauri-update-manifest.mjs \\
    --artifacts artifacts \\
    --repo owner/repo \\
    --tag v0.2.0-beta.1 \\
    --out artifacts/latest.json

Options:
  --version <version>         Defaults to tag without leading "v".
  --asset-base-url <url>      Defaults to the GitHub Release download URL.
  --pub-date <iso-date>       Defaults to the current time.
  --notes <url-or-text>       Defaults to the GitHub Release tag URL.
`);
}

function listFiles(root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

function indexByBaseName(files) {
  const index = new Map();
  for (const file of files) {
    const name = path.basename(file);
    if (index.has(name)) {
      throw new Error(`Duplicate artifact basename: ${name}`);
    }
    index.set(name, file);
  }
  return index;
}

function findPackageFile(files, pattern) {
  const matches = files.filter((file) => pattern.test(path.basename(file)));
  if (matches.length === 0) {
    throw new Error(`Missing updater package artifact matching ${pattern}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple updater package artifacts match ${pattern}: ${matches.join(", ")}`,
    );
  }
  return matches[0];
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/%2F/g, "/");
}
