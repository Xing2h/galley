import {
  ArrowSquareOut,
  Check,
  Copy,
  DownloadSimple,
} from "@phosphor-icons/react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Children,
  type CSSProperties,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

import { useResolvedTheme } from "@/components/theme/ThemeContext";
import { useCopy, type AppCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { makeAppError } from "@/types/app-error";

/**
 * Markdown rendering for agent output (final answers + thinking
 * summaries). Per DESIGN.md §4.3 markdown spec.
 *
 * Stack:
 *   - react-markdown for the parse / React-tree side (no
 *     dangerouslySetInnerHTML; sanitised by virtue of the schema)
 *   - remark-gfm for GitHub-flavoured extensions (tables, task
 *     lists, autolink, strikethrough)
 *   - shiki for code-block syntax highlighting, with a hand-picked
 *     language set so we don't ship every TextMate grammar known to
 *     mankind. Languages outside the list fall back to the plain
 *     mono code block — same visual chrome, just no token colours.
 *
 * Styling philosophy: every override pulls from the existing
 * Newsreader / Inter / JetBrains-Mono token system so the
 * conversation reads as one document, not a stylesheet collage.
 *
 * The component-level overrides give us this without touching
 * globals.css — typography lives at the boundary, not in CSS
 * cascade-land.
 */

interface MarkdownViewProps {
  /** Raw markdown source from the LLM. */
  source: string;
  /**
   * Visual register. "agent" = serif body (final answer floating in
   * the document). "narration" = the same body register for
   * intermediate assistant prose; callers distinguish it by layout
   * and actions, not typography, so streaming text does not jump when
   * it settles into an intermediate turn. "thinking" = serif italic
   * muted (thinking summary callout). Layout chrome (padding /
   * background / brand bar) is the caller's job — this component
   * renders inline content only.
   */
  variant: "agent" | "narration" | "thinking";
  className?: string;
  selectionCopyScope?: boolean;
}

export function MarkdownView({
  source,
  variant,
  className,
  selectionCopyScope = false,
}: MarkdownViewProps) {
  const proseClass =
    variant === "agent"
      ? PROSE_AGENT
      : variant === "narration"
        ? PROSE_NARRATION
        : PROSE_THINKING;
  const usesCjkSerif = cjkDominant(source);
  const proseStyle = {
    "--galley-prose-serif": "var(--font-serif)",
    WebkitFontSmoothing: usesCjkSerif ? "auto" : undefined,
  } as CSSProperties;
  return (
    <div
      data-selection-copy-scope={
        selectionCopyScope ? "assistant-answer" : undefined
      }
      className={cn("select-text", proseClass, className)}
      style={proseStyle}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCjkAdjacentQuotedStrong]}
        components={COMPONENTS}
        urlTransform={markdownUrlTransform}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

// ---------- Prose-level typography (variant) ----------

/**
 * Both variants share `[&_p]:mb-3`, list-marker styling, link color,
 * etc. via descendant selectors. We just swap the surrounding font
 * register at the top.
 */
const PROSE_BASE = cn(
  // Reset child margins so the parent callout (caller's box) can
  // own outer spacing without collapse fighting.
  "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
  // Paragraphs.
  "[&_p]:my-3 [&_p]:leading-[1.7] [&_p:last-child]:mb-0",
  // Headings (Newsreader, slight weight contrast against body).
  "[&_h1]:mt-5 [&_h1]:mb-3 [&_h1]:font-[var(--galley-prose-serif)] [&_h1]:text-[22px] [&_h1]:font-medium [&_h1]:leading-[1.3] [&_h1]:tracking-[0.005em] [&_h1]:text-ink",
  "[&_h2]:mt-5 [&_h2]:mb-2.5 [&_h2]:font-[var(--galley-prose-serif)] [&_h2]:text-[19px] [&_h2]:font-medium [&_h2]:leading-[1.35] [&_h2]:text-ink",
  // h3 deliberately close to body size — DESIGN.md §4.3 calls this
  // out as a way to avoid jarring jumps inside the document flow.
  "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-[var(--galley-prose-serif)] [&_h3]:text-[17px] [&_h3]:font-medium [&_h3]:text-ink",
  "[&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:font-[var(--galley-prose-serif)] [&_h4]:text-[15.5px] [&_h4]:font-medium [&_h4]:text-ink",
  // Lists. ::marker pulls list bullets into the muted register so
  // they read as structure rather than content.
  "[&_ul]:my-3 [&_ul]:ml-5 [&_ul]:list-disc",
  "[&_ol]:my-3 [&_ol]:ml-5 [&_ol]:list-decimal",
  "[&_li]:my-1 [&_li::marker]:text-ink-muted",
  "[&_li>p]:my-0", // tight paragraphs inside list items
  // Nested lists tighter.
  "[&_li>ul]:my-1 [&_li>ol]:my-1",
  // Inline code — mono token, subtle pill background.
  "[&_:not(pre)>code]:rounded-[4px] [&_:not(pre)>code]:bg-hover [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.86em] [&_:not(pre)>code]:text-ink-soft",
  // Block code lives in CodeBlock component (renders pre + own
  // styles); we keep a fallback for any pre that escapes.
  "[&_pre]:my-3.5",
  // Blockquotes — apricot-bar accent, italic, muted.
  "[&_blockquote]:my-3 [&_blockquote]:border-l-[3px] [&_blockquote]:border-brand [&_blockquote]:pl-3.5 [&_blockquote]:font-[var(--galley-prose-serif)] [&_blockquote]:italic [&_blockquote]:text-ink-soft",
  // Links.
  "[&_a]:text-brand-strong [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:decoration-brand-strong/40 [&_a:hover]:decoration-brand-strong",
  // Tables — GFM extension. The table component wraps them in an
  // overflow container; cell styling stays here so the typography
  // remains centralized.
  "[&_th]:border [&_th]:border-line [&_th]:bg-surface [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-ink",
  "[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-ink",
  // hr inside markdown.
  "[&_hr]:my-5 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-line",
  // Strong / em — keep weight in line with Newsreader.
  "[&_strong]:font-medium [&_strong]:text-ink",
  "[&_em]:italic",
  "[&_del]:text-ink-muted [&_del]:line-through",
);

const PROSE_AGENT = cn(
  PROSE_BASE,
  // The "final answer floats in the document" register (DESIGN.md §4.3).
  "font-[var(--galley-prose-serif)] text-[16.5px] leading-[1.7] tracking-[0.005em] text-ink",
);

const PROSE_NARRATION = cn(
  PROSE_BASE,
  // Intermediate LLM narrator prose must match the in-flight body
  // register. Otherwise a pre-tool sentence streams as `agent`, then
  // snaps smaller/softer once turn_end classifies it as narration.
  "font-[var(--galley-prose-serif)] text-[16.5px] leading-[1.7] tracking-[0.005em] text-ink",
);

const PROSE_THINKING = cn(
  PROSE_BASE,
  // Thinking summary register: italic serif muted (a notch lighter
  // than the answer body).
  "font-[var(--galley-prose-serif)] text-[14px] italic leading-[1.55] text-ink-soft",
);

const CJK_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function cjkDominant(source: string): boolean {
  return CJK_SCRIPT.test(source);
}

// CommonMark deliberately keeps `名叫**"下一个字"**` literal: the
// opener follows a CJK letter and precedes punctuation. LLMs emit this
// shape often enough that Galley should render the intended emphasis
// without asking the user to mentally parse raw `**` markers.
type MarkdownAstNode = {
  type: string;
  value?: string;
  children?: MarkdownAstNode[];
  [key: string]: unknown;
};

const CJK_ADJACENT_QUOTED_STRONG =
  /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])\*\*((?:["'“‘「『《（(])[^*\n]+?(?:["'”’」』》）)]))\*\*/gu;

function remarkCjkAdjacentQuotedStrong() {
  return (tree: MarkdownAstNode) => {
    transformCjkAdjacentQuotedStrong(tree);
  };
}

function transformCjkAdjacentQuotedStrong(node: MarkdownAstNode) {
  if (!node.children) return;

  const nextChildren: MarkdownAstNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      nextChildren.push(
        ...(splitCjkAdjacentQuotedStrong(child.value) ?? [child]),
      );
      continue;
    }

    transformCjkAdjacentQuotedStrong(child);
    nextChildren.push(child);
  }

  node.children = nextChildren;
}

function splitCjkAdjacentQuotedStrong(value: string): MarkdownAstNode[] | null {
  const pieces: MarkdownAstNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(CJK_ADJACENT_QUOTED_STRONG)) {
    const start = match.index ?? 0;
    const [fullMatch, prefixChar, strongText] = match;

    if (start > lastIndex) {
      pieces.push({ type: "text", value: value.slice(lastIndex, start) });
    }
    pieces.push({ type: "text", value: prefixChar });
    pieces.push({
      type: "strong",
      children: [{ type: "text", value: strongText }],
    });
    lastIndex = start + fullMatch.length;
  }

  if (pieces.length === 0) return null;
  if (lastIndex < value.length) {
    pieces.push({ type: "text", value: value.slice(lastIndex) });
  }
  return pieces;
}

