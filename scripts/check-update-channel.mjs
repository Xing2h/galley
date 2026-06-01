#!/usr/bin/env node

import fs from "node:fs/promises";

const REQUIRED_PLATFORMS = [
  "darwin-aarch64",
  "darwin-x86_64",
  "windows-x86_64",
];

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

const repo = args.repo ?? "wangjc683/galley";
const channel = args.channel ?? "beta";
const tag = args.tag;
const expectedVersion = args.version ?? (tag ? tag.replace(/^v/, "") : undefined);
const manifestUrl =
  args.url ??
  `https://raw.githubusercontent.com/${repo}/galley-update-channel/updates/${channel}/latest.json`;
const checkAssets = args["no-asset-check"] !== true;
const retries = parsePositiveInt(args.retries ?? "1", "--retries");
const retryDelayMs = parsePositiveInt(args["retry-delay-ms"] ?? "3000", "--retry-delay-ms");

main().catch((error) => {
  console.error(`[check-update-channel] ${error.message}`);
  process.exit(1);
});

async function main() {
  const manifest = await retry(
    async () => {
      const candidate = await fetchJson(manifestUrl);
      validateManifest(candidate);
      return candidate;
    },
    retries,
    retryDelayMs,
  );

  if (checkAssets) {
    for (const platform of REQUIRED_PLATFORMS) {
      await assertUrlOk(manifest.platforms[platform].url, platform);
    }
  }

  console.log(`Update channel OK: ${manifestUrl}`);
  console.log(`version: ${manifest.version}`);
  console.log(`platforms: ${REQUIRED_PLATFORMS.join(", ")}`);
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("manifest is not a JSON object");
  }
  if (typeof manifest.version !== "string" || manifest.version.trim() === "") {
    throw new Error("manifest.version must be a non-empty string");
  }
  if (expectedVersion && manifest.version !== expectedVersion) {
    throw new Error(
      `manifest.version is ${manifest.version}, expected ${expectedVersion}`,
    );
  }
  if (!isIsoDateLike(manifest.pub_date)) {
    throw new Error("manifest.pub_date must be an ISO-like date string");
  }
  if (
    !manifest.platforms ||
    typeof manifest.platforms !== "object" ||
    Array.isArray(manifest.platforms)
  ) {
    throw new Error("manifest.platforms must be an object");
  }

  const expectedReleaseBase = tag
    ? `https://github.com/${repo}/releases/download/${encodePathSegment(tag)}/`
    : null;

  for (const platform of REQUIRED_PLATFORMS) {
    const entry = manifest.platforms[platform];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`manifest.platforms.${platform} is missing`);
    }
    if (typeof entry.url !== "string" || !entry.url.startsWith("https://")) {
      throw new Error(`manifest.platforms.${platform}.url must be an HTTPS URL`);
    }
    if (expectedReleaseBase && !entry.url.startsWith(expectedReleaseBase)) {
      throw new Error(
        `manifest.platforms.${platform}.url does not point at ${expectedReleaseBase}`,
      );
    }
    if (
      typeof entry.signature !== "string" ||
      entry.signature.trim() === "" ||
      /^https?:\/\//.test(entry.signature)
    ) {
      throw new Error(
        `manifest.platforms.${platform}.signature must be inline signature contents`,
      );
    }
  }
}

async function fetchJson(url) {
  if (url.startsWith("file://")) {
    try {
      return JSON.parse(await fs.readFile(new URL(url), "utf8"));
    } catch (error) {
      throw new Error(`read ${url} did not return valid JSON: ${error.message}`);
    }
  }

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`GET ${url} returned HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`GET ${url} did not return valid JSON: ${error.message}`);
  }
}

async function assertUrlOk(url, label) {
  let response = await fetch(url, { method: "HEAD", redirect: "follow" });
  if (response.status === 405 || response.status === 403) {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-0" },
    });
  }
  if (!response.ok) {
    throw new Error(`${label} asset URL returned HTTP ${response.status}: ${url}`);
  }
}

async function retry(task, attempts, delayMs) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.error(
        `[check-update-channel] attempt ${attempt}/${attempts} failed: ${error.message}`,
      );
      await sleep(delayMs);
    }
  }
  throw lastError;
}

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
    const next = argv[index + 1];
    if (key.startsWith("no-")) {
      parsed[key] = true;
      continue;
    }
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function isIsoDateLike(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/%2F/g, "/");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-update-channel.mjs \\
    --repo owner/repo \\
    --tag v0.2.0-beta.1 \\
    --channel beta

Options:
  --url <url>                Override the manifest URL.
  --version <version>        Defaults to tag without leading "v".
  --no-asset-check           Skip HEAD/GET checks for platform asset URLs.
  --retries <count>          Defaults to 1.
  --retry-delay-ms <ms>      Defaults to 3000.
`);
}
