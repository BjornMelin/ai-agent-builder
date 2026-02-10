"use client";

import { Loader2Icon } from "lucide-react";
import { startTransition, useEffect, useId, useRef, useState } from "react";
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
import { tryReadJsonErrorMessage } from "@/lib/core/errors";

type StreamStatus = "idle" | "streaming" | "done" | "error";
const STREAM_EVENT_FLUSH_MS = 16;

const startResponseSchema = z.looseObject({
  runId: z.optional(z.string()),
  workflowRunId: z.optional(z.string()),
});

const uiMessageChunkSchema = z.looseObject({
  data: z.optional(z.unknown()),
  type: z.string(),
});

const codeModeEventSchema = z.looseObject({
  data: z.optional(z.string()),
  exitCode: z.optional(z.number()),
  input: z.optional(z.unknown()),
  message: z.optional(z.string()),
  output: z.optional(z.unknown()),
  stream: z.optional(z.enum(["stdout", "stderr"])),
  textDelta: z.optional(z.string()),
  timestamp: z.optional(z.number()),
  toolName: z.optional(z.string()),
  type: z.enum([
    "assistant-delta",
    "exit",
    "log",
    "status",
    "tool-call",
    "tool-result",
  ]),
});

const MAX_OUTPUT_CHARS = 200_000;

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

function persistStartIndex(storageKey: string, startIndex: number): void {
  try {
    window.sessionStorage.setItem(storageKey, String(startIndex));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
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
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [reconnectSeed, setReconnectSeed] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const start = async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setError(null);
    setOutput("");
    setWasInterrupted(false);
    setStatus("streaming");

    let res: Response;
    try {
      res = await fetch("/api/code-mode", {
        body: JSON.stringify({
          network,
          projectId: props.projectId,
          prompt,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: abortRef.current.signal,
      });
    } catch (err) {
      if (abortRef.current.signal.aborted) return;
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Failed to start Code Mode.",
      );
      return;
    }

    if (!res.ok) {
      const fromServer = await tryReadJsonErrorMessage(res);
      const message =
        fromServer ?? `Failed to start Code Mode (${res.status}).`;
      setStatus("error");
      setError(message);
      return;
    }

    let parsedRunId: string | null = null;
    let parsedWorkflowRunId: string | null = null;
    try {
      const jsonUnknown: unknown = await res.json();
      const parsed = startResponseSchema.safeParse(jsonUnknown);
      if (!parsed.success) {
        throw new Error("Unexpected response from server.");
      }
      parsedRunId = parsed.data.runId ?? null;
      parsedWorkflowRunId = parsed.data.workflowRunId ?? null;
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Failed to parse response.",
      );
      return;
    }

    if (!parsedRunId) {
      setStatus("error");
      setError("Server did not return a runId.");
      return;
    }

    setRunId(parsedRunId);
    setWorkflowRunId(parsedWorkflowRunId);

    try {
      window.sessionStorage.removeItem(
        `workflow:code-mode:v1:${parsedRunId}:startIndex`,
      );
    } catch {
      // Ignore.
    }
  };

  useEffect(() => {
    if (!runId) return;
    void reconnectSeed; // Reference to trigger effect re-run on reconnect requests

    const abort = abortRef.current;
    if (!abort) return;

    const currentRunId = runId;
    const storageKey = `workflow:code-mode:v1:${currentRunId}:startIndex`;

    let startIndex = readStartIndex(storageKey);
    const autoReconnectDelaysMs = [250, 750, 1500] as const;

    async function openAndReadOnce(
      controller: AbortController,
    ): Promise<"done" | "interrupted" | "error" | "aborted"> {
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

      const body = res.body;
      if (!body) {
        setError("Stream response body is missing.");
        setStatus("error");
        return "error";
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawDone = false;

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
                sawDone = true;
                return "done";
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
              if (chunkParsed.data.type !== "data-code-mode") continue;

              const eventParsed = codeModeEventSchema.safeParse(
                chunkParsed.data.data,
              );
              if (!eventParsed.success) continue;

              const ev = eventParsed.data;
              switch (ev.type) {
                case "status": {
                  pendingText += `\n[status] ${ev.message ?? ""}\n`;
                  scheduleFlush();
                  break;
                }
                case "log": {
                  pendingText += ev.data ?? "";
                  scheduleFlush();
                  break;
                }
                case "assistant-delta": {
                  pendingText += ev.textDelta ?? "";
                  scheduleFlush();
                  break;
                }
                case "tool-call": {
                  pendingText += formatToolLine(
                    "call",
                    ev.toolName ?? "tool",
                    ev.input,
                  );
                  scheduleFlush();
                  break;
                }
                case "tool-result": {
                  pendingText += formatToolLine(
                    "result",
                    ev.toolName ?? "tool",
                    ev.output,
                  );
                  scheduleFlush();
                  break;
                }
                case "exit": {
                  const code = ev.exitCode ?? 0;
                  pendingText += `\n\n[exit ${code}]\n`;
                  scheduleFlush();
                  flush();
                  setStatus("done");
                  return "done";
                }
              }
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return "aborted";
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
      return sawDone ? "done" : "interrupted";
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
        if (result === "done") {
          setStatus("done");
          setWasInterrupted(false);
          if (startIndex > 0) {
            try {
              window.sessionStorage.removeItem(storageKey);
            } catch {
              // Ignore.
            }
          }
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
  }, [reconnectSeed, runId]);

  const cancel = async () => {
    if (!runId) return;

    abortRef.current?.abort();
    abortRef.current = null;

    setError(null);

    try {
      const res = await fetch(`/api/code-mode/${runId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        setError(`Failed to cancel (${res.status}).`);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel.");
      return;
    }

    setStatus("done");
  };

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
            disabled={status === "streaming"}
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
              disabled={status === "streaming"}
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
            {status === "streaming" && runId ? (
              <Button
                onClick={() => void cancel()}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            ) : null}
            <Button
              aria-busy={status === "streaming"}
              disabled={status === "streaming"}
              type="submit"
              variant="secondary"
            >
              {status === "streaming" ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="size-4 motion-safe:animate-spin motion-reduce:animate-none"
                />
              ) : null}
              {status === "streaming" ? "Running…" : "Start Code Mode"}
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
