async function load() {
  try {
    return await import("expo-clipboard");
  } catch {
    return null as any;
  }
}

export async function readText(): Promise<string> {
  const Clipboard = await load();
  return Clipboard?.getStringAsync() ?? "";
}

export async function writeText(text: string): Promise<void> {
  const Clipboard = await load();
  if (Clipboard?.setStringAsync) {
    await Clipboard.setStringAsync(text);
  }
}
