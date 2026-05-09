import type { ReactNode } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from "react-resizable-panels";

/**
 * Full app shell:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Top Bar (44px, full width, draggable via tauri-drag-region) │
 *   ├──────────┬─┬──────────────────────────┬─┬───────────────────┤
 *   │ Sidebar  │ │ Main                     │ │ Inspector         │
 *   │ (~18%)   │↕│ (~62%)                   │↕│ (~20%, optional)  │
 *   └──────────┴─┴──────────────────────────┴─┴───────────────────┘
 *
 * Resizable columns via react-resizable-panels v4 (`Group` + `Panel`
 * + `Separator`). Widths are persisted to localStorage by the
 * library's `useDefaultLayout` helper so layout survives across
 * runs without an SQLite round-trip on startup. We use percentages
 * (not pixels) so layout scales gracefully across window sizes; the
 * macOS minimum window is 1120px (Tauri config).
 *
 * Constraints (DESIGN.md §3 / sidebar feedback 2026-05-09):
 *   - Sidebar  14–30%  (≈ 156–444px at 1120w)
 *   - Main     ≥ 40%
 *   - Inspector 14–30% (only present when inspectorVisible)
 *
 * Two distinct Group ids ("3col" / "2col") so the user's main-area
 * width is preserved when the inspector toggles. A single Group with
 * a conditional Panel would force the library to re-balance remaining
 * panels and forget intent.
 *
 * macOS traffic light is positioned at {16, 16} via tauri.conf.json
 * `titleBarStyle: "Overlay"`; it floats above the Top Bar. The Top Bar
 * reserves ~70px left padding and the Sidebar starts at y=44px (below
 * the Top Bar's bottom border), so the traffic light never collides
 * with sidebar content.
 *
 * Inspector visibility is per-screen: Empty State hides it, Main View
 * shows it. The 1120px minimum window width guarantees three columns
 * fit when the inspector is visible.
 *
 * Sidebar collapse / ⌘\ shortcut is intentionally NOT wired here yet —
 * the toggle button in Sidebar.tsx header is currently a noop. Wiring
 * collapse via Panel.collapse() (with collapsedSize ≈ 3% rail) lands
 * in a follow-up commit so this change stays scoped to "manual
 * resize" per the 2026-05-09 sidebar feedback.
 */
export function AppShell({
  topBar,
  sidebar,
  main,
  inspector,
  inspectorVisible = true,
}: {
  topBar: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  inspector?: ReactNode;
  inspectorVisible?: boolean;
}) {
  return (
    <div className="flex h-screen min-h-[720px] w-screen min-w-[1120px] flex-col bg-app text-ink">
      {topBar}
      {inspectorVisible && inspector ? (
        <ThreeColumnLayout
          sidebar={sidebar}
          main={main}
          inspector={inspector}
        />
      ) : (
        <TwoColumnLayout sidebar={sidebar} main={main} />
      )}
    </div>
  );
}

function ThreeColumnLayout({
  sidebar,
  main,
  inspector,
}: {
  sidebar: ReactNode;
  main: ReactNode;
  inspector: ReactNode;
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "ga-workbench-layout-3col",
    panelIds: ["sidebar", "main", "inspector"],
  });
  return (
    <Group
      id="ga-workbench-layout-3col"
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="flex min-h-0 flex-1"
    >
      <Panel id="sidebar" defaultSize={18} minSize={14} maxSize={30}>
        <aside className="flex h-full flex-col border-r border-line bg-app">
          {sidebar}
        </aside>
      </Panel>
      <ResizeSeparator />
      <Panel id="main" defaultSize={62} minSize={40}>
        <main className="flex h-full min-w-0 flex-col bg-app">{main}</main>
      </Panel>
      <ResizeSeparator />
      <Panel id="inspector" defaultSize={20} minSize={14} maxSize={30}>
        <aside className="flex h-full flex-col border-l border-line bg-app">
          {inspector}
        </aside>
      </Panel>
    </Group>
  );
}

function TwoColumnLayout({
  sidebar,
  main,
}: {
  sidebar: ReactNode;
  main: ReactNode;
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "ga-workbench-layout-2col",
    panelIds: ["sidebar", "main"],
  });
  return (
    <Group
      id="ga-workbench-layout-2col"
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="flex min-h-0 flex-1"
    >
      <Panel id="sidebar" defaultSize={20} minSize={14} maxSize={30}>
        <aside className="flex h-full flex-col border-r border-line bg-app">
          {sidebar}
        </aside>
      </Panel>
      <ResizeSeparator />
      <Panel id="main" defaultSize={80} minSize={40}>
        <main className="flex h-full min-w-0 flex-col bg-app">{main}</main>
      </Panel>
    </Group>
  );
}

/**
 * Resize handle: a 1px-wide visible line with a 6px-wide invisible
 * hit zone around it. The hit zone makes the pointer target friendly
 * (1px alone is unhittable) without thickening the divider visually.
 * On hover and during drag (`:active`) the line tints to brand,
 * matching the apricot accent we use for other interactive
 * affordances (DESIGN.md §2.1).
 */
function ResizeSeparator() {
  return (
    <Separator className="group relative w-1.5 shrink-0 cursor-col-resize">
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-brand group-active:bg-brand" />
    </Separator>
  );
}
