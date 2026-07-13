"use client";

import { Loader2Icon } from "lucide-react";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { z } from "zod/mini";

import { Terminal } from "@/components/ai-elements/terminal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AppError,
  isAppError,
  tryReadJsonErrorMessage,
} from "@/lib/core/errors";
import {
  CODE_MODE_RUN_STATUS_HEADER,
  type CodeModeStreamEvent,
  codeModeStreamEventSchema,
  codeModeTerminalStatusSchema,
} from "@/workflows/_shared/workflow-stream-events";

type StreamStatus = "idle" | "streaming" | "done" | "error";
type TerminalStatus = Extract<
  CodeModeStreamEvent,
  { type: "terminal" }
>["status"];
type StreamReadResult = TerminalStatus | "interrupted" | "error" | "aborted";
const STREAM_EVENT_FLUSH_MS = 16;
const ACTIVE_RUN_IDENTITY_VERSION = 2 as const;

const runIdentityResponseSchema = z.strictObject({
  network: z.enum(["none", "restricted"]),
  projectId: z.string().check(z.minLength(1)),
  prompt: z.string(),
  runId: z.string().check(z.minLength(1)),
  status: z.enum([
    "pending",
    "running",
    "waiting",
    "blocked",
    "succeeded",
    "failed",
    "canceled",
  ]),
  workflowRunId: z.nullable(z.string().check(z.minLength(1))),
});

const discoveryResponseSchema = z.strictObject({
  run: z.nullable(runIdentityResponseSchema),
});

const activeRunIdentitySchema = z.strictObject({
  network: z.enum(["none", "restricted"]),
  projectId: z.string().check(z.minLength(1)),
  prompt: z.string().check(z.minLength(1)),
  runId: z.string().check(z.minLength(1)),
  version: z.literal(ACTIVE_RUN_IDENTITY_VERSION),
  workflowRunId: z.nullable(z.string().check(z.minLength(1))),
});

const uiMessageChunkSchema = z.looseObject({
  data: z.optional(z.unknown()),
  type: z.string(),
});

const MAX_OUTPUT_CHARS = 200_000;

type ActiveRunIdentity = Readonly<{
  network: "none" | "restricted";
  projectId: string;
  prompt: string;
  runId: string;
  version: typeof ACTIVE_RUN_IDENTITY_VERSION;
  workflowRunId: string | null;
}>;

type RunIdentityResponse = z.infer<typeof runIdentityResponseSchema>;

function toActiveRunIdentity(run: RunIdentityResponse): ActiveRunIdentity {
  return {
    network: run.network,
    projectId: run.projectId,
    prompt: run.prompt,
    runId: run.runId,
    version: ACTIVE_RUN_IDENTITY_VERSION,
    workflowRunId: run.workflowRunId,
  };
}

function appendOutput(current: string, next: string): string {
  if (!next) return current;
  const merged = current + next;
  if (merged.length <= MAX_OUTPUT_CHARS) return merged;
  return merged.slice(merged.length - MAX_OUTPUT_CHARS);
}

function formatToolLine(
  kind: "call" | "result",
  toolName: string,
  value: unknown,
): string {
  const payload =
    value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);
  const trimmed =
    payload.length > 5_000 ? `${payload.slice(0, 5_000)}…` : payload;
  return `\n[tool ${kind}] ${toolName}${trimmed ? `\n${trimmed}\n` : "\n"}`;
}

