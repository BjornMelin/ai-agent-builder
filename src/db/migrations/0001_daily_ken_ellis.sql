ALTER TABLE "runs" ADD COLUMN "workflow_run_id" varchar(128);--> statement-breakpoint
CREATE UNIQUE INDEX "runs_workflow_run_id_unique" ON "runs" USING btree ("workflow_run_id");