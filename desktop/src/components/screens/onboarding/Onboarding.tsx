import { useEffect, useState } from "react";

import {
  StepAttach,
  type PathValidation,
} from "@/components/screens/onboarding/StepAttach";
import { StepHealth } from "@/components/screens/onboarding/StepHealth";
import { StepWelcome } from "@/components/screens/onboarding/StepWelcome";
import {
  runHealthChecks,
  validateGAPath,
} from "@/lib/onboarding-validation";
import { cn } from "@/lib/utils";
import type { HealthCheckItem } from "@/types/inspector";

export type OnboardingStep = "welcome" | "attach" | "health";

export interface OnboardingProps {
  /** Called when the user completes Step 2 successfully. The host
   * unmounts the Onboarding screen and renders the main app. */
  onComplete: (gaPath: string) => void;
}

const STEP_LABELS: { key: OnboardingStep | "done"; label: string }[] = [
  { key: "welcome", label: "欢迎" },
  { key: "attach", label: "Attach GA" },
  { key: "health", label: "Health Check" },
  { key: "done", label: "完成" },
];

/**
 * Top-level Onboarding controller — manages step state, mocked path
 * validation, and a sequential health-check animation. DESIGN.md §5.
 *
 * No AppShell here: Onboarding is a takeover screen, no sidebar or
 * inspector. We reserve top-left padding for the macOS traffic light
 * (which is positioned at {16, 16} via tauri.conf.json).
 *
 * #5 ships with mocked validation + check progression so we can see
 * the full flow without a real bridge subprocess. Real validation
 * (path existence, agentmain.py import, mykey.py parse, LLM config
 * count) wires up in #10 alongside IPC.
 */
export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [path, setPath] = useState("~/Documents/GenericAgent");
  const [validation, setValidation] = useState<PathValidation>(null);

  // Debounced real path validation via Tauri fs plugin. The
  // setTimeout pacing keeps the UI responsive while the user is still
  // typing; we don't fire a probe on every keystroke. setState calls
  // are scheduled on a tick to satisfy the
  // react-hooks/set-state-in-effect rule.
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (!path.trim()) {
      timers.push(
        setTimeout(() => {
          if (!cancelled) setValidation(null);
        }, 0),
      );
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    timers.push(
      setTimeout(() => {
        if (!cancelled) setValidation({ kind: "checking" });
      }, 0),
    );

    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        // Real fs check. Errors fall through to "not-found" — same UX
        // since either way the path isn't usable. The picker is the
        // happy path; manual typing surfaces typos here.
        void validateGAPath(path).then((result) => {
          if (cancelled) return;
          setValidation(result);
        });
      }, 350),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [path]);

  // Health check progression. Driven by real fs probes via
  // runHealthChecks(); each check transitions pending → running →
  // success/warning/failed in sequence. The runner does its own
  // pacing so we don't need a manual setTimeout cascade here.
  const [healthChecks, setHealthChecks] = useState<HealthCheckItem[]>([]);

  useEffect(() => {
    if (step !== "health") return;
    const controller = new AbortController();
    void runHealthChecks(path, setHealthChecks, controller.signal);
    return () => controller.abort();
  }, [step, path]);

  const handleContinueAttach = () => {
    if (validation?.kind !== "ok") return;
    setStep("health");
  };

  const handleFinish = () => {
    onComplete(path);
  };

  return (
    <div className="flex h-screen min-h-[720px] w-screen min-w-[1120px] flex-col overflow-y-auto bg-app pl-[80px] pr-16 pt-16">
      <div className="mx-auto flex w-full max-w-[700px] flex-col">
        <StepProgress step={step} />

        <div className="mt-10">
          {step === "welcome" && (
            <StepWelcome onStart={() => setStep("attach")} />
          )}
          {step === "attach" && (
            <StepAttach
              path={path}
              validation={validation}
              onPathChange={setPath}
              onPickFolder={() => {
                void pickFolder().then((picked) => {
                  if (picked) setPath(picked);
                });
              }}
              onBack={() => setStep("welcome")}
              onContinue={handleContinueAttach}
            />
          )}
          {step === "health" && (
            <StepHealth
              items={healthChecks}
              onBack={() => setStep("attach")}
              onContinue={handleFinish}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Progress dots ----------------

function StepProgress({ step }: { step: OnboardingStep }) {
  const stepIndex: Record<OnboardingStep | "done", number> = {
    welcome: 0,
    attach: 1,
    health: 2,
    done: 3,
  };
  const current = stepIndex[step];

  return (
    <div className="flex items-center gap-2.5">
      {STEP_LABELS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 text-[12.5px]">
              <span
                className={cn(
                  "inline-flex size-[18px] items-center justify-center rounded-full text-[11px] font-semibold",
                  done && "bg-brand text-ink",
                  active && "bg-ink text-elevated",
                  !done &&
                    !active &&
                    "border border-line-strong text-ink-muted",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  active ? "font-medium text-ink" : "text-ink-muted",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <span className="h-px w-[60px] bg-line" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Folder picker ----------------

/**
 * Tauri dialog folder picker. Lazy import keeps Vite-only dev from
 * choking on the plugin shim. Returns the picked path or null on
 * cancel / error.
 */
async function pickFolder(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 GenericAgent 仓库目录",
    });
    return typeof selected === "string" && selected.length > 0
      ? selected
      : null;
  } catch (e) {
    console.warn("[onboarding] pickFolder failed.", e);
    return null;
  }
}

