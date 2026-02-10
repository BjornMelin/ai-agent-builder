import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/core/errors";
import { fetchWithTimeout } from "@/lib/net/fetch-with-timeout.server";

const skillSchema = z.strictObject({
  id: z.string().min(1),
  installs: z.number().int().nonnegative(),
  name: z.string().min(1),
  skillId: z.string().min(1),
  source: z.string().min(1),
});

const searchResponseSchema = z.strictObject({
  count: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
  query: z.string(),
  searchType: z.string(),
  skills: z.array(skillSchema),
});

/**
 * Skill entry returned by `skills.sh/api/search`.
 */
export type SkillsShSkill = Readonly<z.output<typeof skillSchema>>;

/**
 * Search response returned by `skills.sh/api/search`.
 */
export type SkillsShSearchResponse = Readonly<
  z.output<typeof searchResponseSchema>
>;

/**
 * Search the public skills.sh registry.
 *
 * @param query - Search query.
 * @param options - Optional query options (limit).
 * @returns Parsed search response.
 * @throws AppError - With code `"bad_request"` when query is invalid.
 * @throws AppError - With code `"upstream_failed"` when skills.sh is unavailable.
 */
export async function searchSkillsShRegistry(
  query: string,
  options: Readonly<{ limit?: number }> = {},
): Promise<SkillsShSearchResponse> {
  const q = query.trim();
  if (!q) {
    throw new AppError("bad_request", 400, "Search query is required.");
  }

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const url = new URL("https://skills.sh/api/search");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url.toString(),
      { method: "GET" },
      {
        timeoutMs: 12_000,
      },
    );
  } catch (err) {
    throw new AppError("upstream_failed", 502, "skills.sh search failed.", err);
  }
  if (!res.ok) {
    throw new AppError(
      "upstream_failed",
      502,
      `skills.sh search failed (${res.status}).`,
    );
  }

  let jsonUnknown: unknown;
  try {
    jsonUnknown = await res.json();
  } catch (err) {
    throw new AppError(
      "upstream_failed",
      502,
      "skills.sh search response was not understood.",
      err,
    );
  }
  const parsed = searchResponseSchema.safeParse(jsonUnknown);
  if (!parsed.success) {
    throw new AppError(
      "upstream_failed",
      502,
      "skills.sh search response was not understood.",
      parsed.error,
    );
  }

  return parsed.data;
}
