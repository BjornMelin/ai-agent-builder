import { searchResponseSchema } from "@/lib/search/search-response.schema";
import type { SearchResponse } from "@/lib/search/types";

/**
 * Runtime-validate and coerce the `/api/search` response into `SearchResponse`.
 *
 * @param payload - Untrusted JSON response.
 * @returns A validated search response.
 */
export function parseSearchResponse(payload: unknown): SearchResponse {
  return searchResponseSchema.parse(payload);
}
