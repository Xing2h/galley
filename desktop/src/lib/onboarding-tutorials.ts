/**
 * Tutorial content registry — hand-written fix-it snippets keyed by
 * failure cause. Surfaced via TutorialModal when the user clicks
 * "查看教程" on a failed/warning row in StepAttach or StepHealth.
 *
 * Why hand-written instead of bundling upstream Hello GA markdown:
 *   - Galley-specific context ("完成后回到这里点 选择" / "重新检查")
 *     can't live in upstream
 *   - 50-150 word focused snippets read faster than full chapter sections
 *   - Maintenance: one file in Galley vs. tracking upstream drift
 *
 * Each entry links to the corresponding Hello GA chapter for the full
 * authoritative treatment. The upstream URL is the Datawhale tutorial
 * on GitHub — anchors are unreliable across GitHub heading slug
 * generators for Chinese headings, so we link to the chapter top
 * and trust users to scroll.
 */

import { EXAMPLE_GA_PATH } from "@/lib/platform";

export type TutorialId =
  | "download-ga"
  | "wrong-directory"
  | "mykey-setup"
  | "assets-missing"
  | "memory-info"
  | "python-missing-anthropic";

export interface Tutorial {
  id: TutorialId;
  title: string;
  /** Markdown source. Rendered by TutorialModal via MarkdownView. */
  body: string;
  /** External URL for the full upstream tutorial. Opens in system
   * browser via target="_blank". Omit when the snippet is fully
   * self-contained (e.g. "memory-info" reassurance). */
  upstreamUrl?: string;
  /** Friendly label for the upstream link. Defaults to "查看完整教程". */
  upstreamLabel?: string;
}

const HELLO_GA_BASE =
  "https://github.com/datawhalechina/hello-generic-agent/blob/main/docs/part1/chapter1/index.md";

type TutorialTranslator = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) => string;

const UPSTREAM_LABEL_KEYS: Partial<Record<TutorialId, string>> = {
  "download-ga": "tutorial.downloadGa.upstream",
  "wrong-directory": "tutorial.wrongDirectory.upstream",
  "mykey-setup": "tutorial.mykeySetup.upstream",
  "assets-missing": "tutorial.assetsMissing.upstream",
};

export function getTutorial(id: TutorialId, t: TutorialTranslator): Tutorial {
  return {
    id,
    title: t(`tutorial.${id}.title`),
    body: t(`tutorial.${id}.body`, { examplePath: EXAMPLE_GA_PATH }),
    upstreamUrl: id === "memory-info" || id === "python-missing-anthropic"
      ? undefined
      : HELLO_GA_BASE,
    upstreamLabel: UPSTREAM_LABEL_KEYS[id]
      ? t(UPSTREAM_LABEL_KEYS[id])
      : undefined,
  };
}
