"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import type { ChatTransport, UIDataTypes, UIMessage, UITools } from "ai";
import { getToolName, isToolUIPart } from "ai";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toChatTitle } from "@/lib/chat/title";
import {
  type ChatThreadStatus,
  resolveRunStatusAfterChatEnd,
} from "./run-status";

type UserMessageMarker = Readonly<{
  type: "user-message";
  id: string;
  content: string;
  timestamp: number;
}>;

type AppUIMessage = UIMessage<unknown, UIDataTypes, UITools>;
type AppUIMessagePart = AppUIMessage["parts"][number];
type PersistedUiMessage = Readonly<{
  id: string;
  parts: unknown[];
  role: "assistant" | "system" | "user";
}> &
  Record<string, unknown>;
type EnabledAgentModeOption = Readonly<{
  modeId: string;
  displayName: string;
  description: string;
}>;

type ChatThreadSummary = Readonly<{
  id: string;
  projectId: string;
  title: string;
  mode: string;
  status: ChatThreadStatus;
  workflowRunId: string | null;
  lastActivityAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

const isTerminalStatus = (status: ChatThreadStatus | null): boolean =>
  status === "succeeded" || status === "failed" || status === "canceled";

function replaceThreadIdInUrl(threadId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (threadId) {
    url.searchParams.set("threadId", threadId);
  } else {
    url.searchParams.delete("threadId");
  }
  window.history.replaceState(window.history.state, "", url);
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
 * @param props - Props for rendering a chat thread transcript and starting new sessions.
 * @returns The chat UI for the project.
 */
export function ProjectChatClient(
  props: Readonly<{
    projectId: string;
    threads: readonly ChatThreadSummary[];
    initialThread: ChatThreadSummary | null;
    initialMessages: readonly PersistedUiMessage[];
    enabledModes: readonly EnabledAgentModeOption[];
    defaultModeId: string;
  }>,
) {
  const projectIdRef = useRef(props.projectId);
  useEffect(() => {
    projectIdRef.current = props.projectId;
  }, [props.projectId]);

  const [threads, setThreads] = useState<readonly ChatThreadSummary[]>(
    () => props.threads,
  );
  const [activeThread, setActiveThread] = useState<ChatThreadSummary | null>(
    () => props.initialThread,
  );
  const activeThreadIdRef = useRef<string | null>(
    props.initialThread?.id ?? null,
  );
  useEffect(() => {
    activeThreadIdRef.current = activeThread?.id ?? null;
  }, [activeThread?.id]);

  const initialThreadStatus = props.initialThread?.status ?? null;
  const initialWorkflowRunIdRaw = props.initialThread?.workflowRunId ?? null;
  const initialWorkflowRunId =
    initialWorkflowRunIdRaw && !isTerminalStatus(initialThreadStatus)
      ? initialWorkflowRunIdRaw
      : null;

  const [runId, setRunId] = useState<string | null>(() => initialWorkflowRunId);
  const runIdRef = useRef<string | null>(runId);
  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);
  const [runStatus, setRunStatus] = useState<ChatThreadStatus | null>(
    initialThreadStatus,
  );
  const [chatId] = useState(
    () => initialWorkflowRunId ?? `project-chat:${props.projectId}`,
  );
  const [shouldResume] = useState(() => initialWorkflowRunId !== null);

  const selectedModeFallback =
    props.enabledModes.find((m) => m.modeId === props.defaultModeId)?.modeId ??
    props.enabledModes.at(0)?.modeId ??
    props.defaultModeId;
  const [selectedModeId, setSelectedModeId] = useState<string>(() => {
    const fromThread = props.initialThread?.mode;
    if (!fromThread) return selectedModeFallback;
    return props.enabledModes.some((m) => m.modeId === fromThread)
      ? fromThread
      : selectedModeFallback;
  });

  const selectedModeIdRef = useRef(selectedModeId);
  useEffect(() => {
    selectedModeIdRef.current = selectedModeId;
  }, [selectedModeId]);

  const handleChatEnd = useCallback(() => {
    setRunStatus((previousStatus) => {
      const next = resolveRunStatusAfterChatEnd(previousStatus);
      setActiveThread((prev) =>
        prev && next
          ? {
              ...prev,
              endedAt: new Date().toISOString(),
              status: next,
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
      setThreads((prev) => {
        const activeId = activeThreadIdRef.current;
        if (!activeId || !next) return prev;

        const now = new Date().toISOString();
        return prev.map((t) =>
          t.id === activeId
            ? { ...t, endedAt: now, status: next, updatedAt: now }
            : t,
        );
      });
      return next;
    });
    setRunId(null);
  }, []);

  const handleChatSendMessage = useCallback(
    (response: Response, options: { messages: AppUIMessage[] }) => {
      const workflowRunId = response.headers.get("x-workflow-run-id");
      if (!workflowRunId) return;
      const threadId = response.headers.get("x-chat-thread-id");
      setRunStatus("running");
      setRunId(workflowRunId);

      if (!threadId) return;

      const now = new Date().toISOString();
      const lastUserMessage = options.messages
        .slice()
        .reverse()
        .find((msg) => msg.role === "user");
      const title = lastUserMessage ? toChatTitle(lastUserMessage) : "New chat";
      const mode = selectedModeIdRef.current;
      const nextThread: ChatThreadSummary = {
        createdAt: now,
        endedAt: null,
        id: threadId,
        lastActivityAt: now,
        mode,
        projectId: projectIdRef.current,
        status: "running",
        title,
        updatedAt: now,
        workflowRunId,
      };

      setActiveThread(nextThread);
      setThreads((prev) => {
        const existingIdx = prev.findIndex((t) => t.id === threadId);
        if (existingIdx >= 0) {
          return prev.map((t) => (t.id === threadId ? nextThread : t));
        }
        return [nextThread, ...prev];
      });

      replaceThreadIdInUrl(threadId);
    },
    [],
  );

  const prepareSendMessagesRequest = useCallback(
    async (config: { messages: AppUIMessage[] }) => {
      return {
        body: {
          messages: reconstructMessages(config.messages),
          modeId: selectedModeIdRef.current,
          projectId: projectIdRef.current,
        },
      };
    },
    [],
  );

  // eslint-disable-next-line react-hooks/refs -- The transport constructor stores callbacks; it does not read ref values during render.
  const [transport] = useState(() => {
    const workflowTransport = new WorkflowChatTransport<AppUIMessage>({
      api: "/api/chat",
      onChatEnd: handleChatEnd,
      onChatSendMessage: handleChatSendMessage,
      prepareReconnectToStreamRequest: async (options) => {
        // WorkflowChatTransport uses `chatId` by default when `workflowRunId`
        // isn't known (e.g. page refresh). Always prefer the latest run id.
        const effectiveRunId = runIdRef.current ?? options.id;
        return {
          api: `/api/chat/${encodeURIComponent(effectiveRunId)}/stream`,
        };
      },
      prepareSendMessagesRequest,
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
    // `initialMessages` originate from persisted UI messages that are validated server-side
    // before being serialized to the client, so this cast is safe.
    messages: props.initialMessages as unknown as AppUIMessage[],
    resume: shouldResume,
    transport,
  });

  const [composerError, setComposerError] = useState<string | null>(null);
  const composerErrorId = `project-chat-composer-error-${props.projectId}`;
  const composerInputId = `project-chat-composer-${props.projectId}`;
  const composerLabelId = `${composerInputId}-label`;
  const messages = reconstructMessages(rawMessages);
  const hasMessages = messages.length > 0;
  const hasActiveSession = Boolean(runId) && !isTerminalStatus(runStatus);
  const modeSelectorDisabled = hasActiveSession;
  const threadSelectorDisabled = hasActiveSession;
  const modeForDisplay =
    hasActiveSession && activeThread ? activeThread.mode : selectedModeId;
  const modeOptionForDisplay = props.enabledModes.find(
    (m) => m.modeId === modeForDisplay,
  );

  async function sendFollowUp(text: string): Promise<boolean> {
    if (!runId) return false;

    const messageId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `user-${Date.now()}`;
    const optimisticId = messageId;
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
        body: JSON.stringify({ message: text, messageId }),
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
          setRunStatus(null);
          setRunId(null);
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
        setComposerError(null);
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
      setActiveThread(null);
      replaceThreadIdInUrl(null);
      return;
    }

    if (!hasActiveSession) {
      setRunId(null);
      setRunStatus(null);
      return;
    }

    try {
      const response = await fetch(`/api/chat/${runId}`, {
        body: JSON.stringify({
          message: "/done",
          messageId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `done-${Date.now()}`,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setComposerError("Failed to end session.");
        return;
      }
      setComposerError(null);
      setRunStatus("succeeded");
      setRunId(null);
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
    } catch (error) {
      setComposerError(
        error instanceof Error ? error.message : "Failed to cancel session.",
      );
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-muted-foreground text-sm">Project chat</p>
          <p className="truncate font-medium text-sm">
            {activeThread
              ? `${activeThread.title} · ${activeThread.status}`
              : "New chat"}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            Mode: {modeOptionForDisplay?.displayName ?? modeForDisplay}
            {runId ? ` · Run: ${runId}` : ""}
          </p>
          {modeOptionForDisplay?.description ? (
            <p className="text-muted-foreground text-pretty text-xs">
              {modeOptionForDisplay.description}
            </p>
          ) : null}

          <nav aria-label="Chat threads">
            <ul className="flex items-center gap-2 overflow-x-auto pb-1">
              <li>
                <Button
                  aria-current={activeThread ? undefined : "page"}
                  disabled={threadSelectorDisabled}
                  onClick={() => {
                    if (hasActiveSession) return;
                    setComposerError(null);
                    setMessages([]);
                    setRunId(null);
                    setRunStatus(null);
                    setActiveThread(null);
                    setSelectedModeId(selectedModeFallback);
                    replaceThreadIdInUrl(null);
                  }}
                  size="sm"
                  type="button"
                  variant={activeThread ? "outline" : "secondary"}
                >
                  New chat
                </Button>
              </li>
              {threads.map((t) => {
                const isActive = activeThread?.id === t.id;
                const href = `/projects/${encodeURIComponent(
                  props.projectId,
                )}/chat?threadId=${encodeURIComponent(t.id)}`;
                return (
                  <li key={t.id}>
                    <Button
                      asChild
                      aria-label={`${t.title} (${t.status})`}
                      size="sm"
                      variant={isActive ? "secondary" : "outline"}
                    >
                      <Link
                        aria-current={isActive ? "page" : undefined}
                        aria-disabled={
                          threadSelectorDisabled ? "true" : undefined
                        }
                        data-disabled={
                          threadSelectorDisabled ? "true" : undefined
                        }
                        href={href}
                        onClick={(e) => {
                          if (!threadSelectorDisabled) return;
                          e.preventDefault();
                        }}
                        prefetch={false}
                        tabIndex={threadSelectorDisabled ? -1 : 0}
                      >
                        <span className="max-w-[12rem] truncate">
                          {t.title}
                        </span>
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            onValueChange={(value) => {
              setSelectedModeId(value);
            }}
            value={selectedModeId}
          >
            <SelectTrigger
              aria-label="Select agent mode"
              disabled={modeSelectorDisabled}
              size="sm"
            >
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent align="end">
              {props.enabledModes.map((m) => (
                <SelectItem key={m.modeId} value={m.modeId}>
                  <span className="truncate">{m.displayName}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            disabled={!hasActiveSession && !hasMessages}
            onClick={async () => {
              await endSession();
            }}
            type="button"
            variant="outline"
          >
            {hasActiveSession ? "End session" : "Clear chat"}
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
          onSubmit={sendMessage}
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
              autoComplete="off"
              aria-describedby={composerError ? composerErrorId : undefined}
              aria-invalid={composerError ? "true" : undefined}
              id={composerInputId}
              labelId={composerLabelId}
              name="message"
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