// ---------- Code block (Shiki, fine-grained imports) ----------

/**
 * Hand-picked language set. Coding-agent users hit these constantly;
 * everything else falls through to the un-highlighted block (still
 * mono, still wrapped). Adding a language is one entry here AND a
 * matching dynamic import below — fine-grained registration via
 * `shiki/core` keeps the bundle tight (the default `shiki` entry
 * pulls every TextMate grammar known to mankind, ~600 KB of dead
 * weight including emacs-lisp / wolfram / kt / ...).
 */
const SHIKI_LANGUAGES = [
  "bash",
  "css",
  "diff",
  "html",
  "javascript",
  "json",
  "markdown",
  "python",
  "rust",
  "shell",
  "sql",
  "tsx",
  "typescript",
  "yaml",
] as const;
type ShikiLang = (typeof SHIKI_LANGUAGES)[number];

const SHIKI_THEMES = {
  light: "github-light",
  dark: "github-dark",
} as const;

let _highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!_highlighterPromise) {
    _highlighterPromise = createHighlighterCore({
      themes: [
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/github-dark.mjs"),
      ],
      langs: [
        import("shiki/langs/bash.mjs"),
        import("shiki/langs/css.mjs"),
        import("shiki/langs/diff.mjs"),
        import("shiki/langs/html.mjs"),
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/markdown.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/rust.mjs"),
        import("shiki/langs/shellscript.mjs"),
        import("shiki/langs/sql.mjs"),
        import("shiki/langs/tsx.mjs"),
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/yaml.mjs"),
      ],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }
  return _highlighterPromise;
}

interface CodeBlockProps {
  code: string;
  language: string | null;
}

/**
 * Highlighted code block. Async render: while Shiki loads / when an
 * unsupported language is supplied, falls back to the plain mono
 * block (same chrome, no colors). The plain fallback is rendered
 * synchronously so there's no flash of empty / placeholder content.
 */
function CodeBlock({ code, language }: CodeBlockProps) {
  const copy = useCopy();
  const resolvedTheme = useResolvedTheme();
  const lang = normalizeLanguage(language);
  const shikiTheme = SHIKI_THEMES[resolvedTheme];
  const highlightKey = `${shikiTheme}:${lang ?? "plain"}:${code}`;
  const [highlighted, setHighlighted] = useState<{
    key: string;
    html: string;
  } | null>(null);
  const html = highlighted?.key === highlightKey ? highlighted.html : null;
  const [wrapped, setWrapped] = useState(false);
  const wrapLabel = wrapped
    ? copy.conversation.scrollCode
    : copy.conversation.wrapCode;

  useEffect(() => {
    if (!lang) return;
    let cancelled = false;
    getHighlighter()
      .then((h) => {
        if (cancelled) return;
        try {
          const out = h.codeToHtml(code, {
            lang,
            theme: shikiTheme,
            // Let outer wrapper own padding / background; Shiki's
            // <pre> just provides the colored tokens.
            transformers: [
              {
                pre(node) {
                  // Strip Shiki's inline background so our own
                  // container styles win — keeps the visual aligned
                  // with the rest of the document tokens.
                  delete node.properties.style;
                  return node;
                },
              },
            ],
          });
          setHighlighted({ key: highlightKey, html: out });
        } catch {
          // Unknown language slip — keep the plain fallback below.
        }
      })
      .catch(() => {
        // Highlighter failed to initialize. We just keep the plain
        // block; a console.warn would spam if e.g. WebAssembly is
        // disabled in the runtime.
      });
    return () => {
      cancelled = true;
    };
  }, [code, highlightKey, lang, shikiTheme]);

  return (
    <div className="group/codeblock relative my-3.5 overflow-hidden rounded-md border border-line bg-surface">
      {/* Header row: language label + Copy button. Always render the
          row so the Copy button has a stable home; if no language is
          known, the left side stays empty but the button keeps its
          position. */}
      <div className="flex items-center justify-between border-b border-line bg-elevated px-3 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
          {language ?? ""}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={wrapped}
            onClick={() => setWrapped((value) => !value)}
            className={cn(
              "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.08em]",
              "transition-[background-color,color,opacity,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:translate-y-[0.5px] active:duration-[45ms]",
              wrapped
                ? "bg-hover text-ink-soft opacity-100"
                : "text-ink-muted opacity-0 hover:bg-hover hover:text-ink-soft group-hover/codeblock:opacity-100 focus-visible:opacity-100",
            )}
          >
            {wrapLabel}
          </button>
          <CodeCopyButton code={code} />
        </div>
      </div>
      <div
        className={cn(
          "px-3.5 py-3 font-mono text-[13px] leading-[1.55] text-ink",
          wrapped
            ? "overflow-x-hidden break-words [&_code]:whitespace-pre-wrap [&_pre]:whitespace-pre-wrap"
            : "overflow-x-auto [&_code]:whitespace-pre [&_pre]:whitespace-pre",
          // Shiki's own .shiki/.shiki span colors come through the
          // dangerouslySetInnerHTML payload; no override needed.
          "[&_pre]:m-0 [&_pre]:bg-transparent [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[13px]",
        )}
      >
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre>
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * Copy button on each code block. Hover-revealed (not always-on) so
 * resting code blocks feel uncluttered; Claude.ai / ChatGPT use the
 * same hover pattern. Uses the parent's `group/codeblock` for hover
 * scoping so nested code blocks don't trigger each other.
 */
function CodeCopyButton({ code }: { code: string }) {
  const copy = useCopy();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn("[CodeCopyButton] copy failed", e);
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.08em]",
        "transition-[background-color,color,opacity,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:translate-y-[0.5px] active:duration-[45ms]",
        // Hidden until hover, but stays put once you've clicked
        // (focus-visible) so keyboard users can still see feedback.
        "opacity-0 group-hover/codeblock:opacity-100 focus-visible:opacity-100",
        copied
          ? "text-success"
          : "text-ink-muted hover:bg-hover hover:text-ink-soft",
      )}
    >
      {copied ? (
        <Check size={11} weight="bold" />
      ) : (
        <Copy size={11} weight="thin" />
      )}
      <span>{copied ? copy.conversation.copied : copy.conversation.copy}</span>
    </button>
  );
}

