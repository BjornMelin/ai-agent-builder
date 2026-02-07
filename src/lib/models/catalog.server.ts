import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife, cacheTag } from "next/cache";

import { tagModelCatalog } from "@/lib/cache/tags";
import { log } from "@/lib/core/log";

/**
 * Minimal model descriptor loaded from AI Gateway models JSON.
 */
export type ModelCatalogEntry = Readonly<{
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}>;

/**
 * Load the local AI Gateway model catalog JSON.
 *
 * @returns Parsed model catalog entries.
 */
export async function loadModelCatalog(): Promise<
  readonly ModelCatalogEntry[]
> {
  "use cache";

  cacheLife("hours");
  cacheTag(tagModelCatalog());

  let parsed: unknown;
  try {
    const filePath = path.join(process.cwd(), "docs/ai-gateway-models.json");
    const json = await readFile(filePath, "utf8");
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    log.warn("model_catalog_load_failed", { err: error });
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || id.length === 0) {
      return [];
    }

    const created = (entry as { created?: unknown }).created;
    const object = (entry as { object?: unknown }).object;
    const ownedBy = (entry as { owned_by?: unknown }).owned_by;

    const out: ModelCatalogEntry = {
      id,
      ...(typeof created === "number" ? { created } : {}),
      ...(typeof object === "string" ? { object } : {}),
      ...(typeof ownedBy === "string" ? { owned_by: ownedBy } : {}),
    };

    return [out];
  });
}
