export async function pickFolder(title: string): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title,
    });
    return typeof selected === "string" && selected.length > 0
      ? selected
      : null;
  } catch (e) {
    console.warn("[dialog] pickFolder failed.", e);
    return null;
  }
}
