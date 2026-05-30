/**
 * Python / external-GA runtime probe.
 *
 * The probe now runs through a Rust Tauri command instead of
 * @tauri-apps/plugin-shell. That matters for Windows: the user-picked GA
 * folder may live on `D:\...`, and its venv path is not knowable at build
 * time, so a static shell allowlist cannot cover the real happy path.
 */

import { invoke } from "@tauri-apps/api/core";

import { isWindows } from "@/lib/platform";

/**
 * A candidate Python interpreter the probe will try.
 *
 * `alias` is what we persist to `prefs.ga_config.python` when this
 * candidate wins. Old built-in candidates keep their historical alias
 * names for compatibility; GA-local venv candidates use the absolute
 * Python path so bridge spawn can execute it directly.
 */
export interface PythonCandidate {
  alias: string;
  displayPath: string;
  label: string;
}

interface InternalPythonCandidate extends PythonCandidate {
  commandPath: string;
}

export interface RuntimeProbeLlm {
  index: number;
  name: string;
  isCurrent: boolean;
}

export interface RuntimeProbeResult {
  ok: boolean;
  llms: RuntimeProbeLlm[];
  smokeTested: boolean;
  errorStage?: "spawn" | "timeout" | "runtime" | "llm" | string;
  error?: string;
  traceback?: string;
  stderr?: string;
}

/**
 * Probe candidates in priority order. GA-local venvs are injected ahead of
 * this static list when the user has selected a GA path.
 */
const HOME_PLACEHOLDER = "$HOME";

const MAC_RAW_CANDIDATES: ReadonlyArray<{
  alias: string;
  rawPath: string;
  label: string;
}> = [
  {
    alias: "python-ga-venv",
    rawPath: `${HOME_PLACEHOLDER}/Documents/GenericAgent/.venv/bin/python`,
    label: "GA project venv (.venv)",
  },
  {
    alias: "python-ga-venv-alt",
    rawPath: `${HOME_PLACEHOLDER}/Documents/GenericAgent/venv/bin/python`,
    label: "GA project venv (venv)",
  },
  {
    alias: "python-brew-arm",
    rawPath: "/opt/homebrew/bin/python3",
    label: "Homebrew (Apple Silicon)",
  },
  {
    alias: "python-brew-intel",
    rawPath: "/usr/local/bin/python3",
    label: "Homebrew (Intel)",
  },
  {
    alias: "python-framework-3-14",
    rawPath: "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3",
    label: "Python.org 3.14",
  },
  {
    alias: "python-framework-3-13",
    rawPath: "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3",
    label: "Python.org 3.13",
  },
  {
    alias: "python-framework-3-12",
    rawPath: "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
    label: "Python.org 3.12",
  },
  {
    alias: "python-framework-3-11",
    rawPath: "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
    label: "Python.org 3.11",
  },
];

const PATH_CANDIDATES: ReadonlyArray<InternalPythonCandidate> = [
  {
    alias: "python3",
    commandPath: "python3",
    displayPath: "python3 (PATH)",
    label: "python3 on PATH",
  },
  {
    alias: "python",
    commandPath: "python",
    displayPath: "python (PATH)",
    label: "python on PATH",
  },
];

/**
 * Look up a candidate by stored value. Returns null for unknown aliases;
 * absolute paths intentionally pass through the bridge resolver directly.
 */
export async function findCandidateByAlias(
  alias: string,
): Promise<PythonCandidate | null> {
  if (isAbsolutePath(alias)) {
    return {
      alias,
      displayPath: alias,
      label: "Python",
    };
  }
  const list = await listPythonCandidates();
  return list.find((c) => c.alias === alias) ?? null;
}

export async function listPythonCandidates(
  gaPath?: string | null,
): Promise<PythonCandidate[]> {
  return (await buildPythonCandidates(gaPath)).map(
    ({ alias, displayPath, label }) => ({
      alias,
      displayPath,
      label,
    }),
  );
}

export interface ProbeAttempt {
  candidate: PythonCandidate;
  outcome: "ok" | "spawn-failed" | "import-failed" | "llm-failed" | "timeout";
  detail?: string;
  result?: RuntimeProbeResult;
}

export interface ProbeResult {
  winner: PythonCandidate | null;
  attempts: ProbeAttempt[];
}

const PROBE_TIMEOUT_MS = 45_000;

export async function probePython(
  gaPath: string | null = null,
  signal?: AbortSignal,
  options?: { smokeTest?: boolean },
): Promise<ProbeResult> {
  const candidates = await buildPythonCandidates(gaPath);
  const attempts: ProbeAttempt[] = [];

  for (const candidate of candidates) {
    if (signal?.aborted) break;
    const outcome = await runSingleProbe(candidate, gaPath, {
      smokeTest: options?.smokeTest ?? false,
    });
    attempts.push(outcome);
    if (outcome.outcome === "ok" || outcome.outcome === "llm-failed") {
      return { winner: candidate, attempts };
    }
  }
  return { winner: null, attempts };
}

