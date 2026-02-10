CREATE TABLE "project_skill_registry_installs" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"registry_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workflow_run_id" varchar(128) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_skill_registry_installs" ADD CONSTRAINT "project_skill_registry_installs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_skill_registry_installs_project_id_idx" ON "project_skill_registry_installs" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_skill_registry_installs_workflow_run_id_unique" ON "project_skill_registry_installs" USING btree ("workflow_run_id");