/**
 * react-markdown reports language via className "language-foo".
 * Returns the language id only when it's one Shiki knows about —
 * unknown / missing returns null and skips highlighting entirely
 * (so we don't fire an Effect that's guaranteed to fail).
 */
function normalizeLanguage(language: string | null): ShikiLang | null {
  if (!language) return null;
  const lower = language.toLowerCase();
  // Common aliases users / LLMs type.
  const alias: Record<string, ShikiLang> = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    rs: "rust",
    sh: "bash",
    yml: "yaml",
  };
  if (lower in alias) return alias[lower];
  if (SHIKI_LANGUAGES.includes(lower as ShikiLang)) {
    return lower as ShikiLang;
  }
  return null;
}

// ---------- react-markdown component overrides ----------

/**
 * We route fenced code from `pre`, not `code`: react-markdown gives
 * no-language single-line fences as `<pre><code>...</code></pre>`,
 * and the code node alone is indistinguishable from inline code by
 * text shape. The pre wrapper is the reliable block signal.
 */
const COMPONENTS: Components = {
  table({ className, children, ...props }) {
    return (
      <div className="my-3.5 overflow-x-auto">
        <table
          className={cn(
            "w-max min-w-full border-collapse text-[14px]",
            className,
          )}
          {...props}
        >
          {children}
        </table>
      </div>
    );
  },
  pre({ children }) {
    const codeProps = getPreCodeProps(children);
    if (!codeProps) return <pre>{children}</pre>;

    const match = /language-([\w-]+)/.exec(codeProps.className ?? "");
    const text = String(codeProps.children ?? "").replace(/\n$/, "");
    return <CodeBlock code={text} language={match?.[1] ?? null} />;
  },
  code({ className, children }) {
    return <code className={className}>{children}</code>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    return <MarkdownImage src={src} alt={alt} />;
  },
};

