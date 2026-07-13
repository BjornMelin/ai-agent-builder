ALTER TABLE "runs" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sandbox_jobs" ADD COLUMN "provisioning_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sandbox_jobs" ADD COLUMN "provisioning_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sandbox_jobs" ADD COLUMN "provisioning_key" varchar(256);--> statement-breakpoint
ALTER TABLE "sandbox_jobs" ADD COLUMN "sandbox_id" varchar(128);--> statement-breakpoint
ALTER TABLE "sandbox_jobs" ADD COLUMN "sandbox_stop_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sandbox_jobs" ADD COLUMN "sandbox_stopped_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sandbox_jobs_enforce_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	parent_cancel_requested_at timestamp with time zone;
	parent_status text;
BEGIN
	IF TG_OP = 'INSERT' THEN
		SELECT "cancel_requested_at", "status"::text
		INTO parent_cancel_requested_at, parent_status
		FROM "runs"
		WHERE "id" = NEW."run_id"
		FOR KEY SHARE;
	ELSE
		-- UPDATE already owns the sandbox row. Avoid reversing the DAL's
		-- run-then-sandbox lock order; cancellation will reconcile either winner.
		SELECT "cancel_requested_at", "status"::text
		INTO parent_cancel_requested_at, parent_status
		FROM "runs"
		WHERE "id" = NEW."run_id";
	END IF;

	IF TG_OP = 'INSERT' AND (
		parent_cancel_requested_at IS NOT NULL
		OR parent_status IN ('canceled', 'failed', 'succeeded')
	) THEN
		RAISE EXCEPTION 'Run is not accepting sandbox jobs.'
			USING ERRCODE = '23514';
	END IF;

	IF NEW."sandbox_id" IS NULL
		AND NULLIF(NEW."metadata"->>'sandboxId', '') IS NOT NULL THEN
		NEW."sandbox_id" := NULLIF(NEW."metadata"->>'sandboxId', '');
		NEW."metadata" := NEW."metadata" - 'sandboxId';
	END IF;

	IF TG_OP = 'UPDATE' THEN
		IF OLD."status" IN ('failed', 'succeeded', 'canceled') THEN
			NEW."status" := OLD."status";
		ELSIF OLD."status" = 'canceling'
			AND NEW."status" NOT IN ('canceling', 'canceled') THEN
			NEW."status" := 'canceling';
		END IF;

		IF (
			parent_cancel_requested_at IS NOT NULL
			OR parent_status = 'canceled'
		) AND OLD."status" NOT IN ('failed', 'succeeded', 'canceled')
			AND NEW."status" <> 'canceled' THEN
			NEW."status" := 'canceling';
		END IF;
	END IF;

	IF NEW."sandbox_id" IS NOT NULL THEN
		NEW."provisioning_claimed_at" := NULL;
		NEW."provisioning_expires_at" := NULL;
	ELSIF NEW."status" IN ('pending', 'running', 'canceling')
		AND NEW."provisioning_expires_at" IS NULL THEN
		NEW."provisioning_claimed_at" := COALESCE(
			NEW."provisioning_claimed_at",
			NEW."started_at",
			NEW."created_at",
			statement_timestamp()
		);
		NEW."provisioning_expires_at" :=
			NEW."provisioning_claimed_at" + INTERVAL '31 minutes';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "sandbox_jobs_enforce_lifecycle_trigger"
BEFORE INSERT OR UPDATE ON "sandbox_jobs"
FOR EACH ROW
EXECUTE FUNCTION "sandbox_jobs_enforce_lifecycle"();--> statement-breakpoint
UPDATE "sandbox_jobs"
SET
	"sandbox_id" = NULLIF("metadata"->>'sandboxId', ''),
	"metadata" = "metadata" - 'sandboxId'
WHERE "metadata" ? 'sandboxId';--> statement-breakpoint
UPDATE "sandbox_jobs"
SET
	"provisioning_claimed_at" = COALESCE("started_at", "created_at"),
	"provisioning_expires_at" = COALESCE("started_at", "created_at") + INTERVAL '31 minutes'
WHERE
	"sandbox_id" IS NULL
	AND "status" IN ('pending', 'running', 'canceling');--> statement-breakpoint
CREATE INDEX "sandbox_jobs_run_id_sandbox_id_idx" ON "sandbox_jobs" USING btree ("run_id","sandbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sandbox_jobs_run_id_provisioning_key_unique" ON "sandbox_jobs" USING btree ("run_id","provisioning_key");--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "idempotency_key" varchar(256);--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_project_id_idempotency_key_unique" ON "artifacts" USING btree ("project_id","idempotency_key");
