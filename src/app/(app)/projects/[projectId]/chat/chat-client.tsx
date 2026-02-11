"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import type {
  ChatTransport,
  FileUIPart,
  UIDataTypes,
  UIMessage,
  UITools,
} from "ai";
import { getToolName, isToolUIPart } from "ai";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
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
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
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
import { tryReadJsonErrorMessage } from "@/lib/core/errors";
import {
  uploadAcceptList,
  uploadMaxFiles,
} from "@/lib/uploads/allowed-mime-types";
import { uploadProjectFilesFromFiles } from "@/lib/uploads/upload-files.client";
import {
  type ChatThreadStatus,
  resolveRunStatusAfterChatEnd,
} from "./run-status";

const CHAT_ATTACHMENT_ACCEPT_FALLBACK =
  ".pdf,.docx,.pptx,.xlsx,.txt,.md," +
  "application/pdf,text/plain,text/markdown," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CHAT_ATTACHMENT_ACCEPT =
  typeof uploadAcceptList === "string" && uploadAcceptList.length > 0
    ? uploadAcceptList
    : CHAT_ATTACHMENT_ACCEPT_FALLBACK;

const CHAT_MAX_ATTACHMENT_FILES_FALLBACK = 5;
const CHAT_MAX_ATTACHMENT_FILES =
  typeof uploadMaxFiles === "number" &&
  Number.isFinite(uploadMaxFiles) &&
  uploadMaxFiles > 0
    ? uploadMaxFiles
    : CHAT_MAX_ATTACHMENT_FILES_FALLBACK;

type UserMessageMarker = Readonly<{
  type: "user-message";
  id: string;
  content: string;
  files?: readonly FileUIPart[] | undefined;
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
  const hasValidFiles = value.files === undefined || Array.isArray(value.files);
  return (
    value.type === "user-message" &&
    typeof value.id === "string" &&
    typeof value.content === "string" &&
    hasValidFiles &&
    typeof value.timestamp === "number"
  );
}