export async function probeGARuntime(
  python: string,
  gaPath: string,
  options?: { smokeTest?: boolean; timeoutMs?: number },
): Promise<RuntimeProbeResult> {
  return invoke<RuntimeProbeResult>("probe_ga_runtime", {
    args: {
      python,
      gaPath,
      smokeTest: options?.smokeTest ?? false,
      timeoutMs: options?.timeoutMs ?? PROBE_TIMEOUT_MS,
    },
  });
}

async function runSingleProbe(
  candidate: InternalPythonCandidate,
  gaPath: string | null,
  options: { smokeTest: boolean },
): Promise<ProbeAttempt> {
  if (!gaPath?.trim()) {
    return {
      candidate,
      outcome: "import-failed",
      detail: "GA path is empty",
    };
  }

  try {
    const result = await probeGARuntime(candidate.commandPath, gaPath, options);
    if (result.ok) {
      return { candidate, outcome: "ok", result };
    }
    const outcome =
      result.errorStage === "spawn"
        ? "spawn-failed"
        : result.errorStage === "timeout"
          ? "timeout"
          : result.errorStage === "llm"
            ? "llm-failed"
            : "import-failed";
    return {
      candidate,
      outcome,
      detail: formatProbeFailure(result),
      result,
    };
  } catch (e) {
    return {
      candidate,
      outcome: "spawn-failed",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function buildPythonCandidates(
  gaPath?: string | null,
): Promise<InternalPythonCandidate[]> {
  const candidates: InternalPythonCandidate[] = [];
  const normalizedGaPath = gaPath?.trim();
  if (normalizedGaPath) {
    candidates.push(...(await gaLocalVenvCandidates(normalizedGaPath)));
  }

  const home = await resolveHomeDir();
  if (isWindows) {
    const docsGA = await joinPath(home, "Documents", "GenericAgent");
    candidates.push(...(await windowsHomeVenvCandidates(docsGA)));
  } else {
    candidates.push(
      ...MAC_RAW_CANDIDATES.map((c) => {
        const displayPath = c.rawPath.replace(HOME_PLACEHOLDER, home);
        return {
          alias: c.alias,
          commandPath: displayPath,
          displayPath,
          label: c.label,
        };
      }),
    );
  }

  candidates.push(...PATH_CANDIDATES);
  return dedupeCandidates(candidates);
}

async function gaLocalVenvCandidates(
  gaPath: string,
): Promise<InternalPythonCandidate[]> {
  if (isWindows) {
    const dotVenv = await joinPath(gaPath, ".venv", "Scripts", "python.exe");
    const venv = await joinPath(gaPath, "venv", "Scripts", "python.exe");
    return [
      absoluteCandidate(dotVenv, "Selected GA venv (.venv)"),
      absoluteCandidate(venv, "Selected GA venv (venv)"),
    ];
  }
  const dotVenv = await joinPath(gaPath, ".venv", "bin", "python");
  const venv = await joinPath(gaPath, "venv", "bin", "python");
  return [
    absoluteCandidate(dotVenv, "Selected GA venv (.venv)"),
    absoluteCandidate(venv, "Selected GA venv (venv)"),
  ];
}

async function windowsHomeVenvCandidates(
  gaPath: string,
): Promise<InternalPythonCandidate[]> {
  const dotVenv = await joinPath(gaPath, ".venv", "Scripts", "python.exe");
  const venv = await joinPath(gaPath, "venv", "Scripts", "python.exe");
  return [
    absoluteCandidate(dotVenv, "GA project venv (.venv)"),
    absoluteCandidate(venv, "GA project venv (venv)"),
  ];
}

function absoluteCandidate(
  path: string,
  label: string,
): InternalPythonCandidate {
  return {
    alias: path,
    commandPath: path,
    displayPath: path,
    label,
  };
}

function dedupeCandidates(
  candidates: InternalPythonCandidate[],
): InternalPythonCandidate[] {
  const seen = new Set<string>();
  const out: InternalPythonCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.commandPath.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

async function resolveHomeDir(): Promise<string> {
  try {
    const { homeDir } = await import("@tauri-apps/api/path");
    return (await homeDir()).replace(/[\\/]+$/, "");
  } catch (e) {
    console.warn(
      "[python-probe] homeDir() failed — home-based candidates will be relative.",
      e,
    );
    return "";
  }
}

async function joinPath(base: string, ...parts: string[]): Promise<string> {
  try {
    const { join } = await import("@tauri-apps/api/path");
    let current = base;
    for (const part of parts) {
      current = await join(current, part);
    }
    return current;
  } catch {
    const sep = isWindows ? "\\" : "/";
    return [base.replace(/[\\/]+$/, ""), ...parts].filter(Boolean).join(sep);
  }
}

function isAbsolutePath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(path)
  );
}

function formatProbeFailure(result: RuntimeProbeResult): string {
  const message = result.error?.trim();
  if (message) return message;
  const stderr = result.stderr?.trim();
  if (stderr) return stderr.split("\n").slice(-3).join("\n");
  return "GA runtime probe failed";
}
