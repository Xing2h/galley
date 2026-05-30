import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

import {
  getImSupervisorStatus,
  type ImSupervisorStatus,
} from "@/lib/im-supervisor";

export function useImSupervisorStatus(platform: "wechat", enabled = true) {
  const [status, setStatus] = useState<ImSupervisorStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const replaceStatus = useCallback((next: ImSupervisorStatus | null) => {
    setStatus(next);
    setLoadError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const setError = (e: unknown) => {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      });
    };

    if (!enabled) {
      void Promise.resolve().then(() => {
        if (!cancelled) replaceStatus(null);
      });
      return () => {
        cancelled = true;
      };
    }

    try {
      void getImSupervisorStatus(platform)
        .then((next) => {
          if (!cancelled) replaceStatus(next);
        })
        .catch(setError);
    } catch (e) {
      setError(e);
    }

    try {
      void listen<ImSupervisorStatus>("im-supervisor-updated", (event) => {
        if (!cancelled && event.payload.platform === platform) {
          replaceStatus(event.payload);
        }
      })
        .then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        })
        .catch(setError);
    } catch (e) {
      setError(e);
    }

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled, platform, replaceStatus]);

  return { status, setStatus: replaceStatus, loadError };
}
