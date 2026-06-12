import { useEffect } from "react";

import { hydrateApp } from "@/lib/hydrate";

export function useAppHydrationEffects(): void {
  useEffect(() => {
    void hydrateApp();
  }, []);
}
