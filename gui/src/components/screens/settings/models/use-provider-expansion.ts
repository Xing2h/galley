import { useState } from "react";

export function useProviderExpansion() {
  const [expandedProviderIds, setExpandedProviderIds] = useState<string[]>([]);

  const expandProvider = (id: string) => {
    setExpandedProviderIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
  };

  const isProviderExpanded = (id: string) => expandedProviderIds.includes(id);

  const toggleProvider = (id: string) => {
    if (isProviderExpanded(id)) {
      setExpandedProviderIds((current) =>
        current.filter((item) => item !== id),
      );
      return;
    }
    expandProvider(id);
  };

  return {
    expandProvider,
    isProviderExpanded,
    toggleProvider,
  };
}
