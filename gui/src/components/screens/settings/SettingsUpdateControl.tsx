import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  Info,
  Warning,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useAppUpdateStore,
  type AppUpdateStatus,
} from "@/stores/app-update";

interface SettingsUpdateControlProps {
  hasRunningSessions: boolean;
  className?: string;
}

export function SettingsUpdateControl({
  hasRunningSessions,
  className,
}: SettingsUpdateControlProps) {
  const updateStatus = useAppUpdateStore((s) => s.status);
  const checkUpdate = useAppUpdateStore((s) => s.check);
  const downloadAndInstall = useAppUpdateStore((s) => s.downloadAndInstall);
  const restart = useAppUpdateStore((s) => s.restart);

  const handleUpdateAction = async () => {
    if (updateStatus.kind === "checking" || updateStatus.kind === "downloading") {
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
        onClick={handleUpdateAction}
      />
      <UpdateStatusLine
        status={updateStatus}
        hasRunningSessions={hasRunningSessions}
      />
    </div>
  );
}

function UpdateActionButton({
  status,
  hasRunningSessions,
  onClick,
}: {
  status: AppUpdateStatus;
  hasRunningSessions: boolean;
  onClick: () => void;
}) {
  const view = updateButtonView(status, hasRunningSessions);
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
}: {
  status: AppUpdateStatus;
  hasRunningSessions: boolean;
}) {
  const view = updateStatusView(status, hasRunningSessions);
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
): {
  label: string;
  Icon: typeof ArrowClockwise;
  disabled: boolean;
  spin?: boolean;
} {
  switch (status.kind) {
    case "checking":
      return {
        label: "检查中",
        Icon: ArrowClockwise,
        disabled: true,
        spin: true,
      };
    case "available":
      return { label: "下载更新", Icon: DownloadSimple, disabled: false };
    case "downloading":
      return {
        label: "准备中",
        Icon: ArrowClockwise,
        disabled: true,
        spin: true,
      };
    case "ready":
      return {
        label: "重启更新",
        Icon: CheckCircle,
        disabled: hasRunningSessions,
      };
    case "upToDate":
      return { label: "再次检查", Icon: ArrowClockwise, disabled: false };
    case "error":
      return { label: "重试", Icon: ArrowClockwise, disabled: false };
    default:
      return { label: "检查更新", Icon: ArrowClockwise, disabled: false };
  }
}

function updateStatusView(
  status: AppUpdateStatus,
  hasRunningSessions: boolean,
): {
  message: string;
  Icon: typeof ArrowClockwise;
  className: string;
  spin?: boolean;
} | null {
  if (status.kind === "ready" && hasRunningSessions) {
    return {
      message: `v${status.version} 已准备好；当前任务结束后再重启。`,
      Icon: Warning,
      className: "text-warning",
    };
  }

  switch (status.kind) {
    case "checking":
      return {
        message: "正在检查更新...",
        Icon: CircleNotch,
        className: "text-ink-muted",
        spin: true,
      };
    case "unconfigured":
      return {
        message: "此构建未连接更新通道；Dev 模式下这是预期状态。",
        Icon: Info,
        className: "text-ink-muted",
      };
    case "upToDate":
      return {
        message: "已是最新版本。",
        Icon: CheckCircle,
        className: "text-success",
      };
    case "available":
      return {
        message: `发现 v${status.version}，可后台下载并准备更新。`,
        Icon: DownloadSimple,
        className: "text-brand-strong",
      };
    case "downloading":
      return {
        message: "正在后台下载并准备更新...",
        Icon: CircleNotch,
        className: "text-brand-strong",
        spin: true,
      };
    case "ready":
      return {
        message: `v${status.version} 已准备好，重启后生效。`,
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
