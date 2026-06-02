import { PuzzlePiece } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";

export function BrowserControlAttentionBanner({
  onOpen,
}: {
  onOpen?: () => void;
}) {
  const copy = useCopy().browserControlAttention;
  return (
    <div className="flex min-h-11 shrink-0 items-center justify-between gap-4 border-b border-warning/[var(--opacity-medium)] bg-warning/[var(--opacity-soft)] px-5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-warning/[var(--opacity-medium)] bg-warning/[var(--opacity-soft)] text-warning">
          <PuzzlePiece size={15} weight="thin" />
        </span>
        <p className="min-w-0 truncate text-[12.5px] font-medium text-ink">
          {copy.message}
        </p>
      </div>
      <Button
        variant="warning"
        size="sm"
        onClick={onOpen}
        leadingIcon={<PuzzlePiece size={13} weight="thin" />}
      >
        {copy.action}
      </Button>
    </div>
  );
}

export function BrowserControlAttentionSurface({
  show,
  onOpen,
  children,
}: {
  show: boolean;
  onOpen?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {show && <BrowserControlAttentionBanner onOpen={onOpen} />}
      {children}
    </div>
  );
}