function readStartIndex(storageKey: string): number {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return 0;
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function getStartIndexStorageKeys(runId: string): Readonly<{
  legacy: string;
  v2: string;
}> {
  return {
    legacy: `workflow:code-mode:${runId}:startIndex`,
    v2: `workflow:code-mode:v2:${runId}:startIndex`,
  };
}

function migrateStartIndexStorage(runId: string): number {
  const keys = getStartIndexStorageKeys(runId);
  try {
    const v2Raw = window.sessionStorage.getItem(keys.v2);
    if (v2Raw !== null) {
      window.sessionStorage.removeItem(keys.legacy);
      return readStartIndex(keys.v2);
    }

    const legacyRaw = window.sessionStorage.getItem(keys.legacy);
    if (legacyRaw === null) return 0;

    const parsedLegacy = Number.parseInt(legacyRaw, 10);
    const normalizedLegacy =
      Number.isSafeInteger(parsedLegacy) && parsedLegacy >= 0
        ? parsedLegacy
        : 0;

    window.sessionStorage.setItem(keys.v2, String(normalizedLegacy));
    window.sessionStorage.removeItem(keys.legacy);
    return normalizedLegacy;
  } catch {
    return readStartIndex(keys.v2);
  }
}

function clearStartIndexStorage(runId: string): void {
  const keys = getStartIndexStorageKeys(runId);
  try {
    window.sessionStorage.removeItem(keys.v2);
    window.sessionStorage.removeItem(keys.legacy);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function persistStartIndex(storageKey: string, startIndex: number): void {
  try {
    window.sessionStorage.setItem(storageKey, String(startIndex));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function getActiveRunStorageKey(projectId: string): string {
  return `workflow:code-mode:active:v${ACTIVE_RUN_IDENTITY_VERSION}:${projectId}`;
}

function readActiveRunIdentity(projectId: string): ActiveRunIdentity | null {
  const storageKey = getActiveRunStorageKey(projectId);
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw === null) return null;

    const parsedJson: unknown = JSON.parse(raw);
    const parsed = activeRunIdentitySchema.safeParse(parsedJson);
    if (!parsed.success || parsed.data.projectId !== projectId) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    return parsed.data;
  } catch {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage failures (private mode, quota, etc.).
    }
    return null;
  }
}

function persistActiveRunIdentity(identity: ActiveRunIdentity): void {
  try {
    window.sessionStorage.setItem(
      getActiveRunStorageKey(identity.projectId),
      JSON.stringify(identity),
    );
  } catch {
    // The stream remains usable without refresh recovery.
  }
}

function clearActiveRunIdentity(projectId: string, runId: string): void {
  const storageKey = getActiveRunStorageKey(projectId);
  try {
    const active = readActiveRunIdentity(projectId);
    if (active?.runId === runId) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

async function requestCodeModeStart(
  identity: ActiveRunIdentity,
  signal: AbortSignal,
): Promise<RunIdentityResponse> {
  const res = await fetch("/api/code-mode", {
    body: JSON.stringify({
      network: identity.network,
      projectId: identity.projectId,
      prompt: identity.prompt,
      runId: identity.runId,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  });
  if (!res.ok) {
    const fromServer = await tryReadJsonErrorMessage(res);
    throw new AppError(
      "code_mode_start_rejected",
      res.status,
      fromServer ?? `Failed to start Code Mode (${res.status}).`,
    );
  }

  const jsonUnknown: unknown = await res.json();
  const parsed = runIdentityResponseSchema.safeParse(jsonUnknown);
  if (!parsed.success) {
    throw new Error("Unexpected response from server.");
  }
  if (
    parsed.data.projectId !== identity.projectId ||
    parsed.data.runId !== identity.runId
  ) {
    throw new Error("Server returned a different Code Mode run identity.");
  }
  return parsed.data;
}

async function discoverCodeModeRun(
  projectId: string,
  runId: string | null,
  signal: AbortSignal,
): Promise<RunIdentityResponse | null> {
  const url = new URL("/api/code-mode", window.location.origin);
  url.searchParams.set("projectId", projectId);
  if (runId) url.searchParams.set("runId", runId);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    const fromServer = await tryReadJsonErrorMessage(res);
    throw new Error(
      fromServer ?? `Failed to recover Code Mode (${res.status}).`,
    );
  }

  const jsonUnknown: unknown = await res.json();
  const parsed = discoveryResponseSchema.safeParse(jsonUnknown);
  if (!parsed.success) {
    throw new Error("Unexpected recovery response from server.");
  }
  if (parsed.data.run && parsed.data.run.projectId !== projectId) {
    throw new Error("Server returned a Code Mode run for another project.");
  }
  return parsed.data.run;
}

/**
 * Code Mode client UI (start, stream, cancel).
 *
 * @param props - Props including projectId.
 * @returns Code Mode client UI.
 */
export function CodeModeClient(props: Readonly<{ projectId: string }>) {
  const promptId = useId();
  const networkTriggerId = useId();
  const errorId = useId();

  const [prompt, setPrompt] = useState(
    "Run `bun run test` and summarize any failures.",
  );
  const [network, setNetwork] = useState<"none" | "restricted">("none");

  const [runId, setRunId] = useState<string | null>(null);
  const [workflowRunId, setWorkflowRunId] = useState<string | null>(null);
  const [hasActiveRun, setHasActiveRun] = useState(false);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [reconnectSeed, setReconnectSeed] = useState(0);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const startInFlightRef = useRef(false);

  const settleUnlinkedTerminal = useCallback(
    (run: RunIdentityResponse): boolean => {
      if (
        run.workflowRunId ||
        (run.status !== "canceled" &&
          run.status !== "failed" &&
          run.status !== "succeeded")
      ) {
        return false;
      }

      clearActiveRunIdentity(props.projectId, run.runId);
      activeRunIdRef.current = null;
      setRunId(run.runId);
      setWorkflowRunId(null);
      setHasActiveRun(false);
      setWasInterrupted(false);
      setCancelRequested(false);
      setStatus(run.status === "failed" ? "error" : "done");
      setError(run.status === "failed" ? "Code Mode failed." : null);
      return true;
    },
    [props.projectId],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const stored = readActiveRunIdentity(props.projectId);
    const controller = new AbortController();

    function activate(identity: ActiveRunIdentity): void {
      persistActiveRunIdentity(identity);
      activeRunIdRef.current = identity.runId;
      setPrompt(identity.prompt);
      setNetwork(identity.network);
      setRunId(identity.runId);
      setWorkflowRunId(identity.workflowRunId);
      setHasActiveRun(true);
      setStatus("streaming");
      setWasInterrupted(false);
      setCancelRequested(false);
      setError(null);
    }

    function resetIdle(): void {
      activeRunIdRef.current = null;
      setRunId(null);
      setWorkflowRunId(null);
      setHasActiveRun(false);
      setStatus("idle");
      setWasInterrupted(false);
      setCancelRequested(false);
      setError(null);
      setOutput("");
    }

    if (stored?.workflowRunId) {
      activate(stored);
      return () => controller.abort();
    }

    startInFlightRef.current = true;
    setIsDiscovering(true);
    if (stored) activate(stored);

    async function recover(): Promise<void> {
      try {
        let discovered = await discoverCodeModeRun(
          props.projectId,
          stored?.runId ?? null,
          controller.signal,
        );
        if (!discovered && stored?.runId) {
          discovered = await discoverCodeModeRun(
            props.projectId,
            null,
            controller.signal,
          );
        }
        if (!discovered) {
          if (stored) clearActiveRunIdentity(props.projectId, stored.runId);
          resetIdle();
          return;
        }
        if (settleUnlinkedTerminal(discovered)) return;

        let identity = toActiveRunIdentity(discovered);
        activate(identity);
        if (
          !identity.workflowRunId &&
          discovered.status !== "canceled" &&
          discovered.status !== "failed" &&
          discovered.status !== "succeeded"
        ) {
          const restarted = await requestCodeModeStart(
            identity,
            controller.signal,
          );
          if (settleUnlinkedTerminal(restarted)) return;
          identity = toActiveRunIdentity(restarted);
          activate(identity);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Failed to recover Code Mode.",
        );
        setStatus("error");
      } finally {
        if (!controller.signal.aborted) {
          startInFlightRef.current = false;
          setIsDiscovering(false);
        }
      }
    }

    void recover();
    return () => controller.abort();
  }, [props.projectId, settleUnlinkedTerminal]);

  useEffect(() => {
    if (!runId || workflowRunId || !hasActiveRun) return;
    void reconnectSeed; // Re-run registration discovery on manual reconnect.

    const controller = new AbortController();
    const pollDelaysMs = [150, 400, 1000, 2000] as const;

    async function pollForWorkflowRegistration(): Promise<void> {
      for (const delayMs of pollDelaysMs) {
        await new Promise<void>((resolve) => {
          const timeoutId = window.setTimeout(resolve, delayMs);
          controller.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timeoutId);
              resolve();
            },
            { once: true },
          );
        });
        if (controller.signal.aborted) return;

        const discovered = await discoverCodeModeRun(
          props.projectId,
          runId,
          controller.signal,
        );
        if (!discovered) continue;
        if (settleUnlinkedTerminal(discovered)) return;

        const identity = toActiveRunIdentity(discovered);
        persistActiveRunIdentity(identity);
        if (identity.workflowRunId) {
          setPrompt(identity.prompt);
          setNetwork(identity.network);
          setWorkflowRunId(identity.workflowRunId);
          setStatus("streaming");
          setError(null);
          return;
        }
      }

      setStatus("error");
      setWasInterrupted(true);
      setError(
        "Code Mode is still starting. Its run identity is saved; reconnect or reload to reconcile it.",
      );
    }

    void pollForWorkflowRegistration().catch((err: unknown) => {
      if (controller.signal.aborted) return;
      setStatus("error");
      setWasInterrupted(true);
      setError(
        err instanceof Error ? err.message : "Failed to reconcile Code Mode.",
      );
    });
    return () => controller.abort();
  }, [
    hasActiveRun,
    props.projectId,
    reconnectSeed,
    runId,
    settleUnlinkedTerminal,
    workflowRunId,
  ]);

  const start = async () => {
    if (startInFlightRef.current || activeRunIdRef.current) return;
    startInFlightRef.current = true;

    abortRef.current?.abort();
    const startController = new AbortController();
    abortRef.current = startController;

    const pendingIdentity: ActiveRunIdentity = {
      network,
      projectId: props.projectId,
      prompt,
      runId: crypto.randomUUID(),
      version: ACTIVE_RUN_IDENTITY_VERSION,
      workflowRunId: null,
    };
    persistActiveRunIdentity(pendingIdentity);
    activeRunIdRef.current = pendingIdentity.runId;

    setError(null);
    setOutput("");
    setWasInterrupted(false);
    setCancelRequested(false);
    setStatus("streaming");
    setRunId(pendingIdentity.runId);
    setWorkflowRunId(null);
    setHasActiveRun(true);

    try {
      const started = await requestCodeModeStart(
        pendingIdentity,
        startController.signal,
      );
      if (settleUnlinkedTerminal(started)) return;
      const identity = toActiveRunIdentity(started);
      persistActiveRunIdentity(identity);
      setWorkflowRunId(identity.workflowRunId);
    } catch (startError) {
      if (startController.signal.aborted) return;
      if (
        isAppError(startError) &&
        startError.status >= 400 &&
        startError.status < 500
      ) {
        clearActiveRunIdentity(props.projectId, pendingIdentity.runId);
        activeRunIdRef.current = null;
        setRunId(null);
        setWorkflowRunId(null);
        setHasActiveRun(false);
        setStatus("error");
        setWasInterrupted(false);
        setError(startError.message);
        return;
      }
      try {
        let recovered = await discoverCodeModeRun(
          props.projectId,
          pendingIdentity.runId,
          startController.signal,
        );
        if (!recovered) {
          recovered = await discoverCodeModeRun(
            props.projectId,
            null,
            startController.signal,
          );
        }
        if (!recovered) {
          const retried = await requestCodeModeStart(
            pendingIdentity,
            startController.signal,
          );
          recovered = retried;
        }
        if (settleUnlinkedTerminal(recovered)) return;

        let identity = toActiveRunIdentity(recovered);
        if (
          !identity.workflowRunId &&
          recovered.status !== "canceled" &&
          recovered.status !== "failed" &&
          recovered.status !== "succeeded"
        ) {
          const retried = await requestCodeModeStart(
            identity,
            startController.signal,
          );
          if (settleUnlinkedTerminal(retried)) return;
          identity = toActiveRunIdentity(retried);
        }
        persistActiveRunIdentity(identity);
        activeRunIdRef.current = identity.runId;
        setPrompt(identity.prompt);
        setNetwork(identity.network);
        setRunId(identity.runId);
        setWorkflowRunId(identity.workflowRunId);
        setHasActiveRun(true);
      } catch (recoveryError) {
        try {
          const preserved = await discoverCodeModeRun(
            props.projectId,
            pendingIdentity.runId,
            startController.signal,
          );
          if (preserved) {
            if (settleUnlinkedTerminal(preserved)) return;
            const identity = toActiveRunIdentity(preserved);
            persistActiveRunIdentity(identity);
            activeRunIdRef.current = identity.runId;
            setRunId(identity.runId);
            setWorkflowRunId(identity.workflowRunId);
            setHasActiveRun(true);
            setStatus(identity.workflowRunId ? "streaming" : "error");
            setWasInterrupted(!identity.workflowRunId);
            setError(
              identity.workflowRunId
                ? null
                : "Code Mode is still starting. Its run identity is saved.",
            );
            return;
          }
        } catch {
          // Fall through only when the canonical run cannot be confirmed.
        }
        // Never discard the pre-POST identity on an ambiguous transport path.
        // The registration poll or a reload can still recover an accepted run.
        persistActiveRunIdentity(pendingIdentity);
        activeRunIdRef.current = pendingIdentity.runId;
        setRunId(pendingIdentity.runId);
        setWorkflowRunId(null);
        setHasActiveRun(true);
        setStatus("error");
        setWasInterrupted(true);
        setError(
          recoveryError instanceof Error
            ? `${recoveryError.message} The run identity is saved for reconciliation.`
            : "Failed to confirm Code Mode startup. The run identity is saved for reconciliation.",
        );
      }
    } finally {
      startInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!runId || !workflowRunId || activeRunIdRef.current !== runId) return;
    void reconnectSeed; // Reference to trigger effect re-run on reconnect requests

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const currentRunId = runId;
    const storageKeys = getStartIndexStorageKeys(currentRunId);
    const storageKey = storageKeys.v2;
    let startIndex = migrateStartIndexStorage(currentRunId);
    const autoReconnectDelaysMs = [250, 750, 1500] as const;

    async function openAndReadOnce(
      controller: AbortController,
    ): Promise<StreamReadResult> {
      let flushTimer: number | null = null;
      let pendingText = "";

      const flush = () => {
        if (!pendingText) return;
        const next = pendingText;
        pendingText = "";
        startTransition(() => setOutput((prev) => appendOutput(prev, next)));
      };

      const scheduleFlush = () => {
        if (flushTimer !== null) return;
        flushTimer = window.setTimeout(() => {
          flushTimer = null;
          flush();
        }, STREAM_EVENT_FLUSH_MS);
      };

      const url = new URL(
        `/api/code-mode/${currentRunId}/stream`,
        window.location.origin,
      );
      if (startIndex > 0) {
        url.searchParams.set("startIndex", String(startIndex));
      }

      let res: Response;
      try {
        res = await fetch(url.toString(), {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) return "aborted";
        setError(err instanceof Error ? err.message : "Stream disconnected.");
        return "error";
      }

      if (!res.ok) {
        const fromServer = await tryReadJsonErrorMessage(res);
        const message = fromServer ?? `Failed to open stream (${res.status}).`;
        setError(message);
        setStatus("error");
        return "error";
      }

      const persistedTerminalStatus = codeModeTerminalStatusSchema.safeParse(
        res.headers.get(CODE_MODE_RUN_STATUS_HEADER),
      );
      const finishFromPersistedStatus = (): TerminalStatus | null => {
        if (!persistedTerminalStatus.success) return null;
        pendingText += `\n\n[${persistedTerminalStatus.data}]\n`;
        flush();
        return persistedTerminalStatus.data;
      };

      const body = res.body;
      if (!body) {
        const terminalStatus = finishFromPersistedStatus();
        if (terminalStatus) return terminalStatus;
        setError("Stream response body is missing.");
        setStatus("error");
        return "error";
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const boundary = buffer.indexOf("\n\n");
            if (boundary === -1) break;

            const eventText = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);

            for (const line of eventText.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trimStart();
              if (data === "[DONE]") {
                return finishFromPersistedStatus() ?? "interrupted";
              }

              let jsonUnknown: unknown;
              try {
                jsonUnknown = JSON.parse(data);
              } catch {
                continue;
              }

              startIndex += 1;
              persistStartIndex(storageKey, startIndex);

              const chunkParsed = uiMessageChunkSchema.safeParse(jsonUnknown);
              if (!chunkParsed.success) continue;
              if (chunkParsed.data.type !== "data-workflow") {
                continue;
              }

              const eventParsed = codeModeStreamEventSchema.safeParse(
                chunkParsed.data.data,
              );
              if (!eventParsed.success) continue;

              const ev = eventParsed.data;
              switch (ev.type) {
                case "status": {
                  pendingText += `\n[status] ${ev.message}\n`;
                  scheduleFlush();
                  break;
                }
                case "log": {
                  pendingText += ev.data;
                  scheduleFlush();
                  break;
                }
                case "assistant-delta": {
                  pendingText += ev.textDelta;
                  scheduleFlush();
                  break;
                }
                case "tool-call": {
                  pendingText += formatToolLine("call", ev.toolName, ev.input);
                  scheduleFlush();
                  break;
                }
                case "tool-result": {
                  pendingText += formatToolLine(
                    "result",
                    ev.toolName,
                    ev.output,
                  );
                  scheduleFlush();
                  break;
                }
                case "terminal": {
                  pendingText += `\n\n[${ev.status}]\n`;
                  scheduleFlush();
                  flush();
                  return ev.status;
                }
              }
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return "aborted";
        const terminalStatus = finishFromPersistedStatus();
        if (terminalStatus) return terminalStatus;
        setError(err instanceof Error ? err.message : "Stream disconnected.");
        return "error";
      } finally {
        if (flushTimer !== null) {
          window.clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (!controller.signal.aborted) {
          flush();
        }
        try {
          reader.releaseLock();
        } catch {
          // Ignore.
        }
      }

      if (controller.signal.aborted) return "aborted";
      return finishFromPersistedStatus() ?? "interrupted";
    }

    async function run(controller: AbortController) {
      setStatus("streaming");
      setError(null);
      setWasInterrupted(false);

      for (
        let attempt = 0;
        attempt <= autoReconnectDelaysMs.length;
        attempt++
      ) {
        const result = await openAndReadOnce(controller);
        if (result === "aborted") return;
        if (
          result === "succeeded" ||
          result === "failed" ||
          result === "canceled"
        ) {
          setStatus(result === "failed" ? "error" : "done");
          setError(result === "failed" ? "Code Mode failed." : null);
          setWasInterrupted(false);
          setCancelRequested(false);
          setHasActiveRun(false);
          if (activeRunIdRef.current === currentRunId) {
            activeRunIdRef.current = null;
          }
          clearStartIndexStorage(currentRunId);
          clearActiveRunIdentity(props.projectId, currentRunId);
          return;
        }

        setWasInterrupted(true);
        setStatus(result === "error" ? "error" : "done");

        if (attempt >= autoReconnectDelaysMs.length) return;

        const delayMs = autoReconnectDelaysMs[attempt] ?? 0;
        await new Promise<void>((resolve) => {
          const id = window.setTimeout(resolve, delayMs);
          controller.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(id);
              resolve();
            },
            { once: true },
          );
        });

        if (controller.signal.aborted) return;
        setStatus("streaming");
        setError(null);
      }
    }

    run(abort).catch((err: unknown) => {
      if (abort.signal.aborted) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Stream disconnected.");
    });
    return () => {
      abort.abort();
      if (abortRef.current === abort) {
        abortRef.current = null;
      }
    };
  }, [props.projectId, reconnectSeed, runId, workflowRunId]);

  const cancel = async () => {
    if (!runId || cancelRequested) return;

    setError(null);
    setCancelRequested(true);

    try {
      const res = await fetch(`/api/code-mode/${runId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const fromServer = await tryReadJsonErrorMessage(res);
        setError(fromServer ?? `Failed to cancel (${res.status}).`);
        setCancelRequested(false);
        return;
      }
      setCancelRequested(false);
      if (!workflowRunId) {
        const recovered = await discoverCodeModeRun(
          props.projectId,
          runId,
          new AbortController().signal,
        );
        if (recovered && settleUnlinkedTerminal(recovered)) return;
        if (recovered?.workflowRunId) {
          const identity = toActiveRunIdentity(recovered);
          persistActiveRunIdentity(identity);
          setWorkflowRunId(identity.workflowRunId);
        }
      }
      if (activeRunIdRef.current === runId) {
        setReconnectSeed((prev) => prev + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel.");
      setCancelRequested(false);
      return;
    }
  };

  const isRunLocked = isDiscovering || status === "streaming" || hasActiveRun;

  return (
    <div aria-describedby={error ? errorId : undefined} className="space-y-4">
      {error ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className="text-destructive text-sm"
          id={errorId}
        >
          {error}
        </p>
      ) : null}

      <form
        className="grid gap-4 rounded-xl border bg-muted/20 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor={promptId}>
            Prompt
          </label>
          <Input
            autoCapitalize="sentences"
            autoComplete="off"
            disabled={isRunLocked}
            id={promptId}
            name="prompt"
            onChange={(e) => setPrompt(e.target.value)}
            value={prompt}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label
              className="text-muted-foreground text-sm"
              htmlFor={networkTriggerId}
            >
              Network:
            </label>
            <Select
              disabled={isRunLocked}
              onValueChange={(v) => {
                if (v === "restricted" || v === "none") setNetwork(v);
              }}
              value={network}
            >
              <SelectTrigger className="h-9 w-[200px]" id={networkTriggerId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="restricted">Restricted</SelectItem>
                <SelectItem value="none">No access</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveRun && runId ? (
              <Button
                aria-busy={cancelRequested}
                disabled={cancelRequested}
                onClick={() => void cancel()}
                type="button"
                variant="outline"
              >
                {cancelRequested ? "Cancellation requested…" : "Cancel"}
              </Button>
            ) : null}
            <Button
              aria-busy={isDiscovering || status === "streaming"}
              disabled={isRunLocked}
              type="submit"
              variant="secondary"
            >
              {isDiscovering || status === "streaming" ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="size-4 motion-safe:animate-spin motion-reduce:animate-none"
                />
              ) : null}
              {isDiscovering
                ? "Checking active run…"
                : status === "streaming"
                  ? "Running…"
                  : hasActiveRun
                    ? "Run active"
                    : "Start Code Mode"}
            </Button>
          </div>
        </div>

        {runId ? (
          <p className="text-muted-foreground text-sm">
            Run: <span className="font-mono">{runId}</span>
            {workflowRunId ? (
              <>
                {" "}
                · Workflow: <span className="font-mono">{workflowRunId}</span>
              </>
            ) : null}
          </p>
        ) : null}

        {wasInterrupted && status !== "streaming" ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
            <p className="text-muted-foreground text-sm">
              Stream ended before a finish chunk. The run may still be in
              progress.
            </p>
            <Button
              onClick={() => setReconnectSeed((prev) => prev + 1)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Reconnect
            </Button>
          </div>
        ) : null}
      </form>

      <Terminal
        mode={status === "streaming" ? "streaming" : "static"}
        onClear={() => setOutput("")}
        output={output}
      />
    </div>
  );
}
