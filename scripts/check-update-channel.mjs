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
const channel = args.channel ?? "stable";
const tag = args.tag;
const expectedVersion = args.version ?? (tag ? tag.replace(/^v/, "") : undefined);
const expectedCommitSha = args["require-commit-sha"];
const token = args.token;
// Default to the GitHub contents API for the manifest: it reflects git state
// immediately, unlike the raw CDN which can serve a stale version for minutes
// after a promote push and falsely fail verification. Pass --url to fall back
// to the raw URL (e.g. for local testing against a checked-out branch).
const useApiManifest = !args.url;
const manifestUrl =
  args.url ??
  `https://raw.githubusercontent.com/${repo}/galley-update-channel/updates/${channel}/latest.json`;
const checkAssets = args["no-asset-check"] !== true;
const cacheBust = args["cache-bust"] === true;
const retries = parsePositiveInt(args.retries ?? "1", "--retries");
const retryDelayMs = parsePositiveInt(args["retry-delay-ms"] ?? "3000", "--retry-delay-ms");

main().catch((error) => {
  console.error(`[check-update-channel] ${error.message}`);
  process.exit(1);
});

async function main() {
  // Hard gate: confirm the promote push actually landed on the update-channel
  // branch by matching the file's latest commit SHA. Sourced from the GitHub
  // commits API, which is immediate and bypasses raw-CDN cache latency.
  if (expectedCommitSha) {
    await retry(
      () => verifyCommitSha(repo, channel, expectedCommitSha, { token }),
      retries,
      retryDelayMs,
    );
  }

  // Manifest content: prefer the contents API (immediate) over the raw CDN
  // (cache-delayed). validateManifest still checks version / platforms /
  // signature integrity on whichever source we read.
  const manifest = useApiManifest
    ? await retry(
        async () => {
          const candidate = await fetchManifestViaApi(repo, channel, { token });
          validateManifest(candidate);
          return candidate;
        },
        retries,
        retryDelayMs,
      )
    : await retry(
        async () => {
          const candidate = await fetchJson(manifestUrl, { cacheBust });
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

  console.log(`Update channel OK (${useApiManifest ? "api" : "raw"}: ${channel})`);
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

async function fetchJson(url, options = {}) {
  if (url.startsWith("file://")) {
    try {
      return JSON.parse(await fs.readFile(new URL(url), "utf8"));
    } catch (error) {
      throw new Error(`read ${url} did not return valid JSON: ${error.message}`);
    }
  }

  const requestUrl = options.cacheBust ? withCacheBust(url) : url;
  const response = await fetch(requestUrl, {
    redirect: "follow",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} returned HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`GET ${url} did not return valid JSON: ${error.message}`);
  }
}

function withCacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set(
    "_galley_check",
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  return parsed.toString();
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

async function githubApiFetch(url, { token } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "galley-check-update-channel",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchManifestViaApi(repo, channel, { token }) {
  const url = `https://api.github.com/repos/${repo}/contents/updates/${channel}/latest.json?ref=galley-update-channel`;
  const data = await githubApiFetch(url, { token });
  if (!data || typeof data.content !== "string" || data.encoding !== "base64") {
    throw new Error(
      `contents API did not return base64 content for updates/${channel}/latest.json`,
    );
  }
  const decoded = Buffer.from(data.content, "base64").toString("utf8");
  try {
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(`contents API content is not valid JSON: ${error.message}`);
  }
}

async function verifyCommitSha(repo, channel, expectedSha, { token }) {
  const url = `https://api.github.com/repos/${repo}/commits?path=updates/${channel}/latest.json&sha=galley-update-channel&per_page=1`;
  const commits = await githubApiFetch(url, { token });
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error(
      `no commits found for updates/${channel}/latest.json on galley-update-channel`,
    );
  }
  const actualSha = commits[0].sha;
  if (!actualSha.startsWith(expectedSha)) {
    throw new Error(
      `updates/${channel}/latest.json last commit is ${actualSha}, expected ${expectedSha}`,
    );
  }
  console.log(
    `[check-update-channel] commit ${actualSha.slice(0, 12)} matches promote push (${channel})`,
  );
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
    --channel stable

Options:
  --url <url>                Override the manifest URL (forces raw-CDN mode).
  --version <version>        Defaults to tag without leading "v".
  --require-commit-sha <sha> Match the file's latest commit on galley-update-channel
                             (GitHub commits API; immediate, bypasses raw CDN).
  --token <token>            GitHub token for API auth (optional on public repos).
  --no-asset-check           Skip HEAD/GET checks for platform asset URLs.
  --cache-bust               Add a per-attempt query param to avoid stale raw CDN reads.
  --retries <count>          Defaults to 1.
  --retry-delay-ms <ms>      Defaults to 3000.
`);
}
