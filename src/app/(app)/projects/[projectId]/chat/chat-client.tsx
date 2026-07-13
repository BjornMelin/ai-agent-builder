"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@ai-sdk/workflow";
import type {
  ChatStatus,
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
import { decodeReplaySafeAssistantStream } from "@/lib/chat/replay-safe-stream";
import type { ChatThreadStatus } from "@/lib/chat/thread-status";
import { toChatTitle } from "@/lib/chat/title";
import { isJsonError } from "@/lib/core/errors";
import {
  defaultUploadAcceptList,
  defaultUploadMaxFiles,
  uploadAcceptList,
  uploadMaxFiles,
} from "@/lib/uploads/allowed-mime-types";
import { uploadProjectFilesFromFiles } from "@/lib/uploads/upload-files.client";

const CHAT_ATTACHMENT_ACCEPT =
  typeof uploadAcceptList === "string" && uploadAcceptList.length > 0
    ? uploadAcceptList
    : defaultUploadAcceptList;

const CHAT_MAX_ATTACHMENT_FILES =
  typeof uploadMaxFiles === "number" &&
  Number.isFinite(uploadMaxFiles) &&
  uploadMaxFiles > 0
    ? uploadMaxFiles
    : defaultUploadMaxFiles;

type UserMessageMarker = Readonly<{
  content: string;
  domain?: "chat";
  files?: readonly FileUIPart[] | undefined;
  id: string;
  timestamp: number;
  type: "user-message";
  version?: 2;
}>;

type ChatSessionStatusMarker = Readonly<{
  domain: "chat";
  status: "running" | "waiting";
  timestamp: number;
  type: "session-status";
  version: 2;
}>;

type ChatFollowUpDispositionMarker = Readonly<{
  domain: "chat";
  messageId: string;
  outcome: "duplicate" | "rejected";
  reason:
    | "already_committed"
    | "not_waiting"
    | "payload_mismatch"
    | "stale_delivery";
  timestamp: number;
  type: "follow-up-disposition";
  version: 2;
}>;

type ChatTerminalStatusMarker = Readonly<{
  domain: "chat";
  status: "canceled" | "failed" | "succeeded";
  timestamp: number;
  type: "terminal";
  version: 2;
}>;

type SendAcceptance = Readonly<{
  promise: Promise<void>;
  reject: (error: Error) => void;
  resolve: () => void;
}>;

type PendingInitialChatStart = Readonly<{
  fingerprint: string;
  messageId: string;
  threadId: string;
}>;

type FollowUpAcknowledgementResult =
  | Readonly<{ status: "accepted" }>
  | Readonly<{
      message: string;
      rotateMessageId: boolean;
      status: "rejected";
    }>;

type FollowUpAcknowledgement = Readonly<{
  messageId: string;
  promise: Promise<FollowUpAcknowledgementResult>;
  settle: (result: FollowUpAcknowledgementResult) => void;
}>;

const CHAT_SESSION_FAILED_MESSAGE = "Chat session failed.";

function createSendAcceptance(): SendAcceptance {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function createFollowUpAcknowledgement(
  messageId: string,
): FollowUpAcknowledgement {
  let settle: (result: FollowUpAcknowledgementResult) => void = () => undefined;
  const promise = new Promise<FollowUpAcknowledgementResult>((resolve) => {
    settle = resolve;
  });
  return { messageId, promise, settle };
}

function followUpDispositionMessage(
  reason: ChatFollowUpDispositionMarker["reason"],
): string {
  switch (reason) {
    case "payload_mismatch":
      return "This message ID is already bound to different content. Retry the draft.";
    case "not_waiting":
      return "The chat started another turn before this message was admitted. Retry the draft when it is waiting.";
    case "stale_delivery":
      return "Another message won this chat turn. Your draft was not sent; retry when the chat is waiting.";
    case "already_committed":
      return "The message was already admitted.";
  }
}

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
  const hasValidDomain = value.domain === "chat" || value.domain === undefined;
  const hasValidVersion = value.version === 2 || value.version === undefined;
  return (
    hasValidDomain &&
    value.type === "user-message" &&
    hasValidVersion &&
    typeof value.id === "string" &&
    typeof value.content === "string" &&
    hasValidFiles &&
    typeof value.timestamp === "number"
  );
}

function isChatSessionStatusMarker(
  data: unknown,
): data is ChatSessionStatusMarker {
  if (!data || typeof data !== "object") return false;
  const value = data as Partial<ChatSessionStatusMarker>;
  return (
    value.domain === "chat" &&
    (value.status === "running" || value.status === "waiting") &&
    typeof value.timestamp === "number" &&
    value.type === "session-status" &&
    value.version === 2
  );
}

function isChatFollowUpDispositionMarker(
  data: unknown,
): data is ChatFollowUpDispositionMarker {
  if (!data || typeof data !== "object") return false;
  const value = data as Partial<ChatFollowUpDispositionMarker>;
  return (
    value.domain === "chat" &&
    typeof value.messageId === "string" &&
    (value.outcome === "duplicate" || value.outcome === "rejected") &&
    (value.reason === "already_committed" ||
      value.reason === "not_waiting" ||
      value.reason === "payload_mismatch" ||
      value.reason === "stale_delivery") &&
    typeof value.timestamp === "number" &&
    value.type === "follow-up-disposition" &&
    value.version === 2
  );
}

function isChatTerminalStatusMarker(
  data: unknown,
): data is ChatTerminalStatusMarker {
  if (!data || typeof data !== "object") return false;
  const value = data as Partial<ChatTerminalStatusMarker>;
  return (
    value.domain === "chat" &&
    (value.status === "canceled" ||
      value.status === "failed" ||
      value.status === "succeeded") &&
    typeof value.timestamp === "number" &&
    value.type === "terminal" &&
    value.version === 2
  );
}

function isFileUIPart(part: unknown): part is FileUIPart {
  if (!part || typeof part !== "object") return false;
  const value = part as Partial<FileUIPart>;
  const hasValidFilename =
    value.filename === undefined || typeof value.filename === "string";
  return (
    value.type === "file" &&
    typeof value.mediaType === "string" &&
    hasValidFilename &&
    typeof value.url === "string"
  );
}

function createInitialStartFingerprint(
  input: Readonly<{
    files: readonly FileUIPart[];
    modeId: string;
    projectId: string;
    text: string;
  }>,
): string {
  return JSON.stringify(input);
}

function recoverableInitialStart(
  projectId: string,
  thread: ChatThreadSummary | null,
  messages: readonly PersistedUiMessage[],
): Readonly<{
  parts: AppUIMessage["parts"];
  pending: PendingInitialChatStart;
}> | null {
  if (thread?.status !== "pending" || thread.workflowRunId !== null) {
    return null;
  }
  const userMessages = messages.filter(
    (candidate) => candidate.role === "user",
  );
  if (userMessages.length !== 1) return null;
  const [message] = userMessages;
  if (!message) return null;

  const parts = message.parts as AppUIMessage["parts"];
  const files = parts.filter(isFileUIPart);
  const text = parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("");
  return {
    parts,
    pending: {
      fingerprint: createInitialStartFingerprint({
        files,
        modeId: thread.mode,
        projectId,
        text,
      }),
      messageId: message.id,
      threadId: thread.id,
    },
  };
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
              ...(marker.files?.filter(isFileUIPart) ?? []),
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
  const initialStartRecovery = recoverableInitialStart(
    props.projectId,
    props.initialThread,
    props.initialMessages,
  );
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

  const initialThreadStatus = props.initialThread?.status ?? null;
  const initialWorkflowRunIdRaw = props.initialThread?.workflowRunId ?? null;
  const initialWorkflowRunId =
    initialWorkflowRunIdRaw && !isTerminalStatus(initialThreadStatus)
      ? initialWorkflowRunIdRaw
      : null;

  const [runId, setRunId] = useState<string | null>(() => initialWorkflowRunId);
  const runIdRef = useRef<string | null>(initialWorkflowRunId);
  const [runStatus, setRunStatus] = useState<ChatThreadStatus | null>(
    initialThreadStatus,
  );
  const runStatusRef = useRef<ChatThreadStatus | null>(initialThreadStatus);
  const streamThreadIdRef = useRef<string | null>(
    initialWorkflowRunId ? (props.initialThread?.id ?? null) : null,
  );
  const initialSendAcceptanceRef = useRef<SendAcceptance | null>(null);
  const pendingInitialStartRef = useRef<PendingInitialChatStart | null>(
    initialStartRecovery?.pending ?? null,
  );
  const startRecoveryAttemptedRef = useRef(false);
  const [chatId] = useState(
    () => initialWorkflowRunId ?? `project-chat:${props.projectId}`,
  );
  const [shouldResume] = useState(() => initialWorkflowRunId !== null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const isEndingSessionRef = useRef(false);
  const isSendingMessageRef = useRef(false);
  const pendingEndMessageIdRef = useRef<string | null>(null);
  const pendingFollowUpRef = useRef<Readonly<{
    fingerprint: string;
    messageId: string;
  }> | null>(null);
  const followUpAcknowledgementRef = useRef<FollowUpAcknowledgement | null>(
    null,
  );

  const updateRunId = useCallback((nextRunId: string | null) => {
    runIdRef.current = nextRunId;
    setRunId(nextRunId);
  }, []);

  const updateRunStatus = useCallback((nextStatus: ChatThreadStatus | null) => {
    runStatusRef.current = nextStatus;
    setRunStatus(nextStatus);
  }, []);

  const updateEndingSession = useCallback((isEnding: boolean) => {
    isEndingSessionRef.current = isEnding;
    setIsEndingSession(isEnding);
  }, []);

  const updateThreadTerminalStatus = useCallback(
    (threadId: string, status: "canceled" | "failed" | "succeeded") => {
      const now = new Date().toISOString();
      setActiveThread((previous) =>
        previous?.id === threadId
          ? { ...previous, endedAt: now, status, updatedAt: now }
          : previous,
      );
      setThreads((previous) =>
        previous.map((thread) =>
          thread.id === threadId
            ? { ...thread, endedAt: now, status, updatedAt: now }
            : thread,
        ),
      );
    },
    [],
  );

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

  const applyTerminalStatus = useCallback(
    (status: "canceled" | "failed" | "succeeded") => {
      followUpAcknowledgementRef.current?.settle({
        message: `Chat session became ${status} before the message was admitted.`,
        rotateMessageId: false,
        status: "rejected",
      });
      followUpAcknowledgementRef.current = null;
      const threadId = streamThreadIdRef.current;
      if (threadId) {
        updateThreadTerminalStatus(threadId, status);
      }
      updateRunStatus(status);
      updateRunId(null);
      updateEndingSession(false);
      setComposerError(null);
      streamThreadIdRef.current = null;
      pendingEndMessageIdRef.current = null;
      pendingFollowUpRef.current = null;
      pendingInitialStartRef.current = null;
    },
    [
      updateEndingSession,
      updateRunId,
      updateRunStatus,
      updateThreadTerminalStatus,
    ],
  );

  const reconcileChatLifecycle = useCallback(
    async (workflowRunId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/chat/${workflowRunId}`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return false;
        const body: unknown = await response.json();
        const status =
          body && typeof body === "object" && "status" in body
            ? (body as { status?: unknown }).status
            : null;
        if (
          status === "canceled" ||
          status === "failed" ||
          status === "succeeded"
        ) {
          if (runIdRef.current === workflowRunId) {
            applyTerminalStatus(status);
          }
          return true;
        }
        if (
          runIdRef.current === workflowRunId &&
          (status === "pending" ||
            status === "running" ||
            status === "waiting" ||
            status === "blocked")
        ) {
          updateRunStatus(status);
        }
      } catch {
        // The caller keeps the session identity and surfaces a reload prompt.
      }
      return false;
    },
    [applyTerminalStatus, updateRunStatus],
  );

  const handleChatEnd = useCallback(async () => {
    const workflowRunId = runIdRef.current;
    if (!workflowRunId) return;
    followUpAcknowledgementRef.current?.settle({
      message:
        "Chat stream ended before this message was admitted. Reload to reconcile the session.",
      rotateMessageId: false,
      status: "rejected",
    });
    followUpAcknowledgementRef.current = null;
    updateEndingSession(false);
    if (await reconcileChatLifecycle(workflowRunId)) return;
    setComposerError(
      "Chat stream ended before terminal status was confirmed. Reload to reconcile this session.",
    );
  }, [reconcileChatLifecycle, updateEndingSession]);

  const handleChatSendMessage = useCallback(
    (response: Response, options: { messages: AppUIMessage[] }) => {
      const workflowRunId = response.headers.get("x-workflow-run-id");
      if (!workflowRunId) return;
      const threadId = response.headers.get("x-chat-thread-id");
      if (!threadId) {
        throw new Error("Chat thread ID missing from response.");
      }
      const pendingStart = pendingInitialStartRef.current;
      if (!pendingStart) {
        throw new Error("Chat start identity is missing.");
      }
      if (pendingStart.threadId !== threadId) {
        throw new Error("Chat response returned a different thread identity.");
      }
      const initialMessage = options.messages.find(
        (message) =>
          message.id === pendingStart.messageId && message.role === "user",
      );
      if (!initialMessage) {
        throw new Error("Initial user message is missing from the response.");
      }

      streamThreadIdRef.current = threadId;
      updateRunStatus("running");
      updateRunId(workflowRunId);

      const now = new Date().toISOString();
      const title = toChatTitle(initialMessage);
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
      pendingInitialStartRef.current = null;
      initialSendAcceptanceRef.current?.resolve();
      initialSendAcceptanceRef.current = null;
    },
    [updateRunId, updateRunStatus],
  );

  const handleChatError = useCallback(
    (error: Error) => {
      const pendingAcceptance = initialSendAcceptanceRef.current;
      initialSendAcceptanceRef.current = null;
      pendingAcceptance?.reject(error);
      followUpAcknowledgementRef.current?.settle({
        message: "Connection interrupted before this message was admitted.",
        rotateMessageId: false,
        status: "rejected",
      });
      followUpAcknowledgementRef.current = null;
      updateEndingSession(false);

      const workflowRunId = runIdRef.current;
      setComposerError(
        workflowRunId
          ? error.message === CHAT_SESSION_FAILED_MESSAGE
            ? CHAT_SESSION_FAILED_MESSAGE
            : "Connection interrupted. Reload to reconcile this chat session."
          : error.message,
      );
      if (workflowRunId) {
        void reconcileChatLifecycle(workflowRunId);
      }
    },
    [reconcileChatLifecycle, updateEndingSession],
  );

  const handleChatData = useCallback(
    (part: Readonly<{ data: unknown; type: string }>) => {
      if (part.type !== "data-workflow" || !runIdRef.current) {
        return;
      }
      if (isChatTerminalStatusMarker(part.data)) {
        applyTerminalStatus(part.data.status);
        return;
      }
      if (isUserMessageMarker(part.data)) {
        const acknowledgement = followUpAcknowledgementRef.current;
        if (acknowledgement?.messageId === part.data.id) {
          acknowledgement.settle({ status: "accepted" });
          followUpAcknowledgementRef.current = null;
        }
        return;
      }
      if (isChatFollowUpDispositionMarker(part.data)) {
        if (pendingEndMessageIdRef.current === part.data.messageId) {
          if (part.data.outcome === "duplicate") {
            setComposerError(null);
            return;
          }

          if (part.data.reason === "payload_mismatch") {
            pendingEndMessageIdRef.current = null;
          }
          updateEndingSession(false);
          setComposerError(followUpDispositionMessage(part.data.reason));
          return;
        }

        const acknowledgement = followUpAcknowledgementRef.current;
        if (acknowledgement?.messageId !== part.data.messageId) return;
        acknowledgement.settle(
          part.data.outcome === "duplicate"
            ? { status: "accepted" }
            : {
                message: followUpDispositionMessage(part.data.reason),
                rotateMessageId: part.data.reason === "payload_mismatch",
                status: "rejected",
              },
        );
        followUpAcknowledgementRef.current = null;
        return;
      }
      if (isChatSessionStatusMarker(part.data)) {
        updateRunStatus(part.data.status);
      }
    },
    [applyTerminalStatus, updateEndingSession, updateRunStatus],
  );

  const prepareSendMessagesRequest = useCallback(
    async (config: { messages: AppUIMessage[] }) => {
      const pendingStart = pendingInitialStartRef.current;
      if (!pendingStart) {
        throw new Error("Chat start identity is missing.");
      }
      const initialMessage = config.messages.find(
        (message) =>
          message.id === pendingStart.messageId && message.role === "user",
      );
      if (!initialMessage) {
        throw new Error("Initial user message is missing.");
      }
      return {
        body: {
          message: initialMessage,
          modeId: selectedModeIdRef.current,
          projectId: projectIdRef.current,
          threadId: pendingStart.threadId,
        },
      };
    },
    [],
  );

  // The transport constructor stores callbacks; it does not read ref values during render.
  const [transport] = useState(() => {
    const acceptedAssistantChunks = new Map<string, string>();
    const workflowTransport = new WorkflowChatTransport<AppUIMessage>({
      api: "/api/chat",
      onChatEnd: handleChatEnd,
      onChatSendMessage: handleChatSendMessage,
      prepareSendMessagesRequest,
    });

    // @ai-sdk/workflow's optional send fields are not exact-optional compatible
    // with AI SDK 7's ChatTransport contract. Keep this boundary structural and
    // omit undefined values until the upstream signatures converge.
    return {
      reconnectToStream: async (options) => {
        const stream = await workflowTransport.reconnectToStream(options);
        return stream
          ? decodeReplaySafeAssistantStream(stream, acceptedAssistantChunks)
          : null;
      },
      sendMessages: async ({ abortSignal, messageId, ...options }) => {
        const stream = await workflowTransport.sendMessages({
          ...options,
          ...(abortSignal === undefined ? {} : { abortSignal }),
          ...(messageId === undefined ? {} : { messageId }),
        });
        return decodeReplaySafeAssistantStream(stream, acceptedAssistantChunks);
      },
    } satisfies ChatTransport<AppUIMessage>;
  });

  const {
    messages: rawMessages,
    sendMessage: baseSendMessage,
    setMessages,
    status,
    stop,
  } = useChat({
    id: chatId,
    // `initialMessages` originate from persisted UI messages that are validated server-side
    // before being serialized to the client, so this cast is safe.
    messages: props.initialMessages as unknown as AppUIMessage[],
    onData: handleChatData,
    onError: handleChatError,
    resume: shouldResume,
    transport,
  });

  const dispatchInitialStart = useCallback(
    (
      pendingStart: PendingInitialChatStart,
      parts: AppUIMessage["parts"],
    ): Promise<void> => {
      if (initialSendAcceptanceRef.current) {
        const error = new Error("A chat request is already being sent.");
        setComposerError(error.message);
        return Promise.reject(error);
      }

      const acceptance = createSendAcceptance();
      initialSendAcceptanceRef.current = acceptance;
      const existingMessage = rawMessages.some(
        (message) => message.id === pendingStart.messageId,
      );
      const request = existingMessage
        ? baseSendMessage({
            messageId: pendingStart.messageId,
            parts,
            role: "user",
          })
        : baseSendMessage({
            id: pendingStart.messageId,
            parts,
            role: "user",
          });

      void request.then(
        () => {
          if (initialSendAcceptanceRef.current !== acceptance) return;
          initialSendAcceptanceRef.current = null;
          const error = new Error("Chat request ended before it was accepted.");
          setComposerError(error.message);
          acceptance.reject(error);
        },
        (cause: unknown) => {
          if (initialSendAcceptanceRef.current !== acceptance) return;
          initialSendAcceptanceRef.current = null;
          const error =
            cause instanceof Error
              ? cause
              : new Error("Failed to send message.");
          setComposerError(error.message);
          acceptance.reject(error);
        },
      );

      return acceptance.promise;
    },
    [baseSendMessage, rawMessages],
  );

  useEffect(() => {
    if (
      !initialStartRecovery ||
      startRecoveryAttemptedRef.current ||
      runIdRef.current
    ) {
      return;
    }
    startRecoveryAttemptedRef.current = true;
    void dispatchInitialStart(
      initialStartRecovery.pending,
      initialStartRecovery.parts,
    ).catch(() => undefined);
  }, [dispatchInitialStart, initialStartRecovery]);

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
  const composerStatus: ChatStatus =
    hasActiveSession && runStatus === "waiting"
      ? "ready"
      : hasActiveSession
        ? "streaming"
        : status;
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
    | Readonly<{ status: "failed"; message: string }>;

  async function sendFollowUp(input: {
    text?: string | undefined;
    files?: readonly FileUIPart[] | undefined;
  }): Promise<FollowUpSendResult> {
    const currentRunId = runIdRef.current;
    if (!currentRunId) {
      return { message: "No active session.", status: "failed" };
    }

    const text = input.text?.trim() ?? "";
    const files = input.files ?? [];
    const hasText = text.length > 0;
    const hasFiles = files.length > 0;
    if (!hasText && !hasFiles) return { status: "ok" };

    const fingerprint = JSON.stringify({ files, text });
    const pending = pendingFollowUpRef.current;
    const messageId =
      pending?.fingerprint === fingerprint
        ? pending.messageId
        : typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `user-${Date.now()}`;
    pendingFollowUpRef.current = { fingerprint, messageId };
    const acknowledgement = createFollowUpAcknowledgement(messageId);
    followUpAcknowledgementRef.current = acknowledgement;
    try {
      const response = await fetch(`/api/chat/${currentRunId}`, {
        body: JSON.stringify({
          ...(hasFiles ? { files } : {}),
          ...(hasText ? { message: text } : {}),
          messageId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const errorMessage = isJsonError(body)
          ? body.error.message
          : "Failed to send message.";
        if (
          isJsonError(body) &&
          body.error.code === "chat_message_id_conflict"
        ) {
          pendingFollowUpRef.current = null;
        }
        if (followUpAcknowledgementRef.current === acknowledgement) {
          followUpAcknowledgementRef.current = null;
        }
        setComposerError(errorMessage);
        return { message: errorMessage, status: "failed" };
      }

      const body: unknown = await response.json().catch(() => null);
      const deliveryStatus =
        body && typeof body === "object" && "status" in body
          ? (body as { status?: unknown }).status
          : null;
      if (deliveryStatus === "duplicate") {
        if (followUpAcknowledgementRef.current === acknowledgement) {
          followUpAcknowledgementRef.current = null;
        }
        pendingFollowUpRef.current = null;
        setComposerError(null);
        return { status: "ok" };
      }
      if (deliveryStatus !== "queued") {
        if (followUpAcknowledgementRef.current === acknowledgement) {
          followUpAcknowledgementRef.current = null;
        }
        const message = "Chat did not confirm that the message was queued.";
        setComposerError(message);
        return { message, status: "failed" };
      }

      const admission = await acknowledgement.promise;
      if (followUpAcknowledgementRef.current === acknowledgement) {
        followUpAcknowledgementRef.current = null;
      }
      if (admission.status === "rejected") {
        if (admission.rotateMessageId) {
          pendingFollowUpRef.current = null;
        }
        setComposerError(admission.message);
        return { message: admission.message, status: "failed" };
      }

      pendingFollowUpRef.current = null;
      setComposerError(null);
      return { status: "ok" };
    } catch (error) {
      if (followUpAcknowledgementRef.current === acknowledgement) {
        followUpAcknowledgementRef.current = null;
      }
      if (process.env.NODE_ENV !== "production") {
        console.error("Follow-up error:", error);
      }
      const message =
        error instanceof Error ? error.message : "Something went wrong.";
      setComposerError(message);
      return { message, status: "failed" };
    }
  }

  async function startChat(
    text: string,
    files: readonly FileUIPart[],
  ): Promise<void> {
    const fingerprint = createInitialStartFingerprint({
      files,
      modeId: selectedModeIdRef.current,
      projectId: projectIdRef.current,
      text,
    });
    const previous = pendingInitialStartRef.current;
    const pendingStart: PendingInitialChatStart =
      previous?.fingerprint === fingerprint
        ? previous
        : (() => {
            const threadId = crypto.randomUUID();
            return {
              fingerprint,
              messageId: `user:${threadId}:1`,
              threadId,
            };
          })();
    pendingInitialStartRef.current = pendingStart;
    replaceThreadIdInUrl(pendingStart.threadId);

    const parts: AppUIMessage["parts"] = [
      ...files,
      ...(text.length > 0 ? [{ text, type: "text" as const }] : []),
    ];
    await dispatchInitialStart(pendingStart, parts);
  }

  async function sendMessage(message: PromptInputMessage) {
    const text = message.text.trim();
    const hasText = text.length > 0;
    const rawFiles = message.rawFiles;
    const hasFiles = rawFiles.length > 0;
    if (!hasText && !hasFiles) return;

    if (isEndingSessionRef.current) {
      const error = new Error("This chat session is ending.");
      setComposerError(error.message);
      throw error;
    }

    if (isSendingMessageRef.current) {
      const error = new Error("A message is already being sent.");
      setComposerError(error.message);
      throw error;
    }
    isSendingMessageRef.current = true;

    try {
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
          throw error instanceof Error ? error : new Error(messageText);
        } finally {
          setIsUploadingAttachments(false);
        }
      }

      if (runIdRef.current && !isTerminalStatus(runStatusRef.current)) {
        if (runStatusRef.current !== "waiting") {
          const error = new Error("Wait for the current response to finish.");
          setComposerError(error.message);
          throw error;
        }

        const followUpResult = await sendFollowUp({
          ...(hasText ? { text } : {}),
          ...(uploadedFiles.length > 0 ? { files: uploadedFiles } : {}),
        });
        if (followUpResult.status === "ok") {
          return;
        }
        throw new Error(followUpResult.message);
      }

      await startChat(text, uploadedFiles);
    } finally {
      isSendingMessageRef.current = false;
    }
  }

  async function endSession() {
    const currentRunId = runIdRef.current;
    if (!currentRunId) {
      setMessages([]);
      setActiveThread(null);
      streamThreadIdRef.current = null;
      replaceThreadIdInUrl(null);
      return;
    }

    if (isTerminalStatus(runStatusRef.current)) {
      updateRunId(null);
      updateRunStatus(null);
      return;
    }

    if (isEndingSessionRef.current) return;
    updateEndingSession(true);

    try {
      const messageId =
        pendingEndMessageIdRef.current ??
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `done-${Date.now()}`);
      pendingEndMessageIdRef.current = messageId;
      const response = await fetch(`/api/chat/${currentRunId}`, {
        body: JSON.stringify({
          message: "/done",
          messageId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to end session.");
      }
      setComposerError(null);
      updateRunStatus("waiting");
    } catch (error) {
      updateEndingSession(false);
      setComposerError(
        error instanceof Error ? error.message : "Failed to end session.",
      );
    }
  }

  async function cancelSession() {
    const currentRunId = runIdRef.current;
    if (!currentRunId || isTerminalStatus(runStatusRef.current)) return;

    try {
      const response = await fetch(`/api/chat/${currentRunId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        setComposerError("Failed to cancel session.");
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const authoritativeStatus =
        body && typeof body === "object" && "status" in body
          ? (body as { status?: unknown }).status
          : null;
      if (
        authoritativeStatus !== "canceled" &&
        authoritativeStatus !== "failed" &&
        authoritativeStatus !== "succeeded"
      ) {
        setComposerError("Cancellation status was not confirmed.");
        return;
      }
      await stop();
      setComposerError(null);
      applyTerminalStatus(authoritativeStatus);
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
                    updateRunId(null);
                    updateRunStatus(null);
                    updateEndingSession(false);
                    streamThreadIdRef.current = null;
                    pendingInitialStartRef.current = null;
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
            disabled={isEndingSession || (!hasActiveSession && !hasMessages)}
            onClick={async () => {
              await endSession();
            }}
            type="button"
            variant="outline"
          >
            {isEndingSession
              ? "Ending…"
              : hasActiveSession
                ? "End Session"
                : "Clear Chat"}
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

                      {msg.parts.map((part, partIndex) => {
                        if (part.type === "file") {
                          return null;
                        }

                        if (part.type === "text") {
                          return (
                            <MessageResponse
                              key={
                                // biome-ignore lint/suspicious/noArrayIndexKey: AI SDK text parts have no stable ID; stream order is their identity.
                                `${msg.id}-text-${partIndex}`
                              }
                            >
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
                              key={
                                // biome-ignore lint/suspicious/noArrayIndexKey: AI SDK reasoning parts have no stable ID; stream order is their identity.
                                `${msg.id}-reason-${partIndex}`
                              }
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
                                key={`${msg.id}-tool-${tool.toolCallId}`}
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
                              key={`${msg.id}-tool-${tool.toolCallId}`}
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
          aria-busy={isEndingSession || isUploadingAttachments}
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
              disabled={isEndingSession}
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
                  disabled={isEndingSession || isUploadingAttachments}
                />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={isEndingSession || isUploadingAttachments}
              onStop={cancelSession}
              status={composerStatus}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
