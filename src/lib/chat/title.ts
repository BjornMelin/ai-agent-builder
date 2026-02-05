/**
 * Build a compact chat thread title from a UI message.
 *
 * @param message - Message containing UI parts.
 * @returns Normalized title limited to 80 characters, or `"New chat"` when no text exists.
 */
export function toChatTitle(
  message: Readonly<{
    parts: readonly Readonly<{ text?: string; type: string }>[];
  }>,
): string {
  const text = message.parts
    .filter(
      (part): part is Readonly<{ text: string; type: "text" }> =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("")
    .trim();

  if (text.length === 0) {
    return "New chat";
  }

  const normalized = text.replace(/\s+/g, " ");
  return normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;
}
