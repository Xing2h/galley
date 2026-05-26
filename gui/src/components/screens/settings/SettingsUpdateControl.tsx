import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  Info,
  Warning,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useCopy, type AppCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppUpdateStore, type AppUpdateStatus } from "@/stores/app-update";

interface SettingsUpdateControlProps {
  hasRunningSessions: boolean;
  className?: string;
}

export function SettingsUpdateControl({
  hasRunningSessions,
  className,
}: SettingsUpdateControlProps) {
  const copy = useCopy();
  const updateStatus = useAppUpdateStore((s) => s.status);
  const checkUpdate = useAppUpdateStore((s) => s.check);
  const downloadAndInstall = useAppUpdateStore((s) => s.downloadAndInstall);
  const restart = useAppUpdateStore((s) => s.restart);

  const handleUpdateAction = async () => {
    if (
      updateStatus.kind === "checking" ||
      updateStatus.kind === "downloading"
    ) {
      return;
    }
    if (updateStatus.kind === "available") {
      await downloadAndInstall();
      return;
    }
    if (updateStatus.kind === "ready") {
      if (hasRunningSessions) return;
      await restart();
      return;
    }
    await checkUpdate({ silent: false });
  };

  return (
    <div className={cn("min-w-0", className)}>
      <UpdateActionButton
        status={updateStatus}
        hasRunningSessions={hasRunningSessions}
        copy={copy}
        onClick={handleUpdateAction}
      />
      <UpdateStatusLine
        status={updateStatus}
        hasRunningSessions={hasRunningSessions}
        copy={copy}
      />
    </div>
  );
}

function UpdateActionButton({
  status,
  hasRunningSessions,
  copy,
  onClick,
}: {
  status: AppUpdateStatus;
  hasRunningSessions: boolean;
  copy: AppCopy;
  onClick: () => void;
}) {
  const view = updateButtonView(status, hasRunningSessions, copy);
  const Icon = view.Icon;
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      disabled={view.disabled}
      className="h-6 px-2 text-[11.5px]"
      leadingIcon={
        <Icon size={12} weight="thin" className={cn(view.spin && "spin")} />
      }
    >
      <span>{view.label}</span>
    </Button>
  );
}

function UpdateStatusLine({
  status,
  hasRunningSessions,
  copy,
}: {
  status: AppUpdateStatus;
  hasRunningSessions: boolean;
  copy: AppCopy;
}) {
  const view = updateStatusView(status, hasRunningSessions, copy);
  if (!view) return null;
  const Icon = view.Icon;
  return (
    <div
      aria-live="polite"
      className={cn(
        "mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px] leading-[1.45]",
        view.className,
      )}
    >
      <Icon
        size={11}
        weight="thin"
        className={cn("shrink-0", view.spin && "spin")}
      />
      <span className="min-w-0">{view.message}</span>
    </div>
  );
}

function updateButtonView(
  status: AppUpdateStatus,
  hasRunningSessions: boolean,
  copy: AppCopy,
): {
  label: string;
  Icon: typeof ArrowClockwise;
  disabled: boolean;
  spin?: boolean;
} {
  switch (status.kind) {
    case "checking":
      return {
        label: copy.updates.checkingShort,
        Icon: ArrowClockwise,
        disabled: true,
        spin: true,
      };
    case "available":
      return {
        label: hasRunningSessions
          ? copy.updates.waitForTasks
          : copy.updates.download,
        Icon: DownloadSimple,
        disabled: hasRunningSessions,
      };
    case "downloading":
      return {
        label: copy.updates.preparingShort,
        Icon: ArrowClockwise,
        disabled: true,
        spin: true,
      };
    case "ready":
      return {
        label: copy.updates.restart,
        Icon: CheckCircle,
        disabled: hasRunningSessions,
      };
    case "upToDate":
      return {
        label: copy.updates.checkAgain,
        Icon: ArrowClockwise,
        disabled: false,
      };
    case "error":
      return {
        label: copy.updates.retry,
        Icon: ArrowClockwise,
        disabled: false,
      };
    default:
      return {
        label: copy.updates.check,
        Icon: ArrowClockwise,
        disabled: false,
      };
  }
}

function updateStatusView(
  status: AppUpdateStatus,
  hasRunningSessions: boolean,
  copy: AppCopy,
): {
  message: string;
  Icon: typeof ArrowClockwise;
  className: string;
  spin?: boolean;
} | null {
  if (status.kind === "ready" && hasRunningSessions) {
    return {
      message: copy.updates.readyAfterTasks(status.version),
      Icon: Warning,
      className: "text-warning",
    };
  }
  if (status.kind === "available" && hasRunningSessions) {
    return {
      message: copy.updates.foundAfterTasks(status.version),
      Icon: Warning,
      className: "text-warning",
    };
  }

  switch (status.kind) {
    case "checking":
      return {
        message: copy.updates.checking,
        Icon: CircleNotch,
        className: "text-ink-muted",
        spin: true,
      };
    case "unconfigured":
      return {
        message: copy.updates.devNoChannel,
        Icon: Info,
        className: "text-ink-muted",
      };
    case "upToDate":
      return {
        message: copy.updates.upToDate,
        Icon: CheckCircle,
        className: "text-success",
      };
    case "available":
      return {
        message: copy.updates.found(status.version),
        Icon: DownloadSimple,
        className: "text-brand-strong",
      };
    case "downloading":
      return {
        message: copy.updates.downloading,
        Icon: CircleNotch,
        className: "text-brand-strong",
        spin: true,
      };
    case "ready":
      return {
        message: copy.updates.ready(status.version),
        Icon: CheckCircle,
        className: "text-success",
      };
    case "error":
      return {
        message: status.message,
        Icon: Warning,
        className: "text-warning",
      };
    case "idle":
      return null;
  }
}
