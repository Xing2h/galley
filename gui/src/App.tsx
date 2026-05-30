import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";

import { ToastHost } from "@/components/error-card/ToastHost";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CommandPalette } from "@/components/overlay/CommandPalette";
import { BrowserControlSetupDialog } from "@/components/screens/BrowserControlSetupDialog";
import { BrowserControlAttentionSurface } from "@/components/screens/BrowserControlAttentionBanner";
import { EmptyState } from "@/components/screens/EmptyState";
import { MainView } from "@/components/screens/MainView";
import { Onboarding } from "@/components/screens/onboarding/Onboarding";
import { Settings } from "@/components/screens/settings/Settings";
import type { SettingsTab } from "@/components/screens/settings/settings-types";
import { YoloIntroDialog } from "@/components/screens/YoloIntroDialog";
import { ArchivedDialog } from "@/components/screens/archived/ArchivedDialog";
import { EarlierDialog } from "@/components/screens/earlier/EarlierDialog";
import { CreateProjectDialog } from "@/components/screens/project/CreateProjectDialog";
import {
  ConfirmDeleteProjectDialog,
  EditProjectDialog,
} from "@/components/screens/project/EditProjectDialog";
import { CopyProvider, copyForLanguage } from "@/lib/i18n";
import { useImSupervisorStatus } from "@/hooks/useImSupervisorStatus";
import { ensureHistoryReplayComplete } from "@/lib/ipc-handlers";
import { resolveLanguagePreference } from "@/lib/language";
import {
  currentLLMDisplayName,
  managedModelsToLLMs,
} from "@/lib/managed-model-options";
import { bucketSession } from "@/lib/sessions";
import { useAppUpdateStore } from "@/stores/app-update";
import { useBrowserControlStore } from "@/stores/browser-control";
import {
  EMPTY_APPROVALS,
  EMPTY_DECISIONS,
  EMPTY_TURNS,
  useMessagesStore,
} from "@/stores/messages";
import { useManagedModelsStore } from "@/stores/managed-models";
import { usePrefsStore } from "@/stores/prefs";
import { useRuntimeStore } from "@/stores/runtime";
import { useSessionsStore } from "@/stores/sessions";
import { useUiStore } from "@/stores/ui";
import { hydrateApp } from "@/lib/hydrate";
import { makeAppError } from "@/types/app-error";

/**
 * V0.1 Stage 2 #8 — App entry.
 *
 * State lives in the Zustand slices under `stores/`. App is now
 * mostly wiring: pull screen / approval / runtime out of the stores,
 * feed them down to the four screens (Onboarding, Empty State, Main
 * View, plus the modal-y Settings + Command Palette + ToastHost),
 * route component callbacks back to store actions.
 */
