/** UI message shape accepted by chat persistence. */
export type PersistableChatMessage = Readonly<{
  id: string;
  parts: readonly unknown[];
  role: "assistant" | "system" | "user";
}>;

/** Database-safe maximum for client and server UI-message identities. */
export const CHAT_MESSAGE_ID_MAX_LENGTH = 128;

/** Invisible row used to bind one immutable chat-start request. */
export const CHAT_START_INTENT_MESSAGE_ID = "chat-start-intent:v1";

/**
 * Validate the one canonical UI message that may start a chat.
 *
 * @remarks
 * This pure guard is shared by the request, persistence, and workflow
 * boundaries. Initial history and non-conversational UI parts are deliberately
 * unsupported; follow-up and assistant state belong to the durable workflow.
 *
 * @param message - Untrusted candidate initial message.
 * @returns Whether the value is one meaningful, client-owned user message.
 */
export function isCanonicalInitialUserMessage(
  message: unknown,
): message is PersistableChatMessage & Readonly<{ role: "user" }> {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<PersistableChatMessage>;
  if (
    candidate.role !== "user" ||
    typeof candidate.id !== "string" ||
    candidate.id.trim().length === 0 ||
    candidate.id.length > CHAT_MESSAGE_ID_MAX_LENGTH ||
    candidate.id.startsWith("assistant:") ||
    candidate.id === CHAT_START_INTENT_MESSAGE_ID ||
    !Array.isArray(candidate.parts)
  ) {
    return false;
  }

  let hasMeaningfulPart = false;
  for (const part of candidate.parts) {
    if (!part || typeof part !== "object") return false;
    const value = part as Record<string, unknown>;
    if (value.type === "text") {
      if (typeof value.text !== "string") return false;
      hasMeaningfulPart ||= value.text.trim().length > 0;
      continue;
    }
    if (value.type === "file") {
      if (
        typeof value.mediaType !== "string" ||
        value.mediaType.trim().length === 0 ||
        typeof value.url !== "string" ||
        value.url.trim().length === 0
      ) {
        return false;
      }
      hasMeaningfulPart = true;
      continue;
    }
    return false;
  }

  return hasMeaningfulPart;
}

/**
 * Convert UI messages to canonical chat-message inserts.
 *
 * @param messages - Validated UI messages.
 * @param threadId - Owning chat thread UUID.
 * @returns Drizzle-compatible chat-message values.
 */
export function toChatMessageInsertValues(
  messages: readonly PersistableChatMessage[],
  threadId: string,
) {
  return messages.map((message) => {
    const textContent = message.parts
      .flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const candidate = part as { text?: unknown; type?: unknown };
        return candidate.type === "text" && typeof candidate.text === "string"
          ? [candidate.text]
          : [];
      })
      .join("");

    return {
      content: textContent,
      messageUid: message.id,
      role: message.role,
      textContent: textContent.length > 0 ? textContent : null,
      threadId,
      uiMessage: message,
    };
  });
}