function MarkdownImage({
  src,
  alt,
}: {
  src?: string | null;
  alt?: string | null;
}) {
  const copy = useCopy();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const rawSrc = src?.trim() ?? "";
  const preview = failedSrc === rawSrc ? null : markdownImagePreview(src);
  const label = alt?.trim() || "";

  if (!preview) return <MarkdownImageLink src={src} alt={alt} />;

  const openLabel =
    preview.kind === "remote"
      ? copy.conversation.openImageInBrowser
      : copy.conversation.openOriginalImageFile;
  const itemClass = cn(
    "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12.5px] text-ink-soft outline-none transition-colors",
    "data-[highlighted]:bg-hover data-[highlighted]:text-ink",
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <span
          data-galley-context-menu-trigger=""
          className="my-3 block max-w-full"
        >
          <a
            href={preview.openHref}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-block max-w-full no-underline"
          >
            <img
              src={preview.previewSrc}
              alt={label}
              loading="lazy"
              decoding="async"
              onError={() => setFailedSrc(rawSrc)}
              className="block max-h-[420px] max-w-full rounded-[6px] border border-line bg-surface object-contain"
            />
          </a>
        </span>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-[160px] rounded-md border border-line bg-elevated p-1 shadow-elevated">
          <ContextMenu.Item
            onSelect={() => void saveMarkdownImage(preview, copy)}
            className={itemClass}
          >
            <DownloadSimple size={13} weight="thin" />
            {copy.conversation.saveImage}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => void openMarkdownImage(preview, copy)}
            className={itemClass}
          >
            <ArrowSquareOut size={13} weight="thin" />
            {openLabel}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function MarkdownImageLink({
  src,
  alt,
}: {
  src?: string | null;
  alt?: string | null;
}) {
  const copy = useCopy();
  const href = safeMarkdownHref(src);
  const label = alt?.trim() || copy.conversation.imageLink;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-1 align-baseline text-[12.5px] text-ink-soft">
      <span className="shrink-0 text-ink-muted">{copy.conversation.image}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {label}
        </a>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </span>
  );
}

