DROP INDEX "projects_slug_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_unique" ON "projects" USING btree ("owner_user_id","slug");