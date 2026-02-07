ALTER TABLE "projects" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
-- Keep pre-ownership projects accessible via legacy-owner compatibility filters.
UPDATE "projects" SET "owner_user_id" = 'legacy-unowned' WHERE "owner_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "owner_user_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "projects_owner_user_id_updated_at_idx" ON "projects" USING btree ("owner_user_id","updated_at");