function App() {
  const screen = useUiStore((s) => s.screen);
  const setScreen = useUiStore((s) => s.setScreen);

  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const togglePalette = useUiStore((s) => s.togglePalette);

  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("runtime");
  const browserControlStatus = useBrowserControlStore((s) => s.status);
  const browserControlSetupOpen = useBrowserControlStore((s) => s.setupOpen);
  const ensureBrowserControlLayout = useBrowserControlStore(
    (s) => s.ensureLayout,
  );
  const probeBrowserControl = useBrowserControlStore((s) => s.probe);
  const openBrowserControlSetup = useBrowserControlStore((s) => s.openSetup);
  const closeBrowserControlSetup = useBrowserControlStore((s) => s.closeSetup);

  // Sidebar live-status comes from `sessions` directly: messagesStore's
  // `fireSessionMirror` writes sidebar-visible fields (status,
  // pendingApprovalCount, hasPendingAskUser) onto each session row
  // whenever the conversation changes, but only generates a new
  // `sessions` array when those fields actually change. So a plain
  // selector with default strict-equality stays stable through
  // frequent non-sidebar updates like turn_progress streaming.
  const sessions = useSessionsStore((s) => s.sessions);
  const activeSessionId = useSessionsStore((s) => s.activeSessionId);
  const createSession = useSessionsStore((s) => s.createSession);
  // activateSession is the orchestrator — moved to sessionsStore in
  // B3 M5 so it sits next to active id ownership.
  const activateSession = useSessionsStore((s) => s.activateSession);
  const setActiveSession = useSessionsStore((s) => s.setActiveSession);
  const archiveSession = useSessionsStore((s) => s.archiveSession);
  const unarchiveSession = useSessionsStore((s) => s.unarchiveSession);
  const togglePinSession = useSessionsStore((s) => s.togglePinSession);
  const renameSession = useSessionsStore((s) => s.renameSession);
  const projects = useSessionsStore((s) => s.projects);
  const activeProjectFilter = useSessionsStore((s) => s.activeProjectFilter);
  const createProject = useSessionsStore((s) => s.createProject);
  const setActiveProjectFilter = useSessionsStore(
    (s) => s.setActiveProjectFilter,
  );
  const assignSessionToProject = useSessionsStore(
    (s) => s.assignSessionToProject,
  );
  const updateProject = useSessionsStore((s) => s.updateProject);
  const deleteProject = useSessionsStore((s) => s.deleteProject);
  const archiveSessionsBulk = useSessionsStore((s) => s.archiveSessionsBulk);
  const unarchiveSessionsBulk = useSessionsStore(
    (s) => s.unarchiveSessionsBulk,
  );
  const deleteSessionsPermanentlyBulk = useSessionsStore(
    (s) => s.deleteSessionsPermanentlyBulk,
  );
  const deleteSessionPermanently = useSessionsStore(
    (s) => s.deleteSessionPermanently,
  );
  const emptyArchive = useSessionsStore((s) => s.emptyArchive);
  const appendUserTurnExternal = useMessagesStore(
    (s) => s.appendUserTurnExternal,
  );
  const attachExternalBridge = useRuntimeStore((s) => s.attachExternalBridge);
  const applyExternalSessionCreated = useSessionsStore(
    (s) => s.applyExternalSessionCreated,
  );
  const applyExternalSessionUpdated = useSessionsStore(
    (s) => s.applyExternalSessionUpdated,
  );
  const applyExternalProjectCreated = useSessionsStore(
    (s) => s.applyExternalProjectCreated,
  );
  const applyExternalProjectDeleted = useSessionsStore(
    (s) => s.applyExternalProjectDeleted,
  );
  // LLM / runtimeInfo / pet state now live in runtimeStore (M3a).
  // Subscribe to the active session's per-runtime entry so the
  // Composer pill + dropdown + Inspector tab re-render on changes.
  const activeRuntimeLLMs = useRuntimeStore((s) =>
    screen === "main" && activeSessionId
      ? s.byId[activeSessionId]?.llms
      : undefined,
  );
  const activeRuntimeDisplayName = useRuntimeStore((s) =>
    screen === "main" && activeSessionId
      ? s.byId[activeSessionId]?.llmDisplayName
      : undefined,
  );
  const cachedLLMs = useRuntimeStore((s) => s.cachedLLMs);
  const cachedLLMDisplayName = useRuntimeStore((s) => s.cachedLLMDisplayName);
  const pendingLLMIndex = useRuntimeStore((s) => s.pendingLLMIndex);
  const selectLLMForNewSession = useRuntimeStore(
    (s) => s.selectLLMForNewSession,
  );
  const selectLLMForSession = useRuntimeStore((s) => s.selectLLMForSession);
  const runtimeInfo = useRuntimeStore((s) => s.runtimeInfo);

  // Per-session conversation reads — activeSessionId comes from
  // sessionsStore (declared above), used by every selector below to
  // index into messagesStore.byId. EMPTY_* singletons keep React 19
  // strict-mode getSnapshot stable across renders.
  const approvalDecisions = useMessagesStore((s) =>
    activeSessionId
      ? (s.byId[activeSessionId]?.approvalDecisions ?? EMPTY_DECISIONS)
      : EMPTY_DECISIONS,
  );
  const recordApprovalDecision = useMessagesStore(
    (s) => s.recordApprovalDecision,
  );
  const approvalConfig = usePrefsStore((s) => s.approvalConfig);
  const setApprovalRequiredTools = usePrefsStore(
    (s) => s.setApprovalRequiredTools,
  );
  const removeAlwaysAllow = usePrefsStore((s) => s.removeAlwaysAllow);
  const yoloMode = usePrefsStore((s) => s.yoloMode);
  const setYoloMode = usePrefsStore((s) => s.setYoloMode);
  const yoloIntroSeen = usePrefsStore((s) => s.yoloIntroSeen);
  const acknowledgeYoloIntro = usePrefsStore((s) => s.acknowledgeYoloIntro);
  const conversationWidth = usePrefsStore((s) => s.conversationWidth);
  const setConversationWidth = usePrefsStore((s) => s.setConversationWidth);
  const languagePreference = usePrefsStore((s) => s.languagePreference);
  const setLanguagePreference = usePrefsStore((s) => s.setLanguagePreference);
  const petAttachedSessionId = useRuntimeStore((s) => s.petAttachedSessionId);
  const setPendingPetMigration = useUiStore((s) => s.setPendingPetMigration);

  const toasts = useUiStore((s) => s.toasts);
  const pushToast = useUiStore((s) => s.pushToast);
  const dismissToast = useUiStore((s) => s.dismissToast);
  const checkForAppUpdate = useAppUpdateStore((s) => s.check);
  const [emptyComposerFocusTick, setEmptyComposerFocusTick] = useState(0);

  const bridgeStatus = useRuntimeStore((s) =>
    activeSessionId
      ? (s.byId[activeSessionId]?.bridgeStatus ?? "idle")
      : "idle",
  );
  const sendIPCCommand = useRuntimeStore((s) => s.sendIPCCommand);
  const shutdownBridge = useRuntimeStore((s) => s.shutdownBridge);
  const setGAConfig = usePrefsStore((s) => s.setGAConfig);
  const setActiveRuntimeKind = usePrefsStore((s) => s.setActiveRuntimeKind);
  const gaConfig = usePrefsStore((s) => s.gaConfig);
  const activeRuntimeKind = usePrefsStore((s) => s.activeRuntimeKind);
  const channelsStatus = useImSupervisorStatus(
    "wechat",
    activeRuntimeKind === "managed",
  );
  const managedModels = useManagedModelsStore((s) => s.models);
  const managedLLMs = useMemo(
    () => managedModelsToLLMs(managedModels, pendingLLMIndex),
    [managedModels, pendingLLMIndex],
  );
  const resolvedLanguage = useMemo(
    () => resolveLanguagePreference(languagePreference),
    [languagePreference],
  );
  const copy = useMemo(
    () => copyForLanguage(resolvedLanguage),
    [resolvedLanguage],
  );
  const managedLLMDisplayName = currentLLMDisplayName(
    managedLLMs,
    copy.app.unconfiguredModel,
  );
  const fallbackLLMs =
    activeRuntimeKind === "managed" ? managedLLMs : cachedLLMs;
  const fallbackLLMDisplayName =
    activeRuntimeKind === "managed"
      ? managedLLMDisplayName
      : cachedLLMDisplayName;
  const llms = activeRuntimeLLMs ?? fallbackLLMs;
  const llmDisplayName =
    activeRuntimeDisplayName ?? fallbackLLMDisplayName ?? "";
  const llmConfigHint =
    activeRuntimeKind === "managed" ? undefined : copy.app.externalModelHint;
  const hasConfiguredManagedModel = managedModels.some(
    (model) => model.credentialStatus !== "missing",
  );
  const requiresManagedModelConfig =
    activeRuntimeKind === "managed" && !hasConfiguredManagedModel;
  const sidebarRuntimeIndicator =
    activeRuntimeKind === "managed"
      ? hasConfiguredManagedModel
        ? "hidden"
        : "configure-models"
      : gaConfig.gaPath.trim() !== "" && gaConfig.python.trim() !== ""
        ? "external-ready"
        : "external-unconfigured";
  const openSettings = (tab: SettingsTab = "runtime") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };
  const openModelsForMissingConfig = () => openSettings("models");
  const openModelConfigFromSwitcher =
    activeRuntimeKind === "managed" ? () => openSettings("models") : undefined;
  const openLLMSwitcherFallback = () => {
    if (activeRuntimeKind === "managed") {
      openSettings("models");
      return;
    }
    setPaletteOpen(true);
  };

  const storeTurns = useMessagesStore((s) =>
    activeSessionId
      ? (s.byId[activeSessionId]?.turns ?? EMPTY_TURNS)
      : EMPTY_TURNS,
  );
  const storePending = useMessagesStore((s) =>
    activeSessionId
      ? (s.byId[activeSessionId]?.pendingApprovals ?? EMPTY_APPROVALS)
      : EMPTY_APPROVALS,
  );
  const agentRunning = useMessagesStore((s) =>
    activeSessionId ? (s.byId[activeSessionId]?.agentRunning ?? false) : false,
  );
  const hasRunningSessions = useMessagesStore((s) =>
    Object.values(s.byId).some((messages) => messages.agentRunning),
  );
  const currentTurnIndex = useMessagesStore((s) =>
    activeSessionId
      ? (s.byId[activeSessionId]?.currentTurnIndex ?? null)
      : null,
  );
  const userSubmitTick = useMessagesStore((s) => s.userSubmitTick);
  const inFlightContent = useMessagesStore((s) =>
    activeSessionId ? (s.byId[activeSessionId]?.inFlightContent ?? "") : "",
  );
  const pendingAskUser = useMessagesStore((s) =>
    activeSessionId ? (s.byId[activeSessionId]?.pendingAskUser ?? null) : null,
  );
  const appendUserTurn = useMessagesStore((s) => s.appendUserTurn);
  const appendSideQuestionUserTurn = useMessagesStore(
    (s) => s.appendSideQuestionUserTurn,
  );
  const removePendingApproval = useMessagesStore(
    (s) => s.removePendingApproval,
  );

  const reportUserSendFailure = (sid: string, context: string, e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[main] send failed", { sid, message });
    const m = useMessagesStore.getState();
    m.setAgentRunning(sid, false);
    m.setCurrentTurnIndex(sid, null);
    m.clearInFlightContent(sid);
    useUiStore.getState().pushToast(
      makeAppError({
        category: "bridge",
        severity: "error",
        title: copy.errors.sendFailed,
        message,
        hint: null,
        retryable: true,
        context,
        traceback: null,
      }),
    );
  };

  const runBrowserControlDemo = async () => {
    if (requiresManagedModelConfig) {
      openModelsForMissingConfig();
      return;
    }
    let demoSid: string | null = null;
    try {
      const sid = createSession();
      demoSid = sid;
      await activateSession(sid);
      setScreen("main");
      appendUserTurn(sid, copy.browserControl.demoPrompt);
      await sendIPCCommand(sid, {
        kind: "user_message",
        text: copy.browserControl.demoPrompt,
        images: [],
      });
    } catch (e) {
      if (demoSid) {
        reportUserSendFailure(demoSid, "browser_control_demo", e);
      } else {
        const message = e instanceof Error ? e.message : String(e);
        useUiStore.getState().pushToast(
          makeAppError({
            category: "bridge",
            severity: "error",
            title: copy.errors.sendFailed,
            message,
            hint: null,
            retryable: true,
            context: "browser_control_demo",
            traceback: null,
          }),
        );
      }
    }
  };

  // Drives the slice-store hydrate sequence in order: app version →
  // prefs hydrate → managed runtime layout → sessions hydrate →
  // SQLite housekeeping / FTS backfill → cached LLM seed →
  // Onboarding routing OR warmup.
  useEffect(() => {
    void hydrateApp();
  }, []);

  // Browser Control is part of the intended managed-GA experience. On each
  // launch in managed mode we sync the stable extension folder and run a real
  // bridge probe. The setup modal is gated below so it does not interrupt the
  // first-run model configuration screen.
  useEffect(() => {
    if (activeRuntimeKind !== "managed") return;
    let cancelled = false;
    void (async () => {
      const layout = await ensureBrowserControlLayout();
      if (cancelled) return;
      if (!layout) return;
      await probeBrowserControl();
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRuntimeKind, ensureBrowserControlLayout, probeBrowserControl]);

  useEffect(() => {
    if (activeRuntimeKind === "managed") return;
    if (!browserControlSetupOpen) return;
    closeBrowserControlSetup();
  }, [activeRuntimeKind, browserControlSetupOpen, closeBrowserControlSetup]);

  // Session creation is **lazy** — we no longer auto-create on
  // landing in the empty screen. Earlier versions did, which
  // accumulated piles of "新对话" rows every time the user opened
  // and closed the app without ever typing. The Composer's
  // onSubmit handles createSession + activate at the moment the
  // user actually has intent. Sidebar's "New Chat" button still
  // creates an explicit session immediately, because that click
  // *is* the intent.

  // Global keyboard shortcuts: ⌘K palette, ⌘, settings, ⌘N new chat.
  // Esc handled by Radix Dialog (Settings) and cmdk (CommandPalette)
  // themselves. ⌘E (Toggle inspector) retired 2026-05-12 with the
  // Inspector panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        togglePalette();
      } else if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setActiveProjectFilter(undefined);
        setActiveSession(undefined);
        setScreen("empty");
        setEmptyComposerFocusTick((tick) => tick + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    togglePalette,
    setSettingsOpen,
    setActiveProjectFilter,
    setActiveSession,
    setScreen,
    setEmptyComposerFocusTick,
  ]);

  // macOS menubar bridge: core/src/lib.rs installs a native menu
  // on Mac that emits `menu:<id>` events. We subscribe and route each
  // to the same store action the matching in-app control would trigger.
  //
  // On Win/Linux there's no menu installed → these events never fire,
  // the subscription sits idle (cheap, no overhead). Keeping it
  // unconditional avoids importing isMac into this file just for a
  // micro-optimization.
  //
  // No double-fire with the keydown handler above: AppKit consumes
  // menu accelerators (Cmd+, / Cmd+N) before the webview sees them
  // when a menu has them bound, so the keydown listener doesn't run
  // on Mac for accelerator-bound keys. Win has no menu so keydown
  // remains the only path there.
  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const handlers: Array<[string, () => void]> = [
      ["menu:settings", () => setSettingsOpen(true)],
      [
        "menu:check_updates",
        () => {
          setSettingsTab("about");
          setSettingsOpen(true);
          void checkForAppUpdate({ silent: false });
        },
      ],
      [
        "menu:new_chat",
        () => {
          setActiveProjectFilter(undefined);
          setActiveSession(undefined);
          setScreen("empty");
        },
      ],
      [
        "menu:width_compact",
        () => {
          void setConversationWidth("compact");
        },
      ],
      [
        "menu:width_wide",
        () => {
          void setConversationWidth("wide");
        },
      ],
    ];

    void (async () => {
      for (const [event, handler] of handlers) {
        const fn = await listen(event, handler);
        if (cancelled) {
          fn();
        } else {
          unlisteners.push(fn);
        }
      }
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [
    setSettingsOpen,
    setActiveProjectFilter,
    setActiveSession,
    setScreen,
    setConversationWidth,
    setSettingsTab,
    checkForAppUpdate,
  ]);

  // `user-message-persisted` listener: Rust core's socket_listener emits
  // this Tauri event whenever a user message is persisted via the socket
  // transport (CLI `galley session send`, supervisor agents). The GUI's
  // own Composer path skips this — it mutates the store synchronously
  // and emitting here would double-render.
  //
  // Without this listener, CLI-origin messages render the agent reply
  // (because bridge events still flow through `runner-event`) but the
  // user question itself never appears — the row exists in DB but the
  // in-memory `turns` array is the source of truth for rendering.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void (async () => {
      const fn = await listen<{
        sessionId: string;
        dispatch?: "dispatched" | "persisted_only" | "spawn_failed";
        message: {
          content: string;
          createdAt?: string;
          origin?: {
            via: "gui" | "cli" | "supervisor" | "system";
            supervisor?: string;
            reason?: string;
          };
        };
      }>("user-message-persisted", (e) => {
        const { sessionId, message, dispatch } = e.payload;
        appendUserTurnExternal(
          sessionId,
          message.content,
          message.origin,
          message.createdAt,
          dispatch === undefined ? true : dispatch === "dispatched",
        );
      });
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [appendUserTurnExternal]);

  // A socket-created session can now start its own runner immediately.
  // Attach the same JS-side event listeners used by GUI-spawned bridges
  // so assistant turns, approvals, and close events flow into stores.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void (async () => {
      const fn = await listen<{
        sessionId: string;
        pid: number;
        via: string;
      }>("runner-spawned-external", (e) => {
        void attachExternalBridge(e.payload.sessionId, e.payload.pid);
      });
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [attachExternalBridge]);

  // B4 M1 session-write listeners. Socket handlers in
  // core/src/socket_listener.rs emit these whenever a CLI / supervisor
  // command persists a session row; the GUI mirrors the row into its
  // in-memory store so the sidebar updates without polling. The payload
  // shape mirrors Rust's `SessionExternalPayload` — `session` is the
  // freshly-read SessionBrief, `via` is the originating socket command.
  //
  // For `session.new`, the corresponding user message lands via the
  // existing `user-message-persisted` event (emitted in the same
  // handler) — kept as two events so a future supervisor agent can
  // listen for one without the other.
  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    type ExternalPayload = {
      session: Parameters<typeof applyExternalSessionCreated>[0];
      via: string;
    };
    void (async () => {
      const subscribe = async (
        event: string,
        handler: (p: ExternalPayload) => void,
      ) => {
        const fn = await listen<ExternalPayload>(event, (e) =>
          handler(e.payload),
        );
        if (cancelled) {
          fn();
        } else {
          unlisteners.push(fn);
        }
      };
      await subscribe("session-created-external", (p) =>
        applyExternalSessionCreated(p.session),
      );
      await subscribe("session-archived-external", (p) =>
        applyExternalSessionUpdated(p.session),
      );
      await subscribe("session-unarchived-external", (p) =>
        applyExternalSessionUpdated(p.session),
      );
      await subscribe("session-moved-external", (p) =>
        applyExternalSessionUpdated(p.session),
      );
      // M1.3 llm.set rides this channel so the Composer pill picks up
      // a CLI / supervisor LLM switch without a list_sessions refresh.
      await subscribe("session-updated-external", (p) =>
        applyExternalSessionUpdated(p.session),
      );
    })();
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [applyExternalSessionCreated, applyExternalSessionUpdated]);

  // B4 M1.3 project-write listeners. Same pattern as the session ones
  // above but with a different payload shape (`project` not `session`),
  // and `project-deleted-external` carries the FK SET NULL detach
  // metadata so we don't have to re-query the list.
  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    void (async () => {
      const createdFn = await listen<{
        project: Parameters<typeof applyExternalProjectCreated>[0];
        via: string;
      }>("project-created-external", (e) => {
        applyExternalProjectCreated(e.payload.project);
      });
      if (cancelled) createdFn();
      else unlisteners.push(createdFn);

      const deletedFn = await listen<{
        projectId: string;
        detachedSessions: number;
        detachedSessionIds: string[];
      }>("project-deleted-external", (e) => {
        applyExternalProjectDeleted(e.payload.projectId);
      });
      if (cancelled) deletedFn();
      else unlisteners.push(deletedFn);
    })();
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [applyExternalProjectCreated, applyExternalProjectDeleted]);

  // Conversation source of truth: messagesStore turns + pendingApprovals,
  // populated by ipc-handlers as bridge events stream in. When no session
  // is active, MainView renders the empty state instead of <Conversation>,
  // so these reduce to EMPTY_TURNS / EMPTY_APPROVALS without rendering.
  const turns = storeTurns;
  const pendingApprovals = storePending;
  // Composer Stop-mode is driven by the real `agentRunning` store flag
  // (set when user submits, cleared on turn_end / error / run_complete).
  const isRunning = agentRunning;

  // Always show history in the sidebar (including on the empty
  // screen) so a user composing in "new chat" can still see and
  // switch back to a prior session. Empty selection is signalled
  // by activeSession being undefined, not by hiding the list.
  //
  // Archived sessions are filtered out here so both Sidebar and
  // CommandPalette pull from the same pre-filtered list. The rows
  // still live in SQLite — the Archived dialog (sidebar footer)
  // surfaces them for Restore / Delete / Empty all.
  const visibleSessions = useMemo(
    () => sessions.filter((s) => s.status !== "archived"),
    [sessions],
  );
  const archivedCount = sessions.length - visibleSessions.length;
  const effectiveActiveId = screen === "main" ? activeSessionId : undefined;
  const activeSession = visibleSessions.find((s) => s.id === effectiveActiveId);
  const activeProject = activeProjectFilter
    ? projects.find((p) => p.id === activeProjectFilter)
    : undefined;
  const activeSessionBusy =
    screen === "main" &&
    (isRunning || pendingApprovals.length > 0 || pendingAskUser !== null);

  // Archived dialog open state — local UI state, no need to live in
  // the global store. Persisting across reloads would be confusing
  // (user expects modals to be closed on app re-open).
  const [archivedOpen, setArchivedOpen] = useState(false);
  // EarlierDialog: opens when the user clicks the collapsed
  // "Earlier (N)" row in the sidebar. Same local-state rationale as
  // archivedOpen.
  const [earlierOpen, setEarlierOpen] = useState(false);
  const earlierSessions = useMemo(
    () => visibleSessions.filter((s) => bucketSession(s) === "earlier"),
    [visibleSessions],
  );
  const [projectViewOpen, setProjectViewOpen] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const [projectReviewNowMs, setProjectReviewNowMs] = useState(0);
  const toggleProjectView = () => {
    if (projectViewOpen) {
      setActiveProjectFilter(undefined);
      setProjectViewOpen(false);
      return;
    }
    setExpandedProjectIds([]);
    setProjectReviewNowMs(Date.now());
    setProjectViewOpen(true);
  };
  const openProjectInSidebar = (projectId: string) => {
    setProjectReviewNowMs(Date.now());
    setProjectViewOpen(true);
    setExpandedProjectIds((ids) =>
      ids.includes(projectId) ? ids : [...ids, projectId],
    );
  };
  const toggleProjectExpanded = (projectId: string) => {
    if (!projectViewOpen) {
      setProjectReviewNowMs(Date.now());
      setExpandedProjectIds([projectId]);
      setProjectViewOpen(true);
      return;
    }
    setExpandedProjectIds((ids) =>
      ids.includes(projectId)
        ? ids.filter((id) => id !== projectId)
        : [...ids, projectId],
    );
  };
  const startProjectConversation = (projectId: string) => {
    setActiveProjectFilter(projectId);
    if (activeSessionBusy) return;
    setActiveSession(undefined);
    setScreen("empty");
    setEmptyComposerFocusTick((tick) => tick + 1);
  };
  const assignSessionToProjectWithToast = (
    sessionId: string,
    projectId: string | null,
  ) => {
    const session = visibleSessions.find((s) => s.id === sessionId);
    const previousProject = session?.projectId
      ? projects.find((p) => p.id === session.projectId)
      : undefined;
    const nextProject = projectId
      ? projects.find((p) => p.id === projectId)
      : undefined;
    const sessionTitle = session?.title ?? copy.toasts.conversationUpdated;

    void assignSessionToProject(sessionId, projectId).then(() => {
      if (projectId) {
        const projectName = nextProject?.name ?? copy.projects.fallbackProject;
        const title =
          session?.projectId && session.projectId !== projectId
            ? copy.toasts.movedTo(projectName)
            : copy.toasts.addedTo(projectName);
        pushToast(
          makeAppError({
            category: "business",
            severity: "info",
            title,
            message: sessionTitle,
            hint: null,
            retryable: false,
            context: null,
            traceback: null,
            action: {
              kind: "view_project",
              label: copy.toasts.viewProject,
              projectId,
            },
            autoDismissMs: 4000,
          }),
        );
        return;
      }

      pushToast(
        makeAppError({
          category: "business",
          severity: "info",
          title: previousProject
            ? copy.toasts.removedFromProject(previousProject.name)
            : copy.toasts.removedFromAnyProject,
          message: sessionTitle,
          hint: null,
          retryable: false,
          context: null,
          traceback: null,
          autoDismissMs: 3000,
        }),
      );
    });
  };
  // CreateProjectDialog open state. Local for the same reason as the
  // other dialogs above — modal visibility shouldn't persist across
  // launches.
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  // EditProjectDialog: stores the full project being edited so the
  // dialog can reset its inputs from the row that triggered it.
  // `null` = closed.
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const editingProject = useMemo(
    () => projects.find((p) => p.id === editingProjectId) ?? null,
    [projects, editingProjectId],
  );
  // ConfirmDeleteProject dialog — opens from inside EditProject when
  // the user clicks "删除 Project". Same null-or-project pattern.
  // Settings-driven Onboarding flows:
  // - Health Check revisit jumps directly to StepHealth and returns to
  //   Settings on completion.
  // - Setup Assistant starts from the same first screen as initial
  //   install, but keeps a Back to Settings escape hatch. Opening it
  //   has no side effect; settings only change when the user edits a
  //   step and completes it.
  //
  // Health Check revisit flow (Settings → Re-run Health Check):
  //   - true → Onboarding renders in "revisit" mode (skips Welcome /
  //     Attach, jumps to Health step, swaps button labels)
  //   - previousScreen remembers where the user was before triggering
  //     the revisit, so onComplete / onCancel can return them there +
  //     re-open Settings (the action itself was triggered from inside
  //     the Settings dialog, so "where I was" implicitly includes
  //     "with Settings open").
  const [healthCheckRevisit, setHealthCheckRevisit] = useState(false);
  const [setupAssistantFromSettings, setSetupAssistantFromSettings] =
    useState(false);
  const [revisitReturnScreen, setRevisitReturnScreen] =
    useState<import("@/stores/ui").Screen>("empty");

  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null,
  );
  const deletingProject = useMemo(
    () => projects.find((p) => p.id === deletingProjectId) ?? null,
    [projects, deletingProjectId],
  );
  const showBrowserControlAttention =
    activeRuntimeKind === "managed" &&
    (browserControlStatus === "not_connected" ||
      browserControlStatus === "error");

  // Onboarding takeover: no AppShell, no overlays besides the dev
  // toggle.
  if (screen === "onboarding") {
    const onboardingMode = healthCheckRevisit
      ? "revisit"
      : setupAssistantFromSettings
        ? "setup"
        : "fresh";
    const returnToSettings = () => {
      setHealthCheckRevisit(false);
      setSetupAssistantFromSettings(false);
      setScreen(revisitReturnScreen);
      setSettingsOpen(true);
    };
    const returnToMainAfterSetup = () => {
      setHealthCheckRevisit(false);
      setSetupAssistantFromSettings(false);
      setScreen("empty");
      setEmptyComposerFocusTick((tick) => tick + 1);
    };
    const saveExternalGAConfigIfChanged = async (
      gaPath: string,
      pythonAlias: string | null,
    ) => {
      const partial: { gaPath?: string; python?: string } = {};
      if (gaPath !== gaConfig.gaPath) partial.gaPath = gaPath;
      if (pythonAlias && pythonAlias !== gaConfig.python) {
        partial.python = pythonAlias;
      }
      if (Object.keys(partial).length > 0) {
        await setGAConfig(partial);
      }
    };

    return (
      <CopyProvider language={resolvedLanguage}>
        <Onboarding
          mode={onboardingMode}
          initialPath={
            healthCheckRevisit || setupAssistantFromSettings
              ? gaConfig.gaPath
              : undefined
          }
          canContinueWithCurrentModel={
            activeRuntimeKind === "managed" && hasConfiguredManagedModel
          }
          languagePreference={languagePreference}
          resolvedLanguage={resolvedLanguage}
          onChangeLanguagePreference={(preference) => {
            void setLanguagePreference(preference);
          }}
          onComplete={(gaPath, pythonAlias) => {
            // Persist the validated path + the probed Python alias so
            // subsequent bridge spawns use the right interpreter, not
            // the demo fallback (system python3 in a packaged build
            // has no GA deps — silent crash).
            void (async () => {
              await saveExternalGAConfigIfChanged(gaPath, pythonAlias);
              if (!healthCheckRevisit && activeRuntimeKind !== "external") {
                await setActiveRuntimeKind("external");
              }
              if (healthCheckRevisit) {
                // Settings → "跑一次 Health Check" round-trip: return
                // the user to the screen they came from + re-open the
                // Settings dialog where they clicked.
                returnToSettings();
              } else {
                returnToMainAfterSetup();
              }
            })();
          }}
          onManagedComplete={() => {
            void (async () => {
              if (activeRuntimeKind !== "managed") {
                await setActiveRuntimeKind("managed");
              }
              returnToMainAfterSetup();
            })();
          }}
          onCancel={() => {
            // Revisit-only escape hatch. setGAConfig is intentionally
            // skipped — the user bailed without committing to a new
            // probe result, so we keep whatever was saved before.
            returnToSettings();
          }}
        />
      </CopyProvider>
    );
  }

  return (
    <CopyProvider language={resolvedLanguage}>
      <AppShell
        topBar={
          <TopBar
            sessionTitle={activeSession?.title}
            yoloMode={yoloMode}
            onDisableYolo={() => {
              void setYoloMode(false);
            }}
            browserControlStatus={
              activeRuntimeKind === "managed" ? browserControlStatus : null
            }
            onOpenBrowserControl={openBrowserControlSetup}
            channelsState={
              activeRuntimeKind === "managed"
                ? (channelsStatus.status?.state ?? null)
                : null
            }
            channelsLoadError={
              activeRuntimeKind === "managed" ? channelsStatus.loadError : null
            }
            onOpenChannelsSettings={
              activeRuntimeKind === "managed"
                ? () => openSettings("im")
                : undefined
            }
            conversationWidth={conversationWidth}
            onToggleConversationWidth={() => {
              void setConversationWidth(
                conversationWidth === "wide" ? "compact" : "wide",
              );
            }}
            onReinjectTools={() => {
              // Reinject targets the currently active session — that's
              // the conversation the user is reading when they notice
              // tool drift. No-op if no active session (button is
              // available but does nothing rather than throwing).
              if (!activeSessionId) return;
              if (bridgeStatus !== "connected") return;
              void sendIPCCommand(activeSessionId, {
                kind: "reinject_tools",
              });
            }}
            onTogglePet={() => {
              // Three cases (see devlog 2026-05-14 pet UX overhaul):
              //   1. Active session HOLDS the pet → detach (close).
              //   2. Pet on another session → implicit migrate:
              //      detach old + stash target; the pet_detached IPC
              //      handler fires the follow-up attach once the
              //      port is released.
              //   3. No pet anywhere → attach to active.
              // The sidebar Cat badge tells the user where the pet
              // currently lives, so the menu's "桌面宠物" always
              // reads as "I want it here" without surprise.
              if (!activeSessionId) return;
              if (petAttachedSessionId === activeSessionId) {
                void sendIPCCommand(activeSessionId, {
                  kind: "detach_pet",
                });
                return;
              }
              if (bridgeStatus !== "connected") return;
              if (petAttachedSessionId) {
                setPendingPetMigration(activeSessionId);
                void sendIPCCommand(petAttachedSessionId, {
                  kind: "detach_pet",
                });
                return;
              }
              void sendIPCCommand(activeSessionId, {
                kind: "attach_pet",
                port: 41983,
              });
            }}
            currentSessionHasPet={
              !!activeSessionId && petAttachedSessionId === activeSessionId
            }
            onRenameSession={(newTitle) => {
              if (!activeSessionId) return;
              renameSession(activeSessionId, newTitle);
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenApprovalSettings={() => openSettings("approval")}
          />
        }
        sidebar={
          <Sidebar
            runtimeIndicator={sidebarRuntimeIndicator}
            onOpenRuntimeSettings={() => openSettings("runtime")}
            onOpenModelsSettings={() => openSettings("models")}
            onOpenAgentSettings={() => openSettings("integration")}
            sessions={visibleSessions}
            activeId={effectiveActiveId}
            onNewChat={() => {
              // Lazy: New Chat just clears the active selection and
              // shows the empty composer. No session row is created
              // until the user actually submits — otherwise every
              // click on this button piles up another "新对话"
              // placeholder in the sidebar. submitOnEmpty does the
              // createSession + activateSession when the user
              // commits to a first message.
              setActiveProjectFilter(undefined);
              setActiveSession(undefined);
              setScreen("empty");
              setEmptyComposerFocusTick((tick) => tick + 1);
            }}
            onSelectSession={(id) => {
              // Activate (re-spawns the bridge if this session has
              // been idle / closed / errored) and switch to main.
              // Other sessions' bridges keep running in background.
              setActiveProjectFilter(undefined);
              void activateSession(id);
              setScreen("main");
            }}
            onArchiveSession={(id) => archiveSession(id)}
            onRenameSession={(id, newTitle) => renameSession(id, newTitle)}
            onTogglePinSession={(id) => togglePinSession(id)}
            onOpenArchived={() => setArchivedOpen(true)}
            onOpenEarlier={() => setEarlierOpen(true)}
            archivedCount={archivedCount}
            onSearch={() => setPaletteOpen(true)}
            projects={projects}
            activeProjectFilter={activeProjectFilter}
            projectViewOpen={projectViewOpen}
            expandedProjectIds={expandedProjectIds}
            projectReviewNowMs={projectReviewNowMs || undefined}
            onNewProject={() => setCreateProjectOpen(true)}
            onToggleProjectView={toggleProjectView}
            onToggleProjectExpanded={toggleProjectExpanded}
            onStartProjectConversation={startProjectConversation}
            onAssignSessionToProject={assignSessionToProjectWithToast}
            onTogglePinProject={(id) => {
              const p = projects.find((x) => x.id === id);
              if (p) void updateProject(id, { pinned: !p.pinned });
            }}
            onEditProject={(id) => setEditingProjectId(id)}
            onDeleteProject={(id) => setDeletingProjectId(id)}
            petAttachedSessionId={petAttachedSessionId}
          />
        }
        main={
          <BrowserControlAttentionSurface
            show={showBrowserControlAttention}
            onOpen={openBrowserControlSetup}
          >
            {screen === "empty" ? (
              <EmptyState
                llmDisplayName={llmDisplayName}
                conversationWidth={conversationWidth}
                projectName={activeProject?.name}
                showPromptSuggestions={!activeProject}
                focusTick={emptyComposerFocusTick}
                llms={llms}
                llmConfigHint={llmConfigHint}
                onConfigureModels={openModelConfigFromSwitcher}
                requiresModelConfig={requiresManagedModelConfig}
                onSelectLLM={(idx) => {
                  // EmptyState always configures the *next* new
                  // session: stash pendingLLMIndex + flip the
                  // top-level llms projection so the Composer pill
                  // reflects the pick. activateSession consumes
                  // pendingLLMIndex when submitOnEmpty creates and
                  // spawns the fresh session.
                  selectLLMForNewSession(idx);
                }}
                onOpenLLMSwitcher={openLLMSwitcherFallback}
                onSubmit={(t) => {
                  if (requiresManagedModelConfig) {
                    openModelsForMissingConfig();
                    return;
                  }
                  void submitOnEmpty(
                    t,
                    activeSessionId,
                    createSession,
                    activateSession,
                    appendUserTurn,
                    sendIPCCommand,
                    setScreen,
                    reportUserSendFailure,
                    activeProjectFilter,
                  ).then(() => {
                    if (activeProjectFilter) setActiveProjectFilter(undefined);
                  });
                }}
                onQuickPrompt={(p) => {
                  if (requiresManagedModelConfig) {
                    openModelsForMissingConfig();
                    return;
                  }
                  void submitOnEmpty(
                    p,
                    activeSessionId,
                    createSession,
                    activateSession,
                    appendUserTurn,
                    sendIPCCommand,
                    setScreen,
                    reportUserSendFailure,
                    activeProjectFilter,
                  ).then(() => {
                    if (activeProjectFilter) setActiveProjectFilter(undefined);
                  });
                }}
              />
            ) : (
              <MainView
                turns={turns}
                llmDisplayName={llmDisplayName}
                projectName={
                  activeSession?.projectId
                    ? projects.find((p) => p.id === activeSession.projectId)
                        ?.name
                    : undefined
                }
                llms={llms}
                llmConfigHint={llmConfigHint}
                onConfigureModels={openModelConfigFromSwitcher}
                requiresModelConfig={requiresManagedModelConfig}
                onSelectLLM={(idx) => {
                  if (!activeSessionId) return;
                  // Flip local + persisted state immediately so the
                  // picker never depends on a bridge round-trip for
                  // visible feedback. The live bridge, when available,
                  // still receives set_llm and will confirm via
                  // llm_changed.
                  selectLLMForSession(activeSessionId, idx);
                  if (
                    bridgeStatus === "connected" ||
                    bridgeStatus === "spawning"
                  ) {
                    void sendIPCCommand(activeSessionId, {
                      kind: "set_llm",
                      llmIndex: idx,
                    });
                  }
                }}
                onOpenLLMSwitcher={openLLMSwitcherFallback}
                pendingApprovals={pendingApprovals}
                approvalDecisions={approvalDecisions}
                onSubmit={(t) => {
                  if (requiresManagedModelConfig) {
                    openModelsForMissingConfig();
                    return;
                  }
                  // Main screen always has an active session — Sidebar
                  // / EmptyState set it before transitioning here.
                  if (!activeSessionId) return;
                  const sid = activeSessionId;
                  const ensureBridgeThenSend = async (
                    cmd:
                      | { kind: "user_message"; text: string; images: string[] }
                      | { kind: "ask_user_response"; text: string },
                  ) => {
                    const runtime = useRuntimeStore.getState();
                    const latestStatus =
                      runtime.byId[sid]?.bridgeStatus ?? "idle";
                    if (
                      latestStatus !== "spawning" &&
                      (latestStatus !== "connected" ||
                        !runtime.hasBridgeClient(sid))
                    ) {
                      await activateSession(sid);
                    }
                    if (cmd.kind === "user_message") {
                      let historyReady = await ensureHistoryReplayComplete(sid);
                      if (!historyReady) {
                        console.warn(
                          "[main] history replay did not confirm; restarting bridge.",
                          { sid },
                        );
                        await shutdownBridge(sid);
                        await activateSession(sid);
                        historyReady = await ensureHistoryReplayComplete(sid);
                        if (!historyReady) {
                          throw new Error(copy.app.restoreTimeout);
                        }
                      }
                    }
                    await sendIPCCommand(sid, cmd);
                  };
                  const reportSendFailure = (e: unknown) =>
                    reportUserSendFailure(sid, "send_user_message", e);
                  // `/btw` is a side question (interruption-free,
                  // not a main-agent turn). Route to the transient
                  // user-turn path so it doesn't disturb the main
                  // agent's running state — bridge intercepts the
                  // user_message command and runs the btw worker
                  // independently of the task queue.
                  const trimmed = t.trimStart();
                  if (trimmed === "/btw" || trimmed.startsWith("/btw ")) {
                    appendSideQuestionUserTurn(sid, t);
                    void ensureBridgeThenSend({
                      kind: "user_message",
                      text: t,
                      images: [],
                    }).catch(reportSendFailure);
                    return;
                  }
                  // Snapshot pendingAskUser **before** appendUserTurn
                  // clears it — we need to know which IPC command to
                  // send. ask_user_response and user_message both
                  // ultimately call agent.put_task on the bridge side
                  // (same agent_runner_loop kickoff), but keeping
                  // them distinct preserves audit-trail clarity:
                  // "this user message was a reply to a specific
                  // question" vs "this was a fresh prompt".
                  const wasAskUser = pendingAskUser !== null;
                  appendUserTurn(sid, t);
                  if (wasAskUser) {
                    void ensureBridgeThenSend({
                      kind: "ask_user_response",
                      text: t,
                    }).catch(reportSendFailure);
                  } else {
                    void ensureBridgeThenSend({
                      kind: "user_message",
                      text: t,
                      images: [],
                    }).catch(reportSendFailure);
                  }
                }}
                onApprove={(approvalId, decision) => {
                  if (!activeSessionId) return;
                  recordApprovalDecision(activeSessionId, approvalId, decision);
                  removePendingApproval(activeSessionId, approvalId);
                  if (bridgeStatus === "connected") {
                    sendIPCCommand(activeSessionId, {
                      kind: "approval_response",
                      approvalId,
                      decision,
                    });
                  }
                }}
                onStop={() => {
                  console.info("[main] stop");
                  if (!activeSessionId) return;
                  if (bridgeStatus === "connected") {
                    sendIPCCommand(activeSessionId, { kind: "abort" });
                  }
                }}
                isRunning={isRunning}
                currentTurnIndex={currentTurnIndex}
                userSubmitTick={userSubmitTick}
                inFlightContent={inFlightContent}
                pendingAskUser={pendingAskUser}
                conversationWidth={conversationWidth}
                activeSessionId={activeSessionId}
              />
            )}
          </BrowserControlAttentionSurface>
        }
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        sessions={visibleSessions}
        runtimeKind={activeRuntimeKind}
        llms={llms}
        onNewChat={() => {
          setActiveProjectFilter(undefined);
          setActiveSession(undefined);
          setScreen("empty");
          setEmptyComposerFocusTick((tick) => tick + 1);
        }}
        onNewProject={() => setCreateProjectOpen(true)}
        onOpenSession={(id) => {
          setActiveProjectFilter(undefined);
          void activateSession(id);
          setScreen("main");
        }}
        onSwitchLLM={(idx) => {
          // Route to the active session's bridge. The palette is a
          // global affordance but `set_llm` is per-bridge; the user
          // intuitively expects "the LLM I see in the Composer" to
          // be the one switched, which matches activeSessionId.
          if (!activeSessionId) {
            console.info("[palette] switch llm: no active session, idx=", idx);
            return;
          }
          selectLLMForSession(activeSessionId, idx);
          // Same relaxed gate as MainView's onSelectLLM — allow during
          // spawning so users don't get silent drops in the cold-start
          // window. set_llm remains best-effort if no live bridge appears.
          if (bridgeStatus === "connected" || bridgeStatus === "spawning") {
            void sendIPCCommand(activeSessionId, {
              kind: "set_llm",
              llmIndex: idx,
            });
          } else {
            console.info(
              "[palette] switch llm: bridge not ready, idx=",
              idx,
              "status=",
              bridgeStatus,
            );
          }
        }}
        onReRunHealthCheck={() => console.info("[palette] re-run health check")}
        onOpenSettings={() => setSettingsOpen(true)}
        onAttachGAFolder={() =>
          console.info("[palette] attach GA folder — wired in #10")
        }
        onSubmitFreeText={(text) => {
          console.info("[palette] free-text submit:", text);
          setScreen("main");
        }}
      />

      <Settings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        runtimeInfo={runtimeInfo}
        approval={approvalConfig}
        projectCount={projects.length}
        hasRunningSessions={hasRunningSessions}
        activeRuntimeKind={activeRuntimeKind}
        hasManagedRuntimeConfigured={hasConfiguredManagedModel}
        hasExternalRuntimeConfigured={gaConfig.gaPath.trim() !== ""}
        yoloMode={yoloMode}
        useExternalPython={gaConfig.useExternalPython}
        onChangeYoloMode={(enabled) => {
          // Fire-and-forget: setYoloMode persists + notifies bridge,
          // but the UI updates synchronously from the store action.
          void setYoloMode(enabled);
        }}
        onChangeRequiredTools={setApprovalRequiredTools}
        onRemoveAlwaysAllow={removeAlwaysAllow}
        onChangeGAPath={() => {
          void pickGAPath(setGAConfig, copy.app.chooseGAFolderTitle);
        }}
        onCommitGAPath={async (path) => {
          // Manual-typed GA path from Settings → Runtime. The
          // SettingsRuntime field has already validated and refuses to
          // call this on `not-found`; we trust it here. setGAConfig
          // shows the same "重启 Galley 才能生效" toast as the picker
          // flow, keeping both entry points symmetric.
          await setGAConfig({ gaPath: path });
        }}
        onToggleExternalPython={(useExternal) => {
          // v0.1.1: persist the bundled-vs-external choice. Like
          // gaPath, takes effect on next bridge spawn (existing live
          // sessions keep their current Python). setGAConfig shows
          // the same "重启 Galley" toast.
          void setGAConfig({ useExternalPython: useExternal });
        }}
        onChangeRuntimeKind={(kind) => {
          if (kind === activeRuntimeKind) return;
          void (async () => {
            await setActiveRuntimeKind(kind);
            useRuntimeStore.setState({ pendingLLMIndex: undefined });
            setActiveProjectFilter(undefined);
            setActiveSession(undefined);
            setScreen("empty");
            await useSessionsStore.getState().hydrate();
            pushToast(
              makeAppError({
                category: "business",
                severity: "info",
                title: copy.toasts.switchedRuntime(kind),
                message: copy.toasts.runtimeSwitchKept,
                hint: null,
                retryable: false,
                context: null,
                traceback: null,
                autoDismissMs: 4200,
              }),
            );
          })();
        }}
        // Bridge Python picker intentionally not wired — V0.1 relies
        // on the python probe to pick the interpreter; advanced users
        // edit prefs / capabilities by hand. Settings just shows the
        // resolved path.
        //
        // "跑一次 Health Check" routes back through Onboarding's
        // StepHealth in revisit mode (skips Welcome / Attach). One
        // canonical health-check UX instead of a divergent inline
        // copy in Settings — see Settings-Health-Check devlog
        // 2026-05-15.
        onReRunHealthCheck={() => {
          setRevisitReturnScreen(screen);
          setSettingsOpen(false);
          setHealthCheckRevisit(true);
          setSetupAssistantFromSettings(false);
          setScreen("onboarding");
        }}
        onOpenSetupAssistant={() => {
          setRevisitReturnScreen(screen);
          setSettingsOpen(false);
          setHealthCheckRevisit(false);
          setSetupAssistantFromSettings(true);
          setScreen("onboarding");
        }}
        languagePreference={languagePreference}
        resolvedLanguage={resolvedLanguage}
        onChangeLanguagePreference={(preference) => {
          void setLanguagePreference(preference);
        }}
      />

      <ArchivedDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        sessions={sessions}
        onRestore={(id) => unarchiveSession(id)}
        onDeletePermanently={(id) => deleteSessionPermanently(id)}
        onEmptyAll={() => emptyArchive()}
        onRestoreBulk={(ids) => unarchiveSessionsBulk(ids)}
        onDeletePermanentlyBulk={(ids) => deleteSessionsPermanentlyBulk(ids)}
      />

      <EarlierDialog
        open={earlierOpen}
        onOpenChange={setEarlierOpen}
        sessions={earlierSessions}
        onSelectSession={(id) => {
          setActiveProjectFilter(undefined);
          void activateSession(id);
          setScreen("main");
        }}
        onArchiveSession={(id) => archiveSession(id)}
        onTogglePinSession={(id) => togglePinSession(id)}
        onArchiveSessionsBulk={(ids) => archiveSessionsBulk(ids)}
      />

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreate={async (input) => {
          // Create + immediately open the new project in Project
          // View. Creation is organization, not conversation
          // creation; the row's inline + is the explicit "start a
          // project conversation" action.
          const created = await createProject(input);
          openProjectInSidebar(created.id);
        }}
      />

      <EditProjectDialog
        project={editingProject}
        onClose={() => setEditingProjectId(null)}
        onSave={async (id, partial) => {
          await updateProject(id, partial);
        }}
        onRequestDelete={(p) => {
          // Hand off to ConfirmDeleteProjectDialog while keeping
          // the Edit dialog state — when the user cancels the
          // confirm, they're back in Edit naturally. On confirm,
          // both close together.
          setDeletingProjectId(p.id);
        }}
      />

      <ConfirmDeleteProjectDialog
        project={deletingProject}
        onCancel={() => setDeletingProjectId(null)}
        onConfirm={async () => {
          if (!deletingProject) return;
          await deleteProject(deletingProject.id);
          setDeletingProjectId(null);
          setEditingProjectId(null);
        }}
      />

      <BrowserControlSetupDialog
        open={activeRuntimeKind === "managed" && browserControlSetupOpen}
        onOpenChange={(open) => {
          if (open) {
            if (activeRuntimeKind === "managed") openBrowserControlSetup();
          } else {
            closeBrowserControlSetup();
          }
        }}
        onRunDemo={() => {
          void runBrowserControlDemo();
        }}
      />

      <ToastHost
        toasts={toasts}
        onDismiss={dismissToast}
        onViewProject={openProjectInSidebar}
      />

      <YoloIntroDialog
        open={!yoloIntroSeen}
        onAcknowledge={(revertToApproval) => {
          void acknowledgeYoloIntro(revertToApproval);
        }}
      />
    </CopyProvider>
  );
}

export default App;

// ---------------- Lazy session creation ----------------

/**
 * Empty-screen submit handler. The session is created lazily — the
 * first user-initiated action (typing a message or clicking a quick
 * prompt) is what bumps us from "no chat yet" to "real chat".
 *
 * Flow:
 *   1. If there's already an active session id, reuse it.
 *   2. Otherwise createSession + activateSession (which awaits the
 *      process spawn). sendIPCCommand then waits for the bridge `ready`
 *      event before writing the user message.
 *   3. Append the user turn locally and send the IPC message.
 *   4. Transition to main view so the user sees the thinking
 *      placeholder appear under their message.
 *
 * sendIPCCommand waits for the bridge `ready` event before writing
 * user-visible commands. This keeps first-run Windows startup stalls from
 * turning into a silent, indefinite "thinking" state.
 */
async function submitOnEmpty(
  text: string,
  existingId: string | undefined,
  createSession: (projectId?: string) => string,
  activateSession: (id: string) => Promise<void>,
  appendUserTurn: (sessionId: string, text: string) => void,
  sendIPCCommand: (
    sessionId: string,
    cmd: { kind: "user_message"; text: string; images?: string[] },
  ) => Promise<void>,
  setScreen: (s: import("@/stores/ui").Screen) => void,
  reportSendFailure: (
    sessionId: string,
    context: string,
    error: unknown,
  ) => void,
  inheritProjectId?: string,
): Promise<void> {
  let id = existingId;
  if (!id) {
    // Inherit project assignment when the EmptyState composer was
    // opened from a project's inline +. The context is one-shot:
    // after the first message creates the session, App clears the
    // pending project id.
    id = createSession(inheritProjectId);
    await activateSession(id);
  }
  setScreen("main");
  appendUserTurn(id, text);
  try {
    await sendIPCCommand(id, {
      kind: "user_message",
      text,
      images: [],
    });
  } catch (e) {
    reportSendFailure(id, "send_user_message", e);
  }
}

// ---------------- Settings path pickers ----------------
//
// Lazy-import the Tauri dialog plugin so a Vite-only dev build doesn't
// fail to load App.tsx. In Tauri the dialog returns a string (single
// selection), null on cancel, or string[] when multiple=true.

async function pickGAPath(
  setGAConfig: (
    p: Partial<{ python: string; gaPath: string; bridgeCwd: string }>,
  ) => Promise<void>,
  title: string,
): Promise<void> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title,
    });
    if (typeof selected === "string" && selected.length > 0) {
      await setGAConfig({ gaPath: selected });
    }
  } catch (e) {
    console.warn("[settings] pickGAPath failed.", e);
  }
}
