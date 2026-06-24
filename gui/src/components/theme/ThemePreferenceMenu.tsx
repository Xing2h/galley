import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CaretRight, Check, Monitor, Moon, Sun } from "@phosphor-icons/react";

import { TooltipLabel } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/i18n";
import type { ResolvedTheme, ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemePreferenceMenu({
  preference,
  resolvedTheme,
  onChange,
  variant = "sidebar",
}: {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  onChange: (preference: ThemePreference) => void;
  variant?: "topbar" | "sidebar";
}) {
  const copy = useCopy();
  const options: Array<{
    value: ThemePreference;
    label: string;
    subLabel?: string;
    Icon: typeof Monitor;
  }> = [
    {
      value: "system",
      label: copy.theme.system,
      subLabel:
        resolvedTheme === "dark"
          ? copy.theme.currentDark
          : copy.theme.currentLight,
      Icon: Monitor,
    },
    { value: "light", label: copy.theme.light, Icon: Sun },
    { value: "dark", label: copy.theme.dark, Icon: Moon },
  ];

  const current = options.find((option) => option.value === preference);
  const actualTooltipLabel =
    resolvedTheme === "dark" ? copy.theme.currentDark : copy.theme.currentLight;
  const actualStatusLabel =
    resolvedTheme === "dark" ? copy.theme.dark : copy.theme.light;
  const triggerLabel = copy.theme.triggerLabel(
    current?.label ?? copy.theme.system,
    actualTooltipLabel,
  );
  const sidebarStatusLabel =
    preference === "system"
      ? `${actualStatusLabel} · ${copy.theme.system}`
      : (current?.label ?? actualStatusLabel);
  const ActualIcon = resolvedTheme === "dark" ? Moon : Sun;

  const menu = (
    <DropdownMenu.Content
      align={variant === "topbar" ? "end" : "start"}
      side={variant === "topbar" ? "bottom" : "right"}
      sideOffset={variant === "topbar" ? 6 : 8}
      className={cn(
        "galley-pop-in z-[70] min-w-[176px] rounded-md border border-line bg-elevated p-1",
        "text-[13px] text-ink shadow-elevated",
      )}
    >
      {options.map((option) => (
        <DropdownMenu.Item
          key={option.value}
          onSelect={() => onChange(option.value)}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none",
            "data-[highlighted]:bg-hover",
          )}
        >
          <span className="flex size-3.5 shrink-0 items-center justify-center">
            {option.value === preference && (
              <Check size={12} weight="bold" className="text-brand-strong" />
            )}
          </span>
          <option.Icon size={14} weight="thin" className="shrink-0" />
          <span className="min-w-0">
            <span className="block truncate">{option.label}</span>
            {option.subLabel && (
              <span className="block truncate text-[11px] text-ink-muted">
                {option.subLabel}
              </span>
            )}
          </span>
        </DropdownMenu.Item>
      ))}
    </DropdownMenu.Content>
  );

  if (variant === "topbar") {
    return (
      <DropdownMenu.Root>
        <TooltipLabel text={triggerLabel} side="bottom">
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={triggerLabel}
              className={cn(
                "relative flex size-7 items-center justify-center rounded-sm border border-transparent text-ink-muted",
                "transition-[background-color,border-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
                "hover:border-line hover:bg-hover hover:text-ink active:translate-y-[0.5px]",
                "outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
                preference !== "system" &&
                  "border-brand/30 bg-brand/[var(--opacity-subtle)] text-brand-strong hover:bg-brand/[var(--opacity-soft)] hover:text-brand-strong",
              )}
            >
              <ActualIcon size={16} weight="thin" />
            </button>
          </DropdownMenu.Trigger>
        </TooltipLabel>
        <DropdownMenu.Portal>{menu}</DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left",
            "text-ink-soft outline-none hover:bg-hover hover:text-ink",
            "transition-[background-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:translate-y-px active:duration-[45ms]",
            "focus-visible:ring-2 focus-visible:ring-brand/30",
            "data-[state=open]:bg-hover data-[state=open]:text-ink",
          )}
          aria-label={copy.theme.aria}
        >
          <ActualIcon size={15} weight="thin" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] leading-4">
              {copy.theme.button}
            </span>
            <span className="block truncate text-[11px] leading-3 text-ink-muted">
              {sidebarStatusLabel}
            </span>
          </span>
          <CaretRight
            size={11}
            weight="bold"
            className="shrink-0 text-ink-muted transition-colors group-hover:text-ink-soft"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>{menu}</DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
