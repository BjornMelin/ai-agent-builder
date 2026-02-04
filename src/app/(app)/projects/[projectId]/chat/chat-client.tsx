"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import type { ChatTransport, UIDataTypes, UIMessage, UITools } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { useState } from "react";

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

function extractTextParts(message: AppUIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
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
  const seenContent = new Set<string>();

  for (const msg of rawMessages) {
    if (msg.role !== "user") continue;
    const text = extractTextParts(msg);
    if (text) seenContent.add(text);
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

          if (!seenContent.has(marker.content)) {
            seenContent.add(marker.content);
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
 * @param props - Component props.
 * @returns The chat UI for the project.
 */
export function ProjectChatClient(props: Readonly<{ projectId: string }>) {
  const storageKey = `workflow:chat:${props.projectId}:runId`;
  const [runId, setRunId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(storageKey);
    } catch (error) {
      console.warn("[ChatClient] Failed to read runId from storage:", error);
      return null;
    }
  });

  const [transport] = useState(() => {
    const workflowTransport = new WorkflowChatTransport<AppUIMessage>({
      api: "/api/chat",
      onChatEnd: () => {
        setRunId(null);
        window.localStorage.removeItem(storageKey);
      },
      onChatSendMessage: (response) => {
        const workflowRunId = response.headers.get("x-workflow-run-id");
        if (!workflowRunId) return;
        setRunId(workflowRunId);
        window.localStorage.setItem(storageKey, workflowRunId);
      },
      prepareReconnectToStreamRequest: async () => {
        const stored = window.localStorage.getItem(storageKey);
        if (!stored) {
          return {};
        }
        return { api: `/api/chat/${stored}/stream` };
      },
      prepareSendMessagesRequest: async (config) => {
        // The server expects a strict body: { projectId, messages }.
        return {
          body: { messages: config.messages, projectId: props.projectId },
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
    stop,
  } = useChat({ resume: !!runId, transport });

  const [composerError, setComposerError] = useState<string | null>(null);

  const messages = reconstructMessages(rawMessages);

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
        throw new Error(errorMessage);
      }

      setComposerError(null);
      return true;
    } catch (error) {
      console.error("Follow-up error:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
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

    if (runId) {
      await sendFollowUp(text);
      return;
    }

    await baseSendMessage({ text });
  }

  async function endSession() {
    if (!runId) {
      setMessages([]);
      return;
    }

    await fetch(`/api/chat/${runId}`, {
      body: JSON.stringify({ message: "/done" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">Project chat</p>
          <p className="text-muted-foreground text-xs">
            {runId ? `Session: ${runId}` : "Start a new session"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={status !== "streaming"}
            onClick={() => stop()}
            type="button"
            variant="outline"
          >
            Stop
          </Button>
          <Button onClick={() => endSession()} type="button" variant="outline">
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
          <p className="text-destructive text-sm">{composerError}</p>
        ) : null}

        <PromptInput
          onSubmit={(message) => sendMessage(message)}
          className="rounded-md border bg-card"
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask about your project…"
              className="min-h-[120px]"
            />
          </PromptInputBody>
          <div className="flex items-center justify-end gap-2 px-3 pb-3">
            <PromptInputSubmit status={status} />
          </div>
        </PromptInput>
      </div>
    </div>
  );
}
