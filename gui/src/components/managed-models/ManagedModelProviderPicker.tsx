import * as Popover from "@radix-ui/react-popover";
import { CaretDown, Check } from "@phosphor-icons/react";

import {
  getManagedModelProviderPreset,
  managedModelProtocolLabel,
  MANAGED_MODEL_PROVIDER_PRESETS,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import { cn } from "@/lib/utils";
import type { ManagedModelProtocol } from "@/types/managed-models";

interface ManagedModelProviderPickerProps {
  value: ManagedModelProviderPresetId;
  protocol: ManagedModelProtocol;
  onChange: (value: ManagedModelProviderPresetId) => void;
  className?: string;
}

export function ManagedModelProviderPicker({
  value,
  protocol,
  onChange,
  className,
}: ManagedModelProviderPickerProps) {
  const selectedPreset = getManagedModelProviderPreset(value);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group flex w-full min-w-[240px] items-center justify-between gap-3 rounded-sm border border-line bg-surface px-3 py-2 text-left",
            "outline-none transition-colors hover:bg-hover focus:border-brand focus:ring-[3px] focus:ring-brand/20",
            "data-[state=open]:border-brand data-[state=open]:bg-hover data-[state=open]:ring-[3px] data-[state=open]:ring-brand/20",
            className,
          )}
        >
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium text-ink">
              {selectedPreset.label}
            </span>
            <span className="mt-1 inline-flex rounded-sm bg-ink-muted/10 px-1.5 py-px text-[10.5px] text-ink-muted">
              {managedModelProtocolLabel(protocol)}
            </span>
          </span>
          <CaretDown
            size={12}
            weight="bold"
            className={cn(
              "shrink-0 text-ink-muted transition-transform",
              "group-hover:text-ink-soft group-data-[state=open]:rotate-180 group-data-[state=open]:text-ink-soft",
            )}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={cn(
            "z-[80] max-h-[320px] w-[var(--radix-popover-trigger-width)] overflow-auto rounded-sm border border-line bg-elevated p-1 shadow-elevated",
          )}
        >
          {MANAGED_MODEL_PROVIDER_PRESETS.map((preset) => {
            const selected = preset.id === value;
            return (
              <Popover.Close asChild key={preset.id}>
                <button
                  type="button"
                  onClick={() => onChange(preset.id)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-sm px-2.5 py-2 text-left outline-none transition-colors hover:bg-hover focus:bg-hover",
                    selected ? "text-ink" : "text-ink-soft",
                  )}
                >
                  <span className="flex w-3.5 shrink-0 items-center justify-center">
                    {selected && (
                      <Check
                        size={12}
                        weight="bold"
                        className="text-brand-strong"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                      {preset.label}
                    </span>
                  </span>
                </button>
              </Popover.Close>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
