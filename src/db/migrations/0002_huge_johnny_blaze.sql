ALTER TABLE "chat_messages" ADD COLUMN "message_uid" varchar(128);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "text_content" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "ui_message" jsonb;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "status" "run_status" DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "workflow_run_id" varchar(128);--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_thread_id_message_uid_unique" ON "chat_messages" USING btree ("thread_id","message_uid") WHERE "message_uid" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_threads_workflow_run_id_unique" ON "chat_threads" USING btree ("workflow_run_id") WHERE "workflow_run_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_threads_project_id_status_idx" ON "chat_threads" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "chat_threads_project_id_last_activity_at_idx" ON "chat_threads" USING btree ("project_id","last_activity_at");
