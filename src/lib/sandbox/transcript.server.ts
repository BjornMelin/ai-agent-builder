import "server-only";

import { redactSandboxLog } from "@/lib/sandbox/redaction.server";

export type SandboxLogStream = "stdout" | "stderr";

export type SandboxLogEntry = Readonly<{
  data: string;
  stream: SandboxLogStream;
}>;

export type SandboxTranscript = Readonly<{
  combined: string;
  stderr: string;
  stdout: string;
  truncated: boolean;
}>;

type TranscriptBufferOptions = Readonly<{
  /**
   * Maximum characters to keep for the combined transcript.
   */
  maxCombinedChars: number;
  /**
   * Maximum characters to keep for each stream transcript (`stdout`, `stderr`).
   */
  maxStreamChars: number;
}>;

const DEFAULT_TRANSCRIPT_LIMITS: TranscriptBufferOptions = {
  maxCombinedChars: 200_000,
  maxStreamChars: 100_000,
};

class BoundedStringBuffer {
  private chunks: string[] = [];
  private startIndex = 0;
  private storedLength = 0;
  private didTruncate = false;

  public constructor(private readonly maxChars: number) {}

  public append(text: string): void {
    if (text.length === 0) return;
    this.chunks.push(text);
    this.storedLength += text.length;
    this.trimToLimit();
  }

  public toString(): string {
    if (this.startIndex === 0) return this.chunks.join("");
    return this.chunks.slice(this.startIndex).join("");
  }

  public get truncated(): boolean {
    return this.didTruncate;
  }

  private trimToLimit(): void {
    if (this.storedLength <= this.maxChars) return;
    this.didTruncate = true;

    let over = this.storedLength - this.maxChars;
    while (over > 0 && this.startIndex < this.chunks.length) {
      const chunk = this.chunks[this.startIndex];
      if (!chunk) break;

      if (chunk.length <= over) {
        over -= chunk.length;
        this.storedLength -= chunk.length;
        this.startIndex += 1;
        continue;
      }

      this.chunks[this.startIndex] = chunk.slice(over);
      this.storedLength -= over;
      over = 0;
    }

    // Periodically compact to avoid unbounded growth in the prefix.
    if (this.startIndex > 64 && this.startIndex > this.chunks.length / 2) {
      this.chunks = this.chunks.slice(this.startIndex);
      this.startIndex = 0;
    }
  }
}

/**
 * Collects and redacts sandbox logs into bounded transcript buffers.
 *
 * @remarks
 * This collector keeps only a tail of the transcript in memory to prevent
 * unbounded growth for long-running jobs.
 */
export class SandboxTranscriptCollector {
  private readonly combined: BoundedStringBuffer;
  private readonly stdout: BoundedStringBuffer;
  private readonly stderr: BoundedStringBuffer;

  /**
   * Create a transcript collector.
   *
   * @param options - Transcript buffer limits.
   */
  public constructor(options: Partial<TranscriptBufferOptions> = {}) {
    const limits: TranscriptBufferOptions = {
      ...DEFAULT_TRANSCRIPT_LIMITS,
      ...options,
    };

    this.combined = new BoundedStringBuffer(limits.maxCombinedChars);
    this.stdout = new BoundedStringBuffer(limits.maxStreamChars);
    this.stderr = new BoundedStringBuffer(limits.maxStreamChars);
  }

  /**
   * Append a log entry to the transcript, redacting secrets.
   *
   * @param entry - Log entry (stdout or stderr).
   * @param options - Optional redaction settings.
   * @returns Redacted text that was appended.
   */
  public append(
    entry: SandboxLogEntry,
    options: Readonly<{ extraSecrets?: readonly string[] }> = {},
  ): string {
    const redacted = redactSandboxLog(entry.data, {
      ...(options.extraSecrets ? { extraSecrets: options.extraSecrets } : {}),
    });

    this.combined.append(redacted);
    if (entry.stream === "stdout") {
      this.stdout.append(redacted);
    } else {
      this.stderr.append(redacted);
    }

    return redacted;
  }

  /**
   * Produce JSON-safe transcript tails.
   *
   * @returns Bounded transcript tails.
   */
  public snapshot(): SandboxTranscript {
    return {
      combined: this.combined.toString(),
      stderr: this.stderr.toString(),
      stdout: this.stdout.toString(),
      truncated:
        this.combined.truncated ||
        this.stdout.truncated ||
        this.stderr.truncated,
    };
  }
}
