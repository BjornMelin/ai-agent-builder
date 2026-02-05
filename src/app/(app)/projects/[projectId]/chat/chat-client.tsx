"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import type { ChatTransport, UIDataTypes, UIMessage, UITools } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { useMemo, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";

type UserMessageMarker = Readonly<{
  type: "user-message";
  id: string;
  content: string;
  timestamp: number;
}>;

type AppUIMessage = UIMessage<unknown, UIDataTypes, UITools>;
type AppUIMessagePart = AppUIMessage["parts"][number];

type ChatThreadStatus =
  | "pending"
  | "running"
  | "waiting"
  | "blocked"
  | "succeeded"
  | "failed"
  | "canceled";

const STORAGE_LOG_THROTTLE_MS = 10_000;
const storageLogTimestamps = new Map<string, number>();

type ChatStorageErrorFields = Readonly<{
  error: unknown;
  storageKey: string;
  workflowRunId: string | null;
}>;

function reportChatStorageError(
  message: string,
  fields: ChatStorageErrorFields,
) {
  const dedupeKey = `${message}:${fields.storageKey}`;
  const now = Date.now();
  const previousTimestamp = storageLogTimestamps.get(dedupeKey);
  if (
    previousTimestamp !== undefined &&
    now - previousTimestamp < STORAGE_LOG_THROTTLE_MS
  ) {
    return;
  }
  storageLogTimestamps.set(dedupeKey, now);

  const telemetryError = new Error(message, { cause: fields });
  if (
    typeof window !== "undefined" &&
    typeof window.reportError === "function"
  ) {
    window.reportError(telemetryError);
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.error(message, fields);
  }
}

function isUserMessageMarker(data: unknown): data is UserMessageMarker {
  if (!data || typeof data !== "object") return false;
  const value = data as Partial<UserMessageMarker>;
  return (
    value.type === "user-message" &&
    typeof value.id === "string" &&
    typeof value.content === "string" &&
    typeof value.timestamp === "number"
  );
}

function reconstructMessages(
  rawMessages: readonly AppUIMessage[],
): AppUIMessage[] {
  const result: AppUIMessage[] = [];
  const seenUserMessageIds = new Set<string>();

  for (const msg of rawMessages) {
    if (msg.role !== "user") continue;
    seenUserMessageIds.add(msg.id);
  }

  for (const msg of rawMessages) {
    if (msg.role === "user") {
      result.push(msg);
      continue;
    }

    if (msg.role !== "assistant") {
      result.push(msg);
      continue;
    }

    let currentParts: typeof msg.parts = [];
    let partIndex = 0;

    for (const part of msg.parts) {
      if (part.type === "data-workflow" && "data" in part) {
        const marker = isUserMessageMarker(part.data) ? part.data : null;
        if (marker) {
          if (currentParts.length > 0) {
            result.push({
              ...msg,
              id: `${msg.id}-${partIndex}`,
              parts: currentParts,
            });
            currentParts = [];
            partIndex += 1;
          }

          if (!seenUserMessageIds.has(marker.id)) {
            seenUserMessageIds.add(marker.id);
            result.push({
              id: marker.id,
              parts: [{ text: marker.content, type: "text" }],
              role: "user",
            });
          }
          continue;
        }
      }

      currentParts.push(part);
    }

    if (currentParts.length > 0) {
      result.push({
        ...msg,
        id: partIndex > 0 ? `${msg.id}-${partIndex}` : msg.id,
        parts: currentParts,
      });
    }
  }

  return result;
}

/**
 * Streaming multi-turn chat client for a project.
 *
 * @param props - Props object for the chat client in `chat-client.tsx`; requires `projectId` (string), a non-empty project identifier used for chat-session storage keys and chat API routing.
 * @returns The chat UI for the project.
 */