function ChatComposerAttachments() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <div className="w-full border-b px-3 py-2">
      <Attachments className="w-full" variant="inline">
        {attachments.files.map((file) => (
          <Attachment
            data={file}
            key={file.id}
            onRemove={() => attachments.remove(file.id)}
          >
            <AttachmentPreview />
            <AttachmentInfo />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </div>
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
            const markerParts: AppUIMessage["parts"] = [
              ...(marker.files ?? []),
              ...(marker.content.length > 0
                ? [{ text: marker.content, type: "text" as const }]
                : []),
            ];
            if (markerParts.length === 0) {
              continue;
            }
            result.push({
              id: marker.id,
              parts: markerParts,
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
 * @param props - Configuration including projectId, threads, initialThread, initialMessages, enabledModes, defaultModeId, and maxAttachmentBytes.
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
    maxAttachmentBytes: number;
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
      const title = lastUserMessage ? toChatTitle(lastUserMessage) : "New Chat";
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

  // The transport constructor stores callbacks; it does not read ref values during render.
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
  // Reconstructing message order is O(n) over streamed parts; memoize so
  // unrelated state changes (e.g. input errors) don't re-run the projection.
  const messages = useMemo(
    () => reconstructMessages(rawMessages),
    [rawMessages],
  );
  const hasMessages = messages.length > 0;
  const hasActiveSession = Boolean(runId) && !isTerminalStatus(runStatus);
  const modeSelectorDisabled = hasActiveSession;
  const threadSelectorDisabled = hasActiveSession;
  const modeForDisplay =
    hasActiveSession && activeThread ? activeThread.mode : selectedModeId;
  const modeOptionForDisplay = props.enabledModes.find(
    (m) => m.modeId === modeForDisplay,
  );

  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);

  type FollowUpSendResult =
    | Readonly<{ status: "ok" }>
    | Readonly<{ status: "session-ended" }>
    | Readonly<{ status: "failed"; message: string }>;

  async function sendFollowUp(input: {
    text?: string | undefined;
    files?: readonly FileUIPart[] | undefined;
  }): Promise<FollowUpSendResult> {
    if (!runId) {
      return { message: "No active session.", status: "failed" };
    }

    const text = input.text?.trim() ?? "";
    const files = input.files ?? [];
    const hasText = text.length > 0;
    const hasFiles = files.length > 0;
    if (!hasText && !hasFiles) return { status: "ok" };

    const messageId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `user-${Date.now()}`;
    const optimisticId = messageId;
    const optimisticParts: AppUIMessage["parts"] = [
      ...files,
      ...(hasText ? [{ text, type: "text" as const }] : []),
    ];
    setMessages((prev) =>
      prev.concat([
        {
          id: optimisticId,
          parts: optimisticParts,
          role: "user",
        },
      ]),
    );

    try {
      const response = await fetch(`/api/chat/${runId}`, {
        body: JSON.stringify({
          ...(hasFiles ? { files } : {}),
          ...(hasText ? { message: text } : {}),
          messageId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const errorMessage =
          (await tryReadJsonErrorMessage(response)) ??
          "Failed to send message.";
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
        if (response.status === 404 || response.status === 409) {
          setRunStatus(null);
          setRunId(null);
          setComposerError(null);
          return { status: "session-ended" };
        }
        setComposerError(errorMessage);
        return { message: errorMessage, status: "failed" };
      }

      setRunStatus("waiting");
      setComposerError(null);
      return { status: "ok" };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Follow-up error:", error);
      }
      const message =
        error instanceof Error ? error.message : "Something went wrong.";
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
      setComposerError(message);
      return { message, status: "failed" };
    }
  }

  async function sendMessage(message: PromptInputMessage) {
    const text = message.text.trim();
    const hasText = text.length > 0;
    const rawFiles = message.rawFiles;
    const hasFiles = rawFiles.length > 0;
    if (!hasText && !hasFiles) return;

    setComposerError(null);

    let uploadedFiles: FileUIPart[] = [];
    if (hasFiles) {
      setIsUploadingAttachments(true);
      try {
        uploadedFiles = await uploadProjectFilesFromFiles({
          asyncIngest: false,
          files: rawFiles,
          projectId: projectIdRef.current,
        });
      } catch (error) {
        const messageText =
          error instanceof Error
            ? error.message
            : "Failed to upload attachments.";
        setComposerError(messageText);
        return;
      } finally {
        setIsUploadingAttachments(false);
      }
    }

    if (
      runId &&
      runStatus !== "succeeded" &&
      runStatus !== "failed" &&
      runStatus !== "canceled"
    ) {
      const followUpResult = await sendFollowUp({
        ...(hasText ? { text } : {}),
        ...(uploadedFiles.length > 0 ? { files: uploadedFiles } : {}),
      });
      if (followUpResult.status === "ok") {
        return;
      }
      if (followUpResult.status === "failed") {
        return;
      }

      // Session may have ended; start a new session using the current transcript as context.
      try {
        setComposerError(null);
        if (uploadedFiles.length > 0) {
          await baseSendMessage(
            hasText ? { files: uploadedFiles, text } : { files: uploadedFiles },
          );
        } else {
          await baseSendMessage({ text });
        }
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "Failed to send message.";
        setComposerError(messageText);
        return;
      }
      return;
    }

    try {
      if (uploadedFiles.length > 0) {
        await baseSendMessage(
          hasText ? { files: uploadedFiles, text } : { files: uploadedFiles },
        );
      } else {
        await baseSendMessage({ text });
      }
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Failed to send message.";
      setComposerError(messageText);
      return;
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
          <h2 className="text-muted-foreground text-sm">Project Chat</h2>
          <p className="truncate font-medium text-sm">
            {activeThread
              ? `${activeThread.title} · ${activeThread.status}`
              : "New Chat"}
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
                  New Chat
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
            {hasActiveSession ? "End Session" : "Clear Chat"}
          </Button>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden rounded-md border">
        <Conversation className="bg-card">
          <ConversationContent
            style={
              messages.length > 50
                ? { containIntrinsicSize: "800px", contentVisibility: "auto" }
                : undefined
            }
          >
            {messages.length === 0 ? (
              <ConversationEmptyState
                description="Ask about your uploaded sources (or start by uploading a file)."
                title="No Messages Yet"
              />
            ) : (
              messages.map((msg) => {
                const fileParts = msg.parts.filter(
                  (part): part is FileUIPart => part.type === "file",
                );
                const attachments = fileParts.map((file, index) => ({
                  ...file,
                  id: `${msg.id}-file-${index}`,
                }));

                return (
                  <Message from={msg.role} key={msg.id}>
                    <MessageContent>
                      {attachments.length > 0 ? (
                        <Attachments className="w-full" variant="inline">
                          {attachments.map((file) => (
                            <Attachment data={file} key={file.id}>
                              <AttachmentPreview />
                              <AttachmentInfo />
                            </Attachment>
                          ))}
                        </Attachments>
                      ) : null}

                      {msg.parts.map((part, i) => {
                        if (part.type === "file") {
                          return null;
                        }

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
                                part.state === "streaming"
                                  ? "streaming"
                                  : "idle"
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
                          const input =
                            "input" in tool ? tool.input : undefined;
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
                            <Tool
                              defaultOpen={false}
                              key={`${msg.id}-tool-${i}`}
                            >
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
                );
              })
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className="flex flex-col gap-2">
        {composerError ? (
          <output
            className="block text-destructive text-sm"
            id={composerErrorId}
            aria-live="polite"
            aria-atomic="true"
          >
            {composerError}
          </output>
        ) : null}

        <PromptInput
          accept={CHAT_ATTACHMENT_ACCEPT}
          onSubmit={sendMessage}
          className="rounded-md border bg-card"
          dropMode="global"
          fileUrlMode="preserve"
          maxFileSize={props.maxAttachmentBytes}
          maxFiles={CHAT_MAX_ATTACHMENT_FILES}
        >
          <ChatComposerAttachments />
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
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger
                  disabled={isUploadingAttachments}
                />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={isUploadingAttachments}
              onStop={cancelSession}
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
