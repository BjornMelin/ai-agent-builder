/**
 * Sentinel owner used for projects that pre-date per-user ownership.
 *
 * Legacy rows remain readable to authenticated users until a deployment runs
 * an explicit ownership backfill.
 */
export const LEGACY_UNOWNED_PROJECT_OWNER_ID = "legacy-unowned";
