import "server-only";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/net/fetch-with-timeout.server";

const MAX_GITHUB_ZIP_BYTES = 20_000_000;

function buildArchiveUrl(
  input: Readonly<{ owner: string; repo: string; branch: string }>,
): string {
  return `https://codeload.github.com/${encodeURIComponent(
    input.owner,
  )}/${encodeURIComponent(input.repo)}/zip/refs/heads/${encodeURIComponent(
    input.branch,
  )}`;
}

function githubAuthHeaders(): Readonly<Record<string, string>> {
  if (!env.github.token) return {};
  return { authorization: `Bearer ${env.github.token}` };
}

async function downloadArchive(
  input: Readonly<{ owner: string; repo: string; branch: string }>,
): Promise<Readonly<{ bytes: Uint8Array; branch: string }> | null> {
  const url = buildArchiveUrl(input);
  const res = await fetchWithTimeout(
    url,
    { headers: githubAuthHeaders(), method: "GET" },
    { timeoutMs: 30_000 },
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new AppError(
      "upstream_failed",
      502,
      `GitHub archive download failed (${res.status}).`,
    );
  }

  const contentLength = (
    res as unknown as { headers?: { get?: (name: string) => string | null } }
  ).headers?.get?.("content-length");
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (Number.isSafeInteger(size) && size > MAX_GITHUB_ZIP_BYTES) {
      // Best-effort: avoid buffering large responses in memory.
      await res.body?.cancel();
      throw new AppError(
        "bad_request",
        400,
        `Repository archive exceeds maximum size (${MAX_GITHUB_ZIP_BYTES} bytes).`,
      );
    }
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_GITHUB_ZIP_BYTES) {
    throw new AppError(
      "bad_request",
      400,
      `Repository archive exceeds maximum size (${MAX_GITHUB_ZIP_BYTES} bytes).`,
    );
  }

  return { branch: input.branch, bytes: buf };
}

/**
 * Download a GitHub repository archive ZIP with a `main` → `master` fallback.
 *
 * @param input - Repository identity.
 * @returns ZIP bytes and resolved branch.
 * @throws AppError - With code `"upstream_failed"` when GitHub returns a non-404 error.
 * @throws AppError - With code `"bad_request"` when the archive exceeds the maximum size.
 * @throws AppError - With code `"not_found"` when neither `main` nor `master` branch exists.
 */
export async function downloadGithubRepoZip(
  input: Readonly<{ owner: string; repo: string }>,
): Promise<Readonly<{ bytes: Uint8Array; branch: string }>> {
  const main = await downloadArchive({ ...input, branch: "main" });
  if (main) return main;

  const master = await downloadArchive({ ...input, branch: "master" });
  if (master) return master;

  throw new AppError("not_found", 404, "Repository archive not found.");
}
