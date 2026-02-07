DROP INDEX "projects_slug_unique";--> statement-breakpoint
DROP INDEX "projects_owner_user_id_updated_at_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_user_id_slug_unique" ON "projects" USING btree ("owner_user_id","slug");--> statement-breakpoint
CREATE INDEX "projects_owner_user_id_updated_at_idx" ON "projects" USING btree ("owner_user_id","updated_at" DESC NULLS LAST);