export function ProjectChatClient(
  props: Readonly<{
    projectId: string;
    initialThread: Readonly<{
      workflowRunId: string;
      status: ChatThreadStatus;
    }> | null;
  }>,
) {
  const legacyStorageKey = `workflow:chat:${props.projectId}:runId`;
  const storageKey = `workflow:chat:v1:${props.projectId}:runId`;
  const [runId, setRunId] = useState<string | null>(
    props.initialThread?.workflowRunId ?? null,
  );
  const [runStatus, setRunStatus] = useState<ChatThreadStatus | null>(
    props.initialThread?.status ?? null,
  );
  const [chatId] = useState(
    () =>
      props.initialThread?.workflowRunId ?? `project-chat:${props.projectId}`,
  );
  const [shouldResume] = useState(
    () => props.initialThread?.workflowRunId !== undefined,
  );

  const [transport] = useState(() => {
    const workflowTransport = new WorkflowChatTransport<AppUIMessage>({
      api: "/api/chat",
      onChatEnd: () => {
        setRunStatus("succeeded");
        setRunId(null);
        try {
          window.localStorage.removeItem(storageKey);
          window.localStorage.removeItem(legacyStorageKey);
        } catch (error) {
          reportChatStorageError(
            "[ChatClient] Failed to clear runId from storage",
            {
              error,
              storageKey,
              workflowRunId: null,
            },
          );
        }
      },
      onChatSendMessage: (response) => {
        const workflowRunId = response.headers.get("x-workflow-run-id");
        if (!workflowRunId) return;
        setRunStatus("running");
        setRunId(workflowRunId);
        try {
          window.localStorage.setItem(storageKey, workflowRunId);
        } catch (error) {
          reportChatStorageError(
            "[ChatClient] Failed to persist runId to storage",
            {
              error,
              storageKey,
              workflowRunId,
            },
          );
        }
      },
      prepareSendMessagesRequest: async (config) => {
        // The server expects a strict body: { projectId, messages }.
        return {
          body: {
            messages: reconstructMessages(config.messages),
            projectId: props.projectId,
          },
        };
      },
    });

    const adapter: ChatTransport<AppUIMessage> = {
      reconnectToStream: (options) =>
        workflowTransport.reconnectToStream(options),
      sendMessages: (options) => {
        const { messageId, abortSignal, ...rest } = options;
        return workflowTransport.sendMessages({
          ...rest,
          ...(messageId === undefined ? {} : { messageId }),
          ...(abortSignal === undefined ? {} : { abortSignal }),
        });
      },
    };

    return adapter;
  });

  const {
    messages: rawMessages,
    sendMessage: baseSendMessage,
    setMessages,
    status,
  } = useChat({
    id: chatId,
    resume: shouldResume,
    transport,
  });

  const [composerError, setComposerError] = useState<string | null>(null);
  const composerErrorId = `project-chat-composer-error-${props.projectId}`;
  const composerInputId = `project-chat-composer-${props.projectId}`;
  const composerLabelId = `${composerInputId}-label`;
  const isTerminalStatus =
    runStatus === "succeeded" ||
    runStatus === "failed" ||
    runStatus === "canceled";
  const hasActiveSession = Boolean(runId) && !isTerminalStatus;
  const messages = useMemo(
    () => reconstructMessages(rawMessages),
    [rawMessages],
  );

  async function sendFollowUp(text: string): Promise<boolean> {
    if (!runId) return false;

    const optimisticId = `user-${Date.now()}`;
    setMessages((prev) =>
      prev.concat([
        {
          id: optimisticId,
          parts: [{ text, type: "text" }],
          role: "user",
        },
      ]),
    );

    try {
      const response = await fetch(`/api/chat/${runId}`, {
        body: JSON.stringify({ message: text }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        let errorMessage = "Failed to send message.";
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          // Fallback to default message
        }
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
        setComposerError(errorMessage);
        if (response.status === 404 || response.status === 409) {
          setRunStatus("succeeded");
          setRunId(null);
          try {
            window.localStorage.removeItem(storageKey);
          } catch {
            // Ignore.
          }
        }
        return false;
      }

      setRunStatus("waiting");
      setComposerError(null);
      return true;
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Follow-up error:", error);
      }
      setComposerError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
      return false;
    }
  }

  async function sendMessage(message: PromptInputMessage) {
    const text = message.text.trim();
    if (text.length === 0) return;

    setComposerError(null);

    if (message.files.length > 0) {
      setComposerError(
        "Attach files via Uploads. Chat currently supports text only.",
      );
      return;
    }

    if (
      runId &&
      runStatus !== "succeeded" &&
      runStatus !== "failed" &&
      runStatus !== "canceled"
    ) {
      const ok = await sendFollowUp(text);
      if (ok) {
        return;
      }

      // Session may have ended; start a new session using the current transcript as context.
      try {
        await baseSendMessage({ text });
      } catch (error) {
        setComposerError(
          error instanceof Error ? error.message : "Failed to send message.",
        );
      }
      return;
    }

    try {
      await baseSendMessage({ text });
    } catch (error) {
      setComposerError(
        error instanceof Error ? error.message : "Failed to send message.",
      );
    }
  }

  async function endSession() {
    if (!runId) {
      setMessages([]);
      return;
    }

    if (!hasActiveSession) {
      setRunId(null);
      setRunStatus(null);
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore.
      }
      return;
    }

    try {
      const response = await fetch(`/api/chat/${runId}`, {
        body: JSON.stringify({ message: "/done" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setComposerError("Failed to end session.");
        return;
      }
      setComposerError(null);
      setRunStatus("succeeded");
    } catch (error) {
      setComposerError(
        error instanceof Error ? error.message : "Failed to end session.",
      );
    }
  }

  async function cancelSession() {
    if (!runId || !hasActiveSession) return;

    try {
      const response = await fetch(`/api/chat/${runId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        setComposerError("Failed to cancel session.");
        return;
      }
      setComposerError(null);
      setRunStatus("canceled");
      setRunId(null);
      try {
        window.localStorage.removeItem(storageKey);
        window.localStorage.removeItem(legacyStorageKey);
      } catch {
        // Ignore.
      }
    } catch (error) {
      setComposerError(
        error instanceof Error ? error.message : "Failed to cancel session.",
      );
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">Project chat</p>
          <p className="text-muted-foreground text-xs" suppressHydrationWarning>
            {runId
              ? `Session: ${runId}${runStatus ? ` · ${runStatus}` : ""}`
              : "Start a new session"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={!hasActiveSession}
            onClick={async () => {
              await endSession();
            }}
            type="button"
            variant="outline"
          >
            End session
          </Button>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden rounded-md border">
        <Conversation className="bg-card">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                description="Ask about your uploaded sources (or start by uploading a file)."
                title="No messages yet"
              />
            ) : (
              messages.map((msg) => (
                <Message from={msg.role} key={msg.id}>
                  <MessageContent>
                    {msg.parts.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <MessageResponse key={`${msg.id}-text-${i}`}>
                            {part.text}
                          </MessageResponse>
                        );
                      }

                      if (part.type === "reasoning") {
                        return (
                          <Reasoning
                            state={
                              part.state === "streaming" ? "streaming" : "idle"
                            }
                            key={`${msg.id}-reason-${i}`}
                          >
                            <ReasoningTrigger />
                            <ReasoningContent>{part.text}</ReasoningContent>
                          </Reasoning>
                        );
                      }

                      if (isToolUIPart(part as AppUIMessagePart)) {
                        const tool = part as ToolPart;
                        const output =
                          "output" in tool ? tool.output : undefined;
                        const errorText =
                          "errorText" in tool ? tool.errorText : undefined;
                        const input = "input" in tool ? tool.input : undefined;
                        const toolName = getToolName(tool);

                        if (tool.type === "dynamic-tool") {
                          return (
                            <Tool
                              defaultOpen={false}
                              key={`${msg.id}-tool-${i}`}
                            >
                              <ToolHeader
                                state={tool.state}
                                title={toolName}
                                toolName={tool.toolName}
                                type="dynamic-tool"
                              />
                              <ToolContent>
                                <ToolInput input={input} />
                                <ToolOutput
                                  errorText={errorText}
                                  output={output}
                                />
                              </ToolContent>
                            </Tool>
                          );
                        }

                        return (
                          <Tool defaultOpen={false} key={`${msg.id}-tool-${i}`}>
                            <ToolHeader
                              state={tool.state}
                              title={toolName}
                              type={tool.type}
                            />
                            <ToolContent>
                              <ToolInput input={input} />
                              <ToolOutput
                                errorText={errorText}
                                output={output}
                              />
                            </ToolContent>
                          </Tool>
                        );
                      }

                      if (part.type === "data-workflow") {
                        // Internal marker: handled by reconstruction.
                        return null;
                      }

                      return null;
                    })}
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className="flex flex-col gap-2">
        {composerError ? (
          <p
            className="text-destructive text-sm"
            id={composerErrorId}
            role="alert"
          >
            {composerError}
          </p>
        ) : null}

        <PromptInput
          onSubmit={(message) =>
            Promise.resolve().then(() => sendMessage(message))
          }
          className="rounded-md border bg-card"
        >
          <PromptInputBody>
            <label
              className="sr-only"
              htmlFor={composerInputId}
              id={composerLabelId}
            >
              Message
            </label>
            <PromptInputTextarea
              aria-describedby={composerError ? composerErrorId : undefined}
              aria-invalid={composerError ? "true" : undefined}
              id={composerInputId}
              labelId={composerLabelId}
              placeholder="Ask about your project…"
              className="min-h-[120px]"
            />
          </PromptInputBody>
          <div className="flex items-center justify-end gap-2 px-3 pb-3">
            <PromptInputSubmit onStop={cancelSession} status={status} />
          </div>
        </PromptInput>
      </div>
    </div>
  );
}
