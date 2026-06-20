import { beforeEach, describe, expect, it } from "vitest";

import { usePrefsStore } from "@/stores/prefs";
import { resetStores } from "@/test/store-reset";
import { getTauriMocks } from "@/test/setup";

const tauriMocks = getTauriMocks();

function mockPrefs(values: Record<string, unknown>): void {
  tauriMocks.invoke.mockImplementation(async (command, args) => {
    if (command !== "get_pref_json") return undefined;
    const key = typeof args?.key === "string" ? args.key : "";
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : null;
  });
}

describe("prefsStore", () => {
  beforeEach(() => {
    resetStores();
  });

  it("hydrates a valid conversation font size preference", async () => {
    mockPrefs({ conversation_font_size: "large" });

    await usePrefsStore.getState().hydratePrefs();

    expect(usePrefsStore.getState().conversationFontSize).toBe("large");
  });

  it("falls back to standard for an invalid conversation font size preference", async () => {
    usePrefsStore.setState({ conversationFontSize: "large" });
    mockPrefs({ conversation_font_size: "giant" });

    await usePrefsStore.getState().hydratePrefs();

    expect(usePrefsStore.getState().conversationFontSize).toBe("standard");
  });

  it("persists conversation font size changes", async () => {
    await usePrefsStore.getState().setConversationFontSize("small");

    expect(usePrefsStore.getState().conversationFontSize).toBe("small");
    expect(tauriMocks.invoke).toHaveBeenCalledWith("set_pref_json", {
      key: "conversation_font_size",
      value: "small",
    });
  });
});
