UPDATE "runs"
SET "metadata" = jsonb_set(
	"runs"."metadata",
	'{startedByUserId}',
	to_jsonb("projects"."owner_user_id"),
	true
)
FROM "projects"
WHERE
	"runs"."project_id" = "projects"."id"
	AND "runs"."metadata"->>'origin' = 'code-mode'
	AND NOT ("runs"."metadata" ? 'startedByUserId');