interface MarkdownImagePreview {
  previewSrc: string;
  openHref: string;
  kind: "remote" | "local";
  source: string;
  filename: string;
  extension: string;
}

const RASTER_IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif)(?:[?#].*)?$/i;
const WINDOWS_ABSOLUTE_PATH_RE = /^[a-zA-Z]:[\\/]/;
const WINDOWS_UNC_PATH_RE = /^\\\\[^\\]+\\[^\\]+/;
const IMAGE_FILENAME_UNSAFE_RE = /[<>:"/\\|?*]/g;

function markdownImagePreview(
  value?: string | null,
): MarkdownImagePreview | null {
  const src = value?.trim();
  if (!src || !RASTER_IMAGE_EXT_RE.test(src)) return null;
  const extension = rasterImageExtension(src);
  if (!extension) return null;

  if (/^https:\/\//i.test(src)) {
    try {
      const url = new URL(src);
      return {
        previewSrc: src,
        openHref: src,
        kind: "remote",
        source: url.toString(),
        filename: imageFilename(url.pathname, extension),
        extension,
      };
    } catch {
      return null;
    }
  }

  const localPath = localPathFromMarkdownImageSrc(src);
  if (localPath) {
    const previewSrc = localPathToAssetSrc(localPath);
    const localExtension = rasterImageExtension(localPath) ?? extension;
    return previewSrc
      ? {
          previewSrc,
          openHref: previewSrc,
          kind: "local",
          source: localPath,
          filename: imageFilename(localPath, localExtension),
          extension: localExtension,
        }
      : null;
  }

  return null;
}

async function saveMarkdownImage(
  preview: MarkdownImagePreview,
  copy: AppCopy,
): Promise<void> {
  try {
    const destinationPath = await save({
      defaultPath: preview.filename,
      filters: [{ name: "Image", extensions: [preview.extension] }],
    });
    if (!destinationPath) return;

    await invoke("save_conversation_image", {
      kind: preview.kind,
      source: preview.source,
      destinationPath,
    });
    pushImageToast({
      title: copy.toasts.imageSaved,
      message: copy.toasts.imageSavedMessage,
      severity: "info",
      context: "save_conversation_image",
    });
  } catch (e) {
    console.warn("[MarkdownView] save image failed", e);
    pushImageToast({
      title: copy.toasts.imageSaveFailed,
      message: copy.toasts.imageSaveFailedMessage,
      severity: "error",
      context: "save_conversation_image",
      traceback: errorMessage(e),
    });
  }
}

async function openMarkdownImage(
  preview: MarkdownImagePreview,
  copy: AppCopy,
): Promise<void> {
  try {
    await invoke("open_conversation_image", {
      kind: preview.kind,
      source: preview.source,
    });
  } catch (e) {
    console.warn("[MarkdownView] open image failed", e);
    pushImageToast({
      title: copy.toasts.imageOpenFailed,
      message: copy.toasts.imageOpenFailedMessage,
      severity: "error",
      context: "open_conversation_image",
      traceback: errorMessage(e),
    });
  }
}

function pushImageToast({
  title,
  message,
  severity,
  context,
  traceback = null,
}: {
  title: string;
  message: string;
  severity: "info" | "error";
  context: string;
  traceback?: string | null;
}): void {
  useUiStore.getState().pushToast(
    makeAppError({
      category: "business",
      severity,
      title,
      message,
      hint: null,
      retryable: false,
      context,
      traceback,
      autoDismissMs: severity === "info" ? 2600 : undefined,
    }),
  );
}

function rasterImageExtension(value: string): string | null {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(value);
  const ext = match?.[1]?.toLowerCase();
  if (!ext || !["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    return null;
  }
  return ext;
}

function imageFilename(pathOrUrlPath: string, extension: string): string {
  const raw = pathOrUrlPath.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const decoded = decodeMarkdownLocalPath(raw);
  const sanitized = stripFilenameControlChars(decoded)
    .replace(IMAGE_FILENAME_UNSAFE_RE, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (sanitized && rasterImageExtension(sanitized)) return sanitized;
  return fallbackImageFilename(extension);
}

function stripFilenameControlChars(value: string): string {
  return Array.from(value)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");
}

function fallbackImageFilename(extension: string): string {
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[-:T]/g, "")
    .replace(/^(\d{8})(\d{6})$/, "$1-$2");
  return `galley-image-${stamp}.${extension}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function markdownUrlTransform(
  value: string,
  key: string,
  node: { tagName?: string },
): string | null | undefined {
  if (
    key === "src" &&
    node.tagName === "img" &&
    localPathFromMarkdownImageSrc(value)
  ) {
    return value;
  }
  return defaultUrlTransform(value);
}

function localPathFromMarkdownImageSrc(src: string): string | null {
  if (/^file:\/\//i.test(src)) return fileUrlToLocalPath(src);

  const path = decodeMarkdownLocalPath(src);
  return isAbsoluteLocalPath(path) ? path : null;
}

function fileUrlToLocalPath(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.protocol !== "file:") return null;
    const path = decodeURIComponent(url.pathname);
    if (url.hostname && url.hostname !== "localhost") {
      return `\\\\${decodeURIComponent(url.hostname)}${path.replace(/\//g, "\\")}`;
    }
    return /^\/[a-zA-Z]:\//.test(path) ? path.slice(1) : path;
  } catch {
    return null;
  }
}

function decodeMarkdownLocalPath(src: string): string {
  try {
    return decodeURI(src);
  } catch {
    return src;
  }
}

function isAbsoluteLocalPath(src: string): boolean {
  return (
    src.startsWith("/") ||
    WINDOWS_ABSOLUTE_PATH_RE.test(src) ||
    WINDOWS_UNC_PATH_RE.test(src)
  );
}

function localPathToAssetSrc(path: string): string | null {
  try {
    return convertFileSrc(path);
  } catch {
    return null;
  }
}

function safeMarkdownHref(value?: string | null): string | undefined {
  const href = value?.trim();
  if (!href) return undefined;
  const localPath = localPathFromMarkdownImageSrc(href);
  if (localPath) return localPathToAssetSrc(localPath) ?? href;
  if (/^(https?:|file:|\/|\.\/|\.\.\/|#)/i.test(href)) return href;
  return undefined;
}

interface PreCodeProps {
  className?: string;
  children?: ReactNode;
}

function getPreCodeProps(children: ReactNode): PreCodeProps | null {
  for (const child of Children.toArray(children)) {
    if (isValidElement<PreCodeProps>(child)) return child.props;
  }
  return null;
}
