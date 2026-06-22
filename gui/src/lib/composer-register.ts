/**
 * Composer register resolution — Part B of the philosophical-voice
 * feature. The Composer's placeholder is a function of its
 * language-game: the same input means a different speech act depending
 * on context (*meaning is use*, PI §43).
 *
 * This module owns only the running-vs-idle decision for an existing
 * session surface (MainView). The empty-state "commissioning" register
 * is produced separately by EmptyState's own placeholder copy and is
 * intentionally not modeled here.
 *
 * See `docs/specs/philosophical-voice/` (Requirement 3).
 */

/** The register an in-session Composer can be in. `commissioning`
 *  belongs to the empty state and is excluded from this resolver. */
export type ComposerRegister =
  | "commissioning"
  | "continuing"
  | "reply"
  | "byTheWay";

export interface ComposerRegisterState {
  /** Agent is mid-run (`stopMode`). */
  isRunning: boolean;
  /** Agent is waiting on a user reply (ask_user pending). */
  pendingAskUser: boolean;
}

/**
 * Pure, total, deterministic. Maps in-session Composer state to a
 * register. Running takes priority: while the agent runs, the only
 * input that passes the stop gate is `/btw`, so the by-the-way register
 * is correct regardless of other flags (design Property 5).
 */
export function resolveComposerRegister(
  s: ComposerRegisterState,
): Exclude<ComposerRegister, "commissioning"> {
  if (s.isRunning) return "byTheWay";
  if (s.pendingAskUser) return "reply";
  return "continuing";
}

/** i18n `composer` key for a resolved in-session register. */
export function composerRegisterCopyKey(
  register: Exclude<ComposerRegister, "commissioning">,
): "byTheWay" | "replyToContinue" | "continueConversation" {
  switch (register) {
    case "byTheWay":
      return "byTheWay";
    case "reply":
      return "replyToContinue";
    case "continuing":
      return "continueConversation";
  }
}
