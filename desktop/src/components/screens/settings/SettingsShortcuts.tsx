/**
 * Settings → Shortcuts tab. Lists every global keyboard shortcut
 * the V0.1 build wires up. Pulled out of EmptyState's hint footer
 * (which felt like chrome dilution on the first-impression screen)
 * — DESIGN.md §10 lists the canonical set; this view is the user-
 * facing presentation of that table.
 *
 * V0.1 read-only: rebinding lands in V0.2 Settings → Shortcuts as
 * row-level edit affordances. For now the list is static.
 *
 * OS-conditional display: rows with a platform modifier (Mod/Alt)
 * resolve through formatShortcut so Mac sees ⌘K-style glyphs and
 * Win sees Ctrl+K word names. Rows without a modifier (Enter, Esc,
 * arrows, Tab) render the same on both OSes.
 */

import { useI18n } from "@/lib/i18n";
import { isMac } from "@/lib/platform";
import { formatShortcut } from "@/lib/shortcuts";

interface ShortcutRow {
  /** Canonical key combo, rendered as kbd-style chips. */
  combo: string;
  /** What the combo does, in the user's voice. */
  action: string;
  /** Optional one-liner clarifying scope or caveat. */
  note?: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

export function SettingsShortcuts() {
  const { t } = useI18n();
  const groups: ShortcutGroup[] = [
    {
      title: t("shortcuts.group.navigation"),
      rows: [
        { combo: formatShortcut("Mod+K"), action: t("shortcuts.openPalette") },
        { combo: formatShortcut("Mod+N"), action: t("shortcuts.newChat") },
        {
          combo: formatShortcut("Mod+\\"),
          action: t("shortcuts.toggleSidebar"),
          note: t("shortcuts.toggleSidebarNote"),
        },
        { combo: formatShortcut("Mod+,"), action: t("shortcuts.openSettings") },
      ],
    },
    {
      title: t("shortcuts.group.composer"),
      rows: [
        { combo: "Enter", action: t("shortcuts.sendMessage") },
        { combo: "Shift+Enter", action: t("shortcuts.newline") },
      ],
    },
    {
      title: t("shortcuts.group.conversation"),
      rows: [
        {
          combo: `${formatShortcut("Alt+↑")} / ${formatShortcut("Alt+↓")}`,
          action: t("shortcuts.jumpQuestion"),
          note: isMac
            ? t("shortcuts.jumpQuestionNoteMac")
            : t("shortcuts.jumpQuestionNoteOther"),
        },
      ],
    },
    {
      title: t("shortcuts.group.overlays"),
      rows: [
        { combo: "Esc", action: t("shortcuts.closeOverlay") },
        { combo: "↑ / ↓", action: t("shortcuts.navigateList") },
        { combo: "Tab", action: t("shortcuts.paletteSubmenu") },
      ],
    },
  ];
  return (
    <div className="space-y-7">
      <div>
        <h2 className="m-0 font-serif text-[18px] font-medium text-ink">
          {t("settings.tabs.shortcuts")}
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          {t("shortcuts.subtitle")}
        </p>
      </div>

      {groups.map((g) => (
        <section key={g.title}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {g.title}
          </div>
          <ul className="mt-2 m-0 list-none space-y-0.5 p-0">
            {g.rows.map((r) => (
              <li
                key={r.combo}
                className="flex items-center gap-3 rounded-sm px-2 py-2 transition-colors hover:bg-hover"
              >
                <KbdCombo combo={r.combo} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-ink">{r.action}</div>
                  {r.note && (
                    <div className="mt-0.5 text-[11px] italic text-ink-muted">
                      {r.note}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Splits a combo string like "⌘+Shift+K" into individual key chips.
 * Accepts `+` or space as separators; bare combos like "⌘K" stay as
 * a single chip (the modifier-and-letter idiom is treated as one
 * unit in macOS chrome — Notion / Linear / Slack render it that
 * way).
 */
function KbdCombo({ combo }: { combo: string }) {
  const parts = combo.includes("+") ? combo.split("+") : [combo];
  return (
    <div className="flex shrink-0 items-center gap-1">
      {parts.map((p, i) => (
        <kbd
          key={i}
          className="inline-flex min-w-[28px] items-center justify-center rounded-sm border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink"
        >
          {p}
        </kbd>
      ))}
    </div>
  );
}
