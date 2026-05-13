ALTER TABLE "manuals" ADD COLUMN "available_images" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "manual_sections" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
