ALTER TABLE "entries" ALTER COLUMN "owner_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "creator_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "creator_email" text DEFAULT 'oops, no email here' NOT NULL;