import "server-only";

import { del, list } from "@vercel/blob";
import { purgeProjectRetrievalCache } from "@/lib/ai/tools/retrieval.server";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import { assertProjectUploadGrantsSettled } from "@/lib/data/project-upload-grants.server";
import {
  claimProjectDeletionForUser,
  hardDeleteProjectForUser,
  prepareProjectDeletionForUser,
} from "@/lib/data/projects.server";
import { env } from "@/lib/env";
import { getVectorIndex } from "@/lib/upstash/vector.server";

/**
 * Delete an archived project and every app-owned external resource it references.
 *
 * External cleanup happens before the cascading database delete. Vercel Blob
 * deletion is idempotent, and Upstash namespaces are discovered before removal
 * so missing namespaces are treated as already clean. A failed final database
 * write can therefore be retried without orphaning external data.
 *
 * @param input - Project identity and exact authenticated owner.
 */
export async function deleteProjectForUser(
  input: Readonly<{
    confirmation: string;
    projectId: string;
    userId: string;
  }>,
): Promise<void> {
  await claimProjectDeletionForUser(input);
  // A token granted before the deletion claim is still a provider write
  // capability. Keep the durable project tombstone until every grant has
  // completed or expired, then make the Blob listing below the final sweep.
  await assertProjectUploadGrantsSettled(input.projectId);
  const plan = await prepareProjectDeletionForUser(input);

  try {
    const blobToken = env.blob.readWriteToken;
    const refs = new Set(plan.blobRefs);
    let cursor: string | undefined;
    do {
      const page = await list({
        ...(cursor ? { cursor } : {}),
        limit: 1000,
        prefix: `projects/${input.projectId}/`,
        token: blobToken,
      });
      for (const blob of page.blobs) refs.add(blob.url);
      if (page.hasMore && !page.cursor) {
        throw new Error("Blob listing did not return a pagination cursor.");
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    const blobRefs = [...refs];
    for (let index = 0; index < blobRefs.length; index += 100) {
      await del(blobRefs.slice(index, index + 100), { token: blobToken });
    }
  } catch (err) {
    log.error("project_blob_cleanup_failed", {
      err,
      projectId: input.projectId,
    });
    throw new AppError(
      "project_blob_cleanup_failed",
      502,
      "Blob cleanup failed; project deletion remains pending. Retry deletion.",
      err,
    );
  }

  try {
    const vectorIndex = getVectorIndex();
    const namespacePrefix = `project:${input.projectId}:`;
    const namespaces = (await vectorIndex.listNamespaces()).filter(
      (namespace) => namespace.startsWith(namespacePrefix),
    );
    for (const namespace of namespaces) {
      await vectorIndex.deleteNamespace(namespace);
    }
  } catch (err) {
    log.error("project_vector_cleanup_failed", {
      err,
      projectId: input.projectId,
    });
    throw new AppError(
      "project_vector_cleanup_failed",
      502,
      "Vector cleanup failed; project deletion remains pending. Retry deletion.",
      err,
    );
  }

  try {
    await purgeProjectRetrievalCache(input.projectId);
  } catch (err) {
    log.error("project_cache_cleanup_failed", {
      err,
      projectId: input.projectId,
    });
    throw new AppError(
      "project_cache_cleanup_failed",
      502,
      "Cache cleanup failed; project deletion remains pending. Retry deletion.",
      err,
    );
  }

  await hardDeleteProjectForUser(input);
}
