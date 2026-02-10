CREATE TABLE "project_skills" (
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name" text NOT NULL,
	"name_norm" varchar(128) NOT NULL,
	"project_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_skills_project_id_idx" ON "project_skills" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_skills_project_id_name_norm_unique" ON "project_skills" USING btree ("project_id","name_norm");--> statement-breakpoint
CREATE INDEX "project_skills_project_id_updated_at_idx" ON "project_skills" USING btree ("project_id","updated_at" DESC NULLS LAST);