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
 * resolve through formatShortcut so Mac sees glyphs and Win sees
 * Ctrl+K word names. KbdCombo spaces dense Mac chords as
 * "⌘ + K" inside this page. Rows without a modifier (Enter, Esc,
 * arrows, Tab) render the same on both OSes.
 */

import { isMac } from "@/lib/platform";
import { formatShortcut } from "@/lib/shortcuts";
import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";

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

const GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    rows: [
      { combo: formatShortcut("Mod+K"), action: "打开命令面板（Command Palette）" },
      { combo: formatShortcut("Mod+N"), action: "新建对话" },
      { combo: formatShortcut("Mod+\\"), action: "折叠 / 展开 Sidebar", note: "V0.1 已规划，wiring 待补" },
      { combo: formatShortcut("Mod+,"), action: "打开 Settings" },
    ],
  },
  {
    title: "Composer",
    rows: [
      { combo: "Enter", action: "发送消息" },
      { combo: "Shift+Enter", action: "换行（不发送）" },
    ],
  },
  {
    title: "Conversation",
    rows: [
      {
        combo: `${formatShortcut("Alt+↑")} / ${formatShortcut("Alt+↓")}`,
        action: "跳到上 / 下一条提问",
        // Mac users had the original "macOS 文本编辑原生快捷键保留"
        // phrasing — preserved verbatim so Mac UX is byte-identical
        // through the A4 migration. Win gets a parallel sentence that
        // doesn't reference macOS.
        note: isMac
          ? "焦点在 Composer 时不生效（macOS 文本编辑原生快捷键保留）"
          : "焦点在 Composer 时不生效（保留原生文本编辑快捷键）",
      },
    ],
  },
  {
    title: "Overlays",
    rows: [
      { combo: "Esc", action: "关闭当前 overlay 或退出 inline edit" },
      { combo: "↑ / ↓", action: "在 Command Palette / 列表中上下选择" },
      { combo: "Tab", action: "在 Command Palette 中进入二级菜单" },
    ],
  },
];

export function SettingsShortcuts() {
  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title="Shortcuts"
        subtitle="快捷键设置"
      />

      {GROUPS.map((g) => (
        <section key={g.title}>
          <SettingsSectionLabel>{g.title}</SettingsSectionLabel>
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
 * Splits combo strings into readable key chips. Settings has more
 * room than sidebar hints, so compact macOS chords like "⌘K" become
 * "⌘ + K" here while global shortcut hints stay terse.
 */
function KbdCombo({ combo }: { combo: string }) {
  const chords = combo.split(/\s+\/\s+/);
  return (
    <div className="flex shrink-0 items-center gap-1">
      {chords.map((chord, chordIndex) => (
        <span key={chordIndex} className="inline-flex items-center gap-1">
          {chordIndex > 0 && (
            <span className="px-0.5 text-[11px] text-ink-muted">/</span>
          )}
          {shortcutParts(chord).map((part, partIndex) => (
            <span key={partIndex} className="inline-flex items-center gap-1">
              {partIndex > 0 && (
                <span className="text-[10.5px] text-ink-muted">+</span>
              )}
              <kbd className="inline-flex min-w-[28px] items-center justify-center rounded-sm border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink">
                {part}
              </kbd>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

function shortcutParts(chord: string): string[] {
  if (chord.includes("+")) {
    return chord.split("+").filter(Boolean);
  }
  const compactMacChord = chord.match(/^([⌘⌃⌥⇧]+)(.+)$/);
  if (!compactMacChord) return [chord];
  return [...compactMacChord[1], compactMacChord[2]];
}
