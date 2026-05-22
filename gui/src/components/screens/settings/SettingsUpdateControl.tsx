import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
} from "@phosphor-icons/react";
import { useState } from "react";

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
  const [restartBlocked, setRestartBlocked] = useState(false);

  const handleUpdateAction = async () => {
    setRestartBlocked(false);
    if (updateStatus.kind === "checking" || updateStatus.kind === "downloading") {
      return;
    }
    if (updateStatus.kind === "available") {
      await downloadAndInstall();
      return;
    }
    if (updateStatus.kind === "ready") {
      if (hasRunningSessions) {
        setRestartBlocked(true);
        return;
      }
      await restart();
      return;
    }
    await checkUpdate({ silent: false });
  };

  return (
    <div className={cn("min-w-0", className)}>
      <UpdateActionButton
        status={updateStatus}
        onClick={handleUpdateAction}
      />
      <UpdateStatusLine
        status={updateStatus}
        restartBlocked={restartBlocked}
      />
    </div>
  );
}

function UpdateActionButton({
  status,
  onClick,
}: {
  status: AppUpdateStatus;
  onClick: () => void;
}) {
  const view = updateButtonView(status);
  const Icon = view.Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={view.disabled}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm border border-line bg-elevated px-2 text-[11.5px]",
        "text-ink-soft transition-colors hover:border-brand hover:bg-brand-soft hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-elevated disabled:hover:text-ink-soft",
      )}
    >
      <Icon
        size={12}
        weight="thin"
        className={cn(view.spin && "spin")}
      />
      <span>{view.label}</span>
    </button>
  );
}

function UpdateStatusLine({
  status,
  restartBlocked,
}: {
  status: AppUpdateStatus;
  restartBlocked: boolean;
}) {
  const message = updateStatusMessage(status, restartBlocked);
  if (!message) return null;
  return (
    <div
      className={cn(
        "mt-1 text-[11.5px] text-ink-muted",
        status.kind === "available" && "text-brand-strong",
        (status.kind === "error" || restartBlocked) && "text-warning",
      )}
    >
      {message}
    </div>
  );
}

function updateButtonView(status: AppUpdateStatus): {
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
        label: "下载中",
        Icon: ArrowClockwise,
        disabled: true,
        spin: true,
      };
    case "ready":
      return { label: "重启更新", Icon: CheckCircle, disabled: false };
    default:
      return { label: "检查更新", Icon: ArrowClockwise, disabled: false };
  }
}

function updateStatusMessage(
  status: AppUpdateStatus,
  restartBlocked: boolean,
): string | null {
  if (restartBlocked) return "当前任务仍在运行，结束后再重启更新。";

  switch (status.kind) {
    case "checking":
      return "正在检查更新...";
    case "unconfigured":
      return "当前构建未配置更新通道。";
    case "upToDate":
      return "已是最新版本。";
    case "available":
      return `发现 v${status.version}。`;
    case "downloading":
      return "正在下载并安装更新...";
    case "ready":
      return `v${status.version} 已准备好，重启后生效。`;
    case "error":
      return status.message;
    case "idle":
      return null;
  }
}
