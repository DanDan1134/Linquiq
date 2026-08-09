ALTER TABLE "entries" ADD COLUMN "type" text DEFAULT 'None' NOT NULL;--> statement-breakpoint
CREATE INDEX "creator_idx" ON "entries" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "owner_idx" ON "entries" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "createdAt_x" ON "entries" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "from_idx" ON "links" USING btree ("from_id");