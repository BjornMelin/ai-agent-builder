"use client";

import type { UIMessageChunk } from "ai";
import { useEffect, useState } from "react";

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
import { Button } from "@/components/ui/button";
import {
  type RunStreamEvent,
  runStreamEventSchema,
} from "@/lib/runs/run-stream";

type StreamStatus = "idle" | "streaming" | "done" | "error";
const STREAM_EVENT_FLUSH_MS = 16;

function toMarkdown(event: RunStreamEvent): string {
  switch (event.type) {
    case "run-started":
      return `**Run started**\\n\\n- Kind: \`${event.kind}\`\\n- Workflow: \`${event.workflowRunId}\``;
    case "step-started":
      return `**Step started**\\n\\n- \`${event.stepId}\`\\n- ${event.stepName}`;
    case "step-finished": {
      const header = `**Step ${event.status}**\\n\\n- \`${event.stepId}\``;
      const outputs =
        event.outputs && Object.keys(event.outputs).length > 0
          ? `\\n\\n\`\`\`json\\n${JSON.stringify(event.outputs, null, 2)}\\n\`\`\``
          : "";
      const error =
        event.error && Object.keys(event.error).length > 0
          ? `\\n\\n**Error**\\n\\n\`\`\`json\\n${JSON.stringify(event.error, null, 2)}\\n\`\`\``
          : "";
      return `${header}${outputs}${error}`;
    }
    case "run-finished":
      if (event.status === "canceled") {
        return "**Run canceled**";
      }
      if (event.status === "failed") {
        return "**Run failed**";
      }
      if (event.status === "succeeded") {
        return "**Run succeeded**";
      }
      return `**Run finished**\\n\\n- Status: \`${event.status}\``;
  }
}

function readStartIndex(storageKey: string): number {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
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
 * Client-side run stream reader.
 *
 * @remarks
 * Uses the AI SDK's SSE response format to resume stream reading by `startIndex`.
 *
 * @param props - Client props.
 * @returns Stream UI.
 */
export function RunStreamClient(props: Readonly<{ runId: string }>) {
  const storageKey = `workflow:runs:v1:${props.runId}:startIndex`;
  const [events, setEvents] = useState<RunStreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [reconnectSeed, setReconnectSeed] = useState(0);

  useEffect(() => {
    // Used as a manual "restart stream" trigger for this effect.
    void reconnectSeed;

    const abort = new AbortController();
    let startIndex = readStartIndex(storageKey);

    const autoReconnectDelaysMs = [250, 750, 1500] as const;

    async function openAndReadOnce(): Promise<
      "done" | "interrupted" | "error" | "aborted"
    > {
      let pendingEvents: RunStreamEvent[] = [];
      let flushTimer: number | null = null;
      const flushPendingEvents = () => {
        if (pendingEvents.length === 0) {
          return;
        }
        const nextEvents = pendingEvents;
        pendingEvents = [];
        setEvents((prev) => prev.concat(nextEvents));
      };
      const scheduleFlush = () => {
        if (flushTimer !== null) {
          return;
        }
        flushTimer = window.setTimeout(() => {
          flushTimer = null;
          flushPendingEvents();
        }, STREAM_EVENT_FLUSH_MS);
      };

      const url = new URL(
        `/api/runs/${props.runId}/stream`,
        window.location.origin,
      );
      if (startIndex > 0) {
        url.searchParams.set("startIndex", String(startIndex));
      }

      let res: Response;
      try {
        res = await fetch(url.toString(), {
          headers: { Accept: "text/event-stream" },
          signal: abort.signal,
        });
      } catch (err) {
        if (abort.signal.aborted) return "aborted";
        setError(err instanceof Error ? err.message : "Stream disconnected.");
        return "error";
      }

      if (!res.ok) {
        let message = `Failed to open stream (${res.status}).`;
        try {
          const json = (await res.json()) as unknown;
          const errorMessage = (json as { error?: { message?: unknown } })
            ?.error?.message;
          if (typeof errorMessage === "string" && errorMessage.length > 0) {
            message = errorMessage;
          }
        } catch {
          // Ignore JSON parsing errors.
        }
        setStatus("error");
        setError(message);
        return "error";
      }

      const body = res.body;
      if (!body) {
        setStatus("error");
        setError("Stream response body is missing.");
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

            const lines = eventText.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;

              const data = line.slice(5).trimStart();
              if (data === "[DONE]") {
                sawDone = true;
                return "done";
              }

              let chunkUnknown: unknown;
              try {
                chunkUnknown = JSON.parse(data);
              } catch {
                continue;
              }

              startIndex += 1;
              persistStartIndex(storageKey, startIndex);

              const chunk = chunkUnknown as UIMessageChunk;
              if (chunk.type !== "data-workflow") continue;
              if (!("data" in chunk)) continue;

              const parsed = runStreamEventSchema.safeParse(chunk.data);
              if (!parsed.success) continue;

              pendingEvents.push(parsed.data);
              scheduleFlush();
            }
          }
        }
      } catch (err) {
        if (abort.signal.aborted) return "aborted";
        setError(err instanceof Error ? err.message : "Stream disconnected.");
        return "error";
      } finally {
        if (flushTimer !== null) {
          window.clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (!abort.signal.aborted) {
          flushPendingEvents();
        }
        try {
          reader.releaseLock();
        } catch {
          // Ignore.
        }
      }

      if (abort.signal.aborted) return "aborted";
      return sawDone ? "done" : "interrupted";
    }

    async function run() {
      setStatus("streaming");
      setError(null);
      setWasInterrupted(false);

      for (
        let attempt = 0;
        attempt <= autoReconnectDelaysMs.length;
        attempt++
      ) {
        const result = await openAndReadOnce();
        if (result === "aborted") {
          return;
        }

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

        // Ensure we never remain in the streaming state after an unexpected stream termination.
        setStatus(result === "error" ? "error" : "done");

        if (attempt >= autoReconnectDelaysMs.length) {
          return;
        }

        // Backoff then reconnect from the last processed chunk index.
        const delayMs = autoReconnectDelaysMs[attempt] ?? 0;
        await new Promise<void>((resolve) => {
          const id = window.setTimeout(resolve, delayMs);
          abort.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(id);
              resolve();
            },
            { once: true },
          );
        });

        if (abort.signal.aborted) return;
        setStatus("streaming");
        setError(null);
      }
    }

    void run();

    return () => {
      abort.abort();
    };
  }, [props.runId, reconnectSeed, storageKey]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">
            Stream:{" "}
            <span className="font-medium text-foreground">
              {status === "streaming" ? "streaming" : status}
            </span>
          </p>
          {wasInterrupted && status !== "streaming" ? (
            <p className="text-muted-foreground text-sm">
              Stream ended before a finish chunk. The run may still be in
              progress.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {wasInterrupted && status !== "streaming" ? (
            <Button
              onClick={() => {
                setReconnectSeed((prev) => prev + 1);
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Reconnect
            </Button>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
      </div>

      <div className="h-[460px] overflow-hidden rounded-md border bg-card">
        <Conversation className="h-full">
          <ConversationContent>
            {events.length === 0 ? (
              <ConversationEmptyState
                description="Waiting for run events…"
                title="No events yet"
              />
            ) : (
              events.map((ev, index) => (
                <Message
                  from="assistant"
                  key={`${ev.type}-${ev.runId}-${index}`}
                >
                  <MessageContent>
                    <MessageResponse>{toMarkdown(ev)}</MessageResponse>
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>
    </div>
  );
